import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type Konva from "konva";
import { useShallow } from "zustand/react/shallow";
import { useBoardStore } from "../store/useBoardStore";
import type { Waypoint } from "../store/useBoardStore";
import { useUIStore } from "../store/useUIStore";
import { useCanvasStore } from "../store/canvasStore";

// ─── Internal helpers ──────────────────────────────────────────────────────────

interface Vec2 { x: number; y: number }

/** Convert a Konva stage-pointer position to canvas (world) coordinates. */
function toCanvasPos(stage: Konva.Stage): Vec2 {
  const p = stage.getPointerPosition()!;
  return {
    x: (p.x - stage.x()) / stage.scaleX(),
    y: (p.y - stage.y()) / stage.scaleY(),
  };
}

// ─── Public interface ──────────────────────────────────────────────────────────

export interface UseCanvasDrawParams {
  stageRef:     RefObject<Konva.Stage | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Whether the blueprint "standard" scale transform is active. */
  isStandardBp: boolean;
  bpScale:   number;
  bpOffsetX: number;
  bpOffsetY: number;
  /** Local selection state owned by the parent component. */
  selectedId:        string | null;
  setSelectedId:     (id: string | null) => void;
  setCtxMenu:        (menu: { itemId: string; x: number; y: number } | null) => void;
  setActiveRoomEdit: (edit: {
    id: string; x: number; y: number;
    text: string; screenX: number; screenY: number;
  } | null) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCanvasDraw({
  stageRef,
  containerRef,
  isStandardBp,
  bpScale,
  bpOffsetX,
  bpOffsetY,
  selectedId,
  setSelectedId,
  setCtxMenu,
  setActiveRoomEdit,
}: UseCanvasDrawParams) {

  // UI store slices (tool / brush / pending operator)
  const {
    tool, setTool,
    brushColor, brushSize,
    pendingOperator, setPendingOperator,
  } = useUIStore(useShallow((s) => ({
    tool: s.tool, setTool: s.setTool,
    brushColor: s.brushColor, brushSize: s.brushSize,
    pendingOperator: s.pendingOperator, setPendingOperator: s.setPendingOperator,
  })));

  // Board store slices needed for drawing
  const {
    currentRouteStep,
    addItem,
    addText,
    addRoomLabel,
    addRoutePoint,
    addThrowableLine,
    addLine,
    setResizingItemId,
    setTransformingItemId,
  } = useBoardStore(useShallow((s) => ({
    currentRouteStep: s.currentRouteStep,
    addItem:            s.addItem,
    addText:            s.addText,
    addRoomLabel:       s.addRoomLabel,
    addRoutePoint:      s.addRoutePoint,
    addThrowableLine:   s.addThrowableLine,
    addLine:            s.addLine,
    setResizingItemId:  s.setResizingItemId,
    setTransformingItemId: s.setTransformingItemId,
  })));

  // Live drawing state (not committed to store yet)
  const [liveShape, setLiveShape] = useState<{
    type: "line" | "arrow" | "throwable";
    points: number[];
  } | null>(null);
  const isDrawingRef = useRef(false);

  // ── Cancel live drawing when switching tools ────────────────────────────
  // Keep selection alive for route tool so waypoints attach to the selected op.
  useEffect(() => {
    isDrawingRef.current = false;
    setLiveShape(null);
    if (tool !== "cursor" && tool !== "route") setSelectedId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // ── Coordinate helpers ───────────────────────────────────────────────────

  // Convert Stage-world pointer position → map-image coordinate space.
  // In blueprint "standard" mode the image group applies a transform; storing items
  // at the inverse-transformed coordinates keeps them aligned with the building.
  const toMapCoords = (stage: Konva.Stage): Vec2 => {
    const w = toCanvasPos(stage);
    if (!isStandardBp) return w;
    return {
      x: (w.x - 3200) / bpScale + bpOffsetX,
      y: (w.y - 1800) / bpScale + bpOffsetY,
    };
  };

  // ── Mouse handlers ────────────────────────────────────────────────────────

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current!;

    if (tool === "place_operator" && pendingOperator) {
      const pos = toMapCoords(stage);
      addItem({
        id:         crypto.randomUUID(),
        operatorId: pendingOperator.operatorId,
        iconPath:   pendingOperator.iconPath,
        name:       pendingOperator.name,
        side:       pendingOperator.side,
        x: pos.x, y: pos.y,
        rotation: 0, scaleX: 1, scaleY: 1,
      });
      // Gadgets (side === "neutral") stay active for continuous placement.
      // Operators (atk/def) reset to cursor after a single drop.
      if (pendingOperator.side !== "neutral") {
        setPendingOperator(null);
        setTool("cursor");
      }
      return;
    }

    if (tool === "text") {
      if (e.target === stage) {
        const pos = toMapCoords(stage);
        addText({
          id: crypto.randomUUID(),
          x: pos.x, y: pos.y,
          text: "New Text",
          fontSize: 120,
          fill: brushColor,
          rotation: 0, scaleX: 1, scaleY: 1,
        });
        setTool("cursor");
      }
      return;
    }

    if (tool === "room_name") {
      const pos   = toMapCoords(stage);
      const newId = crypto.randomUUID();

      // 1. 写入 Zustand (floorId injected by store from useCanvasStore.getState().currentFloorId)
      addRoomLabel({
        id: newId,
        x: pos.x, y: pos.y,
        text: "Room",
        fontSize: 60,
        fill: "#ffffff",
        rotation: 0, scaleX: 1, scaleY: 1,
      });

      // 2. Auto-enable the "names" overlay so the newly created label is immediately visible
      if (!useCanvasStore.getState().overlays.names) {
        useCanvasStore.getState().toggleOverlay("names");
      }

      // 3. 获取原生屏幕坐标，绕开 Konva 的矩阵缩放
      const rect = containerRef.current?.getBoundingClientRect();
      const sx = rect ? e.evt.clientX - rect.left : e.evt.clientX;
      const sy = rect ? e.evt.clientY - rect.top  : e.evt.clientY;

      // 4. 激活 HTML 文本框并重置鼠标工具
      setActiveRoomEdit({ id: newId, x: pos.x, y: pos.y, text: "Room", screenX: sx, screenY: sy });
      setTool("cursor");
      return;
    }

    if (tool === "cursor") {
      if (e.target === stage) {
        setSelectedId(null);
        setResizingItemId(null);
        setTransformingItemId(null);
        setCtxMenu(null);
      }
      return;
    }
    if (tool === "eraser") {
      if (e.target === stage) {
        setSelectedId(null);
        setResizingItemId(null);
        setTransformingItemId(null);
      }
      return;
    }

    // route: add waypoint at currentRouteStep to currently-selected operator on background click
    if (tool === "route") {
      if (e.target === stage && selectedId) {
        const pos = toMapCoords(stage);
        addRoutePoint(selectedId, currentRouteStep, { x: pos.x, y: pos.y } as Waypoint);
      }
      return;
    }

    // pen, arrow, throwable: start freehand / line drawing
    e.evt.preventDefault();
    isDrawingRef.current = true;
    const pos = toMapCoords(stage);
    if (tool === "throwable") {
      setLiveShape({ type: "throwable", points: [pos.x, pos.y, pos.x, pos.y] });
    } else {
      setLiveShape({ type: tool === "arrow" ? "arrow" : "line", points: [pos.x, pos.y, pos.x, pos.y] });
    }
  };

  const handleMouseMove = (_e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawingRef.current || !liveShape) return;
    const pos = toMapCoords(stageRef.current!);

    if (liveShape.type === "line" || liveShape.type === "throwable") {
      // Freehand: append each point
      setLiveShape((prev) => prev ? { ...prev, points: [...prev.points, pos.x, pos.y] } : null);
    } else {
      // Arrow: only track start → current-end
      setLiveShape((prev) =>
        prev ? { ...prev, points: [prev.points[0], prev.points[1], pos.x, pos.y] } : null,
      );
    }
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current || !liveShape) return;
    isDrawingRef.current = false;

    if (liveShape.points.length >= 4) {
      if (liveShape.type === "throwable") {
        addThrowableLine({ id: crypto.randomUUID(), points: liveShape.points });
      } else {
        addLine({
          id:          crypto.randomUUID(),
          type:        liveShape.type,
          points:      liveShape.points,
          color:       brushColor,
          strokeWidth: brushSize,
        });
      }
    }
    setLiveShape(null);
  };

  return { handleMouseDown, handleMouseMove, handleMouseUp, liveShape };
}
