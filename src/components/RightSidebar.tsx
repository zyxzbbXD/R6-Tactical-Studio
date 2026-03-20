import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  Bot, FileText, Loader2, AlertCircle, Eye, Pencil,
  Play, Pause, RotateCcw, ChevronRight,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSettingsStore } from "../store/useSettingsStore";
import { useBoardStore, TIMELINE_ROWS, PHASE_START_ROW, type AITimelineJson } from "../store/useBoardStore";
import { useCanvasStore } from "../store/canvasStore";
import { t } from "../locales/i18n";
import { cn } from "../utils/cn";

// ─── Constants ─────────────────────────────────────────────────────────────────

const STEP_CIRCLE = ["①", "②", "③", "④", "⑤"];
const COL_LETTERS = ["A", "B", "C", "D", "E"];

const PHASE_LABELS: Record<string, string> = {
  prep:  "PREP",
  early: "▌ EARLY",
  mid:   "▌ MID",
  late:  "▌ LATE",
};

// Rows where a thick divider appears (start of each action phase section)
const PHASE_DIVIDER_ROWS = new Set([PHASE_START_ROW[2], PHASE_START_ROW[3], PHASE_START_ROW[4]]); // 5, 11, 16

// Gadget IDs that remain on the map after deployment (show a continuous tail in the timeline).
// Consumable/throwable gadgets are NOT listed here and show only the deploy icon.
const CONTINUOUS_PROPS = new Set([
  // Generic gadgets (deployable, stays on map)
  "gadget-barb",
  "gadget-barricade",
  "gadget-reinforcement",
  "gadget-proximity-mine",
  "gadget-shield",
  "gadget-rotation",
  "gadget-defuser",
  // Operator-specific deployables
  "opgadget-azami",
  "opgadget-bandit",
  "opgadget-echo",
  "opgadget-ela",
  "opgadget-fenrir",
  "opgadget-frost",
  "opgadget-goyo",
  "opgadget-grim",
  "opgadget-jager",
  "opgadget-kaid",
  "opgadget-lesion",
  "opgadget-maestro",
  "opgadget-melusi",
  "opgadget-mozzie",
  "opgadget-mute",
  "opgadget-nomad",
  "opgadget-thunderbird",
  "opgadget-valkyrie",
  "opgadget-wamai",
  "opgadget-zero",
]);

// ─── AI Timeline system prompt ─────────────────────────────────────────────────

const AI_TIMELINE_SYSTEM_PROMPT = `You are an expert Rainbow Six Siege tactician. Your ONLY output must be a single valid JSON object — no markdown, no explanation, no code fences.

You MUST match this exact structure and data types:
{
  "title": "Bank 2F Fast Execute",
  "overall_strategy": "Ash and Thermite open the 2F CEO wall during prep while Sledge clears the skylight, enabling a hard 3-man push at round start.",
  "operators": [
    {
      "operatorId": "ash",
      "start_floor": "Roof",
      "steps": [
        {
          "step": 1,
          "phase": 2,
          "location": "Skylight",
          "tip": "Flash and drop through skylight"
        },
        {
          "step": 2,
          "phase": 3,
          "location": "Meeting Room",
          "tip": "Clear roamers and hold angle"
        }
      ]
    },
    {
      "operatorId": "thermite",
      "start_floor": "2F",
      "steps": [
        {
          "step": 1,
          "phase": 1,
          "location": "CEO Office Wall",
          "tip": "Breach main reinforced wall"
        }
      ]
    },
    {
      "operatorId": "sledge",
      "start_floor": "1F",
      "steps": [
        {
          "step": 1,
          "phase": 2,
          "location": "Main Stairs",
          "tip": "Hammer soft floor above site"
        },
        {
          "step": 2,
          "phase": 3,
          "location": "Site Entrance",
          "tip": "Push and plant"
        }
      ]
    }
  ]
}

Field rules — follow these exactly:
- title: short strategy name including map and objective area
- overall_strategy: 1-2 sentences summarising the plan
- operatorId: lowercase R6 operator id matching the official roster (e.g. "ash", "thermite", "sledge", "jager")
- start_floor: where the operator spawns or begins (e.g. "1F", "2F", "B1", "Roof", "Outside")
- step: sequential integer starting at 1 — only include as many steps as strictly needed (1–2 is typical; 5 is the hard maximum)
- phase: integer ONLY — 1 = Prep (45 s countdown), 2 = Early Action (3:00–2:00), 3 = Mid Action (2:00–1:00), 4 = Late / Execute (1:00–0:00)
- location: the specific room, wall, or area name as it appears on the map (e.g. "Server Room", "Main Stairs", "Garage Hatch")
- tip: ultra-concise action verb phrase, under 10 words, no filler (e.g. "Breach hard wall", "Hold flank", "Plant defuser")
- All text fields must be written in the same language the user writes in
- Output ONLY the JSON object — no surrounding text, no markdown code fences`;

