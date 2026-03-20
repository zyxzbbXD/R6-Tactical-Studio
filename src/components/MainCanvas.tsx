import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Video, MapPin, ChevronDown, MousePointer2, Loader2, Bot, FileDown, Save, Upload,
  FileImage, FileText, Film, FileJson,
  Image as ImageIcon, Layers2, Type, Flag, Box, ArrowUpDown,
  PanelLeftClose, PanelLeftOpen, LayoutTemplate,
  Spline, Route, MessageSquare, Tag,
} from "lucide-react";
import { dragState } from "../store/dragState";
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
  nighthavenlabs:   2.5,
};
import FloatingVideoPlayer from "./FloatingVideoPlayer";
import FloatingExportWindow from "./FloatingExportWindow";
import TacticalPanel from "./TacticalPanel";
import MapPreloader from "./MapPreloader";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore, type ViewMode, type OverlayKey } from "../store/canvasStore";
import {
  useBoardStore,
  type BoardItem, type Tool, type Waypoint,
} from "../store/useBoardStore";
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
 * Expand a BoardItem's sparse route dict into 6 positions (index 0 = base, 1–5 = steps).
 * If step N has no waypoint, it inherits from step N-1 ("holding angle").
 * Dead status is inherited forward: once dead, stays dead unless overridden.
 */
