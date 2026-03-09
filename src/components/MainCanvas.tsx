import { useCallback, useEffect, useRef, useState } from "react";
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
  Pencil, ArrowRight, Eraser, Undo2,
  ZoomIn, ZoomOut, Maximize2,
  Video, MapPin, ChevronDown, MousePointer2, Loader2, Bot, FileDown, Save,
  FileImage, FileText, Film,
  Image as ImageIcon, Layers2, Type, Flag, Box, ArrowUpDown,
} from "lucide-react";
import { dragState } from "../store/dragState";
import { getBlueprintBoundingBox, type BoundingBox } from "../utils/imageUtils";
import FloatingVideoPlayer from "./FloatingVideoPlayer";
import { useCanvasStore, type ViewMode, type OverlayKey } from "../store/canvasStore";
import {
  useBoardStore,
  type BoardItem, type Tool,
} from "../store/useBoardStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useProjectStore } from "../store/useProjectStore";
import { t } from "../locales/i18n";

// ─── Constants ─────────────────────────────────────────────────────────────────

const ZOOM_FACTOR = 1.10;
const ZOOM_MIN    = 0.05;
const ZOOM_MAX    = 8;
const ICON_SIZE   = 56;   // operator token size in canvas-space pixels

// ─── Helpers ───────────────────────────────────────────────────────────────────

interface Vec2 { x: number; y: number }
interface Size { width: number; height: number }

// ─── PDF export helpers ─────────────────────────────────────────────────────

const ORANGE: [number, number, number] = [232, 93, 42];
const DARK:   [number, number, number] = [26,  26,  26];

/** Strip bold/italic markers and normalise <br> for plain-text display. */
function stripMd(s: string) {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/<br\s*\/?>/gi, " / ").trim();
}

/**
 * Render markdown notes to one or more A4 canvas pages using system fonts.
 *
 * Why Canvas 2D instead of jsPDF text API:
 *   jsPDF ships only Latin fonts (Helvetica/Times). CJK characters are replaced
 *   with placeholder boxes. The Canvas 2D API uses OS system fonts
 *   (PingFang SC, Microsoft YaHei, Hiragino Sans…) which render CJK natively.
 *   Each finished canvas is exported as a PNG and added to the PDF via addImage().
 */
function renderNotesToCanvas(md: string, mapLabel: string, date: string): string[] {
  // A4 at 96 dpi
  const PX_W  = 794;
  const PX_H  = 1123;
  const SCALE = 2;          // HiDPI — canvas physical pixels = logical × 2
  const MG    = 42;         // margin px (logical)
  const CW    = PX_W - MG * 2;

  // System font stack — covers Windows, macOS, Linux, Android
  const F = '"Microsoft YaHei","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",'
          + '"Noto Sans SC","Source Han Sans SC",system-ui,sans-serif';

  const makeCanvas = () => {
    const el  = document.createElement("canvas");
    el.width  = PX_W * SCALE;
    el.height = PX_H * SCALE;
    const ctx = el.getContext("2d")!;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PX_W, PX_H);
    return { el, ctx };
  };

  const pages: string[] = [];
  let { el, ctx } = makeCanvas();
  let y = MG;

  // Draw page header (orange bar + title)
  const drawHeader = () => {
    ctx.fillStyle = "#e85d2a";
    ctx.fillRect(MG, y, 3, 22);
    ctx.font = `bold 18px ${F}`;
    ctx.fillStyle = "#111111";
    ctx.fillText("R6 Tactical Studio", MG + 8, y + 16);
    y += 24;
    ctx.font = `11px ${F}`;
    ctx.fillStyle = "#888888";
    ctx.fillText(`${mapLabel}${mapLabel ? "  ·  " : ""}${date}`, MG + 8, y);
    y += 6;
    ctx.strokeStyle = "#e85d2a";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(MG, y); ctx.lineTo(MG + CW, y); ctx.stroke();
    y += 14;
    // "TACTIC NOTES" label
    ctx.font = `bold 9px ${F}`;
    ctx.fillStyle = "#e85d2a";
    ctx.fillText("TACTIC NOTES", MG, y);
    y += 12;
  };
  drawHeader();

  const flush = () => {
    pages.push(el.toDataURL("image/png", 1.0));
    ({ el, ctx } = makeCanvas());
    y = MG;
    drawHeader();
  };

  const need = (h: number) => { if (y + h > PX_H - MG) flush(); };

  // Wrap a string to fit within maxWidth using ctx.measureText (works for CJK)
  const wrap = (text: string, maxW: number, fnt: string): string[] => {
    ctx.font = fnt;
    if (ctx.measureText(text).width <= maxW) return [text];
    const lines: string[] = [];
    let cur = "";
    for (const ch of text) {
      if (ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; }
      else cur += ch;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  let tableHeaderDone = false;

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();

    if (!line.trim() || /^---+$/.test(line)) {
      tableHeaderDone = false;
      y += 5; continue;
    }

    // ### heading
    if (/^### /.test(line)) {
      tableHeaderDone = false;
      need(28);
      y += 8;
      const fnt = `bold 10px ${F}`;
      ctx.font = fnt;
      ctx.fillStyle = "#e85d2a";
      ctx.fillText(stripMd(line.slice(4)).toUpperCase(), MG, y);
      y += 3;
      ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(MG, y); ctx.lineTo(MG + CW, y); ctx.stroke();
      y += 8;
      continue;
    }

    // Table separator
    if (/^\|[\s|:-]+\|$/.test(line)) { tableHeaderDone = true; continue; }

    // Table row
    if (line.startsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((c) => stripMd(c));
      if (!cells.length) continue;
      const isHdr = !tableHeaderDone;
      const colW  = CW / cells.length;
      const ROW_H = 22;
      need(ROW_H + 2);

      cells.forEach((cell, i) => {
        const x = MG + i * colW;
        if (isHdr) {
          ctx.fillStyle = "#f4f4f5";
          ctx.fillRect(x, y, colW, ROW_H);
          ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, colW, ROW_H);
          ctx.font = `bold 10px ${F}`;
          ctx.fillStyle = "#e85d2a";
        } else {
          ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, colW, ROW_H);
          ctx.font = `10px ${F}`;
          ctx.fillStyle = "#1a1a1a";
        }
        // Truncate text to fit cell width
        let txt = cell;
        while (txt.length > 1 && ctx.measureText(txt).width > colW - 8) txt = txt.slice(0, -1);
        if (txt !== cell) txt += "…";
        ctx.fillText(txt, x + 4, y + 14);
      });
      y += ROW_H;
      continue;
    }

    // List item
    if (/^[*-] /.test(line)) {
      tableHeaderDone = false;
      const fnt   = `11px ${F}`;
      const lines = wrap(stripMd(line.slice(2)), CW - 18, fnt);
      need(lines.length * 17 + 4);
      ctx.font = fnt;
      ctx.fillStyle = "#e85d2a";
      ctx.fillText("•", MG + 5, y + 13);
      ctx.fillStyle = "#1a1a1a";
      lines.forEach((l, idx) => ctx.fillText(l, MG + 18, y + 13 + idx * 17));
      y += lines.length * 17 + 3;
      continue;
    }

    // Plain paragraph
    tableHeaderDone = false;
    const fnt   = `11px ${F}`;
    const lines = wrap(stripMd(line), CW, fnt);
    need(lines.length * 17 + 4);
    ctx.font = fnt;
    ctx.fillStyle = "#1a1a1a";
    lines.forEach((l, idx) => ctx.fillText(l, MG, y + 13 + idx * 17));
    y += lines.length * 17 + 4;
  }

  pages.push(el.toDataURL("image/png", 1.0));
  return pages;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a Konva stage-pointer position to canvas (world) coordinates. */
