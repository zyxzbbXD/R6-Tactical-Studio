import { create } from "zustand";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type Tool = "cursor" | "pen" | "arrow" | "eraser" | "place_operator";

export interface VideoMarker {
  time: number;   // seconds into the video
  label: string;
}

export interface BoardItem {
  id: string;
  operatorId: string;
  iconPath: string;
  name: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  phase: number;
}

export interface DrawnLine {
  id: string;
  type: "line" | "arrow";
  points: number[];   // flat [x1,y1, x2,y2, ...]
  color: string;
  strokeWidth: number;
  phase: number;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

interface BoardState {
  items: BoardItem[];
  lines: DrawnLine[];
  tool: Tool;
  penColor: string;
  penSize: number;
  isDraggingIcon: boolean;
  pendingOperator: { operatorId: string; iconPath: string; name: string } | null;
  isVideoOpen: boolean;
  notes: string;
  videoMarkers: VideoMarker[];
  currentPhase: number;

  setTool: (tool: Tool) => void;
  setDraggingIcon: (value: boolean) => void;
  setPendingOperator: (op: { operatorId: string; iconPath: string; name: string } | null) => void;
  toggleVideo: () => void;
  setNotes: (notes: string) => void;
  addItem: (item: Omit<BoardItem, "phase">) => void;
  updateItem: (id: string, updates: Partial<BoardItem>) => void;
  removeItem: (id: string) => void;
  addLine: (line: Omit<DrawnLine, "phase">) => void;
  removeLine: (id: string) => void;
  undo: () => void;
  clearAll: () => void;
  addVideoMarker: (marker: VideoMarker) => void;
  clearVideoMarkers: () => void;
  setPhase: (phase: number) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  items: [],
  lines: [],
  tool: "cursor",
  penColor: "#e85d2a",
  penSize: 3,
  isDraggingIcon: false,
  pendingOperator: null,
  isVideoOpen: false,
  notes: "",
  videoMarkers: [],
  currentPhase: 1,

  setTool: (tool) => set({ tool }),
  setDraggingIcon: (value) => set({ isDraggingIcon: value }),
  setPendingOperator: (op) => set({ pendingOperator: op }),
  toggleVideo: () => set((s) => ({ isVideoOpen: !s.isVideoOpen })),
  setNotes: (notes) => set({ notes }),

  addItem: (item) =>
    set((s) => ({ items: [...s.items, { ...item, phase: s.currentPhase }] })),

  updateItem: (id, updates) =>
    set((s) => ({
      items: s.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    })),

  removeItem: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  addLine: (line) =>
    set((s) => ({ lines: [...s.lines, { ...line, phase: s.currentPhase }] })),

  removeLine: (id) =>
    set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),

  // Undo within the current phase: remove last drawn line, or last placed item if no lines
  undo: () =>
    set((s) => {
      const phaseLines = s.lines.filter((l) => l.phase === s.currentPhase);
      if (phaseLines.length > 0) {
        const lastId = phaseLines[phaseLines.length - 1].id;
        return { lines: s.lines.filter((l) => l.id !== lastId) };
      }
      const phaseItems = s.items.filter((i) => i.phase === s.currentPhase);
      if (phaseItems.length > 0) {
        const lastId = phaseItems[phaseItems.length - 1].id;
        return { items: s.items.filter((i) => i.id !== lastId) };
      }
      return {};
    }),

  clearAll: () => set({ items: [], lines: [] }),

  addVideoMarker: (marker) => set((s) => ({ videoMarkers: [...s.videoMarkers, marker] })),
  clearVideoMarkers: () => set({ videoMarkers: [] }),

  // Switch phase; if the target phase is empty, clone operator tokens from the previous phase
  setPhase: (phase) =>
    set((s) => {
      const hasItems = s.items.some((i) => i.phase === phase);
      if (!hasItems && phase > 1) {
        const cloned = s.items
          .filter((i) => i.phase === phase - 1)
          .map((i) => ({ ...i, id: crypto.randomUUID(), phase }));
        return { currentPhase: phase, items: [...s.items, ...cloned] };
      }
      return { currentPhase: phase };
    }),
}));