function getEffectiveRoute(item: BoardItem): Array<{ x: number; y: number; status: "normal" | "dead" | "planting" }> {
  type EffPt = { x: number; y: number; status: "normal" | "dead" | "planting" };
  const pts: EffPt[] = [{ x: item.x, y: item.y, status: "normal" }];
  for (let i = 1; i <= 5; i++) {
    const prev = pts[i - 1];
    const wp = item.route[i];
    const newStatus: "normal" | "dead" | "planting" =
      wp?.status ?? (prev.status === "dead" ? "dead" : "normal");
    pts.push({ x: wp?.x ?? prev.x, y: wp?.y ?? prev.y, status: newStatus });
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
  const applyScale = blueprintScaleMode === "standard" && (isBlueprint || externalCenter != null);
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
  item, isSelected, isTransforming, tool, status, onSelect, onUpdate, onRemove, onDblClick, onContextMenu, displayX, displayY, viewScaleMultiplier = 1.0,
}: {
  item: BoardItem;
  isSelected: boolean;
  isTransforming: boolean;
  tool: Tool;
  status: "normal" | "dead" | "planting";
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, updates: Partial<BoardItem>) => void;
  onRemove: (id: string) => void;
  onDblClick: (id: string) => void;
  onContextMenu: (id: string, clientX: number, clientY: number) => void;
  displayX: number;
  displayY: number;
  viewScaleMultiplier?: number;
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
        opacity={status === "dead" ? 0.5 : 1}
        draggable={tool === "cursor"}
        listening={interactive}
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
      </KonvaGroup>

      {/* Per-item transformer — only shown on double-click, not single-click */}
      {isTransforming && (
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

export default function MainCanvas({
  isLeftOpen = true,
  onToggleLeft,
  onResetWorkspace,
}: {
  isLeftOpen?: boolean;
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
  const { isRightSidebarOpen, toggleRightSidebar, language, isAdvancedMode } = useSettingsStore(
    useShallow((s) => ({ isRightSidebarOpen: s.isRightSidebarOpen, toggleRightSidebar: s.toggleRightSidebar, language: s.language, isAdvancedMode: s.isAdvancedMode })),
  );

  // ── Project store (save) ───────────────────────────────────────────────────
  const saveCurrentProject = useProjectStore((s) => s.saveCurrentProject);
  const currentProjectId   = useProjectStore((s) => s.currentProjectId);
  const [isSaving,      setIsSaving]      = useState(false);
  const [isExportOpen,  setIsExportOpen]  = useState(false);
  const exportMenuRef        = useRef<HTMLDivElement>(null);
  const jsonImportRef        = useRef<HTMLInputElement>(null);
  const roomLabelsImportRef  = useRef<HTMLInputElement>(null);

  // ── Board store (items / lines / tool / notes) ────────────────────────────
  const {
    tool, setTool,
    brushColor, brushSize,
    throwableColor, throwableSize,
    currentRouteStep, setCurrentRouteStep, showFullRoute,
    exportPhases, exportVisibility, gifExportRequested, setGifExportRequested,
    imageExportRequested, setImageExportRequested,
    allPhasesExportRequested, setAllPhasesExportRequested,
    setExportWindowOpen,
    items, lines, throwableLines, texts, roomLabels,
    isDraggingIcon,
    pendingOperator, setPendingOperator,
    isVideoOpen, toggleVideo,
    notes,
    addItem, updateItem, removeItem,
    addLine, removeLine,
    addThrowableLine, removeThrowableLine,
    addRoutePoint, clearRoute,
    addText, updateText, removeText,
    addRoomLabel, updateRoomLabel, removeRoomLabel,
    setRouteStepStatus,
    isPlaying, setIsPlaying,
    undo,
    currentPhase, setPhase,
    setResizingItemId,
    transformingItemId, setTransformingItemId,
  } = useBoardStore(useShallow((s) => ({
    tool: s.tool, setTool: s.setTool,
    brushColor: s.brushColor, brushSize: s.brushSize,
    throwableColor: s.throwableColor, throwableSize: s.throwableSize,
    currentRouteStep: s.currentRouteStep, setCurrentRouteStep: s.setCurrentRouteStep, showFullRoute: s.showFullRoute,
    exportPhases: s.exportPhases, exportVisibility: s.exportVisibility,
    gifExportRequested: s.gifExportRequested, setGifExportRequested: s.setGifExportRequested,
    imageExportRequested: s.imageExportRequested, setImageExportRequested: s.setImageExportRequested,
    allPhasesExportRequested: s.allPhasesExportRequested, setAllPhasesExportRequested: s.setAllPhasesExportRequested,
    setExportWindowOpen: s.setExportWindowOpen,
    items: s.items, lines: s.lines, throwableLines: s.throwableLines, texts: s.texts, roomLabels: s.roomLabels,
    isDraggingIcon: s.isDraggingIcon,
    pendingOperator: s.pendingOperator, setPendingOperator: s.setPendingOperator,
    isVideoOpen: s.isVideoOpen, toggleVideo: s.toggleVideo,
    notes: s.notes,
    addItem: s.addItem, updateItem: s.updateItem, removeItem: s.removeItem,
    addLine: s.addLine, removeLine: s.removeLine,
    addThrowableLine: s.addThrowableLine, removeThrowableLine: s.removeThrowableLine,
    addRoutePoint: s.addRoutePoint, clearRoute: s.clearRoute,
    addText: s.addText, updateText: s.updateText, removeText: s.removeText,
    addRoomLabel: s.addRoomLabel, updateRoomLabel: s.updateRoomLabel, removeRoomLabel: s.removeRoomLabel,
    setRouteStepStatus: s.setRouteStepStatus,
    isPlaying: s.isPlaying, setIsPlaying: s.setIsPlaying,
    undo: s.undo,
    currentPhase: s.currentPhase, setPhase: s.setPhase,
    setResizingItemId: s.setResizingItemId,
    transformingItemId: s.transformingItemId, setTransformingItemId: s.setTransformingItemId,
  })));

  // ── Local UI state ────────────────────────────────────────────────────────
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const copiedItemRef = useRef<BoardItem | null>(null);
  const [editingTextId,  setEditingTextId]  = useState<string | null>(null);
  const [activeRoomEdit, setActiveRoomEdit] = useState<{ id: string; x: number; y: number; text: string; screenX: number; screenY: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ itemId: string; x: number; y: number } | null>(null);

  // Wrapper: reset route step and clear resize mode when switching operators
  const handleSelectOperator = useCallback((id: string | null) => {
    setSelectedId((prev) => {
      if (id !== prev) {
        setCurrentRouteStep(1);
        setResizingItemId(null);
        setTransformingItemId(null);
      }
      return id;
    });
  }, [setCurrentRouteStep, setResizingItemId, setTransformingItemId]);
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
  const [isExporting,   setIsExporting]   = useState(false);
  const [phaseOpen,     setPhaseOpen]     = useState(false);
  const [isExportingGif, setIsExportingGif] = useState(false);

  // ── Blueprint transform — lifted from MapImageLayer so items co-transform ──
  // buildingCenter: updated from whichever image is currently loaded.
  // blueprintCenter: only updated when the blueprint image is scanned — persists across view switches
  //                  so the same pivot is reused on the standard map view.
  const [buildingCenter, setBuildingCenter] = useState<{ x: number; y: number } | null>(null);
  const [blueprintCenter, setBlueprintCenter] = useState<{ x: number; y: number } | null>(null);
  // Reset both on map/floor change.
  useEffect(() => { setBuildingCenter(null); setBlueprintCenter(null); }, [currentMapId, currentFloorId]);

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
  // Transform is active for ALL views once we have a pivot, not just blueprint view.
  const isStandardBp = isStandardScale && effectiveCenter != null;
  const bpScale   = isStandardScale ? (BLUEPRINT_MANUAL_SCALES[currentMapId ?? ""] ?? 1.0) : 1.0;
  const bpOffsetX = effectiveCenter?.x ?? 0;
  const bpOffsetY = effectiveCenter?.y ?? 0;
  // Shared Konva transform applied to BOTH the image layer and the items Group.
  const bpTransformProps = isStandardBp
    ? { x: 3200, y: 1800, offsetX: bpOffsetX, offsetY: bpOffsetY, scaleX: bpScale, scaleY: bpScale }
    : { x: 0,    y: 0,    offsetX: 0,         offsetY: 0,         scaleX: 1,       scaleY: 1       };

  // Live drawing state (not committed to store yet)
  const [liveShape, setLiveShape] = useState<{
    type: "line" | "arrow" | "throwable";
    points: number[];
  } | null>(null);
  const isDrawingRef = useRef(false);

  // Refs
  const stageRef        = useRef<Konva.Stage>(null);
  const containerRef    = useRef<HTMLDivElement>(null);
  const resizeTimerRef  = useRef<ReturnType<typeof setTimeout>>(undefined);
  const phaseRef        = useRef<HTMLDivElement>(null);

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
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }, 16);
    });
    obs.observe(el);
    return () => {
      obs.disconnect();
      clearTimeout(resizeTimerRef.current);
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
    // Keep selection alive for route tool so waypoints attach to the selected op
    if (tool !== "cursor" && tool !== "route") setSelectedId(null);
  }, [tool]);

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
        const item = items.find((i) => i.id === selectedId);
        if (item && (item.route as Record<number, unknown>)[currentRouteStep]) {
          const newRoute = { ...item.route } as Record<number, unknown>;
          delete newRoute[currentRouteStep];
          updateItem(selectedId, { route: newRoute as BoardItem["route"] });
        }
      } else {
        removeItem(selectedId);
        setSelectedId(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, tool, currentRouteStep, items, removeItem, updateItem, removeText, removeRoomLabel, texts, roomLabels]);

  // ── Keyboard shortcuts for tool switching + route step 1–5 ───────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") { setPendingOperator(null); setTool("cursor"); }
      if (e.key === "v" || e.key === "V") setTool("cursor");
      if (e.key === "p" || e.key === "P") setTool("pen");
      if (e.key === "a" || e.key === "A") setTool("arrow");
      if (e.key === "e" || e.key === "E") setTool("eraser");
      if (e.key === "t" || e.key === "T") setTool("throwable");
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
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!currentProjectId) return;
        setIsSaving(true);
        saveCurrentProject().finally(() => setIsSaving(false));
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
  }, [setTool, tool, setCurrentRouteStep, undo, currentProjectId, saveCurrentProject, isPlaying, setIsPlaying, selectedId, items, addItem]);

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

    const data = dragState.operator;
    dragState.operator = null;
    console.log("📦 Drag state received:", data);
    if (!data) return;

    addItem({
      id: crypto.randomUUID(),
      operatorId: data.operatorId,
      iconPath:   data.iconPath,
      name:       data.name,
      side:       data.side,
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

  // ── Export requests from FloatingExportWindow ──────────────────────────────
  useEffect(() => {
    if (gifExportRequested) handleExportGif();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gifExportRequested]);

  useEffect(() => {
    if (imageExportRequested) { handleExportImage(); setImageExportRequested(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageExportRequested]);

  useEffect(() => {
    if (allPhasesExportRequested) { handleExportAllPhases(); setAllPhasesExportRequested(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPhasesExportRequested]);

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

  // Close export menu, phase popover, and context menu on outside click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportOpen(false);
      }
      if (phaseRef.current && !phaseRef.current.contains(e.target as Node)) {
        setPhaseOpen(false);
      }
      setCtxMenu(null);
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

  const handleExportJson = () => {
    const board  = useBoardStore.getState();
    const canvas = useCanvasStore.getState();
    const data = {
      mapId:         canvas.currentMapId,
      floorId:       canvas.currentFloorId,
      items:         board.items,
      lines:         board.lines,
      throwableLines: board.throwableLines,
      texts:         board.texts,
      notes:         board.notes,
      exportedAt:    Date.now(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "R6_Tactics_Project.json";
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
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        useBoardStore.getState().setRoomLabelsForFloor(currentFloorId, data);
      } catch {
        alert("导入失败：JSON 格式不正确");
      }
    };
    reader.readAsText(file);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be imported again if needed
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        useBoardStore.getState().loadProjectData(data);
      } catch {
        console.error("❌ [Import] Failed to parse JSON project file");
        alert("Import failed: invalid or corrupted JSON file.");
      }
    };
    reader.readAsText(file);
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
        await new Promise<void>((r) => setTimeout(r, 300));
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

  // Smart GIF pipeline: detects active floors per phase, renders per-floor frames
  // filtered by exportVisibility, downloads per-phase-per-floor GIFs + merged GIFs.
  const handleExportGif = async () => {
    const stage = stageRef.current;
    if (!stage || isExportingGif || isExporting) return;

    const phases = [...exportPhases].sort((a, b) => a - b);
    if (phases.length === 0) return;

    setIsExportingGif(true);
    const savedPhase = currentPhase;
    const savedStep  = currentRouteStep;
    const savedFloor = currentFloorId;
    // 3 hold-frames per step × 5 steps = 15 frames per phase; operator snaps, no lerp
    const FRAMES_PER_STEP = 3;

    const mapBase   = (map?.name ?? "Tactic").replace(/\s+/g, "");
    const visSuffix = exportVisibility === "all" ? "" : `_${exportVisibility.toUpperCase()}`;

    // Collect floors active in a given phase (items + lines + throwables)
    const getActiveFloors = (ph: number): string[] => {
      const floorSet = new Set<string>();
      items.filter((i) => i.phase === ph && i.floorId).forEach((i) => floorSet.add(i.floorId!));
      lines.filter((l) => l.phase === ph && l.floorId).forEach((l) => floorSet.add(l.floorId!));
      throwableLines.filter((l) => l.phase === ph && l.floorId).forEach((l) => floorSet.add(l.floorId!));
      // Fallback to current floor when phase has no placed content
      if (floorSet.size === 0 && savedFloor) floorSet.add(savedFloor);
      return [...floorSet];
    };

    // frames keyed as `${phase}-${floorId}` → string[]
    const phaseFloorFrames = new Map<string, string[]>();

    try {
      for (const ph of phases) {
        setPhase(ph);
        await new Promise<void>((r) => setTimeout(r, 150));

        for (const fid of getActiveFloors(ph)) {
          setFloor(fid);
          await new Promise<void>((r) => setTimeout(r, 150));

          const frames: string[] = [];
          for (let step = 1; step <= 5; step++) {
            setCurrentRouteStep(step as 1 | 2 | 3 | 4 | 5);
            for (let f = 0; f < FRAMES_PER_STEP; f++) {
              await new Promise<void>((r) => setTimeout(r, 80));
              frames.push(stage.toDataURL({ pixelRatio: 1 }));
            }
          }
          phaseFloorFrames.set(`${ph}-${fid}`, frames);
        }
      }

      // Restore view state
      setPhase(savedPhase);
      setCurrentRouteStep(savedStep);
      if (savedFloor) setFloor(savedFloor);

      const { createGIF } = await import("gifshot");

      const triggerGif = (frames: string[], filename: string) =>
        new Promise<void>((resolve) => {
          createGIF(
            { images: frames, gifWidth: stage.width(), gifHeight: stage.height(), interval: 0.12, numWorkers: 2 },
            (obj) => {
              if (!obj.error) {
                const a = document.createElement("a");
                a.href = obj.image;
                a.download = filename;
                a.click();
              }
              resolve();
            },
          );
        });

      const floorLabel = (fid: string) =>
        (map?.floors.find((f) => f.id === fid)?.label ?? fid).replace(/\s+/g, "");

      // Individual phase GIFs — one per active floor
      for (const ph of phases) {
        const activeFloors = getActiveFloors(ph);
        const multiFloor   = activeFloors.length > 1;
        for (const fid of activeFloors) {
          const frames = phaseFloorFrames.get(`${ph}-${fid}`) ?? [];
          const suffix = multiFloor ? `_${floorLabel(fid)}` : "";
          await triggerGif(frames, `${mapBase}${visSuffix}_Phase${ph}${suffix}.gif`);
          await new Promise<void>((r) => setTimeout(r, 80));
        }
      }

      // Merged GIF if multiple phases selected — one per floor
      if (phases.length > 1) {
        const allFloors  = new Set(phases.flatMap((ph) => getActiveFloors(ph)));
        const multiFloor = allFloors.size > 1;
        const range      = `${phases[0]}-${phases[phases.length - 1]}`;
        for (const fid of allFloors) {
          const allFrames = phases.flatMap((ph) => phaseFloorFrames.get(`${ph}-${fid}`) ?? []);
          if (allFrames.length === 0) continue;
          const suffix = multiFloor ? `_${floorLabel(fid)}` : "";
          await triggerGif(allFrames, `${mapBase}${visSuffix}_Phase${range}${suffix}_Merged.gif`);
        }
      }
    } catch (err) {
      console.error("❌ [Export] GIF export failed:", err);
      setPhase(savedPhase);
      setCurrentRouteStep(savedStep);
      if (savedFloor) setFloor(savedFloor);
    } finally {
      setIsExportingGif(false);
      setGifExportRequested(false);
    }
  };

  // ── Stage mouse events (drawing) ───────────────────────────────────────────
  // Convert Stage-world pointer position → map-image coordinate space.
  // In blueprint "standard" mode the image group applies a transform; storing items
  // at the inverse-transformed coordinates keeps them aligned with the building.
  const toMapCoords = (stage: Konva.Stage): Vec2 => {
    const w = toCanvasPos(stage);
    if (!isStandardBp) return w;
    return { x: (w.x - 3200) / bpScale + bpOffsetX, y: (w.y - 1800) / bpScale + bpOffsetY };
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current!;

    if (tool === "place_operator" && pendingOperator) {
      const pos = toMapCoords(stage);
      addItem({
        id: crypto.randomUUID(),
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
      if (e.target === stage) {
        const pos = toMapCoords(stage);
        const newId = crypto.randomUUID();

        // 1. 写入 Zustand (加上 currentFloorId 确保楼层隔离)
        addRoomLabel({
          id: newId,
          x: pos.x, y: pos.y,
          text: "Room",
          fontSize: 60,
          fill: "#ffffff",
          rotation: 0, scaleX: 1, scaleY: 1,
        }); // floorId injected by store from useCanvasStore.getState().currentFloorId

        // 2. 获取原生屏幕坐标，绕开 Konva 的矩阵缩放
        const rect = containerRef.current?.getBoundingClientRect();
        const sx = rect ? e.evt.clientX - rect.left : e.evt.clientX;
        const sy = rect ? e.evt.clientY - rect.top  : e.evt.clientY;

        console.log("🔥 Room Name Created! Spawning textarea at:", sx, sy);

        // 3. 激活 HTML 文本框并重置鼠标工具
        setActiveRoomEdit({ id: newId, x: pos.x, y: pos.y, text: "Room", screenX: sx, screenY: sy });
        setTool("cursor");
      }
      return;
    }

    if (tool === "cursor") {
      if (e.target === stage) { setSelectedId(null); setResizingItemId(null); setTransformingItemId(null); setCtxMenu(null); }
      return;
    }
    if (tool === "eraser") {
      if (e.target === stage) { setSelectedId(null); setResizingItemId(null); setTransformingItemId(null); }
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
    "default";

  const statusHints: Record<Tool, string> = {
    cursor:         t("hint.cursor",    language),
    pen:            t("hint.pen",       language),
    arrow:          t("hint.arrow",     language),
    eraser:         t("hint.eraser",    language),
    throwable:      "Throwable · drag to draw trajectory  (T)",
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
    { id: "throwable", icon: Spline,         label: "Throwable  (T)", dividerBefore: true },
    { id: "route",     icon: Route,          label: "Route      (R)" },
    { id: "text",      icon: MessageSquare,  label: "Text       (X)" },
    ...(isAdvancedMode ? [{ id: "room_name" as Tool, icon: Tag, label: "Room Label", dividerBefore: true }] : []),
  ];

  // ── Memoized Stage layers — excluded from zoomPercent re-renders ──────────
  // When only zoomPercent changes (e.g. wheel scroll), these layers return
  // the same object reference so React skips reconciling the entire Konva tree.
  const stageLayers = useMemo(() => (
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

        {/* Throwable trajectories — dashed parabolas (color/width stored per-line) */}
        {throwableLines.filter((l) => l.phase === currentPhase && l.floorId === currentFloorId).map((tl) => (
          <Line key={tl.id}
            points={tl.points}
            stroke={tl.color}
            strokeWidth={tl.strokeWidth}
            dash={[10, 8]}
            tension={0.4}
            lineCap="round"
            lineJoin="round"
            hitStrokeWidth={16}
            listening={tool === "eraser"}
            onClick={() => { if (tool === "eraser") removeThrowableLine(tl.id); }}
          />
        ))}

        {/* Live preview while drawing */}
        {liveShape && liveShape.type === "arrow" && (
          <Arrow
            points={liveShape.points}
            stroke={brushColor}
            fill={brushColor}
            strokeWidth={brushSize}
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
            strokeWidth={brushSize}
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
            strokeWidth={throwableSize}
            dash={[10, 8]}
            tension={0.4}
            lineCap="round"
            lineJoin="round"
            listening={false}
            opacity={0.75}
          />
        )}

        {/* Placed operator tokens — rendered at effective route position for currentRouteStep */}
        {(() => {
          const viewScaleMultiplier = (currentView === "isometric" ? 0.4 : 1.0) / bpScale;
          return items
            .filter((i) => i.phase === currentPhase && i.floorId === currentFloorId)
            .filter((i) => !isExportingGif || exportVisibility === "all" || i.side === "neutral" || i.side === exportVisibility)
            .map((item) => {
            const eff = getEffectiveRoute(item);
            return (
              <OperatorToken
                key={item.id}
                item={item}
                isSelected={item.id === selectedId}
                isTransforming={item.id === transformingItemId}
                tool={tool}
                status={eff[currentRouteStep].status}
                onSelect={handleSelectOperator}
                onUpdate={updateItem}
                onRemove={(id) => { removeItem(id); handleSelectOperator(null); setTransformingItemId(null); }}
                onDblClick={(id) => { setResizingItemId(id); setTransformingItemId(id); }}
                onContextMenu={handleContextMenu}
                displayX={eff[currentRouteStep].x}
                displayY={eff[currentRouteStep].y}
                viewScaleMultiplier={viewScaleMultiplier}
              />
            );
          });
        })()}

        {/* Operator movement routes — hidden during GIF export; badges hide at current step */}
        {!isExportingGif && items
          .filter((i) => i.phase === currentPhase && i.floorId === currentFloorId && Object.keys(i.route).length > 0)
          .map((item) => {
          const eff          = getEffectiveRoute(item);
          const upTo         = showFullRoute ? 5 : currentRouteStep;
          const routePoints  = eff.slice(0, upTo + 1).flatMap((p) => [p.x, p.y]);
          const isEraserActive = tool === "eraser";
          return (
            <Fragment key={`route-${item.id}`}>
              <Arrow
                points={routePoints}
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
              {Object.entries(item.route)
                .filter(([stepStr]) => Number(stepStr) <= upTo && Number(stepStr) !== currentRouteStep)
                .map(([stepStr, wp]) => {
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

        {/* 房间名称渲染 */}
        {roomLabels
          .filter((rl) => rl.floorId === currentFloorId)
          .map((label) => (
            <KonvaText
              key={label.id}
              x={label.x}
              y={label.y}
              text={activeRoomEdit?.id === label.id ? "" : label.text}
              fontSize={label.fontSize / bpScale}
              fill={label.fill}
              stroke="rgba(0,0,0,0.85)"
              strokeWidth={4}
              fillAfterStrokeEnabled={true}
              fontStyle="bold"
              rotation={label.rotation}
              scaleX={label.scaleX}
              scaleY={label.scaleY}
              draggable={tool === "cursor"}
              listening={tool === "cursor" || tool === "eraser"}
              onClick={(e) => {
                e.cancelBubble = true;
                if (tool === "eraser") removeRoomLabel(label.id);
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
      bpTransformProps, setBuildingCenter,
      lines, throwableLines, currentPhase, tool,
      brushColor, brushSize, throwableColor, throwableSize, liveShape,
      showFullRoute, currentRouteStep, isExportingGif, exportVisibility,
      items, selectedId, transformingItemId,
      handleSelectOperator, setResizingItemId, setTransformingItemId,
      updateItem, removeLine, removeThrowableLine, removeItem, clearRoute,
      texts, editingTextId, updateText, removeText, handleContextMenu,
      roomLabels, activeRoomEdit, updateRoomLabel, removeRoomLabel]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-1 flex-col bg-r6-bg">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="relative flex shrink-0 items-center gap-1 px-3 py-1.5 z-20 bg-r6-surface-glass border-b border-r6-border backdrop-blur-[10px]">
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
        <Divider />

        {/* Map selector */}
        <Dropdown value={currentMapId} placeholder={t("select_map", language)} items={mapItems}
          onChange={(id) => { if (id !== currentMapId) { useBoardStore.getState().clearBoard(); setMap(id); } }} icon={MapPin} minWidth={158} />

        {/* Floor selector */}
        {map && floorItems.length > 1 && (
          <>
            <span className="text-[13px] text-r6-muted-2">›</span>
            <Dropdown value={currentFloorId} placeholder="…" items={floorItems}
              onChange={(id) => setFloor(id)} minWidth={68} />
          </>
        )}

        {/* Phase selector */}
        {map && (
          <div ref={phaseRef} className="relative shrink-0">
            <button
              onClick={() => setPhaseOpen((o) => !o)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[14px] font-medium border",
                phaseOpen
                  ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
                  : "bg-r6-surface-2 text-r6-text border-r6-border"
              )}
              style={{ minWidth: 112 }}
            >
              <Flag size={13} className="opacity-70 shrink-0" />
              <span className="flex-1 text-left truncate">{t(`phase_${currentPhase}`, language)}</span>
              <ChevronDown size={12} className="opacity-50 shrink-0" />
            </button>
            {/* Animated slide-down popover */}
            <div
              className="absolute left-0 top-[calc(100%+4px)] z-[60] rounded-xl py-1 bg-r6-surface border border-r6-border min-w-[170px]"
              style={{
                boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
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
                  className={cn(
                    "flex w-full items-center justify-between gap-2 pl-4 pr-3 py-1.5 text-[14px] hover:bg-r6-surface-2 transition-colors",
                    ph === currentPhase ? "text-r6-accent" : "text-r6-text"
                  )}
                >
                  <span>{t(`phase_${ph}`, language)}</span>
                  {ph === currentPhase && <span className="text-r6-accent">✓</span>}
                </button>
              ))}
            </div>
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
            <ToolBtn icon={Box}         label="Props"        active={overlays.props}  disabled={!floor?.images.props}                                    onClick={() => toggleOverlay("props"  as OverlayKey)} />
            <ToolBtn icon={ArrowUpDown} label="Stairs"       active={overlays.stairs} disabled={!floor?.images.stairs}                                   onClick={() => toggleOverlay("stairs" as OverlayKey)} />
            <ToolBtn icon={Type}        label="Room Names"   active={overlays.names}  disabled={!floor?.images.roomNames}                                onClick={() => toggleOverlay("names"  as OverlayKey)} />
          </>
        )}


        {/* Undo (Ctrl/Cmd+Z) */}
        <ToolBtn icon={Undo2} label="Undo (Ctrl+Z)" onClick={undo} />

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

        {/* AI / Notes toggle — icon-only */}
        <button
          title="Toggle AI &amp; Notes panel"
          onClick={toggleRightSidebar}
          className={cn(
            "flex shrink-0 h-7 w-7 items-center justify-center rounded-lg border transition-colors",
            isRightSidebarOpen
              ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
              : "bg-r6-surface-2 text-r6-muted border-r6-border hover:bg-r6-accent-dim hover:text-r6-accent hover:border-r6-accent"
          )}
        >
          <Bot size={14} />
        </button>

        {/* Save project — icon-only */}
        <button
          title={currentProjectId ? "Save project (Ctrl+S)" : "No project open"}
          onClick={() => {
            if (!currentProjectId) return;
            setIsSaving(true);
            saveCurrentProject().finally(() => setIsSaving(false));
          }}
          disabled={!currentProjectId || isSaving}
          className={cn(
            "flex shrink-0 h-7 w-7 items-center justify-center rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            isSaving
              ? "bg-r6-accent-dim text-r6-muted-2 border-r6-accent"
              : "bg-r6-surface-2 text-r6-muted border-r6-border hover:bg-r6-accent-dim hover:text-r6-accent hover:border-r6-accent"
          )}
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        </button>

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
                { key: "save_project",     Icon: FileJson,  action: () => { setIsExportOpen(false); handleExportJson(); } },
                { key: "load_project",     Icon: Upload,    action: () => { setIsExportOpen(false); jsonImportRef.current?.click(); } },
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

      {/* Hidden JSON import input */}
      <input
        ref={jsonImportRef}
        type="file"
        accept=".json"
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
        className="canvas-grid relative flex-1 overflow-hidden"
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
            >
              {stageLayers}
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
            autoFocus
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
        <div
          className="absolute left-4 top-1/2 -translate-y-1/2 flex w-12 min-h-[300px] flex-col items-center justify-center gap-2 rounded-[14px] border border-r6-border bg-r6-surface-glass px-2 py-3 backdrop-blur z-50 pointer-events-auto"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
        >
          {toolConfig.map(({ id, icon, label, dividerBefore }) => (
            <Fragment key={id}>
              {dividerBefore && <div className="w-full h-px bg-r6-border my-0.5" />}
              <ToolBtn icon={icon} label={label} active={tool === id} onClick={() => setTool(id)} />
            </Fragment>
          ))}
          <div className="w-full h-px bg-r6-border my-0.5" />
          <ToolBtn icon={Trash2} label="Clear floor" onClick={() => {
            useBoardStore.getState().clearFloor(currentPhase, currentFloorId);
          }} />
        </div>

        {/* Tactical panel — floats right side, shows tool-contextual controls */}
        <TacticalPanel activeTool={tool} />

        {/* Floating video player — always mounted to preserve video state and OCR markers */}
        <FloatingVideoPlayer />

        {/* Floating GIF export window — draggable, opened from Export dropdown */}
        <FloatingExportWindow />
      </div>
    </div>
  );
}
