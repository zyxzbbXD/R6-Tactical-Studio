import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCanvasDraw } from "../hooks/useCanvasDraw";
import { useCanvasExport } from "../hooks/useCanvasExport";
import {
  Stage, Layer,
  Image as KonvaImage,
  Line, Arrow,
  Transformer,
  Group as KonvaGroup,
  Circle as KonvaCircle,
  Text as KonvaText,
  Rect as KonvaRect,
  Label as KonvaLabel,
  Tag as KonvaTag,
} from "react-konva";
import type Konva from "konva";
import useImage from "use-image";
import {
  Pencil, ArrowRight, Eraser, Undo2, Trash2,
  ZoomIn, ZoomOut, Maximize2,
  Video, MapPin, ChevronDown, ChevronLeft, ChevronRight, MousePointer2, Loader2, Bot, FileDown, Upload,
  FileImage, FileText, Film, FileJson,
  Image as ImageIcon, Layers2, Type, Box, ArrowUpDown,
  PanelLeftClose, PanelLeftOpen, LayoutTemplate,
  Spline, Route, MessageSquare, Tag, TableProperties,

} from "lucide-react";
// Cross-platform safe font stack — Canvas (Konva) silently renders nothing on Windows
// if the requested font is missing. "Segoe UI" is the Windows system default; Arial is
// the universal last-resort fallback available on every OS that supports Canvas.
const SAFE_FONT_FAMILY = 'Arial, sans-serif';

// Strip UTF-8 BOM (U+FEFF) that Windows text editors / Notepad add to JSON files.
// Chromium's JSON.parse rejects the BOM and silently fails, leaving labels unloaded.
const stripBOM = (s: string): string => (s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s);

// Hardcoded blueprint scale factors per map id.
// Each value scales the blueprint image so it visually fills the 6400×3600 canvas.
// Maps not listed fall back to 1.0.
const BLUEPRINT_MANUAL_SCALES: Record<string, number> = {
  bank:             1.0,
  border:           1.0,
  chalet:           1.0,
  clubhouse:        1.25,
  consulate:        2.75,
  fortress:         3.0,
  kafe:             3.0,
  lair:             3.0,
  nighthavenlabs:   2.0,
};
import FloatingVideoPlayer from "./FloatingVideoPlayer";
import FloatingExportWindow from "./FloatingExportWindow";
import TacticalPanel from "./TacticalPanel";
import MapPreloader from "./MapPreloader";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore, type ViewMode, type OverlayKey } from "../store/canvasStore";
import {
  useBoardStore,
  useTemporalBoardStore,
  type BoardItem, type Tool, type RoomLabelDef,
} from "../store/useBoardStore";
import { useUIStore } from "../store/useUIStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useProjectStore } from "../store/useProjectStore";
import { t } from "../locales/i18n";
import { cn } from "../utils/cn";

// ─── Constants ─────────────────────────────────────────────────────────────────

const ZOOM_FACTOR = 1.10;
const ZOOM_MIN    = 0.05;
const ZOOM_MAX    = 8;
const ICON_SIZE = 56;   // operator token load size (SVG rasterization); default scale=3 → 168px

// ─── Helpers ───────────────────────────────────────────────────────────────────

interface Vec2 { x: number; y: number }
interface Size { width: number; height: number }

/**
 * Compute an operator's canvas position at a given timeline row index using
 * strict snap logic — NO lerping. The operator holds its current step position
 * and only teleports when the scanline reaches (or passes) the next step's row.
 *
 * Algorithm: find the HIGHEST step number whose mapped row ≤ playbackRowIndex.
 * That step's coordinates are the display position.
 */
function getSnapPositionAtTimelineRow(
  item: import("../store/useBoardStore").BoardItem,
  rowIndex: number,
  routeTimeMap: Record<string, Record<number, number>>,
): { x: number; y: number; step: number } {
  const opMap = routeTimeMap[item.id] ?? {};

  const getStepPos = (step: number) =>
    step === 1 ? { x: item.x, y: item.y } : ((item.route as Record<number, { x: number; y: number } | undefined>)[step] ?? { x: item.x, y: item.y });

  // Find highest step whose row ≤ rowIndex
  let bestStep = -1;
  let bestRow  = -1;
  for (const [stepStr, row] of Object.entries(opMap)) {
    const step = Number(stepStr);
    // Only consider steps that actually have a position (step 1 always has base x/y)
    if (step !== 1 && !item.route[step]) continue;
    if (row <= rowIndex && step > bestStep) {
      bestStep = step;
      bestRow  = row;
    }
  }
  void bestRow; // used only for selection; position comes from step coords

  if (bestStep === -1) {
    // Scanline hasn't reached any mapped step yet — show at base position
    return { ...getStepPos(1), step: 0 };
  }
  return { ...getStepPos(bestStep), step: bestStep };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
// PDF export helpers (ORANGE, DARK, stripMd, renderNotesToCanvas) → hooks/useCanvasExport.ts



/**
 * Expand a BoardItem's sparse route dict into 6 positions (index 0 = base, 1–5 = steps).
 * If step N has no waypoint, it inherits from step N-1 ("holding angle").
 * Dead status is inherited forward: once dead, stays dead unless overridden.
 */
function getEffectiveRoute(item: BoardItem): Array<{ x: number; y: number; status: "normal" | "dead" | "planting"; floorId: string | null }> {
  type EffPt = { x: number; y: number; status: "normal" | "dead" | "planting"; floorId: string | null };
  const pts: EffPt[] = [{ x: item.x, y: item.y, status: "normal", floorId: item.floorId ?? null }];
  for (let i = 1; i <= 5; i++) {
    const prev = pts[i - 1];
    const wp = item.route[i];
    const newStatus: "normal" | "dead" | "planting" =
      wp?.status ?? (prev.status === "dead" ? "dead" : "normal");
    // Propagate floorId: use the waypoint's explicit floor, or inherit the previous step's floor
    const newFloorId = wp?.floorId !== undefined ? (wp.floorId ?? null) : prev.floorId;
    pts.push({ x: wp?.x ?? prev.x, y: wp?.y ?? prev.y, status: newStatus, floorId: newFloorId });
  }
  return pts;
}

/**
 * Load an SVG (or any image) into an HTMLImageElement with explicit dimensions
 * so that browsers rasterize SVGs correctly before Konva draws them.
 */
function useOperatorIcon(src: string): HTMLImageElement | undefined {
  const [image, setImage] = useState<HTMLImageElement | undefined>();
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const img = new Image(ICON_SIZE, ICON_SIZE);
    img.onload = () => { if (!cancelled) setImage(img); };
    img.onerror = () => { console.error("❌ Failed to load image:", src); if (!cancelled) setImage(undefined); };
    // Ensure absolute path so relative URLs don't silently 404
    img.src = src.startsWith("/") ? src : `/${src}`;
    return () => { cancelled = true; img.onload = null; img.onerror = null; };
  }, [src]);
  return image;
}

// ─── Reusable toolbar atoms ────────────────────────────────────────────────────

function ToolBtn({
  icon: Icon, label, active = false, disabled = false, onClick,
}: {
  icon: React.ElementType; label: string; active?: boolean; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex shrink-0 h-8 w-8 items-center justify-center rounded-lg transition-colors border disabled:opacity-30 disabled:cursor-not-allowed",
        active
          ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
          : "bg-transparent text-r6-muted border-transparent hover:text-r6-text hover:bg-r6-surface-2"
      )}
    >
      <Icon size={15} />
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-r6-border" />;
}

