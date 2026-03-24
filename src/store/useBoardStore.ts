import { create, useStore } from "zustand";
import { temporal } from "zundo";
import type { TemporalState } from "zundo";
import { useCanvasStore } from "./canvasStore";
import { useUIStore } from "./useUIStore";

// ─── Timeline constants (shared with RightSidebar) ─────────────────────────────

export const TIMELINE_ROWS: { label: string; timePhase: "prep" | "early" | "mid" | "late" }[] = [
  // PREP — 5 rows, 9-second intervals (rows 0–4)
  { label: "45s",  timePhase: "prep"  }, // 0
  { label: "36s",  timePhase: "prep"  }, // 1
  { label: "27s",  timePhase: "prep"  }, // 2
  { label: "18s",  timePhase: "prep"  }, // 3
  { label: "9s",   timePhase: "prep"  }, // 4
  // EARLY — 6 rows, 10-second intervals: 3:00 → 2:10 (rows 5–10)
  { label: "3:00", timePhase: "early" }, // 5
  { label: "2:50", timePhase: "early" }, // 6
  { label: "2:40", timePhase: "early" }, // 7
  { label: "2:30", timePhase: "early" }, // 8
  { label: "2:20", timePhase: "early" }, // 9
  { label: "2:10", timePhase: "early" }, // 10
  // MID — 6 rows, 10-second intervals: 2:00 → 1:10 (rows 11–16)
  { label: "2:00", timePhase: "mid"   }, // 11
  { label: "1:50", timePhase: "mid"   }, // 12
  { label: "1:40", timePhase: "mid"   }, // 13
  { label: "1:30", timePhase: "mid"   }, // 14
  { label: "1:20", timePhase: "mid"   }, // 15
  { label: "1:10", timePhase: "mid"   }, // 16
  // LATE — 7 rows, 10-second intervals: 1:00 → 0:00 (rows 17–23)
  { label: "1:00", timePhase: "late"  }, // 17
  { label: "0:50", timePhase: "late"  }, // 18
  { label: "0:40", timePhase: "late"  }, // 19
  { label: "0:30", timePhase: "late"  }, // 20
  { label: "0:20", timePhase: "late"  }, // 21
  { label: "0:10", timePhase: "late"  }, // 22
  { label: "0:00", timePhase: "late"  }, // 23
];

/** Row index where each tactical phase begins in TIMELINE_ROWS. */
export const PHASE_START_ROW: Record<number, number> = { 1: 0, 2: 5, 3: 11, 4: 17 };

/**
 * Returns the default timeline row for a given route step, grouped tightly
 * within the temporal section that corresponds to the current tactical phase:
 *   Phase 1 (Prep)  → rows 0–4   (45s – 9s)
 *   Phase 2 (Early) → rows 5–9   (3:00 – 2:20)
 *   Phase 3 (Mid)   → rows 11–15 (2:00 – 1:20)
 *   Phase 4 (Late)  → rows 17–21 (1:00 – 0:20)
 */
export function getDefaultRowForStep(phase: number, step: number): number {
  const base = PHASE_START_ROW[phase] ?? 0;
  return base + (step - 1); // steps 1–5 → base+0 … base+4
}

/**
 * Returns the final state of an item based on its last occupied route waypoint:
 * position, the floor the operator ended up on, and their status at that point.
 * Falls back to the item's own base values when no route waypoints exist.
 */
