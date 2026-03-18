import { create } from "zustand";
import { useCanvasStore } from "./canvasStore";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type Tool =
  | "cursor"
  | "pen"
  | "arrow"
  | "eraser"
  | "place_operator"
  | "throwable"
  | "route"
  | "text";

export interface VideoMarker {
  time: number;   // seconds into the video
  label: string;
}

export interface Waypoint {
  x: number;
  y: number;
  status?: "normal" | "dead" | "planting";
}

export interface TextNode {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
  rotation: number;
  scaleX: number;
  scaleY: number;
  phase: number;
  floorId: string | null;
}

export interface BoardItem {
  id: string;
  operatorId: string;
  iconPath: string;
  name: string;
  side: "atk" | "def" | "neutral"; // "neutral" = gadgets / non-operator tokens
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  scale: number;   // token display size multiplier (1–5, default 3)
  phase: number;
  floorId: string | null;  // floor where this token lives
  route: Record<number, Waypoint>; // sparse dict keyed 2–5 (step 1 = base x/y)
}

export interface DrawnLine {
  id: string;
  type: "line" | "arrow";
  points: number[];   // flat [x1,y1, x2,y2, ...]
  color: string;
  strokeWidth: number;
  phase: number;
  floorId: string | null;
}

export interface ThrowableLine {
  id: string;
  points: number[];   // flat [x1,y1, x2,y2, ...]
  color: string;
  strokeWidth: number;
  phase: number;
  floorId: string | null;
}

// ─── Granular Undo History ──────────────────────────────────────────────────────
// Each entry records the minimal info needed to reverse one action.
// floorId lets undo() snap the canvas back to the floor where the action occurred.

type HistoryEntry =
  | { type: "addLine";             id: string;                                                                      phase: number; floorId: string | null }
  | { type: "addThrowableLine";    id: string;                                                                      phase: number; floorId: string | null }
  | { type: "removeThrowableLine"; line: ThrowableLine;                                                             phase: number; floorId: string | null }
  | { type: "addItem";             id: string;                                                                      phase: number; floorId: string | null }
  | { type: "addRoutePoint";       itemId: string; prevX: number; prevY: number; prevRoute: Record<number, Waypoint>; phase: number; floorId: string | null }
  | { type: "addText";             id: string;                                                                      phase: number; floorId: string | null }
  | { type: "updateText";          id: string; prevNode: TextNode;                                                  phase: number; floorId: string | null }
  | { type: "removeText";          node: TextNode;                                                                  phase: number; floorId: string | null }
  | { type: "setRouteStepStatus";  itemId: string; prevRoute: Record<number, Waypoint>;                             phase: number; floorId: string | null }
  | { type: "clearRoute";          itemId: string; prevRoute: Record<number, Waypoint>;                             phase: number; floorId: string | null };

// ─── Store ─────────────────────────────────────────────────────────────────────

interface BoardState {
  items: BoardItem[];
  lines: DrawnLine[];
  throwableLines: ThrowableLine[];
  tool: Tool;
  // Brush style (pen / arrow)
  brushColor: string;
  brushSize: number;
  // Throwable style
  throwableColor: string;
  throwableSize: number;
  // Route settings
  currentRouteStep: 1 | 2 | 3 | 4 | 5;
  showFullRoute: boolean;

  // Export settings
  exportPhases: number[];
  exportVisibility: "all" | "atk" | "def";
  gifExportRequested: boolean;

  isExportWindowOpen: boolean;
  isDraggingIcon: boolean;
  videoSrc: string | null;
  videoFileName: string;
  pendingOperator: { operatorId: string; iconPath: string; name: string; side: "atk" | "def" | "neutral" } | null;
  isVideoOpen: boolean;
  notes: string;
  videoMarkers: VideoMarker[];
  currentPhase: number;

  // Text annotations on canvas
  texts: TextNode[];

  // Presentation playback
  isPlaying: boolean;

  // Double-click resize state (scale slider in TacticalPanel)
  resizingItemId: string | null;
  // Double-click transform state (Konva Transformer overlay)
  transformingItemId: string | null;

  // Internal undo history (not exposed to consumers)
  _history: HistoryEntry[];

