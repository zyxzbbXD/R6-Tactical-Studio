import { useState, useRef } from "react";
import Draggable from "react-draggable";
import { Film, GripHorizontal, X, FileImage, Video, FileText, Zap, Download } from "lucide-react";
import { useBoardStore } from "../store/useBoardStore";
import { useCanvasStore } from "../store/canvasStore";
import { useProjectStore } from "../store/useProjectStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { t } from "../locales/i18n";
import { cn } from "../utils/cn";
import { generateMtyPayload, downloadMtyFile, sanitizeFileName } from "../utils/mtySerializer";

export default function FloatingExportWindow() {
  const isExportWindowOpen        = useBoardStore((s) => s.isExportWindowOpen);
  const setExportWindowOpen       = useBoardStore((s) => s.setExportWindowOpen);
  const exportPhases              = useBoardStore((s) => s.exportPhases);
  const exportVisibility          = useBoardStore((s) => s.exportVisibility);
  const setExportPhases           = useBoardStore((s) => s.setExportPhases);
  const setExportVisibility       = useBoardStore((s) => s.setExportVisibility);
  const setGifExportRequested     = useBoardStore((s) => s.setGifExportRequested);
  const setImageExportRequested   = useBoardStore((s) => s.setImageExportRequested);
  const setAllPhasesExportRequested = useBoardStore((s) => s.setAllPhasesExportRequested);
  const currentPhase              = useBoardStore((s) => s.currentPhase);
  const notes                     = useBoardStore((s) => s.notes);
  const videoSrc                  = useBoardStore((s) => s.videoSrc);
  const videoFileName             = useBoardStore((s) => s.videoFileName);
  const language                  = useSettingsStore((s) => s.language);

  const [exportTab, setExportTab] = useState<"image" | "gif" | "video">("image");
  const dragRef = useRef<HTMLDivElement>(null);

  if (!isExportWindowOpen) return null;

  const togglePhase = (ph: number) => {
    if (exportPhases.includes(ph)) {
      if (exportPhases.length === 1) return;
      setExportPhases(exportPhases.filter((p) => p !== ph));
    } else {
      setExportPhases([...exportPhases, ph].sort((a, b) => a - b));
    }
  };

  const sortedPhases = [...exportPhases].sort((a, b) => a - b);
  const visSuffix = exportVisibility === "all" ? "" : `_${exportVisibility.toUpperCase()}`;
  const totalFiles = sortedPhases.length > 1 ? sortedPhases.length + 1 : 1;
  const totalFrames = 5 * 3 * sortedPhases.length;

  const handleSaveProject = () => {
    const board  = useBoardStore.getState();
    const canvas = useCanvasStore.getState();
    const { currentProjectId, projectsList } = useProjectStore.getState();
    const projectName = projectsList.find((p) => p.id === currentProjectId)?.name ?? "Untitled_Project";
    const mty = generateMtyPayload(
      currentProjectId,
      projectName,
      canvas.currentMapId,
      {
        items:           board.items,
        lines:           board.lines,
        throwableLines:  board.throwableLines,
        texts:           board.texts,
        roomLabels:      board.roomLabels,
        hiddenOperators: board.hiddenOperators,
        routeTimeMap:    board.routeTimeMap,
        videoMarkers:    board.videoMarkers,
        linkedVideoName: board.videoFileName || null,
      },
      { currentFloorId: canvas.currentFloorId, activePhase: board.currentPhase, activeView: canvas.currentView },
      board.notes,
    );
    downloadMtyFile(mty, `${sanitizeFileName(projectName)}.mty`);
  };

  const handleExportNotes = () => {
    if (!notes) return;
    const blob = new Blob([notes], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "Tactical_Analysis.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabClassName = (active: boolean) => cn(
    "flex-1 py-[7px] text-[13px] font-bold cursor-pointer border-b-2 bg-transparent transition-[color,border-color] duration-150",
    active ? "text-r6-accent border-b-r6-accent" : "text-r6-muted border-b-transparent"
  );

  // ── Shared sub-renders ──────────────────────────────────────────────────────

  const phaseSelector = (
    <div className="flex flex-col gap-2.5 p-3 border-b border-r6-border">
      <span className="text-[10px] font-bold tracking-widest uppercase text-r6-muted">
        {t("export_phases_label", language)}
      </span>
      <div className="flex gap-1.5">
        {([1, 2, 3, 4] as const).map((ph) => {
          const active = exportPhases.includes(ph);
          return (
            <button
              key={ph}
              onClick={() => togglePhase(ph)}
              className={cn(
                "flex flex-1 items-center justify-center rounded-lg py-1.5 text-[13px] font-bold transition-colors border",
                active
                  ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
                  : "bg-r6-surface-2 text-r6-muted border-r6-border"
              )}
            >
              {ph}
            </button>
          );
        })}
      </div>
    </div>
  );

  const visibilitySelector = (
    <div className="flex flex-col gap-2.5 p-3 border-b border-r6-border">
      <span className="text-[10px] font-bold tracking-widest uppercase text-r6-muted">
        {t("export_vis_label", language)}
      </span>
      <div className="flex flex-col gap-1">
        {(["all", "atk", "def"] as const).map((v) => {
          const labelKey = v === "all" ? "export_vis_all" : v === "atk" ? "export_vis_atk" : "export_vis_def";
          const active = exportVisibility === v;
          return (
            <button
              key={v}
              onClick={() => setExportVisibility(v)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors text-left border",
                active
                  ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
                  : "bg-transparent text-r6-muted border-transparent hover:bg-r6-surface-2"
              )}
            >
              <span
                className={cn(
                  "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2",
                  active ? "border-r6-accent" : "border-r6-muted-2"
                )}
              >
                {active && <span className="h-1.5 w-1.5 rounded-full bg-r6-accent" />}
              </span>
              {t(labelKey, language)}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Draggable handle=".export-drag-handle" bounds="parent" nodeRef={dragRef}>
      <div
        ref={dragRef}
        className="absolute z-[9999] flex flex-col overflow-hidden rounded-xl bg-r6-surface border border-r6-border"
        style={{
          top: 72,
          right: 16,
          width: 300,
          boxShadow: "0 12px 40px rgba(0,0,0,0.75)",
        }}
      >
        {/* ── Drag handle / title bar ─────────────────────────────────────── */}
        <div className="export-drag-handle flex shrink-0 cursor-move items-center gap-2 px-3 py-2.5 border-b border-r6-border bg-r6-surface-2">
          <GripHorizontal size={14} className="text-r6-muted-2 shrink-0" />
          <FileImage size={14} className="text-r6-accent shrink-0" />
          <span className="flex-1 text-[13px] font-bold tracking-wide text-r6-text">
            {t("export_window_title", language)}
          </span>
          <button
            onClick={() => setExportWindowOpen(false)}
            className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors text-r6-muted hover:text-r6-text hover:bg-r6-surface-3"
          >
            <X size={13} />
          </button>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 border-b border-r6-border bg-r6-surface-2">
          <button className={tabClassName(exportTab === "image")} onClick={() => setExportTab("image")}>
            {t("export_tab_image", language)}
          </button>
          <button className={tabClassName(exportTab === "gif")} onClick={() => setExportTab("gif")}>
            {t("export_tab_gif", language)}
          </button>
          <button className={tabClassName(exportTab === "video")} onClick={() => setExportTab("video")}>
            {t("export_tab_video", language)}
          </button>
        </div>

        {/* ── Image tab ──────────────────────────────────────────────────── */}
        {exportTab === "image" && (
          <div className="flex flex-col gap-0">
            {phaseSelector}
            {visibilitySelector}

            {/* Buttons */}
            <div className="flex flex-col gap-2 p-3">
              <button
                onClick={() => { setExportWindowOpen(false); setImageExportRequested(true); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold transition-opacity bg-r6-accent text-white hover:opacity-85"
              >
                <FileImage size={15} />
                {t("export_current", language)}
              </button>
              <button
                onClick={() => { setExportWindowOpen(false); setAllPhasesExportRequested(true); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold transition-opacity bg-r6-surface-3 text-r6-text border border-r6-border hover:opacity-75"
              >
                <FileImage size={15} />
                {t("export_all", language)}
              </button>
            </div>
          </div>
        )}

        {/* ── GIF tab ────────────────────────────────────────────────────── */}
        {exportTab === "gif" && (
          <div className="flex flex-col gap-0">
            {/* Quick export buttons */}
            <div className="flex flex-col gap-2 p-3 border-b border-r6-border">
              <span className="text-[10px] font-bold tracking-widest uppercase text-r6-muted">
                Quick Export
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => { setExportPhases([1, 2, 3, 4]); setGifExportRequested(true); }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold transition-opacity bg-r6-accent text-white hover:opacity-85"
                >
                  <Zap size={13} />
                  {t("export_quick_all", language)}
                </button>
                <button
                  onClick={() => { setExportPhases([currentPhase]); setGifExportRequested(true); }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold transition-opacity bg-r6-surface-3 text-r6-text border border-r6-border hover:opacity-75"
                >
                  <Film size={13} />
                  {t("export_current_phase", language)}
                </button>
              </div>
            </div>

            {phaseSelector}
            {visibilitySelector}

            {/* Output files preview */}
            <div className="flex flex-col gap-2 p-3 border-b border-r6-border">
              <span className="text-[10px] font-bold tracking-widest uppercase text-r6-muted">
                {t("export_output_label", language)}
              </span>
              <div className="flex flex-col gap-0.5">
                {sortedPhases.map((ph) => (
                  <div key={ph} className="flex items-center gap-2 text-[11px] text-r6-muted">
                    <Film size={11} className="shrink-0 opacity-60" />
                    <span className="font-mono">
                      {visSuffix}Phase{ph}.gif
                    </span>
                  </div>
                ))}
                {sortedPhases.length > 1 && (
                  <div className="flex items-center gap-2 text-[11px] text-r6-accent">
                    <Film size={11} className="shrink-0" />
                    <span className="font-mono">
                      {visSuffix}Phase{sortedPhases[0]}-{sortedPhases[sortedPhases.length - 1]}_Merged.gif
                    </span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-r6-muted-2">
                {totalFrames} frames · {totalFiles} file{totalFiles > 1 ? "s" : ""}
              </p>
            </div>

            {/* Generate button */}
            <div className="p-3">
              <button
                onClick={() => setGifExportRequested(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold transition-opacity bg-r6-accent text-white hover:opacity-85"
              >
                <Film size={15} />
                {t("export_generate_btn", language)}
              </button>
            </div>
          </div>
        )}

        {/* ── Video & Data tab ───────────────────────────────────────────── */}
        {exportTab === "video" && (
          <div className="flex flex-col gap-0">
            {/* Download source video */}
            <div className="flex flex-col gap-2 p-3 border-b border-r6-border">
              <span className="text-[10px] font-bold tracking-widest uppercase text-r6-muted">
                {t("export_tab_video", language)}
              </span>
              {videoSrc ? (
                <a
                  href={videoSrc}
                  download={videoFileName || "video.mp4"}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold transition-opacity bg-r6-accent text-white no-underline hover:opacity-85"
                >
                  <Video size={15} />
                  {t("export_video_btn", language)}
                </a>
              ) : (
                <div className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium bg-r6-surface-2 text-r6-muted-2 border border-r6-border">
                  <Video size={15} />
                  No video loaded
                </div>
              )}
            </div>

            {/* Export AI notes */}
            <div className="flex flex-col gap-2 p-3 border-b border-r6-border">
              <span className="text-[10px] font-bold tracking-widest uppercase text-r6-muted">
                AI Notes
              </span>
              <button
                onClick={handleExportNotes}
                disabled={!notes}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold transition-opacity border border-r6-border",
                  notes
                    ? "bg-r6-surface-3 text-r6-text hover:opacity-75"
                    : "bg-r6-surface-2 text-r6-muted-2 opacity-50"
                )}
              >
                <FileText size={15} />
                {t("export_ai_notes_btn", language)}
              </button>
            </div>

            {/* Save project as JSON */}
            <div className="flex flex-col gap-2 p-3">
              <span className="text-[10px] font-bold tracking-widest uppercase text-r6-muted">
                Project Data
              </span>
              <button
                onClick={handleSaveProject}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold transition-opacity bg-r6-accent text-white hover:opacity-85"
              >
                <Download size={15} />
                {t("save_project", language)}
              </button>
            </div>
          </div>
        )}
      </div>
    </Draggable>
  );
}
