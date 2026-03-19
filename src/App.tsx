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

    if (file.name.endsWith(".json") || file.type === "application/json") {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          useBoardStore.getState().loadProjectData(data);
        } catch {
          console.error("❌ [Drop] Failed to parse project JSON");
          alert("Import failed: invalid or corrupted JSON file.");
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
  const leftTransition  = anyResizing ? "none" : "opacity 0.2s ease";
  const rightTransition = anyResizing ? "none" : "opacity 0.2s ease";

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
      <div className={cn("flex-1 min-w-0 flex flex-col", anyResizing && "pointer-events-none")}>
        <MainCanvas
          isLeftOpen={isLeftOpen}
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