  setTool: (tool: Tool) => void;
  setBrushStyle: (color: string, size: number) => void;
  setThrowableStyle: (color: string, size: number) => void;
  setCurrentRouteStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  setShowFullRoute: (show: boolean) => void;
  setExportPhases: (phases: number[]) => void;
  setExportVisibility: (v: "all" | "atk" | "def") => void;
  setGifExportRequested: (v: boolean) => void;
  imageExportRequested: boolean;
  allPhasesExportRequested: boolean;
  setImageExportRequested: (v: boolean) => void;
  setAllPhasesExportRequested: (v: boolean) => void;
  setExportWindowOpen: (open: boolean) => void;
  setDraggingIcon: (value: boolean) => void;
  setVideoSrc: (src: string | null) => void;
  setVideoFileName: (name: string) => void;
  setPendingOperator: (op: { operatorId: string; iconPath: string; name: string; side: "atk" | "def" | "neutral" } | null) => void;
  toggleVideo: () => void;
  setNotes: (notes: string) => void;
  setResizingItemId: (id: string | null) => void;
  setTransformingItemId: (id: string | null) => void;
  setIsPlaying: (v: boolean) => void;
  addText: (node: Omit<TextNode, "phase" | "floorId">) => void;
  updateText: (id: string, updates: Partial<TextNode>) => void;
  removeText: (id: string) => void;
  setRouteStepStatus: (itemId: string, step: 1 | 2 | 3 | 4 | 5, status: "normal" | "dead" | "planting") => void;
  addItem: (item: Omit<BoardItem, "phase" | "route" | "scale" | "floorId">) => void;
  updateItem: (id: string, updates: Partial<BoardItem>) => void;
  removeItem: (id: string) => void;
  addLine: (line: Omit<DrawnLine, "phase" | "floorId">) => void;
  removeLine: (id: string) => void;
  addThrowableLine: (line: Pick<ThrowableLine, "id" | "points">) => void;
  removeThrowableLine: (id: string) => void;
  addRoutePoint: (itemId: string, step: 1 | 2 | 3 | 4 | 5, point: Waypoint) => void;
  clearRoute: (itemId: string) => void;
  undo: () => void;
  /** Bulk-load project data from a parsed JSON object; clears history. */
  loadProjectData: (data: unknown) => void;
  clearAll: () => void;
  clearBoard: () => void;
  clearFloor: (phase: number, floorId: string | null) => void;
  addVideoMarker: (marker: VideoMarker) => void;
  clearVideoMarkers: () => void;
  setPhase: (phase: number) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  items: [],
  lines: [],
  throwableLines: [],
  tool: "cursor",
  brushColor: "#e85d2a",
  brushSize: 3,
  throwableColor: "#facc15",
  throwableSize: 4,
  currentRouteStep: 1,
  showFullRoute: true,
  exportPhases: [1, 2, 3, 4],
  exportVisibility: "all",
  gifExportRequested: false,
  imageExportRequested: false,
  allPhasesExportRequested: false,
  isExportWindowOpen: false,
  isDraggingIcon: false,
  videoSrc: null,
  videoFileName: "",
  pendingOperator: null,
  isVideoOpen: false,
  notes: "",
  videoMarkers: [],
  currentPhase: 1,
  texts: [],
  isPlaying: false,
  resizingItemId: null,
  transformingItemId: null,
  _history: [],

