import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Map as MapIcon,
  Users,
  Shield,
  Crosshair,
  FolderPlus,
  FolderOpen,
  Upload,
  Settings,
  Layers,
  Trash2,
  Check,
  X,
  Wrench,
} from "lucide-react";
import { ATK_OPERATORS, DEF_OPERATORS, GADGETS, MAPS, type GadgetConfig, type OperatorConfig } from "../config/assets";
import { dragState } from "../store/dragState";
import { useBoardStore } from "../store/useBoardStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useProjectStore } from "../store/useProjectStore";
import { t } from "../locales/i18n";
import type { ProjectMeta } from "../utils/projectManager";

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  label,
  icon: Icon,
  open,
  onToggle,
}: {
  label: string;
  icon: React.ElementType;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 py-2 transition-colors"
      style={{ color: "var(--color-r6-muted)" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-r6-text)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-r6-muted)")}
    >
      <Icon size={14} className="shrink-0" />
      <span className="flex-1 text-left text-sm font-bold tracking-wide uppercase truncate whitespace-nowrap">{label}</span>
      {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
    </button>
  );
}

function AssetGrid({
  items,
  containerWidth = 240,
}: {
  items: (OperatorConfig | GadgetConfig)[];
  containerWidth?: number;
}) {
  const setDraggingIcon    = useBoardStore((s) => s.setDraggingIcon);
  const setTool            = useBoardStore((s) => s.setTool);
  const setPendingOperator = useBoardStore((s) => s.setPendingOperator);

  // Switch to 5 columns when the sidebar is wider than 125% of the default 320px base
  const gridCols = containerWidth > 400 ? "grid-cols-5" : "grid-cols-4";

  return (
    <div className={`grid ${gridCols} gap-1 px-3 pb-2 transition-all duration-200`}>
      {items.map((op) => (
        <div
          key={op.id}
          title={op.name}
          className="flex flex-col items-center gap-0.5 rounded-lg p-1 cursor-grab transition-colors"
          style={{ background: "var(--color-r6-surface-2)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-r6-surface-3)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-r6-surface-2)")}
          draggable
          onClick={() => {
            const side = "side" in op ? (op.side as "atk" | "def") : "neutral";
            setPendingOperator({ operatorId: op.id, iconPath: op.iconPath, name: op.name, side });
            setTool("place_operator");
          }}
          onDragStart={(e) => {
            const side = "side" in op ? (op.side as "atk" | "def") : "neutral";
            dragState.operator = { operatorId: op.id, iconPath: op.iconPath, name: op.name, side };
            setDraggingIcon(true);
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData("text/plain", op.id);
          }}
          onDragEnd={() => {
            setTimeout(() => { dragState.operator = null; }, 100);
            setDraggingIcon(false);
          }}
          data-operator-id={op.id}
          data-operator-side={"side" in op ? op.side : undefined}
        >
          <div
            className="w-full aspect-square flex items-center justify-center overflow-hidden rounded-full"
            style={{
              background: "var(--color-r6-surface-3)",
              border: "1px solid var(--color-r6-border)",
            }}
          >
            <img
              src={op.iconPath}
              alt={op.name}
              className="w-full h-full object-contain p-1"
              draggable={false}
            />
          </div>
          <span
            className="truncate w-full text-center text-[11px] font-medium leading-tight mt-0.5"
            style={{ color: "var(--color-r6-text)" }}
          >
            {op.name}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Sidebar ──────────────────────────────────────────────────────────────

export default function Sidebar({
  width = 240,
  transition,
}: {
  width?: number;
  transition?: string;
}) {
  const [projectsOpen,   setProjectsOpen]   = useState(true);
  const [assetsOpen,     setAssetsOpen]     = useState(true);
  const [gadgetsOpen,    setGadgetsOpen]    = useState(true);
  const [activeAssetTab, setActiveAssetTab] = useState<"atk" | "def">("atk");
  const openSettings    = useSettingsStore((s) => s.openSettings);
  const openImportModal = useSettingsStore((s) => s.openImportModal);
  const language        = useSettingsStore((s) => s.language);

  const {
    init,
    projectsList,
    currentProjectId,
    loadProject,
    createProject,
    deleteProject,
  } = useProjectStore();

  useEffect(() => { init(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { id: string; label: string; projects: ProjectMeta[] }>();
    for (const proj of projectsList) {
      const mapConfig = MAPS.find((m) => m.id === proj.mapId);
      const key   = mapConfig?.id   ?? "__drafts__";
      const label = mapConfig?.name ?? "Drafts";
      if (!map.has(key)) map.set(key, { id: key, label, projects: [] });
      map.get(key)!.projects.push(proj);
    }
    return [...map.values()];
  }, [projectsList]);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName]       = useState("");
  const newNameRef                  = useRef<HTMLInputElement>(null);
  const loadFileRef                 = useRef<HTMLInputElement>(null);

  const handleLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        useBoardStore.getState().loadProjectData(data);
      } catch {
        console.error("❌ [Sidebar] Failed to load project JSON");
        alert("Import failed: invalid or corrupted JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const openNewProject = () => {
    setNewName("");
    setIsCreating(true);
    setTimeout(() => newNameRef.current?.focus(), 0);
  };

  const confirmNewProject = () => {
    const name = newName.trim() || "Untitled";
    setIsCreating(false);
    createProject(name);
  };

  const cancelNewProject = () => {
    setIsCreating(false);
    setNewName("");
  };

  // Track the last non-zero width so the inner layout container keeps its size
  // while the outer <aside> acts as a sliding clip window during collapse animation.
  const stableWidthRef = useRef(width || 240);
  if (width > 0) stableWidthRef.current = width;

  return (
    <aside
      className="h-full shrink-0"
      style={{
        width,
        overflow: "hidden",
        transition,
        opacity: width === 0 ? 0 : 1,
        flexShrink: 0,
      }}
    >
    {/* Inner div keeps the stable (non-zero) width so the icon grid never reflows
        during the collapse slide — the outer <aside> clips it like a viewport. */}
    <div
      className="flex h-full flex-col"
      style={{
        width: stableWidthRef.current,
        background: "var(--color-r6-surface)",
        borderRight: "1px solid var(--color-r6-border)",
      }}
    >
      {/* ── Logo / App name ── */}
      <div
        className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--color-r6-border)" }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "var(--color-r6-accent)", color: "#fff" }}
        >
          <Crosshair size={17} strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight" style={{ color: "var(--color-r6-text)" }}>
            R6 Tactical
          </div>
          <div className="text-[12px]" style={{ color: "var(--color-r6-muted)" }}>
            Studio
          </div>
        </div>
        <button
          className="ml-auto rounded-lg p-1.5 transition-colors"
          title={t("Settings", language)}
          style={{ color: "var(--color-r6-muted)" }}
          onClick={openSettings}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-r6-text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-r6-muted)")}
        >
          <Settings size={17} />
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">

        {/* Projects Section */}
        <div style={{ borderBottom: "1px solid var(--color-r6-border)" }}>
          <SectionHeader
            label={t("Projects", language)}
            icon={Layers}
            open={projectsOpen}
            onToggle={() => setProjectsOpen(!projectsOpen)}
          />
          {projectsOpen && (
            <div className="pb-2">
              {grouped.length === 0 && (
                <p className="px-3 py-2 text-[13px]" style={{ color: "var(--color-r6-muted-2)" }}>
                  {t("No projects yet", language)}
                </p>
              )}

              {grouped.map((group) => (
                <div key={group.id}>
                  {/* Map group header */}
                  <div
                    className="flex items-center gap-1.5 px-3 pt-2 pb-0.5 text-[12px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--color-r6-muted-2)" }}
                  >
                    <MapIcon size={12} />
                    <span>{(() => { const tk = `map_${group.id}`; const tv = t(tk, language); return tv !== tk ? tv : group.label; })()}</span>
                  </div>

                  {/* Project rows */}
                  {group.projects.map((proj) => {
                    const isActive = proj.id === currentProjectId;
                    return (
                      <div
                        key={proj.id}
                        className="group flex items-center gap-1 pr-1"
                        style={{
                          background: isActive ? "var(--color-r6-accent-dim)" : "transparent",
                        }}
                      >
                        <button
                          onClick={() => loadProject(proj.id)}
                          className="flex flex-1 items-center gap-1.5 py-1.5 pl-6 text-[13px] rounded-l truncate"
                          style={{
                            color: isActive ? "var(--color-r6-accent)" : "var(--color-r6-muted)",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.background = "var(--color-r6-surface-2)";
                              e.currentTarget.style.color = "var(--color-r6-text)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "var(--color-r6-muted)";
                            }
                          }}
                        >
                          <FileText size={13} className="shrink-0" style={{ opacity: 0.6 }} />
                          <span className="truncate">{proj.name}</span>
                        </button>

                        {/* Delete button — visible on row hover */}
                        <button
                          title="Delete project"
                          onClick={() => deleteProject(proj.id)}
                          className="shrink-0 rounded-lg p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: "var(--color-r6-muted-2)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-r6-muted-2)")}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* New project — inline input or trigger button */}
              {isCreating ? (
                <div className="mt-1 flex items-center gap-1 px-2">
                  <input
                    ref={newNameRef}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")  confirmNewProject();
                      if (e.key === "Escape") cancelNewProject();
                    }}
                    placeholder="Project name…"
                    className="flex-1 rounded-lg px-2 py-1 text-[13px] outline-none"
                    style={{
                      background: "var(--color-r6-surface-2)",
                      border: "1px solid var(--color-r6-accent)",
                      color: "var(--color-r6-text)",
                    }}
                  />
                  <button
                    onClick={confirmNewProject}
                    title="Create"
                    className="rounded-lg p-0.5"
                    style={{ color: "var(--color-r6-accent)" }}
                  >
                    <Check size={15} />
                  </button>
                  <button
                    onClick={cancelNewProject}
                    title="Cancel"
                    className="rounded-lg p-0.5"
                    style={{ color: "var(--color-r6-muted)" }}
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={openNewProject}
                    className="mt-1 flex w-full items-center gap-2 px-3 py-1.5 text-[13px] rounded-lg transition-colors"
                    style={{ color: "var(--color-r6-muted)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--color-r6-accent)";
                      e.currentTarget.style.background = "var(--color-r6-accent-dim)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--color-r6-muted)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <FolderPlus size={14} />
                    <span>{t("New Project", language)}</span>
                  </button>
                  <input
                    ref={loadFileRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleLoadFile}
                  />
                  <button
                    onClick={() => loadFileRef.current?.click()}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] rounded-lg transition-colors"
                    style={{ color: "var(--color-r6-muted)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--color-r6-accent)";
                      e.currentTarget.style.background = "var(--color-r6-accent-dim)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--color-r6-muted)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <FolderOpen size={14} />
                    <span>{t("load_project", language)}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Asset Library Section */}
        <div style={{ borderBottom: "1px solid var(--color-r6-border)" }}>
          <SectionHeader
            label={t("Asset Library", language)}
            icon={Users}
            open={assetsOpen}
            onToggle={() => setAssetsOpen(!assetsOpen)}
          />
          {assetsOpen && (
            <div>
              {/* Tab strip */}
              <div
                className="flex mx-3 mb-2 rounded-lg overflow-hidden"
                style={{ background: "var(--color-r6-surface-2)" }}
              >
                {(["atk", "def"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveAssetTab(tab)}
                    className="flex-1 py-1.5 text-xs font-bold tracking-wider uppercase transition-colors"
                    style={{
                      background: activeAssetTab === tab ? "var(--color-r6-surface-3)" : "transparent",
                      color: activeAssetTab === tab ? "var(--color-r6-text)" : "var(--color-r6-muted)",
                      borderBottom: activeAssetTab === tab ? "1px solid var(--color-r6-accent)" : "1px solid transparent",
                    }}
                  >
                    {tab === "atk" ? (
                      <span className="flex items-center justify-center gap-1 whitespace-nowrap">
                        <Users size={12} /> ATK
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1 whitespace-nowrap">
                        <Shield size={12} /> DEF
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <AssetGrid items={activeAssetTab === "atk" ? ATK_OPERATORS : DEF_OPERATORS} containerWidth={width} />
            </div>
          )}
        </div>

        {/* Gadgets Section */}
        <div>
          <SectionHeader
            label={t("sidebar_gadgets", language)}
            icon={Wrench}
            open={gadgetsOpen}
            onToggle={() => setGadgetsOpen(!gadgetsOpen)}
          />
          {gadgetsOpen && <AssetGrid items={GADGETS} containerWidth={width} />}
        </div>
      </div>

      {/* ── Bottom toolbar ── */}
      <div
        className="flex shrink-0 flex-col gap-1 p-2"
        style={{ borderTop: "1px solid var(--color-r6-border)" }}
      >
        <button
          onClick={openImportModal}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-colors"
          style={{
            background: "var(--color-r6-surface-2)",
            color: "var(--color-r6-muted)",
            border: "1px dashed var(--color-r6-border)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-r6-accent-dim)";
            e.currentTarget.style.color = "var(--color-r6-accent)";
            e.currentTarget.style.borderColor = "var(--color-r6-accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--color-r6-surface-2)";
            e.currentTarget.style.color = "var(--color-r6-muted)";
            e.currentTarget.style.borderColor = "var(--color-r6-border)";
          }}
        >
          <Upload size={14} />
          {t("Import Custom Map", language)}
        </button>
      </div>
    </div>
    </aside>
  );
}