function Dropdown<T extends string>({
  value, placeholder, items, onChange, icon: Icon, minWidth = 140,
}: {
  value: T | null; placeholder: string;
  items: { id: T; label: string }[];
  onChange: (id: T) => void;
  icon?: React.ElementType; minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const label = items.find((i) => i.id === value)?.label ?? placeholder;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[14px] font-medium bg-r6-surface-2 border border-r6-border",
          value ? "text-r6-text" : "text-r6-muted"
        )}
        style={{ minWidth }}
      >
        {Icon && <Icon size={13} className="opacity-70 shrink-0" />}
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown size={12} className="opacity-50 shrink-0" />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 rounded-xl py-1 bg-r6-surface border border-r6-border w-max"
          style={{
            boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
            maxHeight: 260, overflowY: "auto",
          }}
        >
          {items.map((item) => (
            <button key={item.id}
              onClick={() => { onChange(item.id); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 pl-4 pr-3 py-1.5 text-[14px] text-r6-text hover:bg-r6-surface-2 transition-colors whitespace-nowrap"
            >
              <span>{item.label}</span>
              {item.id === value && <span className="text-[12px] text-r6-accent">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Map background layer (isolated so useImage only re-runs on path change) ──
// Receives pre-computed paths; empty string = don't load that layer.
// Stacking order: base → props → stairs → vert → names

const MapImageLayer = memo(function MapImageLayer({
  basePath, vertPath, propsPath, stairsPath, namesPath, currentView, currentMapId, blueprintScaleMode, onCenterCalculated, externalCenter,
}: {
  basePath: string;
  vertPath: string;
  propsPath: string;
  stairsPath: string;
  namesPath: string;
  currentView: ViewMode;
  currentMapId: string;
  blueprintScaleMode: "default" | "standard";
  onCenterCalculated?: (center: { x: number; y: number }) => void;
  externalCenter?: { x: number; y: number };
}) {
  const [baseImage]   = useImage(basePath);
  const [vertImage]   = useImage(vertPath);
  const [propsImage]  = useImage(propsPath);
  const [stairsImage] = useImage(stairsPath);
  const [namesImage]  = useImage(namesPath);

  // Pixel-scan the base image to find the actual building bounding-box center.
  // We draw to an offscreen canvas and step through the alpha channel in strides of STEP
  // to avoid blocking the main thread on large images.
  const [buildingCenter, setBuildingCenter] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!baseImage) return;
    setBuildingCenter(null);
    const STEP = 6;
    const w = baseImage.naturalWidth;
    const h = baseImage.naturalHeight;
    try {
      const cvs = document.createElement("canvas");
      cvs.width = w; cvs.height = h;
      const ctx = cvs.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(baseImage, 0, 0);
      const { data } = ctx.getImageData(0, 0, w, h);
      let minX = w, maxX = 0, minY = h, maxY = 0;
      for (let y = 0; y < h; y += STEP) {
        for (let x = 0; x < w; x += STEP) {
          if (data[(y * w + x) * 4 + 3] > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const computed = maxX > minX && maxY > minY
        ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
        : { x: w / 2, y: h / 2 };
      setBuildingCenter(computed);
      onCenterCalculated?.(computed);
    } catch {
      // Canvas CORS security error — fall back to geometric center
      const fallback = { x: w / 2, y: h / 2 };
      setBuildingCenter(fallback);
      onCenterCalculated?.(fallback);
    }
  }, [baseImage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!baseImage) return null;
  const isBlueprint = currentView === "blueprint";

  // "standard": scale image by dict factor, pivot on building center → places building at (3200,1800).
  // For non-blueprint views the externally-supplied blueprint center is used as the pivot so
  // both the map image and the items group share the same transform.
  const blueprintManualScale = BLUEPRINT_MANUAL_SCALES[currentMapId] ?? 1.0;
  const internalCenter = buildingCenter ?? { x: baseImage.naturalWidth / 2, y: baseImage.naturalHeight / 2 };
  // In blueprint view: use the locally-computed center (from alpha-scan of the blueprint PNG).
  // In other views: use the passed-in blueprint center so both layers pivot at the same point.
  const center = (!isBlueprint && externalCenter) ? externalCenter : internalCenter;
  const applyScale = blueprintScaleMode === "standard" && (isBlueprint || externalCenter != null) && currentView !== "isometric";
  const imgProps = applyScale
    ? { x: 3200, y: 1800, offsetX: center.x, offsetY: center.y, scaleX: blueprintManualScale, scaleY: blueprintManualScale }
    : { x: 0,    y: 0,    offsetX: 0,        offsetY: 0,        scaleX: 1,                    scaleY: 1                    };

  return (
    <>
      {/* Standard-size blueprint background sheet (6400×3600) — cyanotype blue */}
      {isBlueprint && (
        <KonvaRect x={0} y={0} width={6400} height={3600} fill="#15539e" listening={false} />
      )}
      <KonvaImage image={baseImage}  {...imgProps} listening={false} perfectDrawEnabled={false} />
      {propsImage  && <KonvaImage image={propsImage}  {...imgProps} listening={false} perfectDrawEnabled={false} />}
      {stairsImage && <KonvaImage image={stairsImage} {...imgProps} listening={false} perfectDrawEnabled={false} />}
      {vertImage   && <KonvaImage image={vertImage}   {...imgProps} listening={false} perfectDrawEnabled={false} />}
      {namesImage  && <KonvaImage image={namesImage}  {...imgProps} listening={false} perfectDrawEnabled={false} />}
      {/* Inset white border — sits 100px inside the paper edges */}
      {isBlueprint && (
        <KonvaRect x={100} y={100} width={6200} height={3400} stroke="rgba(255,255,255,0.7)" strokeWidth={8} listening={false} />
      )}
    </>
  );
});

// ─── Placed operator token ─────────────────────────────────────────────────────

function OperatorToken({
  item, isSelected, isTransforming, tool, status, onSelect, onUpdate, onRemove, onDblClick, onContextMenu, displayX, displayY, viewScaleMultiplier = 1.0, visible = true, ghost = false, ghostFloorLabel,
}: {
  item: BoardItem;
  isSelected: boolean;
  isTransforming: boolean;
  tool: Tool;
  status: "normal" | "dead" | "planting" | undefined;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, updates: Partial<BoardItem>) => void;
  onRemove: (id: string) => void;
  onDblClick: (id: string) => void;
  onContextMenu: (id: string, clientX: number, clientY: number) => void;
  displayX: number;
  displayY: number;
  viewScaleMultiplier?: number;
  /** When false the token stays mounted (preserving the cached SVG image) but is hidden. */
  visible?: boolean;
  /** When true the token is rendered at 25% opacity with pointer events disabled (cross-floor ghost). */
  ghost?: boolean;
  /** Short floor label shown beneath the ghost icon so users know which floor the operator is on. */
  ghostFloorLabel?: string;
}) {
  const image    = useOperatorIcon(item.iconPath);
  const groupRef = useRef<Konva.Group>(null);
  const trRef    = useRef<Konva.Transformer>(null);

  // Attach / detach Transformer on double-click only (isTransforming), not on single-click
  useEffect(() => {
    if (!trRef.current || !groupRef.current) return;
    trRef.current.nodes(isTransforming ? [groupRef.current] : []);
    trRef.current.getLayer()?.batchDraw();
  }, [isTransforming]);

  const interactive  = tool === "cursor" || tool === "eraser" || tool === "route";
  const tokenSize    = ICON_SIZE * item.scale * viewScaleMultiplier;   // respects per-token size slider; shrinks in isometric view
  const half         = tokenSize / 2;

  return (
    <>
      <KonvaGroup
        ref={groupRef}
        id={item.id}
        x={displayX}
        y={displayY}
        offsetX={half}
        offsetY={half}
        rotation={item.rotation}
        scaleX={item.scaleX}
        scaleY={item.scaleY}
        opacity={ghost ? 0.25 : status === "dead" ? 0.5 : 1}
        visible={visible || ghost}
        draggable={tool === "cursor" && visible && !ghost}
        listening={interactive && !ghost}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          onContextMenu(item.id, e.evt.clientX, e.evt.clientY);
        }}
        onMouseEnter={(e) => {
          if (!interactive) return;
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor =
            tool === "eraser" ? "crosshair" :
            tool === "route"  ? "cell"      : "move";
        }}
        onMouseLeave={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = "";
        }}
        onClick={(e) => {
          e.cancelBubble = true;
          if (tool === "cursor" || tool === "route") onSelect(item.id);
          if (tool === "eraser") onRemove(item.id);
        }}
        onDblClick={(e) => {
          e.cancelBubble = true;
          if (tool === "cursor") onDblClick(item.id);
        }}
        onTap={(e) => { e.cancelBubble = true; onSelect(item.id); }}
        onDragEnd={(e) => {
          onUpdate(item.id, { x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={() => {
          const n = groupRef.current!;
          onUpdate(item.id, {
            x: n.x(), y: n.y(),
            rotation: n.rotation(),
            scaleX: n.scaleX(), scaleY: n.scaleY(),
          });
        }}
      >
        {/* Inner clipped group — strict circle mask for background + logo only */}
        <KonvaGroup clipFunc={(ctx) => { ctx.arc(half, half, half, 0, Math.PI * 2, false); }}>
          <KonvaCircle
            x={half} y={half} radius={half}
            fill="#1c1c21"
            stroke="#3f3f46"
            strokeWidth={1.5}
          />
          {image ? (
            <KonvaImage
              image={image}
              x={0} y={0}
              width={tokenSize}
              height={tokenSize}
              listening={false}
            />
          ) : (
            <KonvaText
              x={0} y={0}
              width={tokenSize}
              height={tokenSize}
              text={item.name.slice(0, 2).toUpperCase()}
              fontSize={16}
              fontStyle="bold"
              fill="#f4f4f5"
              align="center"
              verticalAlign="middle"
              listening={false}
            />
          )}
        </KonvaGroup>

        {/* Selection ring — outside inner clip so it draws at full 5%-larger radius */}
        {isSelected && (
          <KonvaCircle
            x={half} y={half} radius={half * 1.05}
            stroke="#e85d2a" strokeWidth={2}
            listening={false}
          />
        )}

        {/* Dead overlay — outside inner clip */}
        {status === "dead" && (
          <>
            <Line points={[tokenSize * 0.15, tokenSize * 0.15, tokenSize * 0.85, tokenSize * 0.85]}
              stroke="#ef4444" strokeWidth={Math.max(4, tokenSize * 0.07)} lineCap="round" listening={false} />
            <Line points={[tokenSize * 0.85, tokenSize * 0.15, tokenSize * 0.15, tokenSize * 0.85]}
              stroke="#ef4444" strokeWidth={Math.max(4, tokenSize * 0.07)} lineCap="round" listening={false} />
          </>
        )}

        {/* Planting badge — outside inner clip so the corner bubble can overflow */}
        {status === "planting" && (
          <>
            <KonvaCircle
              x={tokenSize * 0.8} y={tokenSize * 0.2} radius={tokenSize * 0.22}
              fill="#facc15" listening={false}
            />
            <KonvaText
              x={tokenSize * 0.58} y={tokenSize * 0.02}
              width={tokenSize * 0.44} height={tokenSize * 0.36}
              text="P" fontSize={Math.round(tokenSize * 0.26)}
              fontStyle="bold" fill="#1c1917"
              align="center" verticalAlign="middle"
              listening={false}
            />
          </>
        )}

        {/* Ghost floor label — shown below the circle when operator is on a different floor */}
        {ghost && ghostFloorLabel && (
          <KonvaText
            x={0}
            y={tokenSize + 2}
            width={tokenSize}
            text={ghostFloorLabel}
            fontSize={Math.max(8, Math.round(tokenSize * 0.17))}
            fontStyle="bold"
            fill="#94a3b8"
            stroke="rgba(0,0,0,0.7)"
            strokeWidth={2}
            fillAfterStrokeEnabled
            align="center"
            listening={false}
          />
        )}
      </KonvaGroup>

      {/* Per-item transformer — only shown on double-click, not single-click, and only when visible */}
      {isTransforming && visible && (
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          borderStroke="#e85d2a"
          borderStrokeWidth={1.5}
          anchorSize={8}
          anchorFill="#ffffff"
          anchorStroke="#e85d2a"
          anchorCornerRadius={2}
        />
      )}
    </>
  );
}

// ─── Memoized operator node ────────────────────────────────────────────────────
// Lives outside staticLayers so timeline playback (playbackRowIndex changes)
// triggers re-renders here without busting the large static-layers memo.

const MemoizedOperatorNode = memo(function MemoizedOperatorNode({
  item,
  tool,
  selectedId,
  transformingItemId,
  currentFloorId,
  isPlayingTimeline,
  currentRouteStep,
  playbackRowIndex,
  routeTimeMap,
  viewScaleMultiplier,
  floorLabelMap,
  handleSelectOperator,
  updateItem,
  removeItem,
  handleContextMenu,
  setResizingItemId,
  setTransformingItemId,
}: {
  item: BoardItem;
  tool: Tool;
  selectedId: string | null;
  transformingItemId: string | null;
  currentFloorId: string | null;
  isPlayingTimeline: boolean;
  currentRouteStep: 1 | 2 | 3 | 4 | 5;
  playbackRowIndex: number;
  routeTimeMap: Record<string, Record<number, number>>;
  viewScaleMultiplier: number;
  /** floorId → short label (e.g. "2F") for the ghost floor badge. */
  floorLabelMap: Record<string, string>;
  handleSelectOperator: (id: string | null) => void;
  updateItem: (id: string, updates: Partial<BoardItem>) => void;
  removeItem: (id: string) => void;
  handleContextMenu: (id: string, clientX: number, clientY: number) => void;
  setResizingItemId: (id: string | null) => void;
  setTransformingItemId: (id: string | null) => void;
}) {
  // Cache route computation; only recalculate when the item's position/route changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const eff = useMemo(() => getEffectiveRoute(item), [item.route, item.x, item.y, item.floorId]);

  const activeStep = isPlayingTimeline
    ? (Math.max(1, getSnapPositionAtTimelineRow(item, playbackRowIndex, routeTimeMap).step) as 1 | 2 | 3 | 4 | 5)
    : currentRouteStep;

  const activePoint      = eff[activeStep];
  const isOnCurrentFloor = activePoint.floorId === currentFloorId;

  // Default: always mounted and visible; ghost flag controls cross-floor dimming.
  let tokenVisible = true;
  let isGhost      = !isOnCurrentFloor;

  // Gadget deploy-time visibility: completely hidden until the scanline reaches
  // the row the user assigned as the deploy point (always step 1 for gadgets).
  if (item.side === "neutral" && isPlayingTimeline) {
    const deployRow = routeTimeMap[item.id]?.[1];
    if (deployRow !== undefined && playbackRowIndex < deployRow) {
      tokenVisible = false;
      isGhost      = false; // not a ghost — just not deployed yet
    }
  }

  const ghostFloorLabel = isGhost ? (floorLabelMap[activePoint.floorId ?? ""] ?? "") : undefined;

  return (
    <OperatorToken
      item={item}
      isSelected={item.id === selectedId}
      isTransforming={item.id === transformingItemId}
      tool={tool}
      status={activePoint.status}
      onSelect={handleSelectOperator}
      onUpdate={updateItem}
      onRemove={(id) => { removeItem(id); handleSelectOperator(null); setTransformingItemId(null); }}
      onDblClick={(id) => { setResizingItemId(id); setTransformingItemId(id); }}
      onContextMenu={handleContextMenu}
      displayX={activePoint.x}
      displayY={activePoint.y}
      viewScaleMultiplier={viewScaleMultiplier}
      visible={tokenVisible}
      ghost={isGhost}
      ghostFloorLabel={ghostFloorLabel}
    />
  );
});

// ─── Main component ────────────────────────────────────────────────────────────

export default function MainCanvas({
  isLeftOpen = true,
  leftPanelWidth = 0,
  onToggleLeft,
  onResetWorkspace,
}: {
  isLeftOpen?: boolean;
  leftPanelWidth?: number;
  onToggleLeft?: () => void;
  onResetWorkspace?: () => void;
}) {
  // 🚨 Render tracker — remove after confirming scroll no longer spams re-renders
  console.log("🚨 MainCanvas Rendered");

  // ── Canvas store (map / floor / view) ─────────────────────────────────────
  const {
    maps,
    currentMapId, currentFloorId,
    currentMap, currentFloor,
    currentView, overlays,
    blueprintScaleMode,
    setMap, setFloor, setView, toggleOverlay, setBlueprintScaleMode,
  } = useCanvasStore(useShallow((s) => ({
    maps: s.maps,
    currentMapId: s.currentMapId, currentFloorId: s.currentFloorId,
    currentMap: s.currentMap, currentFloor: s.currentFloor,
    currentView: s.currentView, overlays: s.overlays,
    blueprintScaleMode: s.blueprintScaleMode,
    setMap: s.setMap, setFloor: s.setFloor, setView: s.setView,
    toggleOverlay: s.toggleOverlay, setBlueprintScaleMode: s.setBlueprintScaleMode,
  })));

  // ── Settings store ─────────────────────────────────────────────────────────
  const { isRightSidebarOpen, toggleRightSidebar, language, isAdvancedMode, isAiModeEnabled, rightSidebarTab, setRightSidebarTab } = useSettingsStore(
    useShallow((s) => ({
      isRightSidebarOpen: s.isRightSidebarOpen,
      toggleRightSidebar: s.toggleRightSidebar,
      language: s.language,
      isAdvancedMode: s.isAdvancedMode,
      isAiModeEnabled: s.isAiModeEnabled,
      rightSidebarTab: s.rightSidebarTab,
      setRightSidebarTab: s.setRightSidebarTab,
    })),
  );

  // ── Project store (save) ───────────────────────────────────────────────────
  const saveCurrentProject = useProjectStore((s) => s.saveCurrentProject);
  const saveAsNewProject   = useProjectStore((s) => s.saveAsNewProject);
  const currentProjectId   = useProjectStore((s) => s.currentProjectId);
  const [isExportOpen,     setIsExportOpen]  = useState(false);
  // ── Save-as-new modal ─────────────────────────────────────────────────────
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const saveModalInputRef = useRef<HTMLInputElement>(null);
  // ── Toast notification ────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);
  const exportMenuRef        = useRef<HTMLDivElement>(null);
  const jsonImportRef        = useRef<HTMLInputElement>(null);
  const roomLabelsImportRef  = useRef<HTMLInputElement>(null);

  // ── UI store (tool / brush / cursor state) ───────────────────────────────
  const {
    tool, setTool,
    brushColor, brushSize,
    throwableColor, throwableSize,
    isDraggingIcon,
    pendingOperator, setPendingOperator,
  } = useUIStore(useShallow((s) => ({
    tool: s.tool, setTool: s.setTool,
    brushColor: s.brushColor, brushSize: s.brushSize,
    throwableColor: s.throwableColor, throwableSize: s.throwableSize,
    isDraggingIcon: s.isDraggingIcon,
    pendingOperator: s.pendingOperator, setPendingOperator: s.setPendingOperator,
  })));

  const undo = useTemporalBoardStore((s) => s.undo);

  // ── Board store (items / lines / notes) ──────────────────────────────────
  const {
    currentRouteStep, setCurrentRouteStep, showFullRoute,
    exportVisibility, setExportWindowOpen,
    items, lines, throwableLines, texts, roomLabels,
    presetRoomLabels, showRoomNames, toggleRoomNames, setPresetRoomLabels,
    isVideoOpen, toggleVideo,
    notes,
    addItem, updateItem, removeItem,
    removeLine,
    removeThrowableLine,
    deleteRouteStep, clearRoute,
    updateText, removeText,
    updateRoomLabel, removeRoomLabel,
    setRouteStepStatus,
    isPlaying, setIsPlaying,
    hiddenOperators,
    routeTimeMap,
    isPlayingTimeline,
    playbackRowIndex,
    currentPhase, setPhase, switchPhase,
    setResizingItemId,
    transformingItemId, setTransformingItemId,
  } = useBoardStore(useShallow((s) => ({
    currentRouteStep: s.currentRouteStep, setCurrentRouteStep: s.setCurrentRouteStep, showFullRoute: s.showFullRoute,
    exportVisibility: s.exportVisibility,
    setExportWindowOpen: s.setExportWindowOpen,
    items: s.items, lines: s.lines, throwableLines: s.throwableLines, texts: s.texts, roomLabels: s.roomLabels,
    presetRoomLabels: s.presetRoomLabels, showRoomNames: s.showRoomNames,
    toggleRoomNames: s.toggleRoomNames, setPresetRoomLabels: s.setPresetRoomLabels,
    isVideoOpen: s.isVideoOpen, toggleVideo: s.toggleVideo,
    notes: s.notes,
    addItem: s.addItem, updateItem: s.updateItem, removeItem: s.removeItem,
    removeLine: s.removeLine,
    removeThrowableLine: s.removeThrowableLine,
    deleteRouteStep: s.deleteRouteStep, clearRoute: s.clearRoute,
    updateText: s.updateText, removeText: s.removeText,
    updateRoomLabel: s.updateRoomLabel, removeRoomLabel: s.removeRoomLabel,
    setRouteStepStatus: s.setRouteStepStatus,
    isPlaying: s.isPlaying, setIsPlaying: s.setIsPlaying,
    hiddenOperators: s.hiddenOperators,
    routeTimeMap: s.routeTimeMap,
    isPlayingTimeline: s.isPlayingTimeline,
    playbackRowIndex: s.playbackRowIndex,
    currentPhase: s.currentPhase, setPhase: s.setPhase, switchPhase: s.switchPhase,
    setResizingItemId: s.setResizingItemId,
    transformingItemId: s.transformingItemId, setTransformingItemId: s.setTransformingItemId,
  })));

  // ── Local UI state ────────────────────────────────────────────────────────
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const copiedItemRef = useRef<BoardItem | null>(null);
  const [editingTextId,  setEditingTextId]  = useState<string | null>(null);
  const [activeRoomEdit, setActiveRoomEdit] = useState<{ id: string; x: number; y: number; text: string; screenX: number; screenY: number } | null>(null);
  // Ref tracks activeRoomEdit for use in the document-level keydown handler (stale-closure-safe)
  const activeRoomEditRef = useRef(activeRoomEdit);
  activeRoomEditRef.current = activeRoomEdit;
  // Keep UIStore flag in sync so App.tsx menu-undo can also block undo during room label edit
  const setEditingRoomLabel = useUIStore((s) => s.setEditingRoomLabel);
  useEffect(() => {
    setEditingRoomLabel(activeRoomEdit !== null);
  }, [activeRoomEdit, setEditingRoomLabel]);
  const [ctxMenu, setCtxMenu] = useState<{ itemId: string; x: number; y: number } | null>(null);

  // Wrapper: clear resize/transform mode when switching operators
  // NOTE: does NOT reset currentRouteStep — step resets only on floor/phase switch
  const handleSelectOperator = useCallback((id: string | null) => {
    setSelectedId((prev) => {
      if (id !== prev) {
        setResizingItemId(null);
        setTransformingItemId(null);
      }
      return id;
    });
  }, [setResizingItemId, setTransformingItemId]);
  const handleContextMenu = useCallback((itemId: string, clientX: number, clientY: number) => {
    setCtxMenu({ itemId, x: clientX, y: clientY });
  }, []);

  // Scale/position managed via refs + direct Konva API — bypasses React render on every zoom tick.
  // zoomPercent is React state only for the toolbar display; Konva itself is updated imperatively.
  const scaleRef      = useRef(1);
  const positionRef   = useRef<Vec2>({ x: 0, y: 0 });
  // Throttle the toolbar zoom% display to at most one React re-render per 100 ms during wheel spin.
  const zoomUiTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [zoomPercent, setZoomPercent]     = useState(100);
  const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });


  // ── Blueprint transform — lifted from MapImageLayer so items co-transform ──
  // buildingCenter: updated from whichever image is currently loaded.
  // blueprintCenter: only updated when the blueprint image is scanned — persists across view switches
  //                  so the same pivot is reused on the standard map view.
  const [buildingCenter, setBuildingCenter] = useState<{ x: number; y: number } | null>(null);
  const [blueprintCenter, setBlueprintCenter] = useState<{ x: number; y: number } | null>(null);
  // Reset both on map/floor change.
  useEffect(() => { setBuildingCenter(null); setBlueprintCenter(null); }, [currentMapId, currentFloorId]);

  // Reset standard-scale and room-names when entering 3D (isometric) view — incompatible with both.
  useEffect(() => {
    if (currentView === "isometric") {
      if (blueprintScaleMode === "standard") setBlueprintScaleMode("default");
      if (useBoardStore.getState().showRoomNames) useBoardStore.getState().toggleRoomNames();
    }
  }, [currentView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable callback ref so MapImageLayer (memo) doesn't re-render just because currentView changed.
  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;
  const handleCenterCalculated = useCallback((center: { x: number; y: number }) => {
    setBuildingCenter(center);
    // Only promote to blueprintCenter when scanned from the blueprint image.
    if (currentViewRef.current === "blueprint") setBlueprintCenter(center);
  }, []);

  // Effective pivot: prefer the blueprint-image center; fall back to whatever was computed last.
  const effectiveCenter = blueprintCenter ?? buildingCenter;
  const isStandardScale = blueprintScaleMode === "standard";
  // Transform is active for non-isometric views once we have a pivot, not just blueprint view.
  const isStandardBp = isStandardScale && effectiveCenter != null && currentView !== "isometric";
  const bpScale   = (isStandardScale && currentView !== "isometric") ? (BLUEPRINT_MANUAL_SCALES[currentMapId ?? ""] ?? 1.0) : 1.0;
  const bpOffsetX = effectiveCenter?.x ?? 0;
  const bpOffsetY = effectiveCenter?.y ?? 0;
  // Render-scale compensation: keeps strokes and operator icons visually consistent
  // regardless of bpScale.  Isometric view additionally shrinks tokens to 40 % of normal.
  const renderScaleFactor = (currentView === "isometric" ? 0.4 : 1.0) / bpScale;
  // Shared Konva transform applied to BOTH the image layer and the items Group.
  const bpTransformProps = isStandardBp
    ? { x: 3200, y: 1800, offsetX: bpOffsetX, offsetY: bpOffsetY, scaleX: bpScale, scaleY: bpScale }
    : { x: 0,    y: 0,    offsetX: 0,         offsetY: 0,         scaleX: 1,       scaleY: 1       };

  // Refs
  const stageRef        = useRef<Konva.Stage>(null);
  const containerRef    = useRef<HTMLDivElement>(null);
  const stageWrapperRef = useRef<HTMLDivElement>(null);
  const resizeTimerRef      = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stretchTimerRef     = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevContainerSize   = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  // Tracks the last size committed to state — readable inside ResizeObserver closure.
  const committedSizeRef    = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // ── Drawing hook ───────────────────────────────────────────────────────────
  // liveShape, isDrawingRef, toMapCoords and all three mouse handlers live here.
  // The hook reads tool/brushColor/etc. from useBoardStore directly.
  const { handleMouseDown, handleMouseMove, handleMouseUp, liveShape } = useCanvasDraw({
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
  });

  // Derived
  const floor      = currentFloor();
  const map        = currentMap();
  const mapItems   = maps.map((m) => {
    const key = `map_${m.id}`;
    const translated = t(key, language);
    return { id: m.id, label: translated === key ? m.name : translated };
  });
  const floorItems = map
    ? map.floors
        .filter((f) => f.images.default || f.images.blueprint || f.images.isometric)
        .map((f) => ({ id: f.id, label: f.label }))
    : [];

  // basePath for the current floor is used only for image-load-status tracking and fit-to-screen
  const basePath = floor?.images?.[currentView] ?? floor?.images?.default ?? "";

  const [baseImgEl, imageStatus] = useImage(basePath);

  // ── Container resize ───────────────────────────────────────────────────────
  // Debounced by one ~16ms frame so Konva doesn't redraw on every pixel of a sidebar drag.
  // For large resizes (fullscreen toggle), the stage wrapper is hidden HERE — synchronously,
  // before the debounce fires — so the Konva canvas never shows the map at the wrong
  // scale/position. The animation effect reveals it after fitToScreen has corrected everything.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      const prev = committedSizeRef.current;
      const ratio = prev.w > 0 && prev.h > 0
        ? Math.max(Math.abs(w - prev.w) / prev.w, Math.abs(h - prev.h) / prev.h)
        : 0;
      if (ratio > 0.12) {
        const sw = stageWrapperRef.current;
        if (sw) {
          clearTimeout(stretchTimerRef.current);
          sw.style.transition = "none";
          sw.style.opacity    = "0";
        }
      }
      clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        committedSizeRef.current = { w, h };
        setContainerSize({ width: w, height: h });
      }, 16);
    });
    obs.observe(el);
    return () => {
      obs.disconnect();
      clearTimeout(resizeTimerRef.current);
      clearTimeout(stretchTimerRef.current);
    };
  }, []);

  // ── Fit-to-screen ──────────────────────────────────────────────────────────
  // Blueprint view: the Konva canvas coordinate space is 6400×3600 (background rect size).
  // All other views: fit to the natural image dimensions.
  const fitToScreen = useCallback(() => {
    const isBp = currentView === "blueprint";
    const w    = isBp ? 6400 : baseImgEl?.naturalWidth;
    const h    = isBp ? 3600 : baseImgEl?.naturalHeight;
    if (!w || !h || !containerSize.width || !containerSize.height) return;
    const scale = Math.min(containerSize.width / w, containerSize.height / h) * 0.95;
    const pos   = {
      x: (containerSize.width  - w * scale) / 2,
      y: (containerSize.height - h * scale) / 2,
    };
    scaleRef.current    = scale;
    positionRef.current = pos;
    const stage = stageRef.current;
    if (stage) { stage.scale({ x: scale, y: scale }); stage.position(pos); stage.batchDraw(); }
    setZoomPercent(Math.round(scale * 100));
  }, [baseImgEl, containerSize, currentView]);

  // ── Camera Reset Effect ────────────────────────────────────────────────────
  // Single authoritative viewport reset. Fires when:
  //   • The active project is closed (currentProjectId → null)
  //   • The user switches to a different map (currentMapId changes)
  // Does NOT fire on initial mount, nor during normal editing or project saves.
  const cameraResetMountedRef    = useRef(false);
  const prevMapIdForCameraRef    = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!cameraResetMountedRef.current) {
      cameraResetMountedRef.current   = true;
      prevMapIdForCameraRef.current   = currentMapId;
      return;
    }
    const mapChanged = currentMapId !== prevMapIdForCameraRef.current;
    prevMapIdForCameraRef.current = currentMapId;

    if (currentProjectId === null || mapChanged) {
      scaleRef.current    = 1;
      positionRef.current = { x: 0, y: 0 };
      if (stageRef.current) {
        stageRef.current.scale({ x: 1, y: 1 });
        stageRef.current.position({ x: 0, y: 0 });
        stageRef.current.batchDraw();
      }
      setZoomPercent(100);
      // fitToScreen re-centers on the loaded image; no-op if no image yet
      // (auto-fit effect will handle it once the new image finishes loading).
      fitToScreen();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, currentMapId]);

  // Auto-fit whenever the image finishes loading, the container resizes,
  // or the map/floor/view changes — but NOT in blueprint mode (Stage must stay untouched there).
  useEffect(() => {
    if (currentView === "blueprint" && containerSize.width > 0) {
      fitToScreen();
    } else if (imageStatus === "loaded" && currentView !== "blueprint") {
      fitToScreen();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageStatus, containerSize.width, containerSize.height, currentMapId, currentFloorId, currentView]);

  // ── Fullscreen transition: reveal after reposition ─────────────────────────
  // Fires AFTER fitToScreen (effect ordering). The stage wrapper was already hidden
  // synchronously in ResizeObserver before Konva had a chance to show the wrong size.
  // Here we just wait 2 rAFs (frame 1 = Konva batchDraw at correct position,
  // frame 2 = safe) then fade in — user only ever sees the map correctly placed.
  useEffect(() => {
    const { width: w, height: h } = containerSize;
    const prev = prevContainerSize.current;
    const isLargeResize =
      prev.w > 0 && prev.h > 0 &&
      Math.max(Math.abs(w - prev.w) / prev.w, Math.abs(h - prev.h) / prev.h) > 0.12;
    prevContainerSize.current = { w, h };
    if (!isLargeResize) return;

    const el = stageWrapperRef.current;
    if (!el) return;

    // Frame 1: Konva's batchDraw fires and redraws at the new position.
    // Frame 2: safe to reveal.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        clearTimeout(stretchTimerRef.current);
        el.style.transition = "opacity 220ms ease-out";
        el.style.opacity    = "1";
        stretchTimerRef.current = setTimeout(() => {
          el.style.transition = "";
          el.style.opacity    = "";
        }, 280);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize]);

  // Auto-fallback: if the selected view has no image on the new floor, switch to first available
  useEffect(() => {
    const f = currentFloor();
    if (!f) return;
    if (f.images[currentView]) return; // current view is available — nothing to do
    const fallback = (["default", "blueprint", "isometric"] as const).find((v) => f.images[v]);
    if (fallback) setView(fallback);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFloorId, currentMapId]);

  // ── Keyboard: Delete / Backspace removes selected item or text node ───────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!selectedId) return;
      if (texts.some((t) => t.id === selectedId)) {
        removeText(selectedId);
        setSelectedId(null);
      } else if (roomLabels.some((rl) => rl.id === selectedId)) {
        removeRoomLabel(selectedId);
        setSelectedId(null);
      } else if (tool === "route") {
        // In route mode: remove only the current step waypoint, not the whole operator
        deleteRouteStep(selectedId, currentRouteStep);
      } else {
        removeItem(selectedId);
        setSelectedId(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, tool, currentRouteStep, deleteRouteStep, removeItem, removeText, removeRoomLabel, texts, roomLabels]);

  // ── Keyboard shortcuts for tool switching + route step 1–5 ───────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") { setPendingOperator(null); setTool("cursor"); }
      if (e.key === "v" || e.key === "V") setTool("cursor");
      if (e.key === "p" || e.key === "P") setTool("pen");
      if (e.key === "a" || e.key === "A") setTool("arrow");
      if (e.key === "e" || e.key === "E") setTool("eraser");
      if (e.key === "t" || e.key === "T") { if (currentView !== "isometric") toggleRoomNames(); return; }
      if (e.key === "r" || e.key === "R") setTool("route");
      if (e.key === "x" || e.key === "X") setTool("text");
      if (e.key === " ") { e.preventDefault(); setIsPlaying(!isPlaying); }
      // 1–5 jump to route step when route tool is active
      if (tool === "route" && e.key >= "1" && e.key <= "5") {
        setCurrentRouteStep(parseInt(e.key) as 1 | 2 | 3 | 4 | 5);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
        if (selectedId) {
          const itemToCopy = items.find((i) => i.id === selectedId);
          if (itemToCopy) copiedItemRef.current = JSON.parse(JSON.stringify(itemToCopy));
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
        if (copiedItemRef.current) {
          const pasted: BoardItem = { ...copiedItemRef.current, id: crypto.randomUUID(), x: copiedItemRef.current.x + 30, y: copiedItemRef.current.y + 30 };
          addItem(pasted);
          setSelectedId(pasted.id);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        // If the room-label editor is open, close it instead of undoing board state.
        // Calling undo() while the textarea overlay is mounted can cause a render crash.
        if (activeRoomEditRef.current) { setActiveRoomEdit(null); return; }
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (currentProjectId) {
          saveCurrentProject().then(() => {
            showToast("项目已覆盖保存");
          });
        } else {
          setSaveModalName("");
          setSaveModalOpen(true);
          setTimeout(() => saveModalInputRef.current?.focus(), 0);
        }
      }
      // Arrow-key canvas pan — 40px per keypress, no React state involved
      const PAN_STEP = 40;
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;
        const dx = e.key === "ArrowLeft" ? PAN_STEP : e.key === "ArrowRight" ? -PAN_STEP : 0;
        const dy = e.key === "ArrowUp"   ? PAN_STEP : e.key === "ArrowDown"  ? -PAN_STEP : 0;
        const newPos = { x: positionRef.current.x + dx, y: positionRef.current.y + dy };
        positionRef.current = newPos;
        stage.position(newPos);
        stage.batchDraw();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setTool, tool, setCurrentRouteStep, undo, currentProjectId, saveCurrentProject, isPlaying, setIsPlaying, selectedId, items, addItem, toggleRoomNames, currentView]);

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
  // Wheel zoom: bypass React state entirely — write directly to Konva stage.
  // Only zoomPercent (toolbar display) is updated via throttled setState, max once per 100ms.
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const ptr = stage.getPointerPosition();
      if (!ptr) return;
      const cur      = scaleRef.current;
      const dir      = e.evt.deltaY < 0 ? 1 : -1;
      const newScale = Math.min(Math.max(cur * (dir > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR), ZOOM_MIN), ZOOM_MAX);
      const newPos   = {
        x: ptr.x - (ptr.x - positionRef.current.x) * (newScale / cur),
        y: ptr.y - (ptr.y - positionRef.current.y) * (newScale / cur),
      };
      scaleRef.current    = newScale;
      positionRef.current = newPos;
      stage.scale({ x: newScale, y: newScale });
      stage.position(newPos);
      stage.batchDraw();
      // Throttle the React state update to ≤1 re-render per 100 ms so the Konva
      // imperative path runs at full frame-rate while the toolbar % lags minimally.
      if (zoomUiTimerRef.current === undefined) {
        zoomUiTimerRef.current = setTimeout(() => {
          setZoomPercent(Math.round(scaleRef.current * 100));
          zoomUiTimerRef.current = undefined;
        }, 100);
      }
    },
    [], // refs are always current — no deps needed
  );

  // Clear pending zoom-UI timer on unmount to avoid setState-after-unmount.
  useEffect(() => () => clearTimeout(zoomUiTimerRef.current), []);

  const zoomStep = (dir: 1 | -1) => {
    const stage = stageRef.current;
    if (!stage) return;
    const cx  = containerSize.width / 2, cy = containerSize.height / 2;
    const cur = scaleRef.current;
    const newScale = Math.min(Math.max(cur * (dir > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR), ZOOM_MIN), ZOOM_MAX);
    const newPos   = {
      x: cx - (cx - positionRef.current.x) * (newScale / cur),
      y: cy - (cy - positionRef.current.y) * (newScale / cur),
    };
    scaleRef.current    = newScale;
    positionRef.current = newPos;
    stage.scale({ x: newScale, y: newScale });
    stage.position(newPos);
    stage.batchDraw();
    setZoomPercent(Math.round(newScale * 100));
  };

  // ── HTML5 drag-drop: receive operator token from sidebar ───────────────────
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    console.log("🔥 Drop event fired at:", e.clientX, e.clientY);

    const stage     = stageRef.current;
    const container = containerRef.current;
    if (!stage || !container) return;

    const rect      = container.getBoundingClientRect();
    const worldX    = (e.clientX - rect.left  - stage.x()) / stage.scaleX();
    const worldY    = (e.clientY - rect.top   - stage.y()) / stage.scaleY();
    // Convert Stage-world → map-image coords (accounts for blueprint transform)
    const canvasX   = isStandardBp ? (worldX - 3200) / bpScale + bpOffsetX : worldX;
    const canvasY   = isStandardBp ? (worldY - 1800) / bpScale + bpOffsetY : worldY;

    const { draggingOperator, clearDraggingOperator } = useUIStore.getState();
    console.log("📦 Drag state received:", draggingOperator);
    if (!draggingOperator) return;

    addItem({
      id: crypto.randomUUID(),
      operatorId: draggingOperator.operatorId,
      iconPath:   draggingOperator.iconPath,
      name:       draggingOperator.name,
      side:       draggingOperator.side,
      x: canvasX, y: canvasY,
      rotation: 0, scaleX: 1, scaleY: 1,
    });
    clearDraggingOperator();
  }, [addItem]);

  // ── Export hook ─────────────────────────────────────────────────────────────
  // handleExport (PDF), handleExportGif, handleExportAllPhases, handleExportImage,
  // isExporting, isExportingGif — and the FloatingExportWindow trigger effects — all live here.
  const {
    handleExport,
    handleExportAllPhases,
    handleExportImage,
    isExporting,
    isExportingGif,
  } = useCanvasExport({ stageRef });


  // ── Presentation playback — step through route 1→5, then loop back ────────
  const playStepRef = useRef(currentRouteStep);
  playStepRef.current = currentRouteStep;
  useEffect(() => {
    if (!isPlaying) return;
    setCurrentRouteStep(1);
    const id = setInterval(() => {
      const next = playStepRef.current < 5
        ? ((playStepRef.current + 1) as 1 | 2 | 3 | 4 | 5)
        : 1;
      setCurrentRouteStep(next);
    }, 1200);
    return () => clearInterval(id);
  }, [isPlaying, setCurrentRouteStep]);

  // ── Timeline playback start: deselect operator and reset to cursor tool ──────
  useEffect(() => {
    if (isPlayingTimeline) {
      setTool("cursor");
      setSelectedId(null);
    }
  }, [isPlayingTimeline, setTool]);

  // Close export menu and context menu on outside click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportOpen(false);
      }
      setCtxMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const handleExportMarkdown = () => {
    if (!notes) return;
    const blob = new Blob([notes], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "R6-Tactic-Notes.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportProject = () => {
    const board   = useBoardStore.getState();
    const canvas  = useCanvasStore.getState();
    const { currentProjectId, projectsList } = useProjectStore.getState();
    const projectName = projectsList.find((p) => p.id === currentProjectId)?.name ?? "Untitled_Project";
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
  };

  // 自动从 public/maps/ 加载当前楼层的房间名 JSON
  useEffect(() => {
    if (!currentMapId || !currentFloorId) return;
    fetch(`/maps/${currentMapId}-${currentFloorId}-name.json`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("File not found");
      })
      .then((data) => {
        useBoardStore.getState().setRoomLabelsForFloor(currentFloorId, data);
      })
      .catch(() => {
        // 文件不存在时跳过，该楼层尚未配置房间名
      });
  }, [currentMapId, currentFloorId]);

  // ── Preset room names: load from /names/[mapId]-[floorId]-name.json ─────────
  // Clears the cache when map/floor changes; silently no-ops when file is absent.
  useEffect(() => {
    if (!currentMapId || !currentFloorId) { setPresetRoomLabels([]); return; }
    fetch(`/names/${currentMapId}-${currentFloorId}-name.json`)
      .then((res) => { if (res.ok) return res.text(); throw new Error("not found"); })
      .then((text) => JSON.parse(stripBOM(text)) as RoomLabelDef[])
      .then((data) => setPresetRoomLabels(data))
      .catch(() => setPresetRoomLabels([]));
  }, [currentMapId, currentFloorId, setPresetRoomLabels]);

  // ── [TRACER] Type sniffer — diagnose Windows NaN-coordinate silent-drop bug ──
  useEffect(() => {
    if (roomLabels.length > 0) {
      console.log("[Tracer] Label 0 Data:", roomLabels[0]);
      console.log("[Tracer] Type of X/Y:", typeof roomLabels[0].x, typeof roomLabels[0].y);
      console.log("[Tracer] X/Y values:", roomLabels[0].x, roomLabels[0].y);
    }
  }, [roomLabels]);

  /** Resolve localized text from a preset label. Falls back to English, then the raw value. */
  const getPresetText = (text: RoomLabelDef["text"], lang: string): string => {
    if (typeof text === "string") return text;
    return text[lang] ?? text["en"] ?? "";
  };

  const handleExportRoomLabels = () => {
    const { roomLabels } = useBoardStore.getState();
    const labelsForFloor = roomLabels.filter((rl) => rl.floorId === currentFloorId);
    const blob = new Blob([JSON.stringify(labelsForFloor, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentMapId}-${currentFloorId}-name.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportRoomLabels = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentFloorId) return;
    const inputEl = e.target; // capture before async — React synthetic events may be nulled
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rawText = ev.target?.result as string;
        if (!rawText) return;
        // Strip Windows UTF-8 BOM (0xEF BB BF / \uFEFF) that Notepad & some editors silently prepend
        const cleanText = rawText.replace(/^\uFEFF/, '').trim();
        const data = JSON.parse(cleanText);
        useBoardStore.getState().setRoomLabelsForFloor(currentFloorId, data);
      } catch (error) {
        console.error("Failed to parse Room Labels JSON:", error);
        alert("加载失败：JSON 文件格式损坏或包含非法字符。");
      } finally {
        // Always clear the input so the same file can be re-selected on the next upload
        inputEl.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const inputEl = e.target;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rawText = ev.target?.result as string;
        if (!rawText) return;
        // Strip UTF-8 BOM that Windows editors (Notepad, Excel) silently prepend
        const cleanText = rawText.replace(/^\uFEFF/, '').trim();
        const parsed = JSON.parse(cleanText);
        const data = parsed.payload
          ? { ...parsed.payload.boardState, notes: parsed.payload.notes, floorId: parsed.payload.floorId, mapId: parsed.meta?.mapId }
          : parsed;
        useBoardStore.getState().loadProjectData(data);
      } catch {
        console.error("❌ [Import] Failed to parse .mty project file");
        alert("Import failed: invalid or corrupted .mty file.");
      } finally {
        inputEl.value = '';
      }
    };
    reader.readAsText(file);
  };

  // ── Derived display ────────────────────────────────────────────────────────
  const isPannable  = tool === "cursor" || tool === "eraser";

  const cursorStyle: React.CSSProperties["cursor"] =
    tool === "pen"            ? "crosshair" :
    tool === "arrow"          ? "crosshair" :
    tool === "throwable"      ? "crosshair" :
    tool === "route"          ? "cell"      :
    tool === "eraser"         ? "cell"      :
    tool === "text"           ? "text"      :
    tool === "place_operator" ? "copy"      :
    tool === "room_name"      ? "crosshair" :
    "default";

  const statusHints: Record<Tool, string> = {
    cursor:         t("hint.cursor",    language),
    pen:            t("hint.pen",       language),
    arrow:          t("hint.arrow",     language),
    eraser:         t("hint.eraser",    language),
    throwable:      "Throwable · drag to draw trajectory",
    route:          "Route · click operator to select, then click canvas to add waypoints (max 5) · Eraser clears route  (R)",
    text:           t("hint.text",      language),
    place_operator: `${t("hint.placing", language)} ${pendingOperator?.name ?? "operator"} · click on map to place · Esc to cancel`,
    room_name: t("hint.room_name", language),
  };

  const toolConfig: { id: Tool; icon: React.ElementType; label: string; dividerBefore?: boolean }[] = [
    { id: "cursor",    icon: MousePointer2,  label: "Select     (V)" },
    { id: "pen",       icon: Pencil,         label: "Pen        (P)" },
    { id: "arrow",     icon: ArrowRight,     label: "Arrow      (A)" },
    { id: "eraser",    icon: Eraser,         label: "Eraser     (E)" },
    { id: "throwable", icon: Spline,         label: "Throwable", dividerBefore: true },
    { id: "route",     icon: Route,          label: "Route      (R)" },
    { id: "text",      icon: MessageSquare,  label: "Text       (X)" },
    ...(isAdvancedMode ? [{ id: "room_name" as Tool, icon: Tag, label: "Room Label", dividerBefore: true }] : []),
  ];

  // ── Memoized Stage layers — excluded from zoomPercent re-renders ──────────
  // When only zoomPercent changes (e.g. wheel scroll), these layers return
  // the same object reference so React skips reconciling the entire Konva tree.
  const staticLayers = useMemo(() => (
    <>
      {/* Layer 0 — active floor map background only. All floors are pre-cached by
          the HTML <MapPreloader> so use-image resolves from RAM in 0ms on floor
          switch, preventing the white-flash without bloating the Konva hit-graph. */}
      <Layer listening={false}>
        {floor && (() => {
          const flBase   = floor.images[currentView] ?? floor.images.default ?? "";
          const flVert   = overlays.vert   ? (floor.images.verticality ?? "") : "";
          const flProps  = overlays.props  ? (floor.images.props        ?? "") : "";
          const flStairs = overlays.stairs ? (floor.images.stairs       ?? "") : "";
          const flNames  = overlays.names  ? (floor.images.roomNames    ?? "") : "";
          return flBase ? (
            <>
              <MapImageLayer
                basePath={flBase}
                vertPath={flVert}
                propsPath={flProps}
                stairsPath={flStairs}
                namesPath={flNames}
                currentView={currentView}
                currentMapId={currentMapId ?? ""}
                blueprintScaleMode={blueprintScaleMode}
                onCenterCalculated={handleCenterCalculated}
                externalCenter={blueprintCenter ?? undefined}
              />
              {/* Blueprint legend */}
              {currentView === "blueprint" && (
                <KonvaLabel x={160} y={160} listening={false}>
                  <KonvaTag
                    fill="rgba(10, 37, 64, 0.85)"
                    cornerRadius={12}
                    stroke="#4aa5ff"
                    strokeWidth={6}
                  />
                  <KonvaText
                    text={"■  " + (map?.name.toUpperCase() || "MAP") + " // " + (floor.label.toUpperCase() || "FLOOR") + " — TACTICAL BLUEPRINT"}
                    fill="#ffffff"
                    fontFamily="ui-monospace, monospace"
                    fontSize={72}
                    fontStyle="bold"
                    padding={40}
                  />
                </KonvaLabel>
              )}
            </>
          ) : null;
        })()}
      </Layer>

      {/* Layer 1 — operator tokens + drawings, co-transformed with the map image */}
      <Layer>
        <KonvaGroup {...bpTransformProps}>
        {/* Committed lines — filtered to current phase and floor */}
        {lines.filter((l) => l.phase === currentPhase && l.floorId === currentFloorId).map((ln) =>
          ln.type === "arrow" ? (
            <Arrow key={ln.id}
              points={ln.points}
              stroke={ln.color}
              fill={ln.color}
              strokeWidth={ln.strokeWidth * renderScaleFactor}
              pointerLength={12}
              pointerWidth={10}
              lineCap="round"
              hitStrokeWidth={16}
              listening={tool === "eraser"}
              onClick={() => { if (tool === "eraser") removeLine(ln.id); }}
            />
          ) : (
            <Line key={ln.id}
              points={ln.points}
              stroke={ln.color}
              strokeWidth={ln.strokeWidth * renderScaleFactor}
              lineCap="round"
              lineJoin="round"
              tension={0.4}
              hitStrokeWidth={16}
              listening={tool === "eraser"}
              onClick={() => { if (tool === "eraser") removeLine(ln.id); }}
            />
          )
        )}

        {/* Throwable trajectories — dashed parabolas (color/width stored per-line) */}
        {throwableLines.filter((l) => l.phase === currentPhase && l.floorId === currentFloorId).map((tl) => (
          <Line key={tl.id}
            points={tl.points}
            stroke={tl.color}
            strokeWidth={tl.strokeWidth * renderScaleFactor}
            dash={[10, 8]}
            tension={0.4}
            lineCap="round"
            lineJoin="round"
            hitStrokeWidth={16}
            listening={tool === "eraser"}
            onClick={() => { if (tool === "eraser") removeThrowableLine(tl.id); }}
          />
        ))}

        {/* Operator movement routes — floor-aware: only draw segments on the current floor */}
        {!isExportingGif && items
          .filter((i) => i.phase === currentPhase && Object.keys(i.route).length > 0)
          .filter((i) => !hiddenOperators.includes(i.id))
          .map((item) => {
          const eff            = getEffectiveRoute(item);
          const upTo           = showFullRoute ? 5 : currentRouteStep;
          const isEraserActive = tool === "eraser";

          // Transition-aware segment builder:
          // An edge A→B is rendered on `currentFloorId` only when BOTH A and B are on that floor.
          // A cross-floor hop silently breaks the current segment; when back on the right floor
          // after a gap, always start a fresh segment (never connect across the gap).
          const arrowSegments: number[][] = [];
          let seg: number[] = [];
          for (let s = 0; s <= upTo; s++) {
            const pt     = eff[s];
            const prevPt = s > 0 ? eff[s - 1] : null;
            if (pt.floorId !== currentFloorId) {
              // This point is off-floor — close any open segment.
              if (seg.length >= 4) arrowSegments.push(seg);
              seg = [];
            } else if (prevPt !== null && prevPt.floorId !== currentFloorId) {
              // Back on the current floor after a cross-floor gap — start fresh here;
              // do NOT connect to whatever came before the gap.
              if (seg.length >= 4) arrowSegments.push(seg);
              seg = [pt.x, pt.y];
            } else {
              // Both this point and its predecessor are on the current floor (or s === 0).
              seg.push(pt.x, pt.y);
            }
          }
          if (seg.length >= 4) arrowSegments.push(seg);

          // Step badges: only on the current floor, using effective (inherited) floorId
          const visibleBadges = Object.entries(item.route)
            .filter(([stepStr]) => {
              const s = Number(stepStr);
              return s <= upTo && s !== currentRouteStep && eff[s].floorId === currentFloorId;
            });

          if (arrowSegments.length === 0 && visibleBadges.length === 0) return null;

          return (
            <Fragment key={`route-${item.id}`}>
              {arrowSegments.map((pts, idx) => (
                <Arrow
                  key={idx}
                  points={pts}
                  stroke="rgba(255,255,255,0.92)"
                  fill="rgba(255,255,255,0.92)"
                  strokeWidth={2.5}
                  pointerLength={10}
                  pointerWidth={8}
                  lineCap="round"
                  lineJoin="round"
                  tension={0}
                  hitStrokeWidth={14}
                  listening={isEraserActive}
                  onClick={() => { if (isEraserActive) clearRoute(item.id); }}
                />
              ))}
              {visibleBadges.map(([stepStr, wp]) => {
                  const step = Number(stepStr);
                  return (
                    <Fragment key={step}>
                      <KonvaCircle
                        x={wp.x} y={wp.y}
                        radius={11}
                        fill="rgba(0,0,0,0.78)"
                        stroke="rgba(255,255,255,0.92)"
                        strokeWidth={1.5}
                        hitStrokeWidth={14}
                        listening={isEraserActive}
                        onClick={(e) => { e.cancelBubble = true; if (isEraserActive) { const r = { ...item.route }; delete r[step]; updateItem(item.id, { route: r }); } }}
                      />
                      <KonvaText
                        x={wp.x} y={wp.y}
                        text={String(step)}
                        fill="white"
                        fontSize={12}
                        fontStyle="bold"
                        width={22}
                        height={22}
                        offsetX={11}
                        offsetY={11}
                        align="center"
                        verticalAlign="middle"
                        listening={false}
                      />
                    </Fragment>
                  );
                })}
            </Fragment>
          );
        })}

        {/* Text annotations */}
        {texts
          .filter((tn) => tn.phase === currentPhase && tn.floorId === currentFloorId)
          .map((tn) => (
            <KonvaText
              key={tn.id}
              id={`text-${tn.id}`}
              x={tn.x}
              y={tn.y}
              text={editingTextId === tn.id ? "" : tn.text}
              fontSize={tn.fontSize}
              fill={tn.fill}
              rotation={tn.rotation}
              scaleX={tn.scaleX}
              scaleY={tn.scaleY}
              draggable={tool === "cursor"}
              listening={tool === "cursor" || tool === "eraser" || tool === "text"}
              shadowEnabled={selectedId === tn.id}
              shadowColor="#e85d2a"
              shadowBlur={10}
              shadowOpacity={0.8}
              onClick={(e) => {
                e.cancelBubble = true;
                if (tool === "eraser") { removeText(tn.id); return; }
                if (tool === "cursor") setSelectedId(tn.id);
              }}
              onDblClick={(e) => {
                e.cancelBubble = true;
                if (tool === "cursor") setEditingTextId(tn.id);
              }}
              onDragEnd={(e) => updateText(tn.id, { x: e.target.x(), y: e.target.y() })}
            />
          ))}

        {/* 房间名称渲染 — toggled by T key / Room Names button; always visible in advanced mode */}
        {(showRoomNames || isAdvancedMode) && roomLabels
          .filter((rl) => rl.floorId === currentFloorId)
          .map((label) => (
            <KonvaText
              key={label.id}
              x={label.x}
              y={label.y}
              text={activeRoomEdit?.id === label.id ? "" : (label.text || "")}
              fontSize={label.fontSize}
              fontFamily={SAFE_FONT_FAMILY}
              fill={label.fill || "#ffffff"}
              stroke="rgba(0,0,0,0.75)"
              strokeWidth={2 / bpScale}
              fillAfterStrokeEnabled={true}
              fontStyle="bold"
              rotation={label.rotation}
              scaleX={label.scaleX}
              scaleY={label.scaleY}
              draggable={tool === "cursor"}
              listening={tool === "cursor" || tool === "eraser"}
              onClick={(e) => {
                e.cancelBubble = true;
                if (tool === "eraser") { removeRoomLabel(label.id); return; }
                if (tool === "cursor") setSelectedId(label.id);
              }}
              onDblClick={(e) => {
                e.cancelBubble = true;
                if (tool === "cursor") {
                  const rect = containerRef.current?.getBoundingClientRect();
                  const sx = rect ? e.evt.clientX - rect.left : e.evt.clientX;
                  const sy = rect ? e.evt.clientY - rect.top  : e.evt.clientY;
                  setActiveRoomEdit({ id: label.id, x: label.x, y: label.y, text: label.text, screenX: sx, screenY: sy });
                }
              }}
              onDragEnd={(e) => updateRoomLabel(label.id, { x: e.target.x(), y: e.target.y() })}
            />
          ))}
        </KonvaGroup>
      </Layer>
    </>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [map, floor, currentFloorId, overlays, currentView, currentMapId, blueprintScaleMode,
      bpTransformProps, renderScaleFactor, setBuildingCenter,
      lines, throwableLines, currentPhase, tool,
      showFullRoute, currentRouteStep, isExportingGif,
      items, selectedId,
      updateItem, removeLine, removeThrowableLine, clearRoute,
      texts, editingTextId, updateText, removeText, handleContextMenu,
      roomLabels, activeRoomEdit, updateRoomLabel, removeRoomLabel,
      showRoomNames, isAdvancedMode]);

  // ── Preset room names layer — physically isolated memo so鼠标移动 / operator
  //    drag never re-renders this layer. Only updates when the data or toggle changes.
  const presetRoomsLayer = useMemo(() => {
    // Always mount the <Layer> — unmounting/remounting a Konva Layer shifts layer indices
    // and causes WebView2 / Chromium to lose track of canvas nodes on subsequent renders.
    // Visibility is controlled by rendering an empty KonvaGroup instead.
    const show = showRoomNames && !isAdvancedMode;
    const visible = show
      ? presetRoomLabels.filter((rl) => !rl.floorId || rl.floorId === currentFloorId)
      : [];
    return (
      <Layer listening={false}>
        {/* ── WIN_TEST tracer — hardcoded, no state, no scale — remove after diagnosis ── */}
        <KonvaRect x={0} y={0} width={500} height={500} fill="red" opacity={0.8} listening={false} />
        <KonvaText x={50} y={50} text="WIN_TEST" fontSize={100} fill="lime" fontFamily="Arial" listening={false} />
        {/* ── end tracer ── */}
        <KonvaGroup {...(show ? bpTransformProps : {})}>
          {visible.map((label) => (
            <KonvaText
              key={label.id}
              x={label.x}
              y={label.y}
              text={getPresetText(label.text, language)}
              fontSize={label.fontSize ?? 50}
              fontFamily={SAFE_FONT_FAMILY}
              fill={label.fill ?? "#ffffff"}
              stroke="rgba(0,0,0,0.75)"
              strokeWidth={2 / bpScale}
              fillAfterStrokeEnabled={true}
              fontStyle="bold"
              rotation={label.rotation ?? 0}
              scaleX={label.scaleX ?? 1}
              scaleY={label.scaleY ?? 1}
              opacity={0.75}
              listening={false}
              shadowForStrokeEnabled={false}
              hitStrokeWidth={0}
            />
          ))}
        </KonvaGroup>
      </Layer>
    );
  }, [showRoomNames, isAdvancedMode, presetRoomLabels, language, bpTransformProps, currentFloorId, bpScale]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-1 flex-col min-h-0 bg-r6-bg">

      {/* ── Toolbar — fixed, starts at the right edge of the left panel ─────── */}
      <div
        className="fixed top-0 right-0 z-[100] flex items-center gap-1 px-3 py-1.5 bg-r6-surface-glass border-b border-r6-border backdrop-blur-[10px]"
        style={{ left: leftPanelWidth, transition: "left 200ms ease" }}
      >
        {/* Panel toggle + Reset workspace */}
        <ToolBtn
          icon={isLeftOpen ? PanelLeftClose : PanelLeftOpen}
          label={isLeftOpen ? "Hide left panel" : "Show left panel"}
          onClick={onToggleLeft}
        />
        <ToolBtn
          icon={LayoutTemplate}
          label="Reset panel layout"
          onClick={onResetWorkspace}
        />
        {/* Map selector */}
        <Dropdown value={currentMapId} placeholder={t("select_map", language)} items={mapItems}
          onChange={(id) => {
            if (id === currentMapId) return;
            if (currentProjectId) {
              if (!window.confirm("切换地图将退出当前项目。未保存的更改将丢失，确定要继续吗？")) return;
              useBoardStore.getState().resetWorkspace();
            } else {
              useBoardStore.getState().clearBoard();
            }
            setMap(id);
          }}
          icon={MapPin} minWidth={158} />

        {/* Floor selector */}
        {map && floorItems.length > 1 && (
          <>
            <span className="text-[13px] text-r6-muted-2">›</span>
            <Dropdown value={currentFloorId} placeholder="…" items={floorItems}
              onChange={(id) => setFloor(id)} minWidth={68} />
          </>
        )}

        {/* Phase selector — arrow navigation */}
        {map && (
          <div className="flex shrink-0 items-center rounded-lg border border-r6-border bg-r6-surface-2 overflow-hidden h-7">
            <button
              onClick={() => setPhase(Math.max(1, currentPhase - 1))}
              disabled={currentPhase <= 1}
              className="flex items-center justify-center px-1.5 h-full text-r6-muted hover:text-r6-text hover:bg-r6-surface-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-[13px] font-medium text-r6-text whitespace-nowrap select-none min-w-[88px] text-center">
              {t(`phase_${currentPhase}`, language)}
            </span>
            <button
              onClick={() => switchPhase(Math.min(4, currentPhase + 1), currentFloorId)}
              disabled={currentPhase >= 4}
              className="flex items-center justify-center px-1.5 h-full text-r6-muted hover:text-r6-text hover:bg-r6-surface-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* View selector */}
        {map && (
          <>
            <span className="text-[13px] text-r6-muted-2">›</span>
            <Dropdown<ViewMode>
              value={currentView}
              placeholder={t("view_standard", language)}
              items={([
                floor?.images.default    && { id: "default"   as ViewMode, label: t("view_standard",  language) },
                floor?.images.blueprint  && { id: "blueprint" as ViewMode, label: t("view_blueprint", language) },
                floor?.images.isometric  && { id: "isometric" as ViewMode, label: t("view_isometric", language) },
              ] as const).filter(Boolean) as { id: ViewMode; label: string }[]}
              onChange={(id) => setView(id)}
              icon={ImageIcon}
              minWidth={108}
            />
            {/* Blueprint scale mode toggle — always in blueprint view; in default view only after blueprint center has been computed */}
            {(currentView === "blueprint" || (currentView === "default" && blueprintCenter !== null)) && (
              <ToolBtn
                icon={blueprintScaleMode === "standard" ? ImageIcon : Maximize2}
                label={t(blueprintScaleMode === "standard" ? "scale_default" : "scale_standard", language)}
                active={blueprintScaleMode === "standard"}
                onClick={() => {
                  setBlueprintScaleMode(blueprintScaleMode === "standard" ? "default" : "standard");
                }}
              />
            )}
          </>
        )}

        {/* Overlay toggles — 4 independent layer switches */}
        {map && (
          <>
            <ToolBtn icon={Layers2}     label="Verticality"  active={overlays.vert}   disabled={!floor?.images.verticality}                              onClick={() => toggleOverlay("vert"   as OverlayKey)} />
            <ToolBtn icon={Box}         label={currentView === "isometric" ? "Props (3D 不可用)" : "Props"}                 active={overlays.props}  disabled={!floor?.images.props   || currentView === "isometric"}  onClick={() => toggleOverlay("props"  as OverlayKey)} />
            <ToolBtn icon={ArrowUpDown} label="Stairs"       active={overlays.stairs} disabled={!floor?.images.stairs}                                                           onClick={() => toggleOverlay("stairs" as OverlayKey)} />
            <ToolBtn icon={Type}        label={currentView === "isometric" ? "Room Names (3D 不可用)" : "Room Names (T)"}  active={showRoomNames}   disabled={(presetRoomLabels.length === 0 && roomLabels.filter((rl) => rl.floorId === currentFloorId).length === 0) || currentView === "isometric"}  onClick={toggleRoomNames} />
          </>
        )}


        {/* Undo (Ctrl/Cmd+Z) */}
        <ToolBtn icon={Undo2} label="Undo (Ctrl+Z)" onClick={() => { if (activeRoomEditRef.current) { setActiveRoomEdit(null); return; } undo(); }} />

        <div className="flex-1 shrink-0" />

        {/* Zoom strip */}
        <div className="flex shrink-0 h-7 items-center rounded-lg overflow-hidden bg-r6-surface-2 border border-r6-border">
          <ToolBtn icon={ZoomOut}   label="Zoom out"      onClick={() => zoomStep(-1)} />
          <button className="h-7 w-12 flex items-center justify-center text-[13px] font-mono text-r6-muted"
            onClick={fitToScreen} title="Fit to screen">
            {zoomPercent}%
          </button>
          <ToolBtn icon={ZoomIn}    label="Zoom in"       onClick={() => zoomStep(1)} />
          <ToolBtn icon={Maximize2} label="Fit to screen" onClick={fitToScreen} />
        </div>

        <Divider />

        {/* Video button — icon-only */}
        <button
          title={t("Video", language)}
          onClick={toggleVideo}
          className={cn(
            "flex shrink-0 h-7 w-7 items-center justify-center rounded-lg border transition-colors",
            isVideoOpen
              ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
              : "bg-r6-surface-2 text-r6-muted border-r6-border hover:bg-r6-accent-dim hover:text-r6-accent hover:border-r6-accent"
          )}
        >
          <Video size={14} />
        </button>

        {/* Timeline toggle */}
        <button
          title="Toggle Timeline"
          onClick={() => {
            if (!isRightSidebarOpen || rightSidebarTab !== "timeline") {
              setRightSidebarTab("timeline");
              if (!isRightSidebarOpen) toggleRightSidebar();
            } else {
              toggleRightSidebar();
            }
          }}
          className={cn(
            "flex shrink-0 h-7 w-7 items-center justify-center rounded-lg border transition-colors",
            isRightSidebarOpen && rightSidebarTab === "timeline"
              ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
              : "bg-r6-surface-2 text-r6-muted border-r6-border hover:bg-r6-accent-dim hover:text-r6-accent hover:border-r6-accent"
          )}
        >
          <TableProperties size={14} />
        </button>

        {/* AI assistant toggle — only shown when AI mode is enabled */}
        {isAiModeEnabled && (
          <button
            title="Toggle AI Assistant"
            onClick={() => {
              if (!isRightSidebarOpen || rightSidebarTab !== "ai") {
                setRightSidebarTab("ai");
                if (!isRightSidebarOpen) toggleRightSidebar();
              } else {
                toggleRightSidebar();
              }
            }}
            className={cn(
              "flex shrink-0 h-7 w-7 items-center justify-center rounded-lg border transition-colors",
              isRightSidebarOpen && rightSidebarTab === "ai"
                ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
                : "bg-r6-surface-2 text-r6-muted border-r6-border hover:bg-r6-accent-dim hover:text-r6-accent hover:border-r6-accent"
            )}
          >
            <Bot size={14} />
          </button>
        )}

        {/* Export dropdown */}
        <div ref={exportMenuRef} className="relative shrink-0">
          <button
            title="Export tactical brief"
            onClick={() => setIsExportOpen((o) => !o)}
            disabled={isExporting || isExportingGif}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap overflow-hidden border transition-colors",
              (isExporting || isExportingGif)
                ? "opacity-60 bg-r6-surface-2 text-r6-muted-2 border-r6-border"
                : isExportOpen
                  ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
                  : "bg-r6-surface-2 text-r6-muted border-r6-border hover:bg-r6-accent-dim hover:text-r6-accent hover:border-r6-accent"
            )}
          >
            {(isExporting || isExportingGif) ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {t("Export", language)}
            <ChevronDown size={11} className="opacity-60" />
          </button>

          {isExportOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-1 rounded-xl py-1.5 overflow-hidden bg-r6-surface border border-r6-border"
              style={{ boxShadow: "0 8px 28px rgba(0,0,0,0.5)", minWidth: 192 }}
            >
              {[
                { key: "Export PDF",       Icon: FileDown,  action: () => { setIsExportOpen(false); handleExport(); } },
                { key: "export_current",   Icon: FileImage, action: () => { setIsExportOpen(false); handleExportImage(); } },
                { key: "export_all",       Icon: FileImage, action: () => { setIsExportOpen(false); handleExportAllPhases(); } },
                { key: "Export Markdown",  Icon: FileText,  action: () => { setIsExportOpen(false); handleExportMarkdown(); } },
                { key: "GIF Export Settings", Icon: Film,   action: () => { setIsExportOpen(false); setExportWindowOpen(true); } },
                { key: "save_project",     Icon: FileJson,  action: () => { setIsExportOpen(false); handleExportProject(); } },
              ].map(({ key, Icon, action }) => (
                <button
                  key={key}
                  onClick={action}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors text-r6-text hover:bg-r6-surface-2"
                >
                  <Icon size={14} className="text-r6-muted shrink-0" />
                  {t(key, language)}
                </button>
              ))}

              {/* 高级模式专属选项 */}
              {isAdvancedMode && (
                <>
                  <div className="mx-3 my-1 border-t border-r6-border" />
                  <button
                    onClick={() => { setIsExportOpen(false); handleExportRoomLabels(); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors text-r6-accent hover:bg-r6-surface-2"
                  >
                    <FileDown size={14} className="shrink-0" />
                    下载当前层 RoomLabels (Dev)
                  </button>
                  <button
                    onClick={() => { setIsExportOpen(false); roomLabelsImportRef.current?.click(); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors text-r6-accent hover:bg-r6-surface-2"
                  >
                    <Upload size={14} className="shrink-0" />
                    上传覆盖 RoomLabels (Dev)
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Spacer — reserves the toolbar's height in the flex flow (py-1.5 + h-8 = 2.75rem, scales with font size) */}
      <div className="shrink-0" style={{ height: "2.75rem" }} />

      {/* Hidden .mty import input */}
      <input
        ref={jsonImportRef}
        type="file"
        accept=".mty"
        className="hidden"
        onChange={handleImportJson}
      />
      <input
        ref={roomLabelsImportRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportRoomLabels}
      />

      {/* ── Canvas area ───────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="canvas-grid relative flex-1 min-h-0 overflow-hidden"
        style={{ cursor: cursorStyle }}
      >
        {/* Export loading overlay — blocks user view while html2canvas renders the template */}
        {isExporting && (
          <div className="absolute inset-0 flex items-center justify-center z-[9999] bg-r6-bg">
            <div className="flex flex-col items-center gap-4">
              <Loader2 size={32} className="animate-spin text-r6-accent" />
              <p className="text-[14px] font-medium text-r6-text">
                Generating Tactical Brief...
              </p>
            </div>
          </div>
        )}

        {/* Transparent drop-capture overlay — only mounted while an operator icon is being dragged.
            This sits above the Konva <canvas> (which swallows pointer events) so the HTML5
            drop events always land on a real DOM element. */}
        {isDraggingIcon && (
          <div
            className="absolute inset-0 z-50 cursor-copy"
            onDragEnter={(e) => e.preventDefault()}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDrop={handleDrop}
          />
        )}
        {/* Empty state */}
        {!currentMapId && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-r6-surface-2 border border-r6-border">
                <MapPin size={28} className="text-r6-muted-2" />
              </div>
              <div>
                <p className="text-[17px] font-medium text-r6-text">{t("No map loaded", language)}</p>
                <p className="mt-1 text-[14px] text-r6-muted">
                  {t("Select a project", language)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading spinner */}
        {currentMapId && imageStatus === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 size={28} className="animate-spin text-r6-muted" />
          </div>
        )}

        {/* ── Konva Stage ───────────────────────────────────────────────────── */}
        {containerSize.width > 0 && containerSize.height > 0 && (
          <div
            ref={stageWrapperRef}
            className="w-full h-full"
            style={{
              opacity:   imageStatus === "loaded" ? 1 : 0,
              transform: imageStatus === "loaded" ? "scale(1)" : "scale(0.97)",
              transition: imageStatus === "loaded" ? "opacity 0.3s ease-out, transform 0.3s ease-out" : "none",
            }}
          >
            <Stage
              ref={stageRef}
              width={containerSize.width}
              height={containerSize.height}
              draggable={isPannable}
              onDragEnd={() => {
                const s = stageRef.current;
                if (s) positionRef.current = s.position();
              }}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}   // cancel drawing if cursor leaves stage
              onContextMenu={(e) => {
                if (tool === "place_operator" && pendingOperator) {
                  e.evt.preventDefault();
                  setPendingOperator(null);
                  setTool("cursor");
                }
              }}
            >
              {staticLayers}

              {/* Preset room names — memoized isolated layer, zero hot-path overhead */}
              {presetRoomsLayer}

              {/* Operator token layer — isolated from staticLayers so playbackRowIndex / timeline
                  state changes re-render only tokens, never the committed lines / map background. */}
              <Layer>
                <KonvaGroup {...bpTransformProps}>
                  {(() => {
                    const floorLabelMap: Record<string, string> = Object.fromEntries(
                      (map?.floors ?? []).map((f) => [f.id, f.label])
                    );
                    return items
                      .filter((i) => i.phase === currentPhase)
                      .filter((i) => !hiddenOperators.includes(i.id))
                      .filter((i) => !isExportingGif || exportVisibility === "all" || i.side === "neutral" || i.side === exportVisibility)
                      .map((item) => (
                        <MemoizedOperatorNode
                          key={item.id}
                          item={item}
                          tool={tool}
                          selectedId={selectedId}
                          transformingItemId={transformingItemId}
                          currentFloorId={currentFloorId}
                          isPlayingTimeline={isPlayingTimeline}
                          currentRouteStep={currentRouteStep}
                          playbackRowIndex={playbackRowIndex}
                          routeTimeMap={routeTimeMap}
                          viewScaleMultiplier={renderScaleFactor}
                          floorLabelMap={floorLabelMap}
                          handleSelectOperator={handleSelectOperator}
                          updateItem={updateItem}
                          removeItem={removeItem}
                          handleContextMenu={handleContextMenu}
                          setResizingItemId={setResizingItemId}
                          setTransformingItemId={setTransformingItemId}
                        />
                      ));
                  })()}
                </KonvaGroup>
              </Layer>

              {/* Live drawing layer — isolated so liveShape updates never bust the staticLayers memo */}
              <Layer listening={false}>
                <KonvaGroup {...bpTransformProps}>
                  {liveShape && liveShape.type === "arrow" && (
                    <Arrow
                      points={liveShape.points}
                      stroke={brushColor}
                      fill={brushColor}
                      strokeWidth={brushSize * renderScaleFactor}
                      pointerLength={12}
                      pointerWidth={10}
                      lineCap="round"
                      listening={false}
                      opacity={0.75}
                    />
                  )}
                  {liveShape && liveShape.type === "line" && (
                    <Line
                      points={liveShape.points}
                      stroke={brushColor}
                      strokeWidth={brushSize * renderScaleFactor}
                      lineCap="round"
                      lineJoin="round"
                      tension={0.4}
                      listening={false}
                      opacity={0.75}
                    />
                  )}
                  {liveShape && liveShape.type === "throwable" && (
                    <Line
                      points={liveShape.points}
                      stroke={throwableColor}
                      strokeWidth={throwableSize * renderScaleFactor}
                      dash={[10, 8]}
                      tension={0.4}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                      opacity={0.75}
                    />
                  )}
                </KonvaGroup>
              </Layer>
            </Stage>
          </div>
        )}

        {/* Inline text editor — HTML textarea positioned over the editing text node */}
        {editingTextId && (() => {
          const tn = texts.find((t) => t.id === editingTextId);
          if (!tn || !stageRef.current) return null;
          const stage  = stageRef.current;
          const scale  = stage.scaleX();
          const sPos   = stage.position();
          const screenX = tn.x * scale + sPos.x;
          const screenY = tn.y * scale + sPos.y;
          const fSize   = tn.fontSize * scale;
          return (
            <textarea
              autoFocus
              defaultValue={tn.text}
              style={{
                position: "absolute", left: screenX, top: screenY,
                fontSize: fSize, fontFamily: "sans-serif",
                color: tn.fill, background: "rgba(14,14,16,0.9)",
                border: "1px solid var(--color-r6-accent)", borderRadius: 4,
                padding: "2px 6px", resize: "both",
                minWidth: 80, minHeight: fSize + 10,
                zIndex: 100, outline: "none", lineHeight: 1.3,
              }}
              onBlur={(e) => { updateText(editingTextId, { text: e.target.value }); setEditingTextId(null); }}
              onKeyDown={(e) => { if (e.key === "Escape") { setEditingTextId(null); e.preventDefault(); } }}
            />
          );
        })()}

        {/* 绝对定位的独立输入框 */}
        {activeRoomEdit && (
          <textarea
            ref={(el) => el?.focus()}
            defaultValue={activeRoomEdit.text}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: activeRoomEdit.screenX,
              top: activeRoomEdit.screenY,
              fontSize: "18px",
              fontFamily: "sans-serif",
              color: "white",
              background: "rgba(0,0,0,0.85)",
              textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
              border: "2px solid var(--color-r6-accent)",
              borderRadius: 6,
              padding: "4px 8px",
              resize: "both",
              minWidth: 140,
              zIndex: 999999,
              outline: "none",
            }}
            onBlur={(e) => {
              updateRoomLabel(activeRoomEdit.id, { text: e.target.value });
              setActiveRoomEdit(null);
            }}
            onKeyDown={(e) => {
              // Block ALL keys from reaching document-level shortcut handlers.
              // stopPropagation stops React synthetic bubbling; stopImmediatePropagation
              // stops the native event from reaching document.addEventListener listeners.
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              if (e.key === "Escape" || e.key === "Enter") {
                updateRoomLabel(activeRoomEdit.id, { text: e.currentTarget.value });
                setActiveRoomEdit(null);
                e.preventDefault();
              }
            }}
          />
        )}

        {/* Right-click context menu for operator status */}
        {ctxMenu && (
          <div
            className="absolute bg-r6-surface border border-r6-border rounded-[10px] py-1 min-w-[178px]"
            style={{
              left: ctxMenu.x - (containerRef.current?.getBoundingClientRect().left ?? 0),
              top: ctxMenu.y - (containerRef.current?.getBoundingClientRect().top ?? 0),
              zIndex: 99999,
              boxShadow: "0 8px 28px rgba(0,0,0,0.6)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(["normal", "dead", "planting"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setRouteStepStatus(ctxMenu.itemId, currentRouteStep, s); setCtxMenu(null); }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] hover:bg-r6-surface-2 transition-colors",
                  s === "dead" ? "text-red-500" : s === "planting" ? "text-yellow-400" : "text-r6-text"
                )}
              >
                {s === "normal"   && <span className="text-[15px]">●</span>}
                {s === "dead"     && <span className="text-[15px]">✕</span>}
                {s === "planting" && <span className="text-[15px]">P</span>}
                {t(`mark_${s}`, language)}
                <span className="ml-auto text-[11px] text-r6-muted-2">
                  Step {currentRouteStep}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Status bar */}
        <div className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium tracking-wide pointer-events-none bg-r6-surface-glass-dim border border-r6-border text-r6-muted">
          <span className="text-r6-accent">●</span>
          {statusHints[tool]}
          {selectedId && tool === "cursor" && (
            <span className="text-r6-muted-2"> · {t("hint.del", language)}</span>
          )}
        </div>

        {/* Outdated map warning */}
        {map?.id === "fortress" && currentView === "default" && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-sm font-bold z-10 pointer-events-none whitespace-nowrap bg-red-500/90 text-white">
            {t("warning_outdated_map", language)}
          </div>
        )}

        {/* Zoom badge */}
        {zoomPercent !== 100 && (
          <div className="absolute bottom-4 right-4 rounded-lg px-2.5 py-1 text-xs font-mono pointer-events-none bg-r6-surface-glass-dim border border-r6-border text-zinc-300">
            {zoomPercent}%
          </div>
        )}

        {/* Hidden HTML preloader — caches all floor assets for current map so
            Konva's use-image resolves from RAM on floor switch / Undo (no flicker). */}
        <MapPreloader currentMap={map} />

        {/* Left Floating Toolbar — vertical pill of drawing tools */}
        {/* Wrapper fills the full canvas height so inner pill is always Y-centered */}
        <div className="absolute inset-y-0 left-4 flex items-center z-50 pointer-events-none">
          <div
            className="flex w-12 flex-col items-center justify-center gap-2 rounded-[14px] border border-r6-border bg-r6-surface-glass px-2 py-3 backdrop-blur pointer-events-auto"
            style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
          >
            {toolConfig.map(({ id, icon, label, dividerBefore }) => (
              <Fragment key={id}>
                {dividerBefore && <div className="w-full h-px bg-r6-border my-0.5" />}
                <ToolBtn icon={icon} label={label} active={tool === id} onClick={() => setTool(id)} />
              </Fragment>
            ))}
            {/* Upload Labels — only in advanced mode, appears immediately below the room_name tool */}
            {isAdvancedMode && (
              <ToolBtn
                icon={Upload}
                label="Upload Labels (JSON)"
                onClick={() => roomLabelsImportRef.current?.click()}
              />
            )}
            {/* Load Defaults to Edit — copies preset labels into dynamic layer for editing */}
            {isAdvancedMode && (
              <ToolBtn
                icon={FileDown}
                label="Load Defaults to Edit"
                onClick={() => {
                  if (currentFloorId && presetRoomLabels && presetRoomLabels.length > 0) {
                    if (window.confirm("Load default labels into editor? This will overwrite unsaved dynamic labels for this floor.")) {
                      const coerced = presetRoomLabels.map((def) => ({
                        id:       def.id,
                        x:        def.x,
                        y:        def.y,
                        text:     typeof def.text === "string" ? def.text : (def.text[language] ?? def.text["en"] ?? ""),
                        fontSize: def.fontSize  ?? 14,
                        fill:     def.fill      ?? "#ffffff",
                        rotation: def.rotation  ?? 0,
                        scaleX:   def.scaleX    ?? 1,
                        scaleY:   def.scaleY    ?? 1,
                        floorId:  def.floorId   ?? currentFloorId,
                      }));
                      useBoardStore.getState().setRoomLabelsForFloor(currentFloorId, coerced);
                    }
                  }
                }}
              />
            )}
            <div className="w-full h-px bg-r6-border my-0.5" />
            <ToolBtn icon={Trash2} label="Clear floor" onClick={() => {
              useBoardStore.getState().clearFloor(currentPhase, currentFloorId);
            }} />
          </div>
        </div>

        {/* Tactical panel — floats right side, shows tool-contextual controls */}
        <TacticalPanel activeTool={tool} />

        {/* Floating video player — always mounted to preserve video state and OCR markers */}
        <FloatingVideoPlayer />

        {/* Floating GIF export window — draggable, opened from Export dropdown */}
        <FloatingExportWindow />

        {/* ── Toast notification ──────────────────────────────────────────── */}
        {toast && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl shadow-lg text-sm font-medium pointer-events-none z-[200] bg-r6-surface-3 border border-r6-border text-r6-text whitespace-nowrap">
            {toast}
          </div>
        )}

        {/* ── Save-as-new project modal ────────────────────────────────────── */}
        {saveModalOpen && (
          <div
            className="absolute inset-0 z-[300] flex items-center justify-center bg-black/60"
            onClick={(e) => { if (e.target === e.currentTarget) setSaveModalOpen(false); }}
          >
            <div className="flex flex-col gap-3 rounded-2xl border border-r6-border bg-r6-surface p-6 shadow-2xl w-80">
              <h2 className="text-base font-semibold text-r6-text">保存为新项目</h2>
              <input
                ref={saveModalInputRef}
                value={saveModalName}
                onChange={(e) => setSaveModalName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const name = saveModalName.trim() || "Untitled";
                    setSaveModalOpen(false);
                    saveAsNewProject(name).then(() => {
                      showToast("项目已创建");
                    });
                  }
                  if (e.key === "Escape") setSaveModalOpen(false);
                }}
                placeholder="项目名称…"
                className="rounded-lg px-3 py-2 text-sm outline-none bg-r6-surface-2 border border-r6-border focus:border-r6-accent text-r6-text"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setSaveModalOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm text-r6-muted hover:text-r6-text transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    const name = saveModalName.trim() || "Untitled";
                    setSaveModalOpen(false);
                    saveAsNewProject(name).then(() => {
                      showToast("项目已创建");
                    });
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium bg-r6-accent text-white hover:opacity-90 transition-opacity"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