  setTool: (tool) => set({ tool }),
  setBrushStyle: (color, size) => set({ brushColor: color, brushSize: size }),
  setThrowableStyle: (color, size) => set({ throwableColor: color, throwableSize: size }),
  setCurrentRouteStep: (step) => set({ currentRouteStep: step }),
  setShowFullRoute: (show) => set({ showFullRoute: show }),
  setExportPhases: (phases) => set({ exportPhases: phases }),
  setExportVisibility: (v) => set({ exportVisibility: v }),
  setGifExportRequested: (v) => set({ gifExportRequested: v }),
  setImageExportRequested: (v) => set({ imageExportRequested: v }),
  setAllPhasesExportRequested: (v) => set({ allPhasesExportRequested: v }),
  setExportWindowOpen: (open) => set({ isExportWindowOpen: open }),
  setDraggingIcon: (value) => set({ isDraggingIcon: value }),
  setVideoSrc: (src) => set({ videoSrc: src }),
  setVideoFileName: (name) => set({ videoFileName: name }),
  setPendingOperator: (op) => set({ pendingOperator: op }),
  toggleVideo: () => set((s) => ({ isVideoOpen: !s.isVideoOpen })),
  setNotes: (notes) => set({ notes }),
  setResizingItemId: (id) => set({ resizingItemId: id }),
  setTransformingItemId: (id) => set({ transformingItemId: id }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  addText: (node) =>
    set((s) => {
      const floorId = useCanvasStore.getState().currentFloorId;
      const newNode = { ...node, phase: s.currentPhase, floorId };
      return {
        texts: [...s.texts, newNode],
        _history: [...s._history, { type: "addText", id: node.id, phase: s.currentPhase, floorId }],
      };
    }),
  updateText: (id, updates) =>
    set((s) => {
      const prev = s.texts.find((t) => t.id === id);
      if (!prev) return { texts: s.texts };
      return {
        texts: s.texts.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        _history: [...s._history, { type: "updateText", id, prevNode: prev, phase: s.currentPhase, floorId: prev.floorId }],
      };
    }),
  removeText: (id) =>
    set((s) => {
      const node = s.texts.find((t) => t.id === id);
      if (!node) return { texts: s.texts };
      return {
        texts: s.texts.filter((t) => t.id !== id),
        _history: [...s._history, { type: "removeText", node, phase: s.currentPhase, floorId: node.floorId }],
      };
    }),
  setRouteStepStatus: (itemId, step, status) =>
    set((s) => {
      const item = s.items.find((i) => i.id === itemId);
      if (!item) return { items: s.items };
      const existing = item.route[step];
      const base: Waypoint = existing ?? { x: item.x, y: item.y };
      return {
        items: s.items.map((i) =>
          i.id !== itemId ? i : { ...i, route: { ...i.route, [step]: { ...base, status } } }
        ),
        _history: [...s._history, { type: "setRouteStepStatus", itemId, prevRoute: { ...item.route }, phase: s.currentPhase, floorId: item.floorId }],
      };
    }),

  addItem: (item) =>
    set((s) => {
      const floorId = useCanvasStore.getState().currentFloorId;
      return {
        items: [...s.items, { ...item, phase: s.currentPhase, route: {}, scale: 3, floorId }],
        _history: [...s._history, { type: "addItem", id: item.id, phase: s.currentPhase, floorId }],
      };
    }),

  updateItem: (id, updates) =>
    set((s) => ({
      items: s.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    })),

  removeItem: (id) =>
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      // Prune all history entries for this item so undo slots aren't wasted
      _history: s._history.filter((e) =>
        !(e.type === "addItem" && e.id === id) &&
        !(e.type === "addRoutePoint" && e.itemId === id)
      ),
    })),

  addLine: (line) =>
    set((s) => {
      const floorId = useCanvasStore.getState().currentFloorId;
      return {
        lines: [...s.lines, { ...line, phase: s.currentPhase, floorId }],
        _history: [...s._history, { type: "addLine", id: line.id, phase: s.currentPhase, floorId }],
      };
    }),

  removeLine: (id) =>
    set((s) => ({
      lines: s.lines.filter((l) => l.id !== id),
      _history: s._history.filter((e) => !(e.type === "addLine" && e.id === id)),
    })),

  // Auto-inject current throwable color/size and floorId from store/canvas state
  addThrowableLine: ({ id, points }) =>
    set((s) => {
      const floorId = useCanvasStore.getState().currentFloorId;
      return {
        throwableLines: [
          ...s.throwableLines,
          { id, points, color: s.throwableColor, strokeWidth: s.throwableSize, phase: s.currentPhase, floorId },
        ],
        _history: [...s._history, { type: "addThrowableLine", id, phase: s.currentPhase, floorId }],
      };
    }),

  removeThrowableLine: (id) =>
    set((s) => {
      const line = s.throwableLines.find((l) => l.id === id);
      if (!line) return { throwableLines: s.throwableLines };
      return {
        throwableLines: s.throwableLines.filter((l) => l.id !== id),
        _history: [...s._history, { type: "removeThrowableLine", line, phase: s.currentPhase, floorId: line.floorId }],
      };
    }),

  addRoutePoint: (itemId, step, point) =>
    set((s) => {
      const item = s.items.find((i) => i.id === itemId);
      if (!item) return {};
      const floorId = useCanvasStore.getState().currentFloorId;
      // Snapshot the item's PREVIOUS position/route before mutating
      const histEntry: HistoryEntry = {
        type: "addRoutePoint",
        itemId,
        prevX: item.x,
        prevY: item.y,
        prevRoute: { ...item.route },
        phase: s.currentPhase,
        floorId,
      };
      const newItems = s.items.map((i) => {
        if (i.id !== itemId) return i;
        // Step 1 = base position; update x/y directly and clear any stale route[1]
        if (step === 1) {
          const { 1: _dropped, ...restRoute } = i.route as Record<number, Waypoint>;
          return { ...i, x: point.x, y: point.y, route: restRoute };
        }
        return { ...i, route: { ...i.route, [step]: point } };
      });
      return { items: newItems, _history: [...s._history, histEntry] };
    }),

  clearRoute: (itemId) =>
    set((s) => {
      const item = s.items.find((i) => i.id === itemId);
      if (!item) return { items: s.items };
      return {
        items: s.items.map((i) => (i.id === itemId ? { ...i, route: {} } : i)),
        _history: [...s._history, { type: "clearRoute", itemId, prevRoute: { ...item.route }, phase: s.currentPhase, floorId: item.floorId }],
      };
    }),

  // Granular undo: pop the most recent history entry matching currentPhase,
  // then snap the canvas view to the floor where that action occurred.
  undo: () =>
    set((s) => {
      // Scan backward to find last entry for current phase
      let idx = -1;
      for (let i = s._history.length - 1; i >= 0; i--) {
        if (s._history[i].phase === s.currentPhase) { idx = i; break; }
      }
      if (idx === -1) return {};

      const entry = s._history[idx];
      const newHistory = s._history.filter((_, i) => i !== idx);

      // Sync canvas floor to where the undone action took place
      if (entry.floorId) {
        useCanvasStore.getState().setFloor(entry.floorId);
      }

      switch (entry.type) {
        case "addLine":
          return { _history: newHistory, lines: s.lines.filter((l) => l.id !== entry.id) };
        case "addThrowableLine":
          return { _history: newHistory, throwableLines: s.throwableLines.filter((l) => l.id !== entry.id) };
        case "removeThrowableLine":
          return { _history: newHistory, throwableLines: [...s.throwableLines, entry.line] };
        case "addItem":
          return { _history: newHistory, items: s.items.filter((i) => i.id !== entry.id) };
        case "addRoutePoint":
          return {
            _history: newHistory,
            items: s.items.map((item) =>
              item.id === entry.itemId
                ? { ...item, x: entry.prevX, y: entry.prevY, route: entry.prevRoute }
                : item
            ),
          };
        case "addText":
          return { _history: newHistory, texts: s.texts.filter((t) => t.id !== entry.id) };
        case "updateText":
          return { _history: newHistory, texts: s.texts.map((t) => (t.id === entry.id ? entry.prevNode : t)) };
        case "removeText":
          return { _history: newHistory, texts: [...s.texts, entry.node] };
        case "setRouteStepStatus":
          return {
            _history: newHistory,
            items: s.items.map((item) =>
              item.id === entry.itemId ? { ...item, route: entry.prevRoute } : item
            ),
          };
        case "clearRoute":
          return {
            _history: newHistory,
            items: s.items.map((item) =>
              item.id === entry.itemId ? { ...item, route: entry.prevRoute } : item
            ),
          };
        default:
          return { _history: newHistory };
      }
    }),

  loadProjectData: (data) => {
    const d = data as Record<string, unknown>;
    // Atomically set all board arrays, preserving phase/floorId from the file
    set({
      items:          Array.isArray(d.items)          ? (d.items          as BoardItem[])    : [],
      lines:          Array.isArray(d.lines)          ? (d.lines          as DrawnLine[])    : [],
      throwableLines: Array.isArray(d.throwableLines) ? (d.throwableLines as ThrowableLine[]) : [],
      texts:          Array.isArray(d.texts)          ? (d.texts          as TextNode[])     : [],
      notes:          typeof d.notes === "string"     ? d.notes                              : "",
      _history: [],
    });
    // Sync map/floor in canvasStore
    const canvas = useCanvasStore.getState();
    const mapId   = typeof d.mapId   === "string" ? d.mapId   : null;
    const floorId = typeof d.floorId === "string" ? d.floorId : null;
    if (mapId) {
      if (floorId) canvas.setMapAndFloor(mapId, floorId);
      else         canvas.setMap(mapId);
    }
  },

  clearAll: () => set({ items: [], lines: [], throwableLines: [], texts: [], _history: [] }),
  clearBoard: () => set({ items: [], lines: [], throwableLines: [], texts: [], notes: "", _history: [] }),
  clearFloor: (phase, floorId) => set((s) => ({
    items:          s.items.filter((i) => !(i.phase === phase && i.floorId === floorId)),
    lines:          s.lines.filter((l) => !(l.phase === phase && l.floorId === floorId)),
    throwableLines: s.throwableLines.filter((l) => !(l.phase === phase && l.floorId === floorId)),
    texts:          s.texts.filter((t) => !(t.phase === phase && t.floorId === floorId)),
    _history: [],
  })),

  addVideoMarker: (marker) => set((s) => ({ videoMarkers: [...s.videoMarkers, marker] })),
  clearVideoMarkers: () => set({ videoMarkers: [] }),

  // Switch phase — no cloning; each phase is an independent scenario.
  setPhase: (phase) => set({ currentPhase: phase }),
}));