function lastRouteState(item: BoardItem): {
  x: number;
  y: number;
  floorId: string | null;
  status: Waypoint["status"];
} {
  for (let s = 5; s >= 2; s--) {
    const wp = (item.route as Record<number, Waypoint | undefined>)[s];
    if (wp) return {
      x: wp.x,
      y: wp.y,
      floorId: wp.floorId ?? item.floorId,
      status: wp.status,
    };
  }
  return { x: item.x, y: item.y, floorId: item.floorId, status: undefined };
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type Tool =
  | "cursor"
  | "pen"
  | "arrow"
  | "eraser"
  | "place_operator"
  | "throwable"
  | "route"
  | "text"
  | "room_name";

export interface VideoMarker {
  time: number;   // seconds into the video
  label: string;
  color?: string;
}

export interface Waypoint {
  x: number;
  y: number;
  status?: "normal" | "dead" | "planting";
  /** Floor this waypoint is placed on. Undefined = inherits previous step's floor. */
  floorId?: string | null;
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

// Room labels are floor-scoped only (not phase-scoped) — they represent static
// map annotations like room names that don't change between phases.
export interface RoomLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
  rotation: number;
  scaleX: number;
  scaleY: number;
  floorId: string | null;
}

// ─── AI Timeline JSON ──────────────────────────────────────────────────────────

export interface AITimelineStep {
  step: number;           // 1–5 sequential
  phase: 1 | 2 | 3 | 4;  // 1=Prep, 2=Early, 3=Mid, 4=Late
  location: string;       // Specific room / map area
  tip: string;            // Concise action instruction
}

export interface AITimelineOperator {
  operatorId: string;
  start_floor: string;  // e.g. "1F", "2F", "B1"
  steps: AITimelineStep[];
}

export interface AITimelineJson {
  title: string;
  overall_strategy: string;
  operators: AITimelineOperator[];
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

// ─── Store ─────────────────────────────────────────────────────────────────────

interface BoardState {
  items: BoardItem[];
  lines: DrawnLine[];
  throwableLines: ThrowableLine[];
  // Route settings
  currentRouteStep: 1 | 2 | 3 | 4 | 5;
  showFullRoute: boolean;

  // Export settings
  exportPhases: number[];
  exportVisibility: "all" | "atk" | "def";
  gifExportRequested: boolean;
  imageExportRequested: boolean;
  allPhasesExportRequested: boolean;
  isExportWindowOpen: boolean;

  videoSrc: string | null;
  videoFileName: string;
  isVideoOpen: boolean;
  notes: string;
  videoMarkers: VideoMarker[];
  currentPhase: number;

  // Text annotations on canvas
  texts: TextNode[];

  // Room labels — floor-scoped only (phase-independent static map annotations)
  roomLabels: RoomLabel[];

  // Presentation playback
  isPlaying: boolean;

  // ── Timeline state ───────────────────────────────────────────────────────────
  /** Operator ids whose tokens are hidden on canvas */
  hiddenOperators: string[];
  /**
   * Per-operator, per-step row index in the timeline.
   * routeTimeMap[itemId][step (1-5)] = rowIndex (0-22)
   */
  routeTimeMap: Record<string, Record<number, number>>;
  /** Current scanline row during timeline playback */
  playbackRowIndex: number;
  /** Whether the timeline scanline is actively playing */
  isPlayingTimeline: boolean;

  // Double-click resize state (scale slider in TacticalPanel)
  resizingItemId: string | null;
  // Double-click transform state (Konva Transformer overlay)
  transformingItemId: string | null;

  // ── Actions ─────────────────────────────────────────────────────────────────

  setCurrentRouteStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  setShowFullRoute: (show: boolean) => void;
  setExportPhases: (phases: number[]) => void;
  setExportVisibility: (v: "all" | "atk" | "def") => void;
  setGifExportRequested: (v: boolean) => void;
  setImageExportRequested: (v: boolean) => void;
  setAllPhasesExportRequested: (v: boolean) => void;
  setExportWindowOpen: (open: boolean) => void;
  setVideoSrc: (src: string | null) => void;
  setVideoFileName: (name: string) => void;
  toggleVideo: () => void;
  setNotes: (notes: string) => void;
  setResizingItemId: (id: string | null) => void;
  setTransformingItemId: (id: string | null) => void;
  setIsPlaying: (v: boolean) => void;
  addText: (node: Omit<TextNode, "phase" | "floorId">) => void;
  updateText: (id: string, updates: Partial<TextNode>) => void;
  removeText: (id: string) => void;
  addRoomLabel: (label: Omit<RoomLabel, "floorId">) => void;
  updateRoomLabel: (id: string, updates: Partial<RoomLabel>) => void;
  removeRoomLabel: (id: string) => void;
  setRoomLabelsForFloor: (floorId: string, labels: RoomLabel[]) => void;
  toggleOperatorVisibility: (id: string) => void;
  setPlaybackRowIndex: (i: number) => void;
  setIsPlayingTimeline: (v: boolean) => void;
  setRouteTimeMapping: (itemId: string, step: number, rowIndex: number) => void;
  setRouteStepStatus: (itemId: string, step: 1 | 2 | 3 | 4 | 5, status: "normal" | "dead" | "planting") => void;
  addItem: (item: Omit<BoardItem, "phase" | "route" | "scale" | "floorId">) => void;
  updateItem: (id: string, updates: Partial<BoardItem>) => void;
  removeItem: (id: string) => void;
  addLine: (line: Omit<DrawnLine, "phase" | "floorId">) => void;
  removeLine: (id: string) => void;
  addThrowableLine: (line: Pick<ThrowableLine, "id" | "points">) => void;
  removeThrowableLine: (id: string) => void;
  addRoutePoint: (itemId: string, step: 1 | 2 | 3 | 4 | 5, point: Waypoint) => void;
  /** Remove a single waypoint at `stepIndex` from an operator's route. */
  deleteRouteStep: (itemId: string, stepIndex: number) => void;
  clearRoute: (itemId: string) => void;
  /** Bulk-load project data from a parsed JSON object; clears temporal history. */
  loadProjectData: (data: unknown) => void;
  clearAll: () => void;
  clearBoard: () => void;
  clearFloor: (phase: number, floorId: string | null) => void;
  addVideoMarker: (marker: VideoMarker) => void;
  clearVideoMarkers: () => void;
  setPhase: (phase: number) => void;
  /**
   * Switch to `targetPhase`. When advancing forward by exactly one phase,
   * if the target phase has no operators on `floorId`, automatically clones
   * operators from the current phase (using their final route position as
   * the new base x/y, with an empty route).
   */
  switchPhase: (targetPhase: number, floorId: string | null) => void;
}

export const useBoardStore = create<BoardState>()(
  temporal(
    (set) => ({
      items: [],
      lines: [],
      throwableLines: [],
      currentRouteStep: 1,
      showFullRoute: true,
      exportPhases: [1, 2, 3, 4],
      exportVisibility: "all",
      gifExportRequested: false,
      imageExportRequested: false,
      allPhasesExportRequested: false,
      isExportWindowOpen: false,
      videoSrc: null,
      videoFileName: "",
      isVideoOpen: false,
      notes: "",
      videoMarkers: [],
      currentPhase: 1,
      texts: [],
      roomLabels: [],
      isPlaying: false,
      hiddenOperators: [],
      routeTimeMap: {},
      playbackRowIndex: 0,
      isPlayingTimeline: false,
      resizingItemId: null,
      transformingItemId: null,

      toggleOperatorVisibility: (id) =>
        set((s) => ({
          hiddenOperators: s.hiddenOperators.includes(id)
            ? s.hiddenOperators.filter((h) => h !== id)
            : [...s.hiddenOperators, id],
        })),
      setPlaybackRowIndex: (i) => set({ playbackRowIndex: i }),
      setIsPlayingTimeline: (v) => set({ isPlayingTimeline: v }),
      setRouteTimeMapping: (itemId, step, rowIndex) =>
        set((s) => ({
          routeTimeMap: {
            ...s.routeTimeMap,
            [itemId]: { ...(s.routeTimeMap[itemId] ?? {}), [step]: rowIndex },
          },
        })),

      setCurrentRouteStep: (step) => set({ currentRouteStep: step }),
      setShowFullRoute: (show) => set({ showFullRoute: show }),
      setExportPhases: (phases) => set({ exportPhases: phases }),
      setExportVisibility: (v) => set({ exportVisibility: v }),
      setGifExportRequested: (v) => set({ gifExportRequested: v }),
      setImageExportRequested: (v) => set({ imageExportRequested: v }),
      setAllPhasesExportRequested: (v) => set({ allPhasesExportRequested: v }),
      setExportWindowOpen: (open) => set({ isExportWindowOpen: open }),
      setVideoSrc: (src) => set({ videoSrc: src }),
      setVideoFileName: (name) => set({ videoFileName: name }),
      toggleVideo: () => set((s) => ({ isVideoOpen: !s.isVideoOpen })),
      setNotes: (notes) => set({ notes }),
      setResizingItemId: (id) => set({ resizingItemId: id }),
      setTransformingItemId: (id) => set({ transformingItemId: id }),
      setIsPlaying: (v) => set({ isPlaying: v }),

      addText: (node) =>
        set((s) => {
          const floorId = useCanvasStore.getState().currentFloorId;
          return { texts: [...s.texts, { ...node, phase: s.currentPhase, floorId }] };
        }),
      updateText: (id, updates) =>
        set((s) => ({
          texts: s.texts.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),
      removeText: (id) =>
        set((s) => ({ texts: s.texts.filter((t) => t.id !== id) })),

      addRoomLabel: (label) =>
        set((s) => {
          const floorId = useCanvasStore.getState().currentFloorId;
          return { roomLabels: [...s.roomLabels, { ...label, floorId }] };
        }),
      updateRoomLabel: (id, updates) =>
        set((s) => ({
          roomLabels: s.roomLabels.map((rl) => (rl.id === id ? { ...rl, ...updates } : rl)),
        })),
      removeRoomLabel: (id) =>
        set((s) => ({ roomLabels: s.roomLabels.filter((rl) => rl.id !== id) })),
      setRoomLabelsForFloor: (floorId, labels) =>
        set((s) => ({
          roomLabels: [
            ...s.roomLabels.filter((rl) => rl.floorId !== floorId),
            ...labels,
          ],
        })),

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
          };
        }),

      addItem: (item) =>
        set((s) => {
          const floorId = useCanvasStore.getState().currentFloorId;
          // Enforce uniqueness: same operatorId may not appear twice in the same phase
          if (item.side !== "neutral") {
            const alreadyExists = s.items.some(
              (i) => i.operatorId === item.operatorId && i.phase === s.currentPhase
            );
            if (alreadyExists) return {};
          }
          // Enforce 5-operator limit per side per phase+floor (neutral gadgets are exempt)
          if (item.side !== "neutral") {
            const count = s.items.filter(
              (i) => i.side === item.side && i.phase === s.currentPhase && i.floorId === floorId
            ).length;
            if (count >= 5) return {}; // silently reject
          }
          return {
            items: [...s.items, { ...item, phase: s.currentPhase, route: {}, scale: 3, floorId }],
            routeTimeMap: {
              ...s.routeTimeMap,
              [item.id]: { 1: getDefaultRowForStep(s.currentPhase, 1) },
            },
          };
        }),

      updateItem: (id, updates) =>
        set((s) => ({
          items: s.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
        })),

      removeItem: (id) =>
        set((s) => {
          const { [id]: _rmMap, ...newRouteTimeMap } = s.routeTimeMap;
          return {
            items: s.items.filter((i) => i.id !== id),
            hiddenOperators: s.hiddenOperators.filter((h) => h !== id),
            routeTimeMap: newRouteTimeMap,
          };
        }),

      addLine: (line) =>
        set((s) => {
          const floorId = useCanvasStore.getState().currentFloorId;
          return { lines: [...s.lines, { ...line, phase: s.currentPhase, floorId }] };
        }),

      removeLine: (id) =>
        set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),

      // Color/size injected from useUIStore so this module stays free of UI state
      addThrowableLine: ({ id, points }) =>
        set((s) => {
          const floorId = useCanvasStore.getState().currentFloorId;
          const { throwableColor, throwableSize } = useUIStore.getState();
          return {
            throwableLines: [
              ...s.throwableLines,
              { id, points, color: throwableColor, strokeWidth: throwableSize, phase: s.currentPhase, floorId },
            ],
          };
        }),

      removeThrowableLine: (id) =>
        set((s) => ({ throwableLines: s.throwableLines.filter((l) => l.id !== id) })),

      addRoutePoint: (itemId, step, point) =>
        set((s) => {
          const item = s.items.find((i) => i.id === itemId);
          if (!item) return {};
          const floorId = useCanvasStore.getState().currentFloorId;
          // Stamp the current floor onto the waypoint so cross-floor routing works
          const waypointWithFloor: Waypoint = { ...point, floorId };

          const newItems = s.items.map((i) => {
            if (i.id !== itemId) return i;
            // Step 1 = base position; update x/y directly and clear any stale route[1]
            if (step === 1) {
              const { 1: _dropped, ...restRoute } = i.route as Record<number, Waypoint>;
              // Also update floorId on the item itself to reflect the new base floor
              return { ...i, x: point.x, y: point.y, floorId, route: restRoute };
            }
            return { ...i, route: { ...i.route, [step]: waypointWithFloor } };
          });
          // Auto-assign default timeline row for this step if not already mapped
          const existingOpMap = s.routeTimeMap[itemId] ?? {};
          const newRouteTimeMap: Record<string, Record<number, number>> =
            step in existingOpMap
              ? s.routeTimeMap
              : { ...s.routeTimeMap, [itemId]: { ...existingOpMap, [step]: getDefaultRowForStep(s.currentPhase, step) } };

          return { items: newItems, routeTimeMap: newRouteTimeMap };
        }),

      deleteRouteStep: (itemId, stepIndex) =>
        set((s) => {
          const item = s.items.find((i) => i.id === itemId);
          if (!item) return {};
          // Guard: step must exist in the route dict
          if (!(stepIndex in (item.route as Record<number, unknown>))) return {};

          const prevRoute = { ...item.route } as Record<number, Waypoint>;

          // Remove the target step, then shift all higher-indexed steps down by 1
          const { [stepIndex]: _deleted, ...withoutStep } = prevRoute;
          const newRoute = Object.entries(withoutStep).reduce<Record<number, Waypoint>>(
            (acc, [k, v]) => {
              const key = Number(k);
              acc[key > stepIndex ? key - 1 : key] = v;
              return acc;
            },
            {},
          ) as BoardItem["route"];

          // Sync the timeline mapping with the same re-indexing
          const prevOpMap = { ...(s.routeTimeMap[itemId] ?? {}) } as Record<number, number>;
          const newOpMap = Object.entries(prevOpMap).reduce<Record<number, number>>(
            (acc, [k, v]) => {
              const key = Number(k);
              if (key === stepIndex) return acc;
              acc[key > stepIndex ? key - 1 : key] = v;
              return acc;
            },
            {},
          );

          return {
            items: s.items.map((i) => (i.id === itemId ? { ...i, route: newRoute } : i)),
            routeTimeMap: { ...s.routeTimeMap, [itemId]: newOpMap },
          };
        }),

      clearRoute: (itemId) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === itemId ? { ...i, route: {} } : i)),
        })),

      loadProjectData: (data) => {
        const d = data as Record<string, unknown>;
        const linkedVideoName = typeof d.linkedVideoName === "string" ? d.linkedVideoName : null;

        set((s) => {
          // ── Media-Offline validation ────────────────────────────────────────
          let videoSrc      = s.videoSrc;
          let videoFileName = s.videoFileName;
          if (linkedVideoName) {
            if (s.videoFileName !== linkedVideoName) {
              // Wrong video in player — enter Media Offline state
              videoSrc      = null;
              videoFileName = linkedVideoName;
            }
            // else: correct video already loaded — leave it untouched
          } else {
            // Board has no linked video — clear player
            videoSrc      = null;
            videoFileName = "";
          }

          return {
            items:           Array.isArray(d.items)           ? (d.items           as BoardItem[])                   : [],
            lines:           Array.isArray(d.lines)           ? (d.lines           as DrawnLine[])                   : [],
            throwableLines:  Array.isArray(d.throwableLines)  ? (d.throwableLines  as ThrowableLine[])               : [],
            texts:           Array.isArray(d.texts)           ? (d.texts           as TextNode[])                    : [],
            roomLabels:      Array.isArray(d.roomLabels)      ? (d.roomLabels      as RoomLabel[])                   : [],
            notes:           typeof d.notes === "string"      ? d.notes                                              : "",
            hiddenOperators: Array.isArray(d.hiddenOperators) ? (d.hiddenOperators as string[])                      : [],
            routeTimeMap:    (d.routeTimeMap && typeof d.routeTimeMap === "object")
                               ? (d.routeTimeMap as Record<string, Record<number, number>>)
                               : {},
            videoMarkers:    Array.isArray(d.videoMarkers)    ? (d.videoMarkers    as VideoMarker[])                 : [],
            videoSrc,
            videoFileName,
          };
        });
        // Sync map/floor in canvasStore
        const canvas = useCanvasStore.getState();
        const mapId   = typeof d.mapId   === "string" ? d.mapId   : null;
        const floorId = typeof d.floorId === "string" ? d.floorId : null;
        if (mapId) {
          if (floorId) canvas.setMapAndFloor(mapId, floorId);
          else         canvas.setMap(mapId);
        }
        // Clear undo history so loaded state is a clean baseline
        useBoardStore.temporal.getState().clear();
      },

      clearAll: () => {
        set({ items: [], lines: [], throwableLines: [], texts: [], roomLabels: [], hiddenOperators: [], routeTimeMap: {} });
        useBoardStore.temporal.getState().clear();
      },
      clearBoard: () => {
        set({ items: [], lines: [], throwableLines: [], texts: [], roomLabels: [], notes: "", hiddenOperators: [], routeTimeMap: {} });
        useBoardStore.temporal.getState().clear();
      },
      clearFloor: (phase, floorId) => {
        set((s) => ({
          items:          s.items.filter((i) => !(i.phase === phase && i.floorId === floorId)),
          lines:          s.lines.filter((l) => !(l.phase === phase && l.floorId === floorId)),
          throwableLines: s.throwableLines.filter((l) => !(l.phase === phase && l.floorId === floorId)),
          texts:          s.texts.filter((t) => !(t.phase === phase && t.floorId === floorId)),
          // Room labels are floor-scoped only — clear all for this floor regardless of phase
          roomLabels:     s.roomLabels.filter((rl) => rl.floorId !== floorId),
        }));
        useBoardStore.temporal.getState().clear();
      },

      addVideoMarker: (marker) => set((s) => ({ videoMarkers: [...s.videoMarkers, marker] })),
      clearVideoMarkers: () => set({ videoMarkers: [] }),

      // Switch phase — no cloning; used internally for export loops.
      setPhase: (phase) => set({ currentPhase: phase }),

      switchPhase: (targetPhase, floorId) =>
        set((s) => {
          if (targetPhase === s.currentPhase) return {};

          // Always jump the scanline to the first row of the new phase and reset the route step
          const phaseSync = {
            playbackRowIndex: PHASE_START_ROW[targetPhase] ?? 0,
            currentRouteStep: 1 as const,
          };

          // Only apply continuity cloning when advancing forward by exactly one phase
          const isForwardStep = targetPhase === s.currentPhase + 1;
          if (!isForwardStep) return { currentPhase: targetPhase, ...phaseSync };

          // If the target phase already has operators on this floor, just switch
          const targetHasOps = s.items.some(
            (i) => i.phase === targetPhase && i.floorId === floorId && i.side !== "neutral"
          );
          if (targetHasOps) return { currentPhase: targetPhase, ...phaseSync };

          // Clone all items from current phase on this floor into the target phase.
          // Each clone starts at the last-known route position with a fresh empty route.
          // Dead operators and operators that moved to another floor are excluded.
          const sourceItems = s.items.filter(
            (i) => i.phase === s.currentPhase && i.floorId === floorId
          );
          const cloned: BoardItem[] = [];
          for (const item of sourceItems) {
            const final = lastRouteState(item);
            if (final.status === "dead") continue;
            cloned.push({
              ...item,
              id: crypto.randomUUID(),
              phase: targetPhase,
              x: final.x,
              y: final.y,
              floorId: final.floorId,
              route: {} as Record<number, Waypoint>,
            });
          }

          // Give each clone a clean routeTimeMap entry for step 1
          const newRouteTimeMap = { ...s.routeTimeMap };
          for (const c of cloned) {
            newRouteTimeMap[c.id] = { 1: getDefaultRowForStep(targetPhase, 1) };
          }

          return {
            currentPhase: targetPhase,
            items: [...s.items, ...cloned],
            routeTimeMap: newRouteTimeMap,
            ...phaseSync,
          };
        }),
    }),
    {
      partialize: (state) => ({
        items:          state.items,
        lines:          state.lines,
        throwableLines: state.throwableLines,
        texts:          state.texts,
        routeTimeMap:   state.routeTimeMap,
      }),
      limit: 50,
    },
  ),
);

type TemporalBoardState = {
  items: BoardItem[];
  lines: DrawnLine[];
  throwableLines: ThrowableLine[];
  texts: TextNode[];
  routeTimeMap: Record<string, Record<number, number>>;
};

/** React hook for the zundo temporal store (undo / redo / history). */
export const useTemporalBoardStore = <T>(
  selector: (state: TemporalState<TemporalBoardState>) => T,
): T => useStore(useBoardStore.temporal, selector);
