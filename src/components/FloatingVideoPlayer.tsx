import { useEffect, useRef, useState } from "react";
import Draggable from "react-draggable";
import {
  GripHorizontal, X, FolderOpen,
  Play, Pause, Volume2, Volume1, VolumeX, Scan,
  Square, Maximize2, Expand,
} from "lucide-react";
import { useBoardStore } from "../store/useBoardStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { t } from "../locales/i18n";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FloatingVideoPlayer() {
  const toggleVideo       = useBoardStore((s) => s.toggleVideo);
  const isVideoOpen       = useBoardStore((s) => s.isVideoOpen);
  const videoMarkers      = useBoardStore((s) => s.videoMarkers);
  const addVideoMarker    = useBoardStore((s) => s.addVideoMarker);
  const clearVideoMarkers = useBoardStore((s) => s.clearVideoMarkers);
  const language          = useSettingsStore((s) => s.language);

  const [videoSrc,          setVideoSrc]          = useState<string | null>(null);
  const [fileName,          setFileName]          = useState<string>("");
  const [isPlaying,         setIsPlaying]         = useState(false);
  const [volumeLevel,       setVolumeLevel]       = useState(1);
  const [isVolumeMenuOpen,  setIsVolumeMenuOpen]  = useState(false);
  const [currentTime,       setCurrentTime]       = useState(0);
  const [duration,          setDuration]          = useState(0);
  const [isAnalyzing,       setIsAnalyzing]       = useState(false);
  const [analyzeProgress,   setAnalyzeProgress]   = useState(0);
  const [playerSize,        setPlayerSize]        = useState<"standard" | "large" | "fullscreen">("standard");
  const [markTarget,        setMarkTarget]        = useState<"action" | "prep">("action");

  const videoRef        = useRef<HTMLVideoElement>(null);
  const fileRef         = useRef<HTMLInputElement>(null);
  const dragRef         = useRef<HTMLDivElement>(null);
  const debugCanvasRef  = useRef<HTMLCanvasElement>(null);
  const abortRef        = useRef(false);
  const volumeMenuRef   = useRef<HTMLDivElement>(null);

  // Abort any running analysis on unmount
  useEffect(() => { return () => { abortRef.current = true; }; }, []);

  // Auto-pause when the player is hidden
  useEffect(() => {
    if (!isVideoOpen) {
      videoRef.current?.pause();
      setIsPlaying(false);
    }
  }, [isVideoOpen]);

  // Spacebar → play/pause (only when player is visible, not when typing)
  useEffect(() => {
    if (!isVideoOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== " ") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) { v.play();  setIsPlaying(true);  }
      else          { v.pause(); setIsPlaying(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isVideoOpen]);

  // Revoke object URL when file changes
  useEffect(() => {
    return () => { if (videoSrc) URL.revokeObjectURL(videoSrc); };
  }, [videoSrc]);

  // ── File load ───────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    setVideoSrc(URL.createObjectURL(file));
    setFileName(file.name);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    clearVideoMarkers();
  };

  // ── Playback ────────────────────────────────────────────────────────────────

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else          { v.pause(); setIsPlaying(false); }
  };

  // Close volume menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (volumeMenuRef.current && !volumeMenuRef.current.contains(e.target as Node)) {
        setIsVolumeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const setVolume = (level: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.muted  = level === 0;
    v.volume = level;
    setVolumeLevel(level);
    setIsVolumeMenuOpen(false);
  };

  // ── Seek helpers ────────────────────────────────────────────────────────────

  const seekTo = (time: number): Promise<void> =>
    new Promise((resolve) => {
      const v = videoRef.current;
      if (!v) { resolve(); return; }
      const onSeeked = () => { v.removeEventListener("seeked", onSeeked); resolve(); };
      v.addEventListener("seeked", onSeeked);
      v.currentTime = time;
    });

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration || isAnalyzing) return;
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * duration;
  };

  // ── OCR analysis ────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    const v = videoRef.current;
    if (!v || !videoSrc || isAnalyzing || !isFinite(v.duration) || v.duration <= 0) return;

    setIsAnalyzing(true);
    setAnalyzeProgress(0);
    abortRef.current = false;
    clearVideoMarkers();

    v.pause();
    setIsPlaying(false);

    const offscreen = document.createElement("canvas");
    const ctx       = offscreen.getContext("2d")!;

    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await worker.setParameters({ tessedit_char_whitelist: "0123456789:" } as any);

    const videoDuration = v.duration;
    const step          = 10;
    const totalSteps    = Math.ceil(videoDuration / step);
    let   stepIdx       = 0;

    const foundTimes: number[] = [];

    for (let t2 = 0; t2 < videoDuration && !abortRef.current; t2 += step) {
      await seekTo(t2);

      const vw = v.videoWidth;
      const vh = v.videoHeight;

      // Crop top-center match-timer region (R6 Pro League broadcast position)
      const sx = Math.floor(vw * 0.47);
      const sy = Math.floor(vh * 0.05);
      const sw = Math.floor(vw * 0.06);
      const sh = Math.floor(vh * 0.06);

      offscreen.width  = sw;
      offscreen.height = sh;
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);

      // Mirror crop to debug canvas (top-left of video area)
      const dbg = debugCanvasRef.current;
      if (dbg) {
        dbg.width  = sw;
        dbg.height = sh;
        dbg.getContext("2d")!.drawImage(offscreen, 0, 0);
      }

      // OCR — match strictly M:SS or MM:SS within action-phase range
      const { data: { text } } = await worker.recognize(offscreen);
      const m = text.match(/\b([0-2]):([0-5]\d)\b/);
      if (m) {
        const remaining = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        if (remaining <= 180) {
          const actionPhaseStart = t2 - (180 - remaining);
          if (actionPhaseStart >= 0) {
            const markerTime  = markTarget === "prep"
              ? Math.max(0, actionPhaseStart - 30)
              : actionPhaseStart;
            const markerLabel = markTarget === "prep" ? "Prep Phase" : "Action Phase";
            const isDup = foundTimes.some((ft) => Math.abs(ft - markerTime) <= 60);
            if (!isDup) {
              foundTimes.push(markerTime);
              addVideoMarker({ time: markerTime, label: markerLabel });
            }
          }
        }
      }

      stepIdx++;
      setAnalyzeProgress(Math.round((stepIdx / totalSteps) * 100));
    }

    await worker.terminate();

    if (!abortRef.current) await seekTo(0);

    setIsAnalyzing(false);
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Draggable
      nodeRef={dragRef}
      handle=".drag-handle"
      defaultPosition={{ x: 60, y: 60 }}
      disabled={playerSize === "fullscreen"}
      position={playerSize === "fullscreen" ? { x: 0, y: 0 } : undefined}
    >
      <div
        ref={dragRef}
        className="absolute top-0 left-0 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{
          zIndex: 9999,
          background: "var(--color-r6-surface-glass)",
          border: "1px solid var(--color-r6-border)",
          backdropFilter: "blur(16px)",
          display: isVideoOpen ? "flex" : "none",
          width:  playerSize === "fullscreen" ? "100%" : playerSize === "large" ? 800 : 480,
          height: playerSize === "fullscreen" ? "100%" : "auto",
          ...(playerSize === "fullscreen" && { position: "absolute" as const, inset: 0, borderRadius: 0 }),
        }}
      >
        {/* ── Title bar (drag handle) ─────────────────────────────────────── */}
        <div
          className="drag-handle flex cursor-grab items-center gap-2 px-3 py-2 select-none active:cursor-grabbing"
          style={{ borderBottom: "1px solid var(--color-r6-border)", background: "var(--color-r6-surface-glass-dim)" }}
        >
          <GripHorizontal size={17} style={{ color: "var(--color-r6-muted-2)", flexShrink: 0 }} />
          <span className="flex-1 truncate text-[14px] font-medium" style={{ color: "var(--color-r6-muted)" }}>
            {fileName || t("Video Review", language)}
          </span>

          {/* Size selector */}
          <div
            className="flex items-center rounded-lg overflow-hidden shrink-0"
            style={{ border: "1px solid var(--color-r6-border)", background: "var(--color-r6-surface-2)" }}
          >
            {(["standard", "large", "fullscreen"] as const).map((size, i) => {
              const Icon   = size === "standard" ? Square : size === "large" ? Maximize2 : Expand;
              const titles = [
                t("Standard (480px)", language),
                t("Large (800px)", language),
                t("Fullscreen", language),
              ];
              const active = playerSize === size;
              return (
                <button
                  key={size}
                  title={titles[i]}
                  onClick={() => setPlayerSize(size)}
                  className="flex h-7 w-7 items-center justify-center transition-colors"
                  style={{
                    color:      active ? "var(--color-r6-accent)" : "var(--color-r6-muted)",
                    background: active ? "var(--color-r6-accent-dim)" : "transparent",
                    borderRight: size !== "fullscreen" ? "1px solid var(--color-r6-border)" : undefined,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "var(--color-r6-text)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--color-r6-muted)"; }}
                >
                  <Icon size={13} />
                </button>
              );
            })}
          </div>

          <button
            title="Open video file"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors"
            style={{ background: "var(--color-r6-surface-2)", color: "var(--color-r6-muted)", border: "1px solid var(--color-r6-border)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-r6-text)"; e.currentTarget.style.borderColor = "var(--color-r6-muted-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-r6-muted)"; e.currentTarget.style.borderColor = "var(--color-r6-border)"; }}
          >
            <FolderOpen size={13} />
            {t("Open", language)}
          </button>

          <button
            title="Close video player"
            onClick={toggleVideo}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--color-r6-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(232,93,42,0.15)"; e.currentTarget.style.color = "var(--color-r6-accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-r6-muted)"; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Video area ──────────────────────────────────────────────────── */}
        <div
          className="relative flex items-center justify-center"
          style={{
            background: "#000",
            ...(playerSize === "fullscreen"
              ? { flex: 1, minHeight: 0 }
              : { flex: "none", height: "auto", aspectRatio: "16/9" }),
          }}
        >
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className="h-full w-full object-contain"
              onPlay={()  => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
              onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
            />
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-3 rounded-2xl px-8 py-6 transition-colors"
              style={{ color: "var(--color-r6-muted)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-r6-surface-2)"; e.currentTarget.style.color = "var(--color-r6-text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-r6-muted)"; }}
            >
              <FolderOpen size={38} />
              <span className="text-[15px]">{t("Click to open", language)}</span>
              <span className="text-[13px]" style={{ color: "var(--color-r6-muted-2)" }}>{t("File formats", language)}</span>
            </button>
          )}

          {/* Debug crop canvas — top-left, only during analysis */}
          {isAnalyzing && (
            <div
              className="absolute top-2 left-2 overflow-hidden rounded-lg"
              style={{ border: "1px solid var(--color-r6-accent)", background: "#000" }}
            >
              <canvas
                ref={debugCanvasRef}
                style={{ display: "block", width: 160, imageRendering: "pixelated" }}
              />
              <div
                className="px-1 py-0.5 text-center text-[11px] font-mono uppercase tracking-wider"
                style={{ color: "var(--color-r6-accent)", background: "rgba(0,0,0,0.8)" }}
              >
                {t("OCR crop", language)}
              </div>
            </div>
          )}

          {/* Analysis overlay — centered, semi-transparent */}
          {isAnalyzing && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
            >
              <Scan size={28} style={{ color: "var(--color-r6-accent)" }} className="animate-pulse" />
              <p className="text-[15px] font-semibold" style={{ color: "var(--color-r6-text)" }}>
                {t("Analyzing", language)} {analyzeProgress}%
              </p>
              <div
                className="w-40 overflow-hidden rounded-full"
                style={{ height: 4, background: "var(--color-r6-surface-3)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${analyzeProgress}%`, background: "var(--color-r6-accent)" }}
                />
              </div>
              {videoMarkers.length > 0 && (
                <p className="text-[13px]" style={{ color: "#facc15" }}>
                  {videoMarkers.length} {t("phases found so far", language)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Controls + timeline (only when video loaded) ──────────────── */}
        {videoSrc && (
          <div style={{ borderTop: "1px solid var(--color-r6-border)" }}>

            {/* ── Custom seekable timeline ─────────────────────────────── */}
            <div className="px-3 pt-2 pb-1">
              <div
                className="relative cursor-pointer rounded-full"
                style={{ height: 6, background: "var(--color-r6-surface-3)" }}
                onClick={handleSeekClick}
              >
                {/* Played portion */}
                <div
                  className="absolute left-0 top-0 h-full rounded-full pointer-events-none"
                  style={{ width: `${progressPct}%`, background: "var(--color-r6-accent)" }}
                />

                {/* Seek thumb */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full pointer-events-none"
                  style={{
                    left: `${progressPct}%`,
                    background: "var(--color-r6-accent)",
                    border: "2px solid #fff",
                    boxShadow: "0 0 4px rgba(232,93,42,0.6)",
                  }}
                />

                {/* Phase marker ticks */}
                {videoMarkers.map((marker, i) => {
                  const pct = duration > 0 ? (marker.time / duration) * 100 : 0;
                  return (
                    <button
                      key={i}
                      title={`${marker.label} — ${fmt(marker.time)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const v = videoRef.current;
                        if (v) v.currentTime = marker.time;
                      }}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-md"
                      style={{
                        left: `${pct}%`,
                        width: 3,
                        height: 14,
                        background: "#facc15",
                        cursor: "pointer",
                        boxShadow: "0 0 4px rgba(250,204,21,0.7)",
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* ── Controls row ─────────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-3 pb-2.5">

              {/* Play / Pause */}
              <button
                onClick={togglePlay}
                disabled={isAnalyzing}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                style={{
                  background: "var(--color-r6-accent)",
                  color: "#fff",
                  opacity: isAnalyzing ? 0.4 : 1,
                }}
                onMouseEnter={(e) => { if (!isAnalyzing) e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={(e) => { if (!isAnalyzing) e.currentTarget.style.opacity = "1"; }}
              >
                {isPlaying ? <Pause size={15} /> : <Play size={15} />}
              </button>

              {/* Volume */}
              <div ref={volumeMenuRef} className="relative">
                <button
                  onClick={() => setIsVolumeMenuOpen((o) => !o)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                  style={{ color: volumeLevel === 0 ? "var(--color-r6-accent)" : "var(--color-r6-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-r6-surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  title="Volume"
                >
                  {volumeLevel === 0   ? <VolumeX  size={15} /> :
                   volumeLevel <= 0.5  ? <Volume1  size={15} /> :
                                         <Volume2  size={15} />}
                </button>

                {isVolumeMenuOpen && (
                  <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 rounded-xl py-1 text-[13px]"
                    style={{
                      background:  "var(--color-r6-surface)",
                      border:      "1px solid var(--color-r6-border)",
                      boxShadow:   "0 6px 20px rgba(0,0,0,0.55)",
                      minWidth:    80,
                      zIndex:      100,
                    }}
                  >
                    {([1, 0.75, 0.5, 0.25, 0] as const).map((lvl) => {
                      const label = lvl === 0 ? "Mute" : `${lvl * 100}%`;
                      const active = volumeLevel === lvl;
                      return (
                        <button
                          key={lvl}
                          onClick={() => setVolume(lvl)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-1.5"
                          style={{ color: active ? "var(--color-r6-accent)" : "var(--color-r6-text)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-r6-surface-2)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <span>{label}</span>
                          {active && <span style={{ fontSize: 10 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Time display */}
              <span
                className="text-[13px] font-mono tabular-nums"
                style={{ color: "var(--color-r6-muted)" }}
              >
                {fmt(currentTime)} / {fmt(duration)}
              </span>

              <div className="flex-1" />

              {/* Marker count badge */}
              {videoMarkers.length > 0 && !isAnalyzing && (
                <span
                  className="text-[12px] rounded-lg px-2 py-0.5 font-medium"
                  style={{
                    background: "rgba(250,204,21,0.12)",
                    color: "#facc15",
                    border: "1px solid rgba(250,204,21,0.3)",
                  }}
                >
                  {videoMarkers.length} {t("phases found", language)}
                </span>
              )}

              {/* Mark target toggle */}
              <button
                title="Toggle: mark Action Phase or Prep Phase start"
                onClick={() => setMarkTarget((prev) => prev === "action" ? "prep" : "action")}
                disabled={isAnalyzing}
                className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors shrink-0"
                style={{
                  background: "var(--color-r6-surface-2)",
                  color: markTarget === "prep" ? "#facc15" : "var(--color-r6-muted)",
                  border: markTarget === "prep" ? "1px solid rgba(250,204,21,0.4)" : "1px solid var(--color-r6-border)",
                  opacity: isAnalyzing ? 0.5 : 1,
                }}
                onMouseEnter={(e) => { if (!isAnalyzing) e.currentTarget.style.background = "var(--color-r6-surface-3)"; }}
                onMouseLeave={(e) => { if (!isAnalyzing) e.currentTarget.style.background = "var(--color-r6-surface-2)"; }}
              >
                {markTarget === "action" ? t("Mark: Action", language) : t("Mark: Prep", language)}
              </button>

              {/* Analyze button */}
              <button
                title="Scan video for phase start times (OCR)"
                onClick={handleAnalyze}
                disabled={isAnalyzing || !duration}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  background: isAnalyzing ? "var(--color-r6-accent-dim)" : "var(--color-r6-surface-2)",
                  color:      isAnalyzing ? "var(--color-r6-accent)"     : "var(--color-r6-muted)",
                  border:     isAnalyzing ? "1px solid var(--color-r6-accent)" : "1px solid var(--color-r6-border)",
                  opacity: (!duration || isAnalyzing) ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isAnalyzing && duration) {
                    e.currentTarget.style.background   = "var(--color-r6-accent-dim)";
                    e.currentTarget.style.color        = "var(--color-r6-accent)";
                    e.currentTarget.style.borderColor  = "var(--color-r6-accent)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAnalyzing) {
                    e.currentTarget.style.background  = "var(--color-r6-surface-2)";
                    e.currentTarget.style.color       = "var(--color-r6-muted)";
                    e.currentTarget.style.borderColor = "var(--color-r6-border)";
                  }
                }}
              >
                <Scan size={14} />
                {isAnalyzing ? `${analyzeProgress}%` : t("Analyze", language)}
              </button>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </Draggable>
  );
}
