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
  Package,
} from "lucide-react";
import { ATK_OPERATORS, DEF_OPERATORS, GADGETS, OPERATOR_GADGETS, MAPS, type GadgetConfig, type OperatorConfig } from "../config/assets";
import { useBoardStore } from "../store/useBoardStore";
import { useUIStore } from "../store/useUIStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useProjectStore } from "../store/useProjectStore";
import { t } from "../locales/i18n";
import { cn } from "../utils/cn";
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
      className="flex w-full items-center gap-2 px-3 py-2 transition-colors text-r6-muted hover:text-r6-text"
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
  const setDraggingIcon      = useUIStore((s) => s.setDraggingIcon);
  const setTool              = useUIStore((s) => s.setTool);
  const setPendingOperator   = useUIStore((s) => s.setPendingOperator);
  const setDraggingOperator  = useUIStore((s) => s.setDraggingOperator);
  const clearDraggingOperator = useUIStore((s) => s.clearDraggingOperator);

  // Switch to 5 columns when the sidebar is wider than 125% of the default 320px base
  const gridCols = containerWidth > 400 ? "grid-cols-5" : "grid-cols-4";

  return (
    <div className={`grid ${gridCols} gap-1 px-3 pb-2 transition-all duration-200`}>
      {items.map((op) => (
        <div
          key={op.id}
          title={op.name}
          className="flex flex-col items-center gap-0.5 rounded-lg p-1 cursor-grab transition-colors bg-r6-surface-2 hover:bg-r6-surface-3"
          draggable
          onClick={() => {
            const side = "side" in op ? (op.side as "atk" | "def") : "neutral";
            setPendingOperator({ operatorId: op.id, iconPath: op.iconPath, name: op.name, side });
            setTool("place_operator");
          }}
          onDragStart={(e) => {
            const side = "side" in op ? (op.side as "atk" | "def") : "neutral";
            setDraggingOperator({ operatorId: op.id, iconPath: op.iconPath, name: op.name, side });
            setDraggingIcon(true);
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData("text/plain", op.id);
          }}
          onDragEnd={() => {
            clearDraggingOperator();
            setDraggingIcon(false);
          }}
          data-operator-id={op.id}
          data-operator-side={"side" in op ? op.side : undefined}
        >
          <div className="w-full aspect-square flex items-center justify-center overflow-hidden rounded-full bg-r6-surface-3 border border-r6-border">
            <img
              src={op.iconPath}
              alt={op.name}
              className="w-full h-full object-contain p-1"
              draggable={false}
            />
          </div>
          <span className="truncate w-full text-center text-[11px] font-medium leading-tight mt-0.5 text-r6-text">
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
  const [opGadgetsOpen,  setOpGadgetsOpen]  = useState(true);
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

  const [isCreating,       setIsCreating]       = useState(false);
  const [newName,          setNewName]          = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName,      setEditingName]      = useState("");
  const newNameRef  = useRef<HTMLInputElement>(null);
  const loadFileRef = useRef<HTMLInputElement>(null);

  const commitRename = (id: string) => {
    useProjectStore.getState().renameProject(id, editingName);
    setEditingProjectId(null);
    setEditingName("");
  };
  const cancelRename = () => {
    setEditingProjectId(null);
    setEditingName("");
  };

  const handleLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const fallbackName = file.name.replace(/\.mty$/i, "").trim() || "Untitled_Project";
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.payload) {
          if (!parsed.meta?.name?.trim()) {
            parsed.meta = { ...parsed.meta, name: fallbackName };
          }
          await useProjectStore.getState().installImportedProject(parsed);
        } else {
          useBoardStore.getState().loadProjectData(parsed);
          useUIStore.getState().setTool("cursor");
        }
      } catch {
        console.error("❌ [Sidebar] Failed to load 项目文件");
        alert("Import failed: invalid or corrupted 项目文件.");
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
      className="h-full shrink-0 overflow-hidden"
      style={{
        width,
        transition,
        opacity: width === 0 ? 0 : 1,
      }}
    >
    {/* Inner div keeps the stable (non-zero) width so the icon grid never reflows
        during the collapse slide — the outer <aside> clips it like a viewport. */}
    <div
      className="flex h-full flex-col bg-r6-surface border-r border-r6-border"
      style={{ width: stableWidthRef.current }}
    >
      {/* ── Logo / App name ── */}
      <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-b border-r6-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-r6-accent text-white">
          <Crosshair size={17} strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight text-r6-text">
            R6 Tactical
          </div>
          <div className="text-[12px] text-r6-muted">
            Studio
          </div>
        </div>
        <button
          className="ml-auto rounded-lg p-1.5 transition-colors text-r6-muted hover:text-r6-text"
          title={t("Settings", language)}
          onClick={openSettings}
        >
          <Settings size={17} />
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">

        {/* Projects Section */}
        <div className="border-b border-r6-border">
          <SectionHeader
            label={t("Projects", language)}
            icon={Layers}
            open={projectsOpen}
            onToggle={() => setProjectsOpen(!projectsOpen)}
          />
          {projectsOpen && (
            <div className="pb-2">
              {grouped.length === 0 && (
                <p className="px-3 py-2 text-[13px] text-r6-muted-2">
                  {t("No projects yet", language)}
                </p>
              )}

              {grouped.map((group, index) => (
                <div key={group.id}>
                  {/* Map group header */}
                  <div className={cn("flex items-center gap-1.5 px-3 pb-0.5 text-[13px] font-semibold uppercase tracking-wider text-r6-muted-2", index === 0 ? "pt-0" : "pt-2")}>
                    <MapIcon size={12} />
                    <span>{(() => { const tk = `map_${group.id}`; const tv = t(tk, language); return tv !== tk ? tv : group.label; })()}</span>
                  </div>

                  {/* Project rows */}
                  {group.projects.map((proj) => {
                    const isActive = proj.id === currentProjectId;
                    return (
                      <div
                        key={proj.id}
                        className={cn("group flex items-center gap-1 pr-1", isActive ? "bg-r6-accent-dim" : "bg-transparent")}
                      >
                        <button
                          onClick={() => loadProject(proj.id)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            setEditingProjectId(proj.id);
                            setEditingName(proj.name);
                          }}
                          className={cn(
                            "flex flex-1 items-center gap-1.5 py-1 pl-6 text-[14px] rounded-l truncate",
                            isActive
                              ? "text-r6-accent"
                              : "text-r6-muted hover:bg-r6-surface-2 hover:text-r6-text"
                          )}
                        >
                          <FileText size={13} className="shrink-0 opacity-60" />
                          {editingProjectId === proj.id ? (
                            <input
                              autoFocus
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")  { e.stopPropagation(); commitRename(proj.id); }
                                if (e.key === "Escape") { e.stopPropagation(); cancelRename(); }
                              }}
                              onBlur={() => commitRename(proj.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 min-w-0 bg-transparent outline-none border-b border-r6-accent text-r6-accent text-[14px] leading-tight"
                            />
                          ) : (
                            <span className="truncate">{proj.name}</span>
                          )}
                        </button>

                        {/* Delete button — visible on row hover */}
                        <button
                          title="Delete project"
                          onClick={() => deleteProject(proj.id)}
                          className="shrink-0 rounded-lg p-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-r6-muted-2 hover:text-red-500"
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
                    className="flex-1 rounded-lg px-2 py-1 text-[13px] outline-none bg-r6-surface-2 border border-r6-accent text-r6-text"
                  />
                  <button
                    onClick={confirmNewProject}
                    title="Create"
                    className="rounded-lg p-0.5 text-r6-accent"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    onClick={cancelNewProject}
                    title="Cancel"
                    className="rounded-lg p-0.5 text-r6-muted"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={openNewProject}
                    className="mt-0.5 flex w-full items-center gap-2 px-3 py-1 text-[13px] rounded-lg transition-colors text-r6-muted hover:text-r6-accent hover:bg-r6-accent-dim"
                  >
                    <FolderPlus size={14} />
                    <span>{t("New Project", language)}</span>
                  </button>
                  <input
                    ref={loadFileRef}
                    type="file"
                    accept=".mty,.json"
                    className="hidden"
                    onChange={handleLoadFile}
                  />
                  <button
                    onClick={() => loadFileRef.current?.click()}
                    className="flex w-full items-center gap-2 px-3 py-1 text-[13px] rounded-lg transition-colors text-r6-muted hover:text-r6-accent hover:bg-r6-accent-dim"
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
        <div className="border-b border-r6-border">
          <SectionHeader
            label={t("Asset Library", language)}
            icon={Users}
            open={assetsOpen}
            onToggle={() => setAssetsOpen(!assetsOpen)}
          />
          {assetsOpen && (
            <div>
              {/* Tab strip */}
              <div className="flex mx-3 mb-2 rounded-lg overflow-hidden bg-r6-surface-2">
                {(["atk", "def"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveAssetTab(tab)}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-bold tracking-wider uppercase transition-colors border-b",
                      activeAssetTab === tab
                        ? "bg-r6-surface-3 text-r6-text border-r6-accent"
                        : "bg-transparent text-r6-muted border-transparent"
                    )}
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
        <div className="border-b border-r6-border">
          <SectionHeader
            label={t("sidebar_gadgets", language)}
            icon={Wrench}
            open={gadgetsOpen}
            onToggle={() => setGadgetsOpen(!gadgetsOpen)}
          />
          {gadgetsOpen && <AssetGrid items={GADGETS} containerWidth={width} />}
        </div>

        {/* Operator Gadgets Section */}
        <div>
          <SectionHeader
            label={t("sidebar_op_gadgets", language)}
            icon={Package}
            open={opGadgetsOpen}
            onToggle={() => setOpGadgetsOpen(!opGadgetsOpen)}
          />
          {opGadgetsOpen && <AssetGrid items={OPERATOR_GADGETS} containerWidth={width} />}
        </div>
      </div>

      {/* ── Bottom toolbar ── */}
      <div className="flex shrink-0 flex-col gap-1 p-2 border-t border-r6-border">
        <button
          onClick={openImportModal}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-colors bg-r6-surface-2 text-r6-muted border border-dashed border-r6-border hover:bg-r6-accent-dim hover:text-r6-accent hover:border-r6-accent"
        >
          <Upload size={14} />
          {t("Import Custom Map", language)}
        </button>
      </div>
    </div>
    </aside>
  );
}