/**
 * Strip markdown fences and extract + parse the first JSON object in the
 * response. Handles both ` ```json ... ``` ` and bare `{ ... }` forms.
 */
function parseAiJsonResponse(content: string): AITimelineJson {
  // Remove fenced code blocks (```json or ```)
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : content;
  // Pull the first {...} block in case there's surrounding prose
  const bare = candidate.match(/(\{[\s\S]*\})/);
  return JSON.parse(bare ? bare[1] : candidate) as AITimelineJson;
}

const AI_PHASE_LABEL: Record<number, string> = { 1: "Prep", 2: "Early", 3: "Mid", 4: "Late" };

/** Convert a parsed AI timeline into a clean Markdown string for the Notes area. */
function formatAiTimelineMarkdown(data: AITimelineJson): string {
  const lines: string[] = [`# ${data.title}`, ""];
  if (data.overall_strategy) {
    lines.push(`*${data.overall_strategy}*`, "");
  }
  for (const op of data.operators) {
    const name = op.operatorId.charAt(0).toUpperCase() + op.operatorId.slice(1);
    const floor = op.start_floor ? ` (Start: ${op.start_floor})` : "";
    lines.push(`**${name}${floor}**`);
    for (const s of op.steps) {
      const circle = ["①", "②", "③", "④", "⑤"][s.step - 1] ?? `${s.step}.`;
      const phaseLabel = AI_PHASE_LABEL[s.phase] ?? String(s.phase);
      const ctx = phaseLabel && s.location
        ? ` [${phaseLabel} @ ${s.location}]:`
        : s.location ? ` [${s.location}]:` : "";
      lines.push(`- ${circle}${ctx} ${s.tip}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ─── RightSidebar ───────────────────────────────────────────────────────────────

export default function RightSidebar({
  width = 320,
  transition,
}: {
  width?: number;
  transition?: string;
}) {
  const { apiKey, baseUrl, model, isRightSidebarOpen, isAiModeEnabled, rightSidebarTab, setRightSidebarTab } = useSettingsStore();
  const language = useSettingsStore((s) => s.language);

  // ── Canvas / board state ────────────────────────────────────────────────────
  const { currentFloorId } = useCanvasStore(useShallow((s) => ({ currentFloorId: s.currentFloorId })));

  const {
    items,
    notes, setNotes,
    currentPhase,
    currentRouteStep,
    hiddenOperators, toggleOperatorVisibility,
    routeTimeMap, setRouteTimeMapping,
    playbackRowIndex, setPlaybackRowIndex,
    isPlayingTimeline, setIsPlayingTimeline,
    switchPhase,
  } = useBoardStore(useShallow((s) => ({
    items: s.items,
    notes: s.notes, setNotes: s.setNotes,
    currentPhase: s.currentPhase,
    currentRouteStep: s.currentRouteStep,
    hiddenOperators: s.hiddenOperators,
    toggleOperatorVisibility: s.toggleOperatorVisibility,
    routeTimeMap: s.routeTimeMap,
    setRouteTimeMapping: s.setRouteTimeMapping,
    playbackRowIndex: s.playbackRowIndex,
    setPlaybackRowIndex: s.setPlaybackRowIndex,
    isPlayingTimeline: s.isPlayingTimeline,
    setIsPlayingTimeline: s.setIsPlayingTimeline,
    switchPhase: s.switchPhase,
  })));

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [timelineSide,  setTimelineSide]  = useState<"atk" | "def" | "neutral">("atk");
  const [inputText,     setInputText]     = useState("");
  const [isLoading,     setIsLoading]     = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [notesTab,      setNotesTab]      = useState<"edit" | "preview">("preview");
  const [parsedAiData, setParsedAiData] = useState<AITimelineJson | null>(null);

  const abortRef       = useRef<AbortController | null>(null);
  const playbackRowRef = useRef(playbackRowIndex);
  playbackRowRef.current = playbackRowIndex;

  // Auto-revert to timeline tab if AI mode is disabled while on the AI tab
  useEffect(() => {
    if (!isAiModeEnabled && rightSidebarTab === "ai") {
      setRightSidebarTab("timeline");
    }
  }, [isAiModeEnabled, rightSidebarTab, setRightSidebarTab]);

  // ── Derive the 5 operator columns for the selected side ────────────────────
  // Phase-scoped only — floor is intentionally ignored so operators remain
  // pinned in the timeline columns even when viewing a different floor.
  // Map-based dedup ensures each operatorId gets exactly one column even if
  // the user placed multiple tokens of the same operator on the canvas.
  const columnOps = useMemo(() => {
    const uniqueOps = new Map<string, typeof items[0]>();
    for (const item of items) {
      if (item.side === timelineSide && item.phase === currentPhase) {
        if (!uniqueOps.has(item.operatorId)) {
          uniqueOps.set(item.operatorId, item);
        }
      }
    }
    const sideItems = Array.from(uniqueOps.values());
    if (timelineSide === "neutral") {
      // Prop mode: at least 5 columns for visual consistency, no upper cap
      return Array.from({ length: Math.max(5, sideItems.length) }, (_, i) => sideItems[i] ?? null) as Array<typeof items[0] | null>;
    }
    // Operator mode: hard cap at 5, pad with nulls
    const sliced = sideItems.slice(0, 5);
    return Array.from({ length: 5 }, (_, i) => sliced[i] ?? null) as Array<typeof items[0] | null>;
  }, [items, timelineSide, currentPhase]);

  // ── O(1) cell render map ────────────────────────────────────────────────────
  // Pre-compute badge and tail status for every (opId × rowIdx) pair so the
  // inner render loop does a single Map.get() instead of Object.entries loops.
  // This memo only re-runs when operator assignments or timing mappings change —
  // NOT on every playback tick, keeping the grid render cost near zero.
  const cellRenderMap = useMemo(() => {
    const map = new Map<string, { badge: string; isTail: boolean }>();
    for (const op of columnOps) {
      if (!op) continue;
      const opMap = routeTimeMap[op.id] ?? {};
      // Build reverse lookup: rowIdx → badge string
      const rowToBadge = new Map<number, string>();
      for (const [stepStr, mappedRow] of Object.entries(opMap)) {
        if (mappedRow !== undefined) {
          rowToBadge.set(
            mappedRow as number,
            op.side === "neutral" ? "↓" : (STEP_CIRCLE[Number(stepStr) - 1] ?? String(stepStr)),
          );
        }
      }
      const deployRow: number | undefined = op.side === "neutral" ? (opMap[1] as number | undefined) : undefined;
      const isContinuous = op.side === "neutral" && CONTINUOUS_PROPS.has(op.operatorId);
      for (let rowIdx = 0; rowIdx < TIMELINE_ROWS.length; rowIdx++) {
        const badge = rowToBadge.get(rowIdx);
        const isTail = isContinuous && deployRow !== undefined && rowIdx > deployRow && !badge;
        if (badge !== undefined || isTail) {
          map.set(`${op.id}-${rowIdx}`, { badge: badge ?? "", isTail });
        }
      }
    }
    return map;
  }, [columnOps, routeTimeMap]);

  // Every row is mapped to a tactical phase so the canvas always stays in sync.
  // Row 0 is included so looping back restores phase 1.
  const ROW_TO_PHASE: Record<number, number> = {
    [PHASE_START_ROW[1]]: 1, // row 0  → Prep
    [PHASE_START_ROW[2]]: 2, // row 5  → Early
    [PHASE_START_ROW[3]]: 3, // row 11 → Mid
    [PHASE_START_ROW[4]]: 4, // row 17 → Late
  };
  const LAST_ROW = TIMELINE_ROWS.length - 1; // 23

  // ── Timeline playback interval ──────────────────────────────────────────────
  useEffect(() => {
    if (!isPlayingTimeline) return;
    const id = setInterval(() => {
      const current = playbackRowRef.current;
      // Play-once: stop and reset when the last row is reached
      if (current >= LAST_ROW) {
        setIsPlayingTimeline(false);
        setPlaybackRowIndex(0);
        switchPhase(1, currentFloorId);
        return;
      }
      const next = current + 1;
      setPlaybackRowIndex(next);
      // Enforce the correct tactical phase whenever the scanline enters a new section
      const targetPhase = ROW_TO_PHASE[next];
      if (targetPhase !== undefined) {
        switchPhase(targetPhase, currentFloorId);
      }
    }, 500);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayingTimeline]);

  // ── Timeline helpers ────────────────────────────────────────────────────────
  const getPhaseForRow = (row: number): number => {
    if (row <= 4)  return 1;
    if (row <= 10) return 2;
    if (row <= 16) return 3;
    return 4;
  };

  const handleJumpToRow = (rowIndex: number) => {
    setPlaybackRowIndex(rowIndex);
    const targetPhase = getPhaseForRow(rowIndex);
    if (targetPhase !== currentPhase) {
      switchPhase(targetPhase, currentFloorId);
    }
  };

  // ── Cell click: assign current route step to this (opId, rowIndex) ─────────
  const handleCellClick = (opId: string, rowIndex: number, forceStep?: number) => {
    // Only allow placement in the rows belonging to the current phase
    if (getPhaseForRow(rowIndex) !== currentPhase) return;
    const opMap = routeTimeMap[opId] ?? {};
    // If this row already has a step badge, do nothing (no accidental overwrite)
    if (Object.values(opMap).includes(rowIndex)) return;
    setRouteTimeMapping(opId, forceStep ?? currentRouteStep, rowIndex);
  };

  // ── AI call ─────────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!apiKey.trim()) { setError("API Key not set. Open Settings (gear icon) to configure."); return; }
    if (!inputText.trim()) { setError("Please paste some match commentary or VOD subtitles first."); return; }
    setError(null);
    setParsedAiData(null);
    setIsLoading(true);
    abortRef.current = new AbortController();
    const boardContext = items.length > 0
      ? `\nCurrent board operators: ${items.map((i) => i.name).join(", ")}`
      : "";
    try {
      const endpoint = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, messages: [
            { role: "system", content: AI_TIMELINE_SYSTEM_PROMPT },
            { role: "user",   content: inputText + boardContext },
          ],
          temperature: 0.3, max_tokens: 1024, stream: false,
        }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
      const data = await res.json();
      const content: string | undefined = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error(t("api_empty_response", language));
      try {
        const parsed = parseAiJsonResponse(content);
        if (!parsed?.title || !Array.isArray(parsed.operators)) throw new Error("Unexpected JSON shape");
        setParsedAiData(parsed);
        setNotes(formatAiTimelineMarkdown(parsed));
        setNotesTab("preview");
      } catch {
        // Fallback: show raw output as-is
        setParsedAiData(null);
        setNotes(content);
        setNotesTab("preview");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally { setIsLoading(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden bg-r6-surface z-[50]",
        isRightSidebarOpen ? "border-l border-r6-border" : "border-none"
      )}
      style={{
        width: isRightSidebarOpen ? width : 0,
        opacity: isRightSidebarOpen ? 1 : 0,
        transition: transition ?? "opacity 200ms ease",
      }}
    >
      <div className="flex h-full flex-col" style={{ width }}>

        {/* ── Top spacer — clears the fixed toolbar (41 px height + 3 px gap) ─── */}
        <div className="shrink-0 border-b border-r6-border" style={{ height: 44 }} />

        {/* ════════════════════════════════════════════════════════════════════
            TIMELINE TAB
        ════════════════════════════════════════════════════════════════════ */}
        {rightSidebarTab === "timeline" && (
          <div className="flex min-h-0 flex-1 flex-col">

            {/* ── Controls bar ──────────────────────────────────────────── */}
            <div className="flex shrink-0 items-center gap-1.5 border-b border-r6-border px-2 py-1.5">
              {/* ATK / DEF / PROP toggle */}
              {(["atk", "def"] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setTimelineSide(side)}
                  className={cn(
                    "rounded px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                    timelineSide === side
                      ? side === "atk"
                        ? "bg-blue-600/30 text-blue-300 border border-blue-500/40"
                        : "bg-red-600/30 text-red-300 border border-red-500/40"
                      : "bg-r6-surface-2 text-r6-muted border border-r6-border hover:text-r6-text"
                  )}
                >
                  {side.toUpperCase()}
                </button>
              ))}
              <button
                onClick={() => setTimelineSide("neutral")}
                className={cn(
                  "rounded px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                  timelineSide === "neutral"
                    ? "bg-amber-600/30 text-amber-300 border border-amber-500/40"
                    : "bg-r6-surface-2 text-r6-muted border border-r6-border hover:text-r6-text"
                )}
              >
                PROP
              </button>

              <div className="ml-auto flex items-center gap-1">
                {/* Reset */}
                <button
                  onClick={() => { setIsPlayingTimeline(false); setPlaybackRowIndex(0); switchPhase(1, currentFloorId); }}
                  className="rounded p-1 text-r6-muted hover:text-r6-text hover:bg-r6-surface-3 transition-colors"
                  title="Reset"
                >
                  <RotateCcw size={13} />
                </button>
                {/* Play / Pause */}
                <button
                  onClick={() => {
                    if (!isPlayingTimeline && playbackRowIndex >= LAST_ROW) {
                      setPlaybackRowIndex(0);
                      switchPhase(1, currentFloorId);
                    }
                    setIsPlayingTimeline(!isPlayingTimeline);
                  }}
                  className={cn(
                    "rounded p-1 transition-colors",
                    isPlayingTimeline
                      ? "text-r6-accent hover:text-orange-300"
                      : "text-r6-muted hover:text-r6-text hover:bg-r6-surface-3"
                  )}
                  title={isPlayingTimeline ? "Pause" : "Play"}
                >
                  {isPlayingTimeline ? <Pause size={13} /> : <Play size={13} />}
                </button>
                {/* Row indicator */}
                <span className="min-w-[32px] text-center text-[10px] font-mono text-r6-muted-2">
                  {TIMELINE_ROWS[playbackRowIndex]?.label ?? "--"}
                </span>
              </div>
            </div>

            {/* ── Grid ─────────────────────────────────────────────────── */}
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
              {/* min-w-max wrapper ensures phase banners and data rows all stretch
                  to the same full width as the header when scrolling horizontally */}
              <div className="flex min-w-max flex-col">
              {/* Time-label width = 38px; each op column fills the rest (5 cols) */}
              <div className="sticky top-0 z-10 flex min-w-max border-b-2 border-r6-border bg-r6-surface">
                {/* time label header cell — sticky left so it doesn't scroll away */}
                <div className="sticky left-0 z-20 shrink-0 border-r border-r6-border bg-r6-surface" style={{ width: 38 }} />
                {columnOps.map((op, ci) => (
                  <div
                    key={ci}
                    className="flex min-w-[54px] shrink-0 flex-col items-center gap-0.5 border-r border-r6-border py-1 last:border-r-0"
                  >
                    <span className="text-[10px] font-bold tracking-widest text-r6-muted-2">
                      {timelineSide === "neutral" ? `P${ci + 1}` : (COL_LETTERS[ci] ?? String(ci + 1))}
                    </span>
                    {op ? (
                      <>
                        <button
                          onClick={() => toggleOperatorVisibility(op.id)}
                          title={`${op.name} — ${hiddenOperators.includes(op.id) ? "Show" : "Hide"}`}
                          className={cn(
                            "relative rounded overflow-hidden transition-opacity",
                            hiddenOperators.includes(op.id) ? "opacity-30" : "opacity-100"
                          )}
                        >
                          <img
                            src={op.iconPath}
                            alt={op.name}
                            className="block"
                            style={{ width: 28, height: 28, objectFit: "cover" }}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        </button>
                      </>
                    ) : (
                      <span className="text-[9px] text-r6-muted-2">—</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {TIMELINE_ROWS.map((row, rowIdx) => {
                const isScanline   = rowIdx === playbackRowIndex;
                const isNewPhase   = PHASE_DIVIDER_ROWS.has(rowIdx);
                const prevPhase    = rowIdx > 0 ? TIMELINE_ROWS[rowIdx - 1].timePhase : null;
                const phaseChanged = prevPhase !== row.timePhase;

                return (
                  <div key={rowIdx}>
                    {/* Phase section banner */}
                    {phaseChanged && (
                      <div
                        className={cn(
                          "flex min-w-max items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest",
                          isNewPhase ? "border-t-2 border-r6-accent/40" : "",
                          row.timePhase === "prep"  && "bg-zinc-800/60 text-zinc-400",
                          row.timePhase === "early" && "bg-blue-950/60 text-blue-400",
                          row.timePhase === "mid"   && "bg-indigo-950/60 text-indigo-400",
                          row.timePhase === "late"  && "bg-violet-950/60 text-violet-400",
                        )}
                      >
                        <ChevronRight size={9} />
                        {PHASE_LABELS[row.timePhase]}
                      </div>
                    )}

                    {/* Data row */}
                    <div
                      className={cn(
                        "flex min-w-max border-b transition-colors",
                        isScanline
                          ? "bg-blue-900/50 border-blue-500/50"
                          : "border-r6-border hover:bg-r6-surface-2/40"
                      )}
                      style={{ height: 22 }}
                    >
                      {/* Time label — sticky left so the time column stays visible when scrolling */}
                      <div
                        onDoubleClick={() => handleJumpToRow(rowIdx)}
                        className={cn(
                          "sticky left-0 z-10 flex shrink-0 items-center justify-end border-r px-1 font-mono text-[9px] select-none cursor-pointer",
                          isScanline ? "border-blue-500/50 bg-blue-900/50 text-blue-300" : "border-r6-border bg-r6-surface text-r6-muted-2 hover:text-r6-text"
                        )}
                        style={{ width: 38 }}
                        title="Double-click to jump here"
                      >
                        {row.label}
                      </div>

                      {/* Operator / Prop cells */}
                      {columnOps.map((op, ci) => {
                        // O(1) lookup — all badge/tail logic is pre-computed in cellRenderMap
                        const cellInfo = op ? cellRenderMap.get(`${op.id}-${rowIdx}`) : undefined;
                        const badge = cellInfo?.badge ?? null;
                        const isActivePropTail = cellInfo?.isTail ?? false;

                        return (
                          <div
                            key={ci}
                            onClick={() => {
                              if (!op) return;
                              // Gadgets always bind to step 1 (deploy event)
                              handleCellClick(op.id, rowIdx, op.side === "neutral" ? 1 : undefined);
                            }}
                            className={cn(
                              "relative flex min-w-[54px] shrink-0 items-center justify-center border-r text-[12px] last:border-r-0",
                              isScanline ? "border-blue-500/30" : "border-r6-border",
                              op ? "cursor-pointer" : "cursor-default",
                              op && !badge && !isActivePropTail && "hover:bg-r6-surface-3/50",
                              isActivePropTail && "bg-amber-500/5"
                            )}
                          >
                            {isActivePropTail ? (
                              // Vertical tail bar — thin amber line centred in the cell
                              <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-amber-500/30" />
                            ) : badge ? (
                              <span
                                className={cn(
                                  "font-bold leading-none",
                                  isScanline ? "text-blue-200" : "text-r6-text"
                                )}
                              >
                                {badge}
                              </span>
                            ) : op ? (
                              <span className="text-[8px] text-r6-muted-2 opacity-40">·</span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Bottom spacer */}
              <div className="h-4" />
              </div>{/* end min-w-max wrapper */}
            </div>

            {/* ── Step assignment hint ─────────────────────────────────── */}
            <div className="shrink-0 border-t border-r6-border px-3 py-1.5">
              <p className="text-[10px] text-r6-muted-2">
                点击空格将当前路线步骤 <span className="font-bold text-r6-accent">{STEP_CIRCLE[currentRouteStep - 1]}</span> 指定到该时间点
              </p>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            ANALYSIS TAB (AI + Notes — original content)
        ════════════════════════════════════════════════════════════════════ */}
        {rightSidebarTab === "ai" && (
          <div className="flex min-h-0 flex-1 flex-col">

            {/* AI section */}
            <div className="flex shrink-0 flex-col border-b border-r6-border">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-r6-border">
                <Bot size={17} className="text-r6-accent" />
                <span className="text-sm font-bold tracking-wide uppercase whitespace-nowrap text-r6-muted">
                  {t("AI Tactic Agent", language)}
                </span>
              </div>

              <div className="flex flex-col gap-2 p-3">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={t("ai_input_placeholder", language)}
                  rows={5}
                  className="w-full resize-none rounded-xl px-3 py-2 text-[13px] leading-relaxed outline-none transition-colors bg-r6-surface-2 border border-r6-border text-r6-text caret-r6-accent focus:border-r6-accent"
                />
                {error && (
                  <div
                    className="flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] leading-snug text-orange-400"
                    style={{ background: "rgba(232,93,42,0.1)", border: "1px solid rgba(232,93,42,0.3)" }}
                  >
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}
                {isLoading ? (
                  <button
                    onClick={() => { abortRef.current?.abort(); setIsLoading(false); }}
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium bg-r6-surface-3 text-r6-muted border border-r6-border"
                  >
                    <Loader2 size={15} className="animate-spin" />
                    {t("Generating", language)}
                  </button>
                ) : (
                  <button
                    onClick={handleGenerate}
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium bg-r6-accent text-white hover:opacity-85"
                  >
                    <Bot size={15} />
                    {t("Generate Tactic Table", language)}
                  </button>
                )}
              </div>
            </div>

            {/* ── AI 战术建议 preview ──────────────────────────────────── */}
            {parsedAiData && (
              <div className="flex shrink-0 flex-col border-b border-r6-border">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-r6-border bg-r6-accent-dim">
                  <Bot size={13} className="text-r6-accent shrink-0" />
                  <div className="flex flex-1 flex-col min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-r6-accent">AI 战术建议</span>
                    <span className="text-[11px] text-r6-text truncate" title={parsedAiData.title}>{parsedAiData.title}</span>
                  </div>
                  <button
                    onClick={() => setParsedAiData(null)}
                    className="text-r6-muted hover:text-r6-text text-[10px] shrink-0 px-1"
                    title="关闭"
                  >✕</button>
                </div>
                {/* Operator preview list */}
                <div className="flex flex-col gap-1 px-3 py-2">
                  {parsedAiData.operators.map((op, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="shrink-0 w-4 text-[10px] font-mono text-r6-muted-2 mt-0.5">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[12px] font-semibold text-r6-text capitalize">{op.operatorId}</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {op.steps.map((s) => {
                            const phaseLabel = AI_PHASE_LABEL[s.phase] ?? String(s.phase);
                            const previewTip = phaseLabel && s.location
                              ? `[${phaseLabel} - ${s.location}] ${s.tip}`
                              : s.tip;
                            return (
                              <span
                                key={s.step}
                                className="rounded px-1 py-0.5 text-[10px] bg-r6-surface-3 text-r6-muted border border-r6-border"
                                title={previewTip}
                              >
                                {["①","②","③","④","⑤"][s.step - 1]}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes section */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-1 px-3 py-2 border-b border-r6-border">
                <FileText size={15} className="text-r6-muted" />
                <span className="flex-1 text-[14px] font-semibold tracking-wide uppercase text-r6-muted">
                  {t("Notes", language)}
                </span>
                <div className="flex rounded-lg overflow-hidden border border-r6-border">
                  {(["preview", "edit"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setNotesTab(tab)}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 text-[13px] transition-colors",
                        notesTab === tab ? "bg-r6-accent-dim text-r6-accent" : "bg-transparent text-r6-muted"
                      )}
                    >
                      {tab === "preview" ? <Eye size={13} /> : <Pencil size={13} />}
                      {tab === "preview" ? t("Preview", language) : t("Edit", language)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {notesTab === "edit" ? (
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={"AI output appears here.\nYou can also type notes manually."}
                    className="h-full w-full resize-none px-4 py-3 text-sm leading-relaxed outline-none bg-transparent text-r6-text caret-r6-accent font-mono"
                  />
                ) : notes ? (
                  <div className="prose-r6 px-4 py-3 text-sm leading-relaxed text-r6-text">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{notes}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-[13px] leading-relaxed text-r6-muted-2 font-mono whitespace-pre-line">
                      {t("ai_placeholder_text", language)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </aside>
  );
}
