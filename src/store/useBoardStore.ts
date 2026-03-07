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
}

export interface DrawnLine {
  id: string;
  type: "line" | "arrow";
  points: number[];   // flat [x1,y1, x2,y2, ...]
  color: string;
  strokeWidth: number;
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

  setTool: (tool: Tool) => void;
  setDraggingIcon: (value: boolean) => void;
  setPendingOperator: (op: { operatorId: string; iconPath: string; name: string } | null) => void;
  toggleVideo: () => void;
  setNotes: (notes: string) => void;
  addItem: (item: BoardItem) => void;
  updateItem: (id: string, updates: Partial<BoardItem>) => void;
  removeItem: (id: string) => void;
  addLine: (line: DrawnLine) => void;
  removeLine: (id: string) => void;
  undo: () => void;
  clearAll: () => void;
  addVideoMarker: (marker: VideoMarker) => void;
  clearVideoMarkers: () => void;
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

  setTool: (tool) => set({ tool }),
  setDraggingIcon: (value) => set({ isDraggingIcon: value }),
  setPendingOperator: (op) => set({ pendingOperator: op }),
  toggleVideo: () => set((s) => ({ isVideoOpen: !s.isVideoOpen })),
  setNotes: (notes) => set({ notes }),

  addItem: (item) => set((s) => ({ items: [...s.items, item] })),

  updateItem: (id, updates) =>
    set((s) => ({
      items: s.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    })),

  removeItem: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  addLine: (line) => set((s) => ({ lines: [...s.lines, line] })),

  removeLine: (id) =>
    set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),

  // Simple undo: remove last drawn line, or last placed item if no lines remain
  undo: () =>
    set((s) => {
      if (s.lines.length > 0) return { lines: s.lines.slice(0, -1) };
      if (s.items.length > 0) return { items: s.items.slice(0, -1) };
      return {};
    }),

  clearAll: () => set({ items: [], lines: [] }),

  addVideoMarker: (marker) => set((s) => ({ videoMarkers: [...s.videoMarkers, marker] })),
  clearVideoMarkers: () => set({ videoMarkers: [] }),
}));
