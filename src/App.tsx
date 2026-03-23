import { useEffect, useState, useCallback } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import MainCanvas from "./components/MainCanvas";
import RightSidebar from "./components/RightSidebar";
import SettingsModal from "./components/SettingsModal";
import ImportMapModal from "./components/ImportMapModal";
import { useSettingsStore } from "./store/useSettingsStore";
import { useResizable } from "./hooks/useResizable";
import { useBoardStore } from "./store/useBoardStore";
import { useProjectStore } from "./store/useProjectStore";
import { useUIStore } from "./store/useUIStore";
import { useCanvasStore } from "./store/canvasStore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cn } from "./utils/cn";

// ── Root font-size scaling ───────────────────────────────────────────────────

function applyFontScale() {
  const w = window.innerWidth;
  let fontSize = 16;
  if (w >= 3840) fontSize = 24;       // 4K  → 1.5×
  else if (w >= 2560) fontSize = 20;  // 2K  → 1.25×
  document.documentElement.style.fontSize = `${fontSize}px`;
}

// ── Default widths ───────────────────────────────────────────────────────────

const DEFAULT_LEFT  = 240;
const DEFAULT_RIGHT = 320;

// ── App ─────────────────────────────────────────────────────────────────────

function App() {
  const theme = useSettingsStore((s) => s.theme);
  const isRightSidebarOpen = useSettingsStore((s) => s.isRightSidebarOpen);

  const [leftWidth,  startLeftResize,  setLeftWidth,  isLeftResizing]  =
    useResizable(DEFAULT_LEFT,  200, 560, "left");
  const [rightWidth, startRightResize, setRightWidth, isRightResizing] =
    useResizable(DEFAULT_RIGHT, 260, 720, "right");

  // True while either handle is being dragged — used to kill transitions + pointer events
  const anyResizing = isLeftResizing || isRightResizing;

  const [isLeftOpen, setIsLeftOpen] = useState(true);

  // ── Global drag-and-drop ─────────────────────────────────────────────────
  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (file.name.endsWith(".mty") || file.name.endsWith(".json") || file.type === "application/json") {
      const fallbackName = file.name.replace(/\.(mty|json)$/i, "").trim() || "Untitled_Project";
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
          console.error("❌ [Drop] Failed to parse 项目文件");
          alert("Import failed: invalid or corrupted 项目文件.");
        }
      };
      reader.readAsText(file);
    } else if (file.type.startsWith("video/")) {
      const videoUrl = URL.createObjectURL(file);
      useBoardStore.getState().setVideoSrc(videoUrl);
      useBoardStore.getState().setVideoFileName(file.name);
      if (!useBoardStore.getState().isVideoOpen) {
        useBoardStore.getState().toggleVideo();
      }
    }
  }, []);

  const resetWorkspace = () => {
    setIsLeftOpen(true);
    setLeftWidth(DEFAULT_LEFT);
    setRightWidth(DEFAULT_RIGHT);
  };

  // ── Open .mty file passed via file-association double-click ─────────────────
  useEffect(() => {
    invoke<string | null>("get_initial_file_content").then(async (raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.payload) {
          await useProjectStore.getState().installImportedProject(parsed);
        } else {
          useBoardStore.getState().loadProjectData(parsed);
          useUIStore.getState().setTool("cursor");
        }
      } catch {
        console.error("❌ [App] Failed to parse initial .mty file");
      }
    }).catch(() => {});
  }, []);

  // ── Native menu event listeners ──────────────────────────────────────────
  useEffect(() => {
    const unlisten: Array<() => void> = [];

    (async () => {
      // menu-new — confirm then create a blank project
      unlisten.push(await listen("menu-new", async () => {
        const name = window.prompt("New project name:", "Untitled Project");
        if (name === null) return; // user cancelled
        await useProjectStore.getState().createProject(name.trim() || "Untitled Project");
      }));

      // menu-open — native file-open dialog → read → install
      unlisten.push(await listen("menu-open", async () => {
        try {
          const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
          const { readTextFile } = await import("@tauri-apps/plugin-fs");

          const selected = await openDialog({
            multiple: false,
            filters: [{ name: "R6 Tactical Project", extensions: ["mty"] }],
          });
          if (!selected) return;
          const filePath = typeof selected === "string" ? selected : selected[0];
          if (!filePath) return;

          const raw = await readTextFile(filePath);
          const parsed = JSON.parse(raw);
          const fallbackName = filePath
            .split(/[/\\]/)
            .pop()
            ?.replace(/\.mty$/i, "")
            .trim() || "Untitled_Project";

          if (parsed.payload) {
            if (!parsed.meta?.name?.trim()) {
              parsed.meta = { ...parsed.meta, name: fallbackName };
            }
            await useProjectStore.getState().installImportedProject(parsed);
          } else {
            useBoardStore.getState().loadProjectData(parsed);
            useUIStore.getState().setTool("cursor");
          }
        } catch (err) {
          console.error("❌ [menu-open] Failed to open file:", err);
        }
      }));

      // menu-save — persist current project to disk
      unlisten.push(await listen("menu-save", async () => {
        await useProjectStore.getState().saveCurrentProject();
      }));

      // menu-export — download .mty file (mirrors FloatingExportWindow logic)
      unlisten.push(await listen("menu-export", () => {
        const board   = useBoardStore.getState();
        const canvas  = useCanvasStore.getState();
        const { currentProjectId, projectsList } = useProjectStore.getState();
        const projectName   = projectsList.find((p) => p.id === currentProjectId)?.name ?? "Untitled_Project";
        const sanitizedName = projectName.replace(/[\\/:*?"<>|]/g, "_");
        const now = Date.now();
        const mty = {
          version: "1.0",
          meta: {
            id:        currentProjectId ?? crypto.randomUUID(),
            name:      projectName,
            mapId:     canvas.currentMapId,
            updatedAt: now,
          },
          payload: {
            boardState: {
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
            notes:         board.notes,
            floorId:       canvas.currentFloorId,
            activeFloorId: canvas.currentFloorId,
            activePhase:   board.currentPhase,
          },
        };
        const blob = new Blob([JSON.stringify(mty, null, 2)], { type: "application/json" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `${sanitizedName}.mty`;
        a.click();
        URL.revokeObjectURL(url);
      }));

      // menu-undo / menu-redo — zundo temporal store
      unlisten.push(await listen("menu-undo", () => {
        useBoardStore.temporal.getState().undo();
      }));

      unlisten.push(await listen("menu-redo", () => {
        useBoardStore.temporal.getState().redo();
      }));
    })();

    // Cleanup: unsubscribe all listeners on unmount
    return () => {
      unlisten.forEach((fn) => fn());
    };
  }, []);

  // Theme sync
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().setTheme(theme === "dark" ? "dark" : "light").catch(() => {});
    }).catch(() => {});
  }, [theme]);

  // Resolution-adaptive root font size
  useEffect(() => {
    applyFontScale();
    window.addEventListener("resize", applyFontScale);
    return () => window.removeEventListener("resize", applyFontScale);
  }, []);

  // ── Sidebar panel widths (0 when closed, with optional CSS transition) ─────
  const leftPanelWidth  = isLeftOpen ? leftWidth : 0;
  const leftTransition  = anyResizing ? "none" : "width 200ms ease, opacity 200ms ease";
  const rightTransition = anyResizing ? "none" : "width 200ms ease, opacity 200ms ease";

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-r6-bg"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleGlobalDrop}
    >
      {/* Left Sidebar */}
      <Sidebar
        width={leftPanelWidth}
        transition={leftTransition}
      />

      {/* Left resize handle — only when open */}
      {isLeftOpen && (
        <div
          className="flex-shrink-0 cursor-col-resize z-50 bg-transparent hover:bg-r6-accent transition-colors"
          style={{ width: 4 }}
          onMouseDown={startLeftResize}
        />
      )}

      {/* Center — canvas fills remaining space.
          pointer-events-none during resize stops the browser from computing
          :hover states on the hundreds of Konva / DOM nodes inside. */}
      <div className={cn("flex-1 min-w-0 min-h-0 flex flex-col", anyResizing && "pointer-events-none")}>
        <MainCanvas
          isLeftOpen={isLeftOpen}
          leftPanelWidth={leftPanelWidth + (isLeftOpen ? 4 : 0)}
          onToggleLeft={() => setIsLeftOpen((v) => !v)}
          onResetWorkspace={resetWorkspace}
        />
      </div>

      {/* Right resize handle */}
      {isRightSidebarOpen && (
        <div
          className="flex-shrink-0 cursor-col-resize z-50 bg-transparent hover:bg-r6-accent transition-colors"
          style={{ width: 4 }}
          onMouseDown={startRightResize}
        />
      )}

      {/* Right Sidebar */}
      <RightSidebar
        width={rightWidth}
        transition={rightTransition}
      />

      <SettingsModal />
      <ImportMapModal />
    </div>
  );
}

export default App;
