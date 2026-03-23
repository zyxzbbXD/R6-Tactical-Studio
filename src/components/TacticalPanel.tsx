import { Eye, EyeOff, Scaling, Play, Pause } from "lucide-react";
import { useBoardStore } from "../store/useBoardStore";
import type { Tool } from "../store/useBoardStore";
import { useUIStore } from "../store/useUIStore";
import { cn } from "../utils/cn";

const BRUSH_SWATCHES = [
  { label: "Orange", value: "#e85d2a" },
  { label: "White",  value: "#ffffff" },
  { label: "Red",    value: "#ef4444" },
  { label: "Blue",   value: "#3b82f6" },
  { label: "Green",  value: "#22c55e" },
];

const THROWABLE_SWATCHES = [
  { label: "Yellow", value: "#facc15" },
  { label: "White",  value: "#ffffff" },
  { label: "Red",    value: "#ef4444" },
  { label: "Blue",   value: "#3b82f6" },
  { label: "Green",  value: "#22c55e" },
];

export default function TacticalPanel({ activeTool }: { activeTool: Tool }) {
  const {
    currentRouteStep, setCurrentRouteStep,
    showFullRoute, setShowFullRoute,
    resizingItemId, items, updateItem,
    isPlaying, setIsPlaying,
  } = useBoardStore();

  const {
    brushColor, brushSize, setBrushStyle,
    throwableColor, throwableSize, setThrowableStyle,
  } = useUIStore();

  const resizingItem = resizingItemId ? items.find((i) => i.id === resizingItemId) : null;

  const showRouteControls  = activeTool === "route";
  const showStyleControls  = activeTool === "pen" || activeTool === "arrow" || activeTool === "throwable" || activeTool === "text";
  const showScaleControls  = !!resizingItem;

  if (!showRouteControls && !showStyleControls && !showScaleControls) return null;

  const isThrowable  = activeTool === "throwable";
  const activeColor  = isThrowable ? throwableColor : brushColor;
  const activeSize   = isThrowable ? throwableSize  : brushSize;
  const setStyle     = isThrowable ? setThrowableStyle : setBrushStyle;
  const swatches     = isThrowable ? THROWABLE_SWATCHES : BRUSH_SWATCHES;

  return (
    <div
      className="absolute right-4 top-1/2 -translate-y-1/2 flex w-12 flex-col items-center gap-2 rounded-[14px] border border-r6-border bg-r6-surface-glass px-2 py-3 backdrop-blur-md z-50"
      style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
    >
      {showRouteControls && (
        <>
          {/* Step selector 1–5 */}
          <div className="flex flex-col gap-2 items-center">
            {([1, 2, 3, 4, 5] as const).map((step) => (
              <button
                key={step}
                onClick={() => setCurrentRouteStep(step)}
                title={`Set waypoint at step ${step}`}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-bold transition-colors border",
                  currentRouteStep === step
                    ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
                    : "bg-r6-surface-2 text-r6-muted border-r6-border"
                )}
              >
                {step}
              </button>
            ))}
          </div>

          <div className="w-full h-px bg-r6-border" />

          {/* Show full route toggle */}
          <button
            onClick={() => setShowFullRoute(!showFullRoute)}
            title={showFullRoute ? "Show up to current step only" : "Show full route"}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors mx-auto border",
              showFullRoute
                ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
                : "bg-r6-surface-2 text-r6-muted border-r6-border"
            )}
          >
            {showFullRoute ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>

          <div className="w-full h-px bg-r6-border" />

          {/* Play/Pause presentation */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? "Pause (Space)" : "Play Strategy (Space)"}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-bold transition-colors border",
              isPlaying
                ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
                : "bg-r6-surface-2 text-r6-muted border-r6-border"
            )}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          </button>
        </>
      )}

      {showStyleControls && (
        <>
          {/* Color swatches */}
          <div className="flex flex-col gap-2 items-center">
            {swatches.map(({ label, value }) => (
              <button
                key={value}
                title={label}
                onClick={() => setStyle(value, activeSize)}
                className={cn(
                  "h-5 w-5 rounded-full transition-all",
                  activeColor === value
                    ? "outline outline-2 outline-r6-accent outline-offset-2 scale-[1.18]"
                    : "outline outline-2 outline-transparent"
                )}
                style={{
                  background: value,
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </div>

          <div className="w-full h-px bg-r6-border" />

          {/* Size preview dot */}
          <div
            className="rounded-full mx-auto"
            style={{
              width:      Math.min(Math.max(activeSize * 2 + 2, 4), 22),
              height:     Math.min(Math.max(activeSize * 2 + 2, 4), 22),
              background: activeColor,
              border:     "1px solid rgba(255,255,255,0.2)",
            }}
          />

          {/* Vertical thickness slider */}
          <input
            type="range"
            min={1}
            max={10}
            value={activeSize}
            onChange={(e) => setStyle(activeColor, Number(e.target.value))}
            title="Brush size"
            className="cursor-pointer self-center accent-r6-accent"
            style={{
              writingMode: "vertical-lr",
              direction:   "rtl",
              height:      72,
              width:       20,
            }}
          />
        </>
      )}

      {/* Token scale slider — shown when a token is double-clicked */}
      {showScaleControls && (
        <>
          {(showRouteControls || showStyleControls) && (
            <div className="w-full h-px bg-r6-border" />
          )}
          <Scaling
            size={13}
            className="mx-auto text-r6-accent opacity-80"
          />
          <input
            type="range"
            min={1}
            max={5}
            step={0.1}
            value={resizingItem!.scale}
            onChange={(e) => updateItem(resizingItem!.id, { scale: parseFloat(e.target.value) })}
            title="Token size"
            className="cursor-pointer self-center accent-r6-accent"
            style={{
              writingMode: "vertical-lr",
              direction:   "rtl",
              height:      72,
              width:       20,
            }}
          />
        </>
      )}
    </div>
  );
}
