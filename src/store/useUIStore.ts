/**
 * useUIStore.ts
 *
 * Ephemeral UI state that does NOT need undo/redo history or disk persistence.
 * Separated from useBoardStore so that zundo's temporal middleware only
 * snapshots board data (items, lines, etc.), not tool/cursor state.
 */

import { create } from "zustand";
import type { Tool } from "./useBoardStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OperatorDragPayload = {
  operatorId: string;
  iconPath: string;
  name: string;
  side: "atk" | "def" | "neutral";
};

type PendingOperator = OperatorDragPayload;

// ─── State shape ─────────────────────────────────────────────────────────────

interface UIState {
  tool: Tool;
  brushColor: string;
  brushSize: number;
  throwableColor: string;
  throwableSize: number;
  isDraggingIcon: boolean;
  pendingOperator: PendingOperator | null;
  /** Operator being dragged from the sidebar; replaces the fragile dragState.ts global. */
  draggingOperator: OperatorDragPayload | null;
  /** Canvas selection — promoted from local component state for cross-component access. */
  selectedId: string | null;

  setTool: (tool: Tool) => void;
  setBrushStyle: (color: string, size: number) => void;
  setThrowableStyle: (color: string, size: number) => void;
  setDraggingIcon: (value: boolean) => void;
  setPendingOperator: (op: PendingOperator | null) => void;
  setDraggingOperator: (op: OperatorDragPayload) => void;
  clearDraggingOperator: () => void;
  setSelectedId: (id: string | null) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>()((set) => ({
  tool: "cursor",
  brushColor: "#e85d2a",
  brushSize: 3,
  throwableColor: "#facc15",
  throwableSize: 4,
  isDraggingIcon: false,
  pendingOperator: null,
  draggingOperator: null,
  selectedId: null,

  setTool:               (tool)        => set({ tool }),
  setBrushStyle:         (color, size) => set({ brushColor: color, brushSize: size }),
  setThrowableStyle:     (color, size) => set({ throwableColor: color, throwableSize: size }),
  setDraggingIcon:       (value)       => set({ isDraggingIcon: value }),
  setPendingOperator:    (op)          => set({ pendingOperator: op }),
  setDraggingOperator:   (op)          => set({ draggingOperator: op }),
  clearDraggingOperator: ()            => set({ draggingOperator: null }),
  setSelectedId:         (id)          => set({ selectedId: id }),
}));