function toCanvasPos(stage: Konva.Stage): Vec2 {
  const p = stage.getPointerPosition()!;
  return {
    x: (p.x - stage.x()) / stage.scaleX(),
    y: (p.y - stage.y()) / stage.scaleY(),
  };
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
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        background: active ? "var(--color-r6-accent-dim)" : "transparent",
        color:      active ? "var(--color-r6-accent)"     : "var(--color-r6-muted)",
        border:     active ? "1px solid var(--color-r6-accent)" : "1px solid transparent",
      }}
      onMouseEnter={(e) => { if (!active && !disabled) { e.currentTarget.style.color = "var(--color-r6-text)"; e.currentTarget.style.background = "var(--color-r6-surface-2)"; } }}
      onMouseLeave={(e) => { if (!active && !disabled) { e.currentTarget.style.color = "var(--color-r6-muted)"; e.currentTarget.style.background = "transparent"; } }}
    >
      <Icon size={15} />
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0" style={{ background: "var(--color-r6-border)" }} />;
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
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] font-medium"
        style={{
          background: "var(--color-r6-surface-2)",
          color:      value ? "var(--color-r6-text)" : "var(--color-r6-muted)",
          border:     "1px solid var(--color-r6-border)",
          minWidth,
        }}
      >
        {Icon && <Icon size={13} style={{ opacity: 0.7, flexShrink: 0 }} />}
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 rounded-xl py-1"
          style={{
            background: "var(--color-r6-surface)",
            border:     "1px solid var(--color-r6-border)",
            boxShadow:  "0 8px 24px rgba(0,0,0,0.55)",
            minWidth, maxHeight: 260, overflowY: "auto",
          }}
        >
          {items.map((item) => (
            <button key={item.id}
              onClick={() => { onChange(item.id); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[14px]"
              style={{ color: "var(--color-r6-text)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-r6-surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span>{item.label}</span>
              {item.id === value && <span className="text-[12px]" style={{ color: "var(--color-r6-accent)" }}>✓</span>}
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

function MapImageLayer({
  basePath, vertPath, propsPath, stairsPath, namesPath, currentView, blueprintScaleMode,
}: {
  basePath: string;
  vertPath: string;
  propsPath: string;
  stairsPath: string;
  namesPath: string;
  currentView: ViewMode;
  blueprintScaleMode: "default" | "standard";
}) {
  const [baseImage]   = useImage(basePath);
  const [vertImage]   = useImage(vertPath);
  const [propsImage]  = useImage(propsPath);
  const [stairsImage] = useImage(stairsPath);
  const [namesImage]  = useImage(namesPath);
  const [bbox, setBbox] = useState<BoundingBox | null>(null);

  useEffect(() => {
    if (!baseImage || currentView !== "blueprint") { setBbox(null); return; }
    setBbox(getBlueprintBoundingBox(baseImage));
  }, [baseImage, currentView]);

  if (!baseImage) return null;
  const isBlueprint = currentView === "blueprint";

  // Compute transform for standard scale mode
  const useStandard = isBlueprint && blueprintScaleMode === "standard" && bbox;
  const TARGET_SIZE = 3000;
  const scaleFactor = useStandard ? TARGET_SIZE / Math.max(bbox.width, bbox.height) : 1;
  const imgProps = useStandard
    ? { x: 3200, y: 1800, offsetX: bbox.centerX, offsetY: bbox.centerY, scaleX: scaleFactor, scaleY: scaleFactor }
    : { x: 0,    y: 0,    offsetX: 0,             offsetY: 0,             scaleX: 1,            scaleY: 1 };

  return (
    <>
      {/* Standard-size blueprint background sheet (6400×3600) — cyanotype blue */}
      {isBlueprint && (
        <KonvaRect x={0} y={0} width={6400} height={3600} fill="#15539e" listening={false} />
      )}
      <KonvaImage image={baseImage}  {...imgProps} listening={false} />
      {propsImage  && <KonvaImage image={propsImage}  {...imgProps} listening={false} />}
      {stairsImage && <KonvaImage image={stairsImage} {...imgProps} listening={false} />}
      {vertImage   && <KonvaImage image={vertImage}   {...imgProps} listening={false} />}
      {namesImage  && <KonvaImage image={namesImage}  {...imgProps} listening={false} />}
      {/* Inset white border — sits 100px inside the paper edges */}
      {isBlueprint && (
        <KonvaRect x={100} y={100} width={6200} height={3400} stroke="rgba(255,255,255,0.7)" strokeWidth={8} listening={false} />
      )}
    </>
  );
}

// ─── Placed operator token ─────────────────────────────────────────────────────

function OperatorToken({
  item, isSelected, tool, onSelect, onUpdate, onRemove,
}: {
  item: BoardItem;
  isSelected: boolean;
  tool: Tool;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, updates: Partial<BoardItem>) => void;
  onRemove: (id: string) => void;
}) {
  const image    = useOperatorIcon(item.iconPath);
  const groupRef = useRef<Konva.Group>(null);
  const trRef    = useRef<Konva.Transformer>(null);

  // Attach / detach Transformer whenever selection changes
  useEffect(() => {
    if (!trRef.current || !groupRef.current) return;
    trRef.current.nodes(isSelected ? [groupRef.current] : []);
    trRef.current.getLayer()?.batchDraw();
  }, [isSelected]);

  const interactive = tool === "cursor" || tool === "eraser";
  const half = ICON_SIZE / 2;

  return (
    <>
      <KonvaGroup
        ref={groupRef}
        id={item.id}
        x={item.x}
        y={item.y}
        offsetX={half}
        offsetY={half}
        rotation={item.rotation}
        scaleX={item.scaleX}
        scaleY={item.scaleY}
        draggable={tool === "cursor"}
        listening={interactive}
        onMouseEnter={(e) => {
          if (!interactive) return;
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor =
            tool === "eraser" ? "crosshair" : "move";
        }}
        onMouseLeave={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = "";
        }}
        onClick={(e) => {
          e.cancelBubble = true;
          if (tool === "cursor") onSelect(item.id);
          if (tool === "eraser") onRemove(item.id);
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
        {/* Background circle — always visible, gives the token a solid base */}
        <KonvaCircle
          x={half} y={half} radius={half}
          fill="#1c1c21"
          stroke={isSelected ? "#e85d2a" : "#3f3f46"}
          strokeWidth={1.5}
        />
        {/* Operator icon — rendered once the image has loaded */}
        {image ? (
          <KonvaImage
            image={image}
            x={0} y={0}
            width={ICON_SIZE}
            height={ICON_SIZE}
            listening={false}
          />
        ) : (
          /* Fallback: initials text — proves the token placed even if image fails */
          <KonvaText
            x={0} y={0}
            width={ICON_SIZE}
            height={ICON_SIZE}
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

      {/* Per-item transformer (only rendered when selected) */}
      {isSelected && (
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

// ─── Main component ────────────────────────────────────────────────────────────

export default function MainCanvas() {
  // ── Canvas store (map / floor / view) ─────────────────────────────────────
  const {
    maps,
    currentMapId, currentFloorId,
    currentMap, currentFloor,
    currentView, overlays,
    blueprintScaleMode,
    setMap, setFloor, setView, toggleOverlay, setBlueprintScaleMode,
  } = useCanvasStore();

  // ── Settings store ─────────────────────────────────────────────────────────
  const { isRightSidebarOpen, toggleRightSidebar, language } = useSettingsStore();

  // ── Project store (save) ───────────────────────────────────────────────────
  const saveCurrentProject = useProjectStore((s) => s.saveCurrentProject);
  const currentProjectId   = useProjectStore((s) => s.currentProjectId);
  const [isSaving,      setIsSaving]      = useState(false);
  const [isExportOpen,  setIsExportOpen]  = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // ── Board store (items / lines / tool / notes) ────────────────────────────
  const {
    tool, setTool,
    penColor, penSize,
    items, lines,
    isDraggingIcon,
    pendingOperator, setPendingOperator,
    isVideoOpen, toggleVideo,
    notes,
    addItem, updateItem, removeItem,
    addLine, removeLine,
    undo,
    currentPhase, setPhase,
  } = useBoardStore();

  // ── Local UI state ────────────────────────────────────────────────────────
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [scale,         setScale]         = useState(1);
  const [position,      setPosition]      = useState<Vec2>({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });
  const [isExporting,   setIsExporting]   = useState(false);
  const [phaseOpen,     setPhaseOpen]     = useState(false);
  const [isExportingGif, setIsExportingGif] = useState(false);

  // Live drawing state (not committed to store yet)
  const [liveShape, setLiveShape] = useState<{
    type: "line" | "arrow";
    points: number[];
  } | null>(null);
  const isDrawingRef = useRef(false);

  // Refs
  const stageRef     = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const phaseRef     = useRef<HTMLDivElement>(null);

  // Derived
  const floor      = currentFloor();
  const map        = currentMap();
  const mapItems   = maps.map((m) => ({ id: m.id, label: m.name }));
  const floorItems = map
    ? map.floors
        .filter((f) => f.images.default || f.images.blueprint || f.images.isometric)
        .map((f) => ({ id: f.id, label: f.label }))
    : [];

  // Path construction — floor.images is the single source of truth for all maps
  const basePath   = floor?.images?.[currentView] ?? floor?.images?.default ?? "";
  const vertPath   = overlays.vert   ? (floor?.images?.verticality ?? "") : "";
  const propsPath  = overlays.props  ? (floor?.images?.props       ?? "") : "";
  const stairsPath = overlays.stairs ? (floor?.images?.stairs      ?? "") : "";
  const namesPath  = overlays.names  ? (floor?.images?.roomNames   ?? "") : "";

  const [, imageStatus] = useImage(basePath);

  // ── Container resize ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) =>
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Fit-to-screen ──────────────────────────────────────────────────────────
  const fitToScreen = useCallback(() => {
    const imgEl = new Image();
    imgEl.src = basePath;
    const doFit = (w: number, h: number) => {
      if (!w || !h || !containerSize.width || !containerSize.height) return;
      const padding  = 48;
      const newScale = Math.min(
        (containerSize.width  - padding * 2) / w,
        (containerSize.height - padding * 2) / h,
      );
      setScale(newScale);
      setPosition({
        x: (containerSize.width  - w * newScale) / 2,
        y: (containerSize.height - h * newScale) / 2,
      });
    };
    if (imgEl.complete && imgEl.naturalWidth) doFit(imgEl.naturalWidth, imgEl.naturalHeight);
    else imgEl.onload = () => doFit(imgEl.naturalWidth, imgEl.naturalHeight);
  }, [basePath, containerSize]);

  useEffect(() => {
    if (imageStatus === "loaded") fitToScreen();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageStatus, containerSize.width, containerSize.height]);

  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [basePath]);

  // Auto-fallback: if the selected view has no image on the new floor, switch to first available
  useEffect(() => {
    const f = currentFloor();
    if (!f) return;
    if (f.images[currentView]) return; // current view is available — nothing to do
    const fallback = (["default", "blueprint", "isometric"] as const).find((v) => f.images[v]);
    if (fallback) setView(fallback);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFloorId, currentMapId]);

  // ── Cancel live drawing when switching tools ───────────────────────────────
  useEffect(() => {
    isDrawingRef.current = false;
    setLiveShape(null);
    // Deselect when leaving cursor mode
    if (tool !== "cursor") setSelectedId(null);
  }, [tool]);

  // ── Keyboard: Delete / Backspace removes selected item ────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (selectedId) { removeItem(selectedId); setSelectedId(null); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, removeItem]);

  // ── Keyboard shortcuts for tool switching ─────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") { setPendingOperator(null); setTool("cursor"); }
      if (e.key === "v" || e.key === "V") setTool("cursor");
      if (e.key === "p" || e.key === "P") setTool("pen");
      if (e.key === "a" || e.key === "A") setTool("arrow");
      if (e.key === "e" || e.key === "E") setTool("eraser");
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!currentProjectId) return;
        setIsSaving(true);
        saveCurrentProject().finally(() => setIsSaving(false));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setTool, undo, currentProjectId, saveCurrentProject]);

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const ptr = stage.getPointerPosition();
      if (!ptr) return;
      const dir      = e.evt.deltaY < 0 ? 1 : -1;
      const newScale = Math.min(Math.max(scale * (dir > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR), ZOOM_MIN), ZOOM_MAX);
      setPosition({
        x: ptr.x - (ptr.x - position.x) * (newScale / scale),
        y: ptr.y - (ptr.y - position.y) * (newScale / scale),
      });
      setScale(newScale);
    },
    [scale, position],
  );

  const zoomStep = (dir: 1 | -1) => {
    const cx = containerSize.width / 2, cy = containerSize.height / 2;
    const newScale = Math.min(Math.max(scale * (dir > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR), ZOOM_MIN), ZOOM_MAX);
    setPosition({
      x: cx - (cx - position.x) * (newScale / scale),
      y: cy - (cy - position.y) * (newScale / scale),
    });
    setScale(newScale);
  };

  // ── HTML5 drag-drop: receive operator token from sidebar ───────────────────
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    console.log("🔥 Drop event fired at:", e.clientX, e.clientY);

    const stage     = stageRef.current;
    const container = containerRef.current;
    if (!stage || !container) return;

    const rect    = container.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left  - stage.x()) / stage.scaleX();
    const canvasY = (e.clientY - rect.top   - stage.y()) / stage.scaleY();
    console.log("🎯 Calculated Canvas X/Y:", canvasX, canvasY);

    const data = dragState.operator;
    dragState.operator = null;
    console.log("📦 Drag state received:", data);
    if (!data) return;

    addItem({
      id: crypto.randomUUID(),
      operatorId: data.operatorId,
      iconPath:   data.iconPath,
      name:       data.name,
      x: canvasX, y: canvasY,
      rotation: 0, scaleX: 1, scaleY: 1,
    });
  }, [addItem]);

  // ── PDF Export (pure jsPDF — no html2canvas, no DOM cloning) ──────────────
  const handleExport = async () => {
    const stage = stageRef.current;
    if (!stage || isExporting) return;

    setIsExporting(true);
    try {
      // ── Page 1: Tactical Board (canvas screenshot) ──────────────────────
      const dataUrl = stage.toDataURL({ pixelRatio: 2 });
      console.log("🔥 Konva Snapshot Length:", dataUrl.length);

      const { jsPDF } = await import("jspdf");
      const mapLabel = [map?.name, currentFloor()?.label].filter(Boolean).join(" · ");
      const date     = new Date().toLocaleDateString();

      const doc       = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const PAGE_W    = 210;
      const MARGIN    = 14;
      const CONTENT_W = PAGE_W - MARGIN * 2;
      let y           = MARGIN;

      // Header — orange accent bar + title
      doc.setFillColor(...ORANGE);
      doc.rect(MARGIN, y, 2, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...DARK);
      doc.text("R6 Tactical Studio", MARGIN + 5, y + 6);
      y += 10;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(136, 136, 136);
      doc.text(`${mapLabel}${mapLabel ? "  ·  " : ""}${date}`, MARGIN + 5, y);
      y += 4;

      // Orange divider
      doc.setDrawColor(...ORANGE);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += 6;

      // Section label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...ORANGE);
      doc.text("TACTICAL BOARD", MARGIN, y);
      y += 4;

      // Canvas image — fill content width, maintain aspect ratio
      const imgProps = doc.getImageProperties(dataUrl);
      const imgH     = (imgProps.height / imgProps.width) * CONTENT_W;
      doc.addImage(dataUrl, "PNG", MARGIN, y, CONTENT_W, imgH);
      y += imgH;

      // ── Page 2+: Notes rendered to canvas with system fonts (CJK-safe) ──
      if (notes) {
        const notesPages = renderNotesToCanvas(notes, mapLabel, date);
        for (const pageUrl of notesPages) {
          doc.addPage();
          doc.addImage(pageUrl, "PNG", 0, 0, 210, 297);
        }
      }

      doc.save(`R6-Tactic-${mapLabel || "Brief"}.pdf`);
    } catch (err) {
      console.error("❌ [Export] PDF export failed:", err);
      alert("Export failed! Check the console for details.");
    } finally {
      setIsExporting(false);
    }
  };

  // Close export menu and phase popover on outside click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportOpen(false);
      }
      if (phaseRef.current && !phaseRef.current.contains(e.target as Node)) {
        setPhaseOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const handleExportImage = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = "R6-Tactic.png";
    a.click();
  };

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

  // Loop through phases 1-4, capture each, download as individual PNGs
  const handleExportAllPhases = async () => {
    const stage = stageRef.current;
    if (!stage || isExporting || isExportingGif) return;
    const savedPhase = currentPhase;
    setIsExporting(true);
    try {
      for (const ph of [1, 2, 3, 4]) {
        setPhase(ph);
        await new Promise<void>((r) => setTimeout(r, 150));
        const dataURL = stage.toDataURL({ pixelRatio: 2 });
        const a = document.createElement("a");
        a.href = dataURL;
        a.download = `R6-Tactic-Phase-${ph}.png`;
        a.click();
        await new Promise<void>((r) => setTimeout(r, 200));
      }
      setPhase(savedPhase);
    } catch (err) {
      console.error("❌ [Export] Multi-phase export failed:", err);
      setPhase(savedPhase);
    } finally {
      setIsExporting(false);
    }
  };

  // Capture all 4 phases and stitch into an animated GIF via gifshot
  const handleExportGif = async () => {
    const stage = stageRef.current;
    if (!stage || isExportingGif || isExporting) return;
    setIsExportingGif(true);
    const savedPhase = currentPhase;
    const frames: string[] = [];
    try {
      for (const ph of [1, 2, 3, 4]) {
        setPhase(ph);
        await new Promise<void>((r) => setTimeout(r, 150));
        frames.push(stage.toDataURL({ pixelRatio: 1 }));
      }
      setPhase(savedPhase);
      const { createGIF } = await import("gifshot");
      createGIF(
        {
          images: frames,
          gifWidth:   stage.width(),
          gifHeight:  stage.height(),
          interval:   1.5,
          numWorkers: 2,
        },
        (obj) => {
          if (!obj.error) {
            const a = document.createElement("a");
            a.href = obj.image;
            a.download = "R6-Tactical-Animation.gif";
            a.click();
          }
          setIsExportingGif(false);
        },
      );
    } catch (err) {
      console.error("❌ [Export] GIF export failed:", err);
      setPhase(savedPhase);
      setIsExportingGif(false);
    }
  };

  // ── Stage mouse events (drawing) ───────────────────────────────────────────
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current!;

    if (tool === "place_operator" && pendingOperator) {
      const pos = toCanvasPos(stage);
      addItem({
        id: crypto.randomUUID(),
        operatorId: pendingOperator.operatorId,
        iconPath:   pendingOperator.iconPath,
        name:       pendingOperator.name,
        x: pos.x, y: pos.y,
        rotation: 0, scaleX: 1, scaleY: 1,
      });
      setPendingOperator(null);
      setTool("cursor");
      return;
    }

    if (tool === "cursor") {
      if (e.target === stage) setSelectedId(null);
      return;
    }
    if (tool === "eraser") {
      if (e.target === stage) setSelectedId(null);
      return;
    }

    // pen or arrow: start drawing
    e.evt.preventDefault();
    isDrawingRef.current = true;
    const pos = toCanvasPos(stage);
    setLiveShape({ type: tool === "arrow" ? "arrow" : "line", points: [pos.x, pos.y, pos.x, pos.y] });
  };

  const handleMouseMove = (_e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawingRef.current || !liveShape) return;
    const pos = toCanvasPos(stageRef.current!);

    if (liveShape.type === "pen" as unknown as string || liveShape.type === "line") {
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
      addLine({
        id:          crypto.randomUUID(),
        type:        liveShape.type,
        points:      liveShape.points,
        color:       penColor,
        strokeWidth: penSize,
      });
    }
    setLiveShape(null);
  };

  // ── Derived display ────────────────────────────────────────────────────────
  const zoomPercent = Math.round(scale * 100);
  const isPannable  = tool === "cursor" || tool === "eraser";

  const cursorStyle: React.CSSProperties["cursor"] =
    tool === "pen"            ? "crosshair" :
    tool === "arrow"          ? "crosshair" :
    tool === "eraser"         ? "cell"      :
    tool === "place_operator" ? "copy"      :
    "default";

  const statusHints: Record<Tool, string> = {
    cursor:         t("hint.cursor", language),
    pen:            t("hint.pen",    language),
    arrow:          t("hint.arrow",  language),
    eraser:         t("hint.eraser", language),
    place_operator: `${t("hint.placing", language)} ${pendingOperator?.name ?? "operator"} · click on map to place · Esc to cancel`,
  };

  const toolConfig: { id: Tool; icon: React.ElementType; label: string }[] = [
    { id: "cursor", icon: MousePointer2, label: "Select  (V)" },
    { id: "pen",    icon: Pencil,        label: "Pen     (P)" },
    { id: "arrow",  icon: ArrowRight,    label: "Arrow   (A)" },
    { id: "eraser", icon: Eraser,        label: "Eraser  (E)" },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden" style={{ background: "var(--color-r6-bg)" }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center gap-1 px-3 py-1.5 z-10"
        style={{ background: "var(--color-r6-surface-glass)", borderBottom: "1px solid var(--color-r6-border)", backdropFilter: "blur(10px)" }}
      >
        {/* Map selector */}
        <Dropdown value={currentMapId} placeholder="Select Map" items={mapItems}
          onChange={(id) => setMap(id)} icon={MapPin} minWidth={158} />

        {/* Floor selector */}
        {map && floorItems.length > 1 && (
          <>
            <span className="text-[13px]" style={{ color: "var(--color-r6-muted-2)" }}>›</span>
            <Dropdown value={currentFloorId} placeholder="Floor" items={floorItems}
              onChange={(id) => setFloor(id)} minWidth={68} />
          </>
        )}

        {/* Phase selector */}
        {map && (
          <div ref={phaseRef} className="relative shrink-0">
            <button
              onClick={() => setPhaseOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] font-medium"
              style={{
                background: phaseOpen ? "var(--color-r6-accent-dim)" : "var(--color-r6-surface-2)",
                color:      phaseOpen ? "var(--color-r6-accent)"     : "var(--color-r6-text)",
                border:     phaseOpen ? "1px solid var(--color-r6-accent)" : "1px solid var(--color-r6-border)",
                minWidth: 112,
              }}
            >
              <Flag size={13} style={{ opacity: 0.7, flexShrink: 0 }} />
              <span className="flex-1 text-left truncate">{t(`phase_${currentPhase}`, language)}</span>
              <ChevronDown size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
            </button>
            {/* Animated slide-down popover */}
            <div
              style={{
                position: "absolute", left: 0, top: "calc(100% + 4px)", zIndex: 60,
                background: "var(--color-r6-surface)",
                border: "1px solid var(--color-r6-border)",
                borderRadius: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
                minWidth: 170, padding: "4px 0",
                opacity: phaseOpen ? 1 : 0,
                transform: phaseOpen ? "translateY(0)" : "translateY(-6px)",
                pointerEvents: phaseOpen ? "auto" : "none",
                transition: "opacity 0.15s ease, transform 0.15s ease",
              }}
            >
              {([1, 2, 3, 4] as const).map((ph) => (
                <button
                  key={ph}
                  onClick={() => { setPhase(ph); setPhaseOpen(false); }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[14px]"
                  style={{ color: ph === currentPhase ? "var(--color-r6-accent)" : "var(--color-r6-text)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-r6-surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span>{t(`phase_${ph}`, language)}</span>
                  {ph === currentPhase && <span style={{ color: "var(--color-r6-accent)" }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* View selector */}
        {map && (
          <>
            <span className="text-[13px]" style={{ color: "var(--color-r6-muted-2)" }}>›</span>
            <Dropdown<ViewMode>
              value={currentView}
              placeholder={t("view_standard", language)}
              items={([
                floor?.images.default    && { id: "default"   as ViewMode, label: t("view_standard",  language) },
                floor?.images.blueprint  && { id: "blueprint" as ViewMode, label: t("view_blueprint", language) },
                floor?.images.isometric  && { id: "isometric" as ViewMode, label: t("view_isometric", language) },
              ] as const).filter(Boolean) as { id: ViewMode; label: string }[]}
              onChange={setView}
              icon={ImageIcon}
              minWidth={108}
            />
            {/* Blueprint scale mode toggle — icon-only, only visible in blueprint view */}
            {currentView === "blueprint" && (
              <ToolBtn
                icon={blueprintScaleMode === "standard" ? ImageIcon : Maximize2}
                label={t(blueprintScaleMode === "standard" ? "scale_default" : "scale_standard", language)}
                active={blueprintScaleMode === "standard"}
                onClick={() => setBlueprintScaleMode(blueprintScaleMode === "standard" ? "default" : "standard")}
              />
            )}
          </>
        )}

        {/* Overlay toggles — 4 independent layer switches */}
        {map && (
          <>
            <ToolBtn icon={Layers2}     label="Verticality"  active={overlays.vert}   disabled={!floor?.images.verticality}                              onClick={() => toggleOverlay("vert"   as OverlayKey)} />
            <ToolBtn icon={Box}         label="Props"        active={overlays.props}  disabled={!floor?.images.props}                                    onClick={() => toggleOverlay("props"  as OverlayKey)} />
            <ToolBtn icon={ArrowUpDown} label="Stairs"       active={overlays.stairs} disabled={!floor?.images.stairs}                                   onClick={() => toggleOverlay("stairs" as OverlayKey)} />
            <ToolBtn icon={Type}        label="Room Names"   active={overlays.names}  disabled={!floor?.images.roomNames}                                onClick={() => toggleOverlay("names"  as OverlayKey)} />
          </>
        )}

        <Divider />

        {/* Draw tools */}
        {toolConfig.map(({ id, icon, label }) => (
          <ToolBtn key={id} icon={icon} label={label} active={tool === id} onClick={() => setTool(id)} />
        ))}

        <Divider />

        {/* Undo (Ctrl/Cmd+Z) */}
        <ToolBtn icon={Undo2} label="Undo (Ctrl+Z)" onClick={undo} />

        <div className="flex-1" />

        {/* Zoom strip */}
        <div className="flex items-center rounded-lg"
          style={{ background: "var(--color-r6-surface-2)", border: "1px solid var(--color-r6-border)" }}>
          <ToolBtn icon={ZoomOut}   label="Zoom out"      onClick={() => zoomStep(-1)} />
          <button className="w-12 text-center text-[13px] font-mono"
            style={{ color: "var(--color-r6-muted)" }}
            onClick={fitToScreen} title="Fit to screen">
            {zoomPercent}%
          </button>
          <ToolBtn icon={ZoomIn}    label="Zoom in"       onClick={() => zoomStep(1)} />
          <ToolBtn icon={Maximize2} label="Fit to screen" onClick={fitToScreen} />
        </div>

        <Divider />

        {/* Video button */}
        <button
          title="Open floating video player"
          onClick={toggleVideo}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium"
          style={{
            background:  isVideoOpen ? "var(--color-r6-accent-dim)" : "var(--color-r6-surface-2)",
            color:       isVideoOpen ? "var(--color-r6-accent)"     : "var(--color-r6-muted)",
            border:      isVideoOpen ? "1px solid var(--color-r6-accent)" : "1px solid var(--color-r6-border)",
          }}
          onMouseEnter={(e) => { if (!isVideoOpen) { e.currentTarget.style.background = "var(--color-r6-accent-dim)"; e.currentTarget.style.color = "var(--color-r6-accent)"; e.currentTarget.style.borderColor = "var(--color-r6-accent)"; } }}
          onMouseLeave={(e) => { if (!isVideoOpen) { e.currentTarget.style.background = "var(--color-r6-surface-2)"; e.currentTarget.style.color = "var(--color-r6-muted)"; e.currentTarget.style.borderColor = "var(--color-r6-border)"; } }}
        >
          <Video size={14} /> {t("Video", language)}
        </button>

        {/* AI / Notes toggle */}
        <button
          title="Toggle AI &amp; Notes panel"
          onClick={toggleRightSidebar}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium"
          style={{
            background:  isRightSidebarOpen ? "var(--color-r6-accent-dim)" : "var(--color-r6-surface-2)",
            color:       isRightSidebarOpen ? "var(--color-r6-accent)"     : "var(--color-r6-muted)",
            border:      isRightSidebarOpen ? "1px solid var(--color-r6-accent)" : "1px solid var(--color-r6-border)",
          }}
          onMouseEnter={(e) => { if (!isRightSidebarOpen) { e.currentTarget.style.background = "var(--color-r6-accent-dim)"; e.currentTarget.style.color = "var(--color-r6-accent)"; e.currentTarget.style.borderColor = "var(--color-r6-accent)"; } }}
          onMouseLeave={(e) => { if (!isRightSidebarOpen) { e.currentTarget.style.background = "var(--color-r6-surface-2)"; e.currentTarget.style.color = "var(--color-r6-muted)"; e.currentTarget.style.borderColor = "var(--color-r6-border)"; } }}
        >
          <Bot size={14} /> {t("AI", language)}
        </button>

        {/* Save project */}
        <button
          title={currentProjectId ? "Save project (Ctrl+S)" : "No project open"}
          onClick={() => {
            if (!currentProjectId) return;
            setIsSaving(true);
            saveCurrentProject().finally(() => setIsSaving(false));
          }}
          disabled={!currentProjectId || isSaving}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium"
          style={{
            background: isSaving ? "var(--color-r6-accent-dim)" : "var(--color-r6-surface-2)",
            color: (!currentProjectId || isSaving) ? "var(--color-r6-muted-2)" : "var(--color-r6-muted)",
            border: isSaving ? "1px solid var(--color-r6-accent)" : "1px solid var(--color-r6-border)",
            opacity: !currentProjectId ? 0.4 : 1,
          }}
          onMouseEnter={(e) => { if (currentProjectId && !isSaving) { e.currentTarget.style.background = "var(--color-r6-accent-dim)"; e.currentTarget.style.color = "var(--color-r6-accent)"; e.currentTarget.style.borderColor = "var(--color-r6-accent)"; } }}
          onMouseLeave={(e) => { if (currentProjectId && !isSaving) { e.currentTarget.style.background = "var(--color-r6-surface-2)"; e.currentTarget.style.color = "var(--color-r6-muted)"; e.currentTarget.style.borderColor = "var(--color-r6-border)"; } }}
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {t("Save", language)}
        </button>

        {/* Export dropdown */}
        <div ref={exportMenuRef} className="relative">
          <button
            title="Export tactical brief"
            onClick={() => setIsExportOpen((o) => !o)}
            disabled={isExporting || isExportingGif}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium"
            style={{
              background: isExportOpen ? "var(--color-r6-accent-dim)" : "var(--color-r6-surface-2)",
              color: (isExporting || isExportingGif) ? "var(--color-r6-muted-2)" : isExportOpen ? "var(--color-r6-accent)" : "var(--color-r6-muted)",
              border: isExportOpen ? "1px solid var(--color-r6-accent)" : "1px solid var(--color-r6-border)",
              opacity: (isExporting || isExportingGif) ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { if (!isExporting && !isExportingGif && !isExportOpen) { e.currentTarget.style.background = "var(--color-r6-accent-dim)"; e.currentTarget.style.color = "var(--color-r6-accent)"; e.currentTarget.style.borderColor = "var(--color-r6-accent)"; } }}
            onMouseLeave={(e) => { if (!isExporting && !isExportingGif && !isExportOpen) { e.currentTarget.style.background = "var(--color-r6-surface-2)"; e.currentTarget.style.color = "var(--color-r6-muted)"; e.currentTarget.style.borderColor = "var(--color-r6-border)"; } }}
          >
            {(isExporting || isExportingGif) ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {t("Export", language)}
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>

          {isExportOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-1 rounded-xl py-1.5 overflow-hidden"
              style={{
                background: "var(--color-r6-surface)",
                border: "1px solid var(--color-r6-border)",
                boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
                minWidth: 192,
              }}
            >
              {[
                { key: "Export PDF",       Icon: FileDown,  action: () => { setIsExportOpen(false); handleExport(); } },
                { key: "export_current",   Icon: FileImage, action: () => { setIsExportOpen(false); handleExportImage(); } },
                { key: "export_all",       Icon: FileImage, action: () => { setIsExportOpen(false); handleExportAllPhases(); } },
                { key: "export_gif",       Icon: Film,      action: () => { setIsExportOpen(false); handleExportGif(); } },
                { key: "Export Markdown",  Icon: FileText,  action: () => { setIsExportOpen(false); handleExportMarkdown(); } },
              ].map(({ key, Icon, action }) => (
                <button
                  key={key}
                  onClick={action}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors"
                  style={{ color: "var(--color-r6-text)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-r6-surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Icon size={14} style={{ color: "var(--color-r6-muted)", flexShrink: 0 }} />
                  {t(key, language)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Canvas area ───────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="canvas-grid relative flex-1 overflow-hidden"
        style={{ cursor: cursorStyle }}
      >
        {/* Export loading overlay — blocks user view while html2canvas renders the template */}
        {isExporting && (
          <div className="absolute inset-0 flex items-center justify-center z-[9999]"
            style={{ background: "var(--color-r6-bg)" }}>
            <div className="flex flex-col items-center gap-4">
              <Loader2 size={32} className="animate-spin" style={{ color: "var(--color-r6-accent)" }} />
              <p className="text-[14px] font-medium" style={{ color: "var(--color-r6-text)" }}>
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
            className="absolute inset-0 z-50"
            style={{ cursor: "copy" }}
            onDragEnter={(e) => e.preventDefault()}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDrop={handleDrop}
          />
        )}
        {/* Empty state */}
        {!currentMapId && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ background: "var(--color-r6-surface-2)", border: "1px solid var(--color-r6-border)" }}>
                <MapPin size={28} style={{ color: "var(--color-r6-muted-2)" }} />
              </div>
              <div>
                <p className="text-[17px] font-medium" style={{ color: "var(--color-r6-text)" }}>{t("No map loaded", language)}</p>
                <p className="mt-1 text-[14px]" style={{ color: "var(--color-r6-muted)" }}>
                  {t("Select a project", language)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading spinner */}
        {currentMapId && imageStatus === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 size={28} className="animate-spin" style={{ color: "var(--color-r6-muted)" }} />
          </div>
        )}

        {/* ── Konva Stage ───────────────────────────────────────────────────── */}
        {containerSize.width > 0 && containerSize.height > 0 && (
          <Stage
            ref={stageRef}
            width={containerSize.width}
            height={containerSize.height}
            scaleX={scale}
            scaleY={scale}
            x={position.x}
            y={position.y}
            draggable={isPannable}
            onDragEnd={() => {
              const s = stageRef.current;
              if (s) setPosition({ x: s.x(), y: s.y() });
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}   // cancel drawing if cursor leaves stage
          >
            {/* Layer 0 — map background (base + optional overlays) */}
            <Layer listening={false}>
              {basePath && (
                <MapImageLayer
                  basePath={basePath}
                  vertPath={vertPath}
                  propsPath={propsPath}
                  stairsPath={stairsPath}
                  namesPath={namesPath}
                  currentView={currentView}
                  blueprintScaleMode={blueprintScaleMode}
                />
              )}
              {/* Blueprint legend — painted onto the paper at absolute canvas coords */}
              {currentView === "blueprint" && (
                <KonvaLabel x={160} y={160} listening={false}>
                  <KonvaTag
                    fill="rgba(10, 37, 64, 0.85)"
                    cornerRadius={12}
                    stroke="#4aa5ff"
                    strokeWidth={6}
                  />
                  <KonvaText
                    text={"■  " + (map?.name.toUpperCase() || "MAP") + " // " + (floor?.label.toUpperCase() || "FLOOR") + " — TACTICAL BLUEPRINT"}
                    fill="#ffffff"
                    fontFamily="ui-monospace, monospace"
                    fontSize={72}
                    fontStyle="bold"
                    padding={40}
                  />
                </KonvaLabel>
              )}
            </Layer>

            {/* Layer 1 — operator tokens + drawings */}
            <Layer>
              {/* Committed lines — filtered to current phase */}
              {lines.filter((l) => l.phase === currentPhase).map((ln) =>
                ln.type === "arrow" ? (
                  <Arrow key={ln.id}
                    points={ln.points}
                    stroke={ln.color}
                    fill={ln.color}
                    strokeWidth={ln.strokeWidth}
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
                    strokeWidth={ln.strokeWidth}
                    lineCap="round"
                    lineJoin="round"
                    tension={0.4}
                    hitStrokeWidth={16}
                    listening={tool === "eraser"}
                    onClick={() => { if (tool === "eraser") removeLine(ln.id); }}
                  />
                )
              )}

              {/* Live preview while drawing */}
              {liveShape && liveShape.type === "arrow" && (
                <Arrow
                  points={liveShape.points}
                  stroke={penColor}
                  fill={penColor}
                  strokeWidth={penSize}
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
                  stroke={penColor}
                  strokeWidth={penSize}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.4}
                  listening={false}
                  opacity={0.75}
                />
              )}

              {/* Placed operator tokens — filtered to current phase */}
              {items.filter((i) => i.phase === currentPhase).map((item) => (
                <OperatorToken
                  key={item.id}
                  item={item}
                  isSelected={item.id === selectedId}
                  tool={tool}
                  onSelect={setSelectedId}
                  onUpdate={updateItem}
                  onRemove={(id) => { removeItem(id); setSelectedId(null); }}
                />
              ))}
            </Layer>
          </Stage>
        )}

        {/* Status bar */}
        <div
          className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] pointer-events-none"
          style={{ background: "var(--color-r6-surface-glass-dim)", border: "1px solid var(--color-r6-border)", color: "var(--color-r6-muted)" }}
        >
          <span style={{ color: "var(--color-r6-accent)" }}>●</span>
          {statusHints[tool]}
          {selectedId && tool === "cursor" && (
            <span style={{ color: "var(--color-r6-muted-2)" }}> · {t("hint.del", language)}</span>
          )}
        </div>

        {/* Outdated map warning */}
        {map?.id === "fortress" && currentView === "default" && (
          <div
            className="absolute bottom-6 right-6 px-4 py-2 rounded-lg shadow-lg text-sm font-bold z-10 pointer-events-none"
            style={{ background: "rgba(239,68,68,0.9)", color: "#fff" }}
          >
            {t("warning_outdated_map", language)}
          </div>
        )}

        {/* Zoom badge */}
        {zoomPercent !== 100 && (
          <div
            className="absolute bottom-4 right-4 rounded-lg px-2.5 py-1 text-[13px] font-mono pointer-events-none"
            style={{ background: "var(--color-r6-surface-glass-dim)", border: "1px solid var(--color-r6-border)", color: "var(--color-r6-muted)" }}
          >
            {zoomPercent}%
          </div>
        )}

        {/* Floating video player — always mounted to preserve video state and OCR markers */}
        <FloatingVideoPlayer />
      </div>
    </div>
  );
}
