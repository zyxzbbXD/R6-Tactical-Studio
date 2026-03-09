import { useEffect, useRef, useState } from "react";
import Draggable from "react-draggable";
import {
  GripHorizontal, X, FolderOpen,
  Play, Pause, Volume2, Volume1, VolumeX, Scan,
  Square, Maximize2, Expand,
  ChevronLeft, ChevronRight, Download,
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
  const [isExportMenuOpen,  setIsExportMenuOpen]  = useState(false);

  const videoRef        = useRef<HTMLVideoElement>(null);
  const fileRef         = useRef<HTMLInputElement>(null);
  const dragRef         = useRef<HTMLDivElement>(null);
  const debugCanvasRef  = useRef<HTMLCanvasElement>(null);
  const abortRef        = useRef(false);
  const volumeMenuRef   = useRef<HTMLDivElement>(null);
  const exportMenuRef   = useRef<HTMLDivElement>(null);

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

  // Arrow keys → short press: ±5s, long press (400ms): jump to prev/next marker
  const pressTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  useEffect(() => {
    if (!isVideoOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.repeat) { e.preventDefault(); return; }
      e.preventDefault();
      isLongPressRef.current = false;

      pressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        const v = videoRef.current;
        if (!v) return;
        const sorted = [...videoMarkers].sort((a, b) => a.time - b.time);
        if (e.key === "ArrowRight") {
          const target = sorted.find((m) => m.time > v.currentTime + 1);
          if (target) v.currentTime = target.time;
        } else {
          const target = [...sorted].reverse().find((m) => m.time < v.currentTime - 1);
          if (target) v.currentTime = target.time;
        }
      }, 400);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      if (!isLongPressRef.current) {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = e.key === "ArrowRight"
          ? Math.min(v.currentTime + 5, v.duration)
          : Math.max(v.currentTime - 5, 0);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    };
  }, [isVideoOpen, videoMarkers]);

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

  // Close volume/export menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (volumeMenuRef.current && !volumeMenuRef.current.contains(e.target as Node)) {
        setIsVolumeMenuOpen(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
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

    // OCR the current video frame in a specific UI mode
    const ocrFrameMode = async (mode: "broadcast" | "pov"): Promise<number | null> => {
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      // broadcast: timer sits at ~5% from top, 6%×6% crop
      // pov:       timer is ~3% higher and ~5% larger
      const bSy = vh * 0.05;
      const bSw = vw * 0.06;
      const bSh = vh * 0.06;
      const sy = Math.floor(mode === "pov" ? bSy - vh * 0.03 : bSy);
      const sw = Math.floor(mode === "pov" ? bSw * 1.05      : bSw);
      const sh = Math.floor(mode === "pov" ? bSh * 1.05      : bSh);
      const sx = Math.floor(vw * 0.47 - (sw - Math.floor(bSw)) / 2); // keep centered
      offscreen.width  = sw;
      offscreen.height = sh;
      ctx.drawImage(v, sx, Math.max(0, sy), sw, sh, 0, 0, sw, sh);
      const { data: { text } } = await worker.recognize(offscreen);
      const m = text.match(/\b([0-2]):([0-5]\d)\b/);
      if (!m) return null;
      const remaining = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      return remaining <= 180 ? remaining : null;
    };

    // Dual-mode OCR: tries currentUIMode first; falls back to the other and re-locks if successful
    let currentUIMode: "broadcast" | "pov" = "broadcast";
    const ocrFrame = async (): Promise<number | null> => {
      let result = await ocrFrameMode(currentUIMode);
      if (result === null) {
        const fallback = currentUIMode === "broadcast" ? "pov" : "broadcast";
        result = await ocrFrameMode(fallback);
        if (result !== null) currentUIMode = fallback; // re-lock to whichever mode works
      }
      // Update debug canvas with the last crop drawn
      const dbg = debugCanvasRef.current;
      if (dbg) {
        dbg.width  = offscreen.width;
        dbg.height = offscreen.height;
        dbg.getContext("2d")!.drawImage(offscreen, 0, 0);
      }
      return result;
    };

    // Binary-search the exact second the timer permanently disappears
    const binarySearchRoundEnd = async (left: number, right: number): Promise<number> => {
      const clampedRight = Math.min(right, videoDuration);
      let lo = left, hi = clampedRight;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        await seekTo(mid);
        const remaining = await ocrFrame();
        if (remaining !== null) lo = mid;
        else                    hi = mid;
      }
      return hi;
    };

    // Neighborhood tracker — tolerates brief camera cuts (no snap-to-end on first miss)
    // `partial` = true when the round started before the recording began (inferredStart < 0);
    // partial rounds are tracked for continuity but never emitted as markers.
    let activeRound: { actionStart: number; lastValidTime: number; partial: boolean } | null = null;

    for (let t2 = 0; t2 < videoDuration && !abortRef.current; t2 += step) {
      await seekTo(t2);
      const remaining = await ocrFrame();

      if (remaining !== null) {
        const inferredStart = t2 - (180 - remaining);
        const isPartial     = inferredStart < 0;

        if (!activeRound) {
          // New round detected — only emit markers if the round starts within the video
          if (!isPartial) {
            addVideoMarker({ time: Math.max(0, inferredStart - 30), label: "Prep Phase" });
            addVideoMarker({ time: inferredStart,                   label: "Action Phase" });
          }
          activeRound = { actionStart: inferredStart, lastValidTime: t2, partial: isPartial };

        } else if (Math.abs(inferredStart - activeRound.actionStart) <= 60) {
          // Still in the same round — update last known valid position
          activeRound.lastValidTime = t2;

        } else {
          // Timer jumped → close out previous round, start a new one
          if (!activeRound.partial) {
            const endTime = await binarySearchRoundEnd(activeRound.lastValidTime, activeRound.lastValidTime + 20);
            addVideoMarker({ time: endTime, label: "Round End" });
          }
          if (!isPartial) {
            addVideoMarker({ time: Math.max(0, inferredStart - 30), label: "Prep Phase" });
            addVideoMarker({ time: inferredStart,                   label: "Action Phase" });
          }
          activeRound = { actionStart: inferredStart, lastValidTime: t2, partial: isPartial };
        }

      } else {
        // No timer — only declare round over once we've exceeded the max round window
        if (activeRound && t2 > activeRound.actionStart + 250) {
          if (!activeRound.partial) {
            const endTime = await binarySearchRoundEnd(activeRound.lastValidTime, activeRound.lastValidTime + 20);
            addVideoMarker({ time: endTime, label: "Round End" });
          }
          activeRound = null;
        }
      }

      stepIdx++;
      setAnalyzeProgress(Math.round((stepIdx / totalSteps) * 100));
    }

    // Final cleanup: close any complete round still active at end-of-video
    if (!abortRef.current && activeRound && !activeRound.partial) {
      const endTime = await binarySearchRoundEnd(
        activeRound.lastValidTime,
        Math.min(activeRound.lastValidTime + 20, videoDuration),
      );
      addVideoMarker({ time: endTime, label: "Round End" });
    }

    await worker.terminate();

    if (!abortRef.current) await seekTo(0);

    setIsAnalyzing(false);
  };

  // ── FFmpeg script export ─────────────────────────────────────────────────────

  const generateFFmpegScript = (os: "win" | "mac") => {
    // Pair markers into rounds: (Prep Phase | Action Phase) → Round End
    const sorted = [...videoMarkers].sort((a, b) => a.time - b.time);
    const rounds: { roundNum: number; start: number; end: number }[] = [];
    let roundStart: number | null = null;
    let roundNum = 1;
    for (const marker of sorted) {
      if (roundStart === null && (marker.label === "Prep Phase" || marker.label === "Action Phase")) {
        roundStart = marker.time;
      } else if (roundStart !== null && marker.label === "Round End") {
        rounds.push({ roundNum, start: roundStart, end: marker.time });
        roundNum++;
        roundStart = null;
      }
    }

    // Format seconds → HH:MM:SS for ffmpeg
    const ts = (s: number) => {
      const h   = Math.floor(s / 3600);
      const m   = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    };

    const safeFileName = fileName || "video.mp4";

    let script: string;
    if (os === "win") {
      const lines = [
        "@echo off",
        "chcp 65001",
        "REM IMPORTANT: Place this script in the SAME folder as the video file before running.",
        "cd /d \"%~dp0\"",
        `mkdir "R6_Clips" 2>nul`,
        `set "INPUT_VIDEO=${safeFileName}"`,
        "",
        ...rounds.map((r) =>
          `ffmpeg -i "%INPUT_VIDEO%" -ss ${ts(r.start)} -to ${ts(r.end)} -c copy "R6_Clips\\Round_${r.roundNum}.mp4"`
        ),
        "",
        "pause",
      ];
      script = lines.join("\r\n");
    } else {
      const lines = [
        "#!/bin/bash",
        "# IMPORTANT: Place this script in the SAME folder as the video file before running.",
        `cd "$(dirname "$0")"`,
        `mkdir -p "R6_Clips"`,
        `INPUT_VIDEO="${safeFileName}"`,
        "",
        ...rounds.map((r) =>
          `ffmpeg -i "$INPUT_VIDEO" -ss ${ts(r.start)} -to ${ts(r.end)} -c copy "R6_Clips/Round_${r.roundNum}.mp4"`
        ),
      ];
      script = lines.join("\n");
    }

    const blob = new Blob([script], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = os === "win" ? "Cut_R6_Rounds.bat" : "Cut_R6_Rounds.sh";
    a.click();
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
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
          onDoubleClick={() => setPlayerSize((prev) => prev === "fullscreen" ? "standard" : "fullscreen")}
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
          onDoubleClick={() => setPlayerSize((prev) => prev === "fullscreen" ? "standard" : "fullscreen")}
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
                  const pct    = duration > 0 ? (marker.time / duration) * 100 : 0;
                  const color  = marker.label === "Round End"   ? "#ef4444"
                               : marker.label === "Prep Phase"  ? "#06b6d4"
                               :                                  "#facc15";
                  const shadow = marker.label === "Round End"   ? "0 0 4px rgba(239,68,68,0.7)"
                               : marker.label === "Prep Phase"  ? "0 0 4px rgba(6,182,212,0.7)"
                               :                                  "0 0 4px rgba(250,204,21,0.7)";
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
                        background: color,
                        cursor: "pointer",
                        boxShadow: shadow,
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

              {/* Round count badge + prev/next navigation */}
              {videoMarkers.length > 0 && !isAnalyzing && (() => {
                const roundCount    = videoMarkers.filter((m) => m.label === "Action Phase").length;
                const sortedMarkers = [...videoMarkers].sort((a, b) => a.time - b.time);
                const navBtn = (dir: "prev" | "next") => {
                  const v = videoRef.current;
                  if (!v) return;
                  const ct = v.currentTime;
                  const target = dir === "next"
                    ? sortedMarkers.find((m) => m.time > ct + 1)
                    : [...sortedMarkers].reverse().find((m) => m.time < ct - 1);
                  if (target) v.currentTime = target.time;
                };
                return (
                  <div className="flex items-center gap-1">
                    <button
                      title="Previous marker"
                      onClick={() => navBtn("prev")}
                      className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                      style={{ color: "var(--color-r6-muted)", background: "var(--color-r6-surface-2)", border: "1px solid var(--color-r6-border)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-r6-text)"; e.currentTarget.style.borderColor = "var(--color-r6-muted-2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-r6-muted)"; e.currentTarget.style.borderColor = "var(--color-r6-border)"; }}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span
                      className="text-[12px] rounded-lg px-2 py-0.5 font-medium"
                      style={{
                        background: "rgba(250,204,21,0.12)",
                        color: "#facc15",
                        border: "1px solid rgba(250,204,21,0.3)",
                      }}
                    >
                      {roundCount} {t("rounds found", language)}
                    </span>
                    <button
                      title="Next marker"
                      onClick={() => navBtn("next")}
                      className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                      style={{ color: "var(--color-r6-muted)", background: "var(--color-r6-surface-2)", border: "1px solid var(--color-r6-border)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-r6-text)"; e.currentTarget.style.borderColor = "var(--color-r6-muted-2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-r6-muted)"; e.currentTarget.style.borderColor = "var(--color-r6-border)"; }}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                );
              })()}

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

              {/* Export FFmpeg script dropdown */}
              {videoMarkers.length > 0 && !isAnalyzing && (
                <div ref={exportMenuRef} className="relative">
                  <button
                    title={t("Export Clips", language)}
                    onClick={() => setIsExportMenuOpen((o) => !o)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors whitespace-nowrap"
                    style={{
                      background: isExportMenuOpen ? "var(--color-r6-accent-dim)" : "var(--color-r6-surface-2)",
                      color:      isExportMenuOpen ? "var(--color-r6-accent)"     : "var(--color-r6-muted)",
                      border:     isExportMenuOpen ? "1px solid var(--color-r6-accent)" : "1px solid var(--color-r6-border)",
                    }}
                    onMouseEnter={(e) => { if (!isExportMenuOpen) { e.currentTarget.style.background = "var(--color-r6-accent-dim)"; e.currentTarget.style.color = "var(--color-r6-accent)"; e.currentTarget.style.borderColor = "var(--color-r6-accent)"; } }}
                    onMouseLeave={(e) => { if (!isExportMenuOpen) { e.currentTarget.style.background = "var(--color-r6-surface-2)"; e.currentTarget.style.color = "var(--color-r6-muted)"; e.currentTarget.style.borderColor = "var(--color-r6-border)"; } }}
                  >
                    <Download size={14} />
                    {t("Export Clips", language)}
                  </button>

                  {isExportMenuOpen && (
                    <div
                      className="absolute bottom-full right-0 mb-2 rounded-xl py-1 text-[13px]"
                      style={{
                        background: "var(--color-r6-surface)",
                        border:     "1px solid var(--color-r6-border)",
                        boxShadow:  "0 6px 20px rgba(0,0,0,0.55)",
                        minWidth:   180,
                        zIndex:     100,
                      }}
                    >
                      {([
                        { label: "Export FFmpeg (.bat)", os: "win" as const },
                        { label: "Export FFmpeg (.sh)",  os: "mac" as const },
                      ]).map(({ label, os }) => (
                        <button
                          key={os}
                          onClick={() => generateFFmpegScript(os)}
                          className="flex w-full items-center gap-2 px-3 py-2"
                          style={{ color: "var(--color-r6-text)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-r6-surface-2)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <Download size={13} style={{ color: "var(--color-r6-muted)" }} />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
