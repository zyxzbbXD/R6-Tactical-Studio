import { useEffect, useRef, useState } from "react";
import Draggable from "react-draggable";
import {
  GripHorizontal, X, FolderOpen,
  Play, Pause, Volume2, Volume1, VolumeX, Scan,
  Square, Maximize2, Expand,
  ChevronLeft, ChevronRight, Download, AlertTriangle, Link,
} from "lucide-react";
import { useBoardStore } from "../store/useBoardStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { t } from "../locales/i18n";
import { cn } from "../utils/cn";

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
  const syncVideoSrc      = useBoardStore((s) => s.setVideoSrc);
  const syncVideoFileName = useBoardStore((s) => s.setVideoFileName);
  const storeVideoSrc     = useBoardStore((s) => s.videoSrc);
  const storeVideoFileName = useBoardStore((s) => s.videoFileName);
  const language          = useSettingsStore((s) => s.language);

  const [videoSrc,          setVideoSrc]          = useState<string | null>(null);
  const [fileName,          setFileName]          = useState<string>("");
  const [isPlaying,         setIsPlaying]         = useState(false);
  const [volumeLevel,       setVolumeLevel]       = useState(1);
  const lastVolumeRef = useRef(1);
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

  // Sync externally-loaded video (e.g., global drag-and-drop from App.tsx)
  useEffect(() => {
    if (storeVideoSrc && storeVideoSrc !== videoSrc) {
      if (videoSrc) URL.revokeObjectURL(videoSrc);
      setVideoSrc(storeVideoSrc);
      setFileName(storeVideoFileName);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      clearVideoMarkers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeVideoSrc]);

  // Revoke object URL when file changes; also clear global store reference
  useEffect(() => {
    return () => {
      if (videoSrc) {
        URL.revokeObjectURL(videoSrc);
        syncVideoSrc(null);
        syncVideoFileName("");
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc]);

  // ── File load ───────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    const newSrc = URL.createObjectURL(file);
    setVideoSrc(newSrc);
    setFileName(file.name);
    syncVideoSrc(newSrc);
    syncVideoFileName(file.name);
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

  // Close export menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
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
    if (level > 0) lastVolumeRef.current = level;
  };

  const toggleMute = () => {
    if (volumeLevel > 0) {
      lastVolumeRef.current = volumeLevel;
      setVolume(0);
    } else {
      setVolume(lastVolumeRef.current > 0 ? lastVolumeRef.current : 1);
    }
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

  // ── OCR analysis ────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    const v = videoRef.current;
    if (!v || !videoSrc || isAnalyzing || !isFinite(v.duration) || v.duration <= 0) return;

    setIsAnalyzing(true);
    setAnalyzeProgress(0);
    abortRef.current = false;
    clearVideoMarkers();

    // Local staging array — markers are collected here and committed atomically at the end
    const localMarkers: { time: number; label: string; color?: string }[] = [];
    // All video timestamps where OCR returned a valid remaining time (used for Prep Phase gate)
    const validHits: number[] = [];

    v.pause();
    setIsPlaying(false);

    const offscreen = document.createElement("canvas");
    const ctx       = offscreen.getContext("2d")!;

    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await worker.setParameters({ tessedit_char_whitelist: "0123456789:" } as any);

    const videoDuration = v.duration;

    interface FrameResult { remaining: number | null; isPlanted: boolean; }

    const ocrFrameMode = async (mode: "broadcast" | "pov"): Promise<FrameResult> => {
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      const bSy = vh * 0.05;
      const bSw = vw * 0.06;
      const bSh = vh * 0.06;
      const sy = Math.floor(mode === "pov" ? bSy - vh * 0.03 : bSy);
      const sw = Math.floor(mode === "pov" ? bSw * 1.05      : bSw);
      const sh = Math.floor(mode === "pov" ? bSh * 1.05      : bSh);
      const sx = Math.floor(vw * 0.47 - (sw - Math.floor(bSw)) / 2);
      offscreen.width  = sw;
      offscreen.height = sh;
      ctx.drawImage(v, sx, Math.max(0, sy), sw, sh, 0, 0, sw, sh);

      // Fast yellow-pixel scan — R6 defuser-planted timer turns yellow; skip OCR when planted
      const pixels = ctx.getImageData(0, 0, sw, sh).data;
      let yellowCount = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 180 && pixels[i + 1] > 160 && pixels[i + 2] < 100) yellowCount++;
      }
      if (yellowCount / (sw * sh) > 0.30) {
        return { remaining: null, isPlanted: true };
      }

      const { data: { text } } = await worker.recognize(offscreen);
      const m = text.match(/\b([0-2]):([0-5]\d)\b/);
      if (!m) return { remaining: null, isPlanted: false };
      const remaining = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      return { remaining: remaining <= 180 ? remaining : null, isPlanted: false };
    };

    let currentUIMode: "broadcast" | "pov" = "broadcast";
    const ocrFrame = async (): Promise<FrameResult> => {
      let result = await ocrFrameMode(currentUIMode);
      // Only try fallback when primary had no yellow and OCR missed
      if (result.remaining === null && !result.isPlanted) {
        const fallback = currentUIMode === "broadcast" ? "pov" : "broadcast";
        const fb = await ocrFrameMode(fallback);
        if (fb.remaining !== null || fb.isPlanted) { currentUIMode = fallback; result = fb; }
      }
      const dbg = debugCanvasRef.current;
      if (dbg) {
        dbg.width  = offscreen.width;
        dbg.height = offscreen.height;
        dbg.getContext("2d")!.drawImage(offscreen, 0, 0);
      }
      return result;
    };

    // Detect the 'WON' victory banner — Hunt Mode capture (screen centre-mid).
    // Uses {once: true} seeked listeners for reliable async frame capture.
    // Capture rect: x=35%, y=40%, w=30%, h=15% — covers the full WON settlement banner.
    // Always restores video.currentTime after recognition so callers are not disturbed.
    const checkWonBanner = async (seekT: number): Promise<boolean> => {
      const originalTime = v.currentTime;

      await new Promise<void>((resolve) => {
        v.addEventListener("seeked", () => resolve(), { once: true });
        v.currentTime = seekT;
      });

      const vw = v.videoWidth;
      const vh = v.videoHeight;
      const bw = Math.floor(vw * 0.30);
      const bh = Math.floor(vh * 0.15);
      offscreen.width  = bw;
      offscreen.height = bh;
      ctx.drawImage(v, Math.floor(vw * 0.35), Math.floor(vh * 0.40), bw, bh, 0, 0, bw, bh);

      // Fast binarize: bright white text → pure black; all other background → pure white.
      // "ROUND WON" renders in white lettering; inversion gives dark-on-light for best Tesseract accuracy.
      const imgData = ctx.getImageData(0, 0, bw, bh);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) {
          d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255;
        } else {
          d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      const { data: { text } } = await worker.recognize(offscreen);

      // Restore position so the main loop's frame pointer is undisturbed
      await new Promise<void>((resolve) => {
        v.addEventListener("seeked", () => resolve(), { once: true });
        v.currentTime = originalTime;
      });

      return /W[O0Q]N/.test(text.toUpperCase().replace(/[\s\n]/g, ""));
    };

    // Hunt Mode: scan [fromT, toT] at 0.25 s granularity searching for the WON settlement banner.
    // Returns the precise timestamp the banner first appears.
    // Fallback: if no WON banner is found in the full window, returns the first frame where
    // the top-area timer OCR returns null (UI has already disappeared).
    const huntPrecisionWonEnd = async (fromT: number, toT: number): Promise<number> => {
      const hi = Math.min(toT, videoDuration);
      let firstNull: number | null = null;

      for (let s = fromT; s <= hi + 0.001 && !abortRef.current; s += 0.25) {
        const t = Math.min(s, hi);
        if (await checkWonBanner(t)) return t;

        // Track the first timer-null frame as a fallback anchor.
        // checkWonBanner restored currentTime to originalTime; re-seek to t for ocrFrame.
        if (firstNull === null) {
          await seekTo(t);
          const { remaining } = await ocrFrame();
          if (remaining === null) firstNull = t;
        }
      }

      return firstNull ?? hi;
    };

    // Candidate round: buffered until 40 s of stable, drift-free signal confirms it's a real round
    interface CandidateRound {
      actionStart:       number;
      lastValidTime:     number;
      firstHitTime:      number;
      lastInferredStart: number;   // drift anchor: should stay ~constant between steps
      driftStrikes:      number;   // consecutive drift violations; execution at >= 2
      partial:           boolean;
    }

    let activeRound: {
      actionStart:       number;
      lastValidTime:     number;
      lastInferredStart: number;
      driftStrikes:      number;
      partial:           boolean;
      hasPlanted:        boolean;  // once set, exempts from drift check (planted timer ≠ round timer)
    } | null = null;
    let pendingRound: CandidateRound | null = null;

    // Per-round staging buffer — flushed to localMarkers only after lifecycle validation
    let roundMarkerBuffer: typeof localMarkers = [];

    // Lifecycle gate: a genuine round must have a valid OCR hit within 20 s of action start.
    // If not, the entire buffer is silently discarded (long replay masquerading as a real round).
    const commitRound = (actionStart: number) => {
      const hasEarlyActivity = validHits.some(
        (t) => t >= actionStart && t <= actionStart + 20,
      );
      if (hasEarlyActivity) localMarkers.push(...roundMarkerBuffer);
      roundMarkerBuffer = [];
    };

    // Push Prep Phase (blue, only if a valid OCR hit landed in the [-30, -25] window before
    // action start) + Action Phase into roundMarkerBuffer.
    const pushRoundStartMarkers = (actionStart: number) => {
      const hasPrepHit = validHits.some(
        (t) => t >= actionStart - 30 && t <= actionStart - 25,
      );
      if (hasPrepHit) {
        roundMarkerBuffer.push({ time: Math.max(0, actionStart - 30), label: "Prep Phase", color: "#3b82f6" });
      }
      roundMarkerBuffer.push({ time: actionStart, label: "Action Phase" });
    };

    for (let t2 = 0; t2 < videoDuration && !abortRef.current;) {
      await seekTo(t2);
      const { remaining, isPlanted } = await ocrFrame();

      if (isPlanted) {
        if (activeRound) {
          // Defuser planted — keep round alive, reset strikes, exempt future readings from drift check
          activeRound.lastValidTime = t2;
          activeRound.driftStrikes  = 0;
          if (!activeRound.hasPlanted) {
            activeRound.hasPlanted = true;
            roundMarkerBuffer.push({ time: t2, label: "Defuser Planted" });
          }
        } else if (pendingRound) {
          // Planted during candidate window: strongest possible confirmation → promote immediately
          roundMarkerBuffer = [];
          if (!pendingRound.partial) {
            pushRoundStartMarkers(pendingRound.actionStart);
            roundMarkerBuffer.push({ time: t2, label: "Defuser Planted" });
          }
          activeRound  = { actionStart: pendingRound.actionStart, lastValidTime: t2, lastInferredStart: pendingRound.lastInferredStart, driftStrikes: 0, partial: pendingRound.partial, hasPlanted: true };
          pendingRound = null;
        }
        // If neither active nor pending: planted with no context — ignore

      } else if (remaining !== null) {
        const inferredStart = t2 - (180 - remaining);
        const isPartial     = inferredStart < 0;
        validHits.push(t2); // record every clean OCR hit for lifecycle gate and Prep Phase gate

        if (activeRound) {
          if (Math.abs(inferredStart - activeRound.actionStart) <= 60) {
            const drift = Math.abs(inferredStart - activeRound.lastInferredStart);
            // Drift check exempted when defuser was planted (post-plant clock differs from round clock)
            if (!activeRound.hasPlanted && drift > 5) {
              activeRound.driftStrikes++;
              // Anchor frozen — do NOT update lastInferredStart or lastValidTime yet
              if (activeRound.driftStrikes >= 2) {
                // Three-strikes: broadcast cut confirmed — hunt for precise WON banner end
                if (!activeRound.partial) {
                  const endTime = await huntPrecisionWonEnd(activeRound.lastValidTime, Math.min(t2, activeRound.lastValidTime + 12));
                  roundMarkerBuffer.push({ time: endTime, label: "Round End" });
                  commitRound(activeRound.actionStart);
                } else {
                  roundMarkerBuffer = [];
                }
                activeRound  = null;
                pendingRound = { actionStart: inferredStart, lastValidTime: t2, firstHitTime: t2, lastInferredStart: inferredStart, driftStrikes: 0, partial: isPartial };
              }
              // else: single strike — give it a chance to self-heal next step
            } else {
              // Clean reading — reset strikes, advance anchors
              activeRound.driftStrikes      = 0;
              activeRound.lastValidTime     = t2;
              activeRound.lastInferredStart = inferredStart;
            }
          } else {
            // Big jump → close active round, hunt for precise WON banner end
            if (!activeRound.partial) {
              const endTime = await huntPrecisionWonEnd(activeRound.lastValidTime, Math.min(t2, activeRound.lastValidTime + 12));
              roundMarkerBuffer.push({ time: endTime, label: "Round End" });
              commitRound(activeRound.actionStart);
            } else {
              roundMarkerBuffer = [];
            }
            activeRound  = null;
            pendingRound = { actionStart: inferredStart, lastValidTime: t2, firstHitTime: t2, lastInferredStart: inferredStart, driftStrikes: 0, partial: isPartial };
          }

        } else if (pendingRound) {
          if (Math.abs(inferredStart - pendingRound.actionStart) <= 60) {
            const drift = Math.abs(inferredStart - pendingRound.lastInferredStart);
            if (drift > 5) {
              pendingRound.driftStrikes++;
              // Anchor frozen — do NOT update lastInferredStart or lastValidTime yet
              if (pendingRound.driftStrikes >= 2) {
                // Three-strikes: discard candidate, restart with fresh anchor
                pendingRound = { actionStart: inferredStart, lastValidTime: t2, firstHitTime: t2, lastInferredStart: inferredStart, driftStrikes: 0, partial: isPartial };
              }
              // else: single strike — self-heal opportunity
            } else {
              // Clean reading — reset strikes, advance window
              pendingRound.driftStrikes      = 0;
              pendingRound.lastValidTime     = t2;
              pendingRound.lastInferredStart = inferredStart;
              // Promote once 40 s of drift-free signal confirms a real round
              if (pendingRound.lastValidTime - pendingRound.firstHitTime >= 40) {
                roundMarkerBuffer = [];
                if (!pendingRound.partial) {
                  pushRoundStartMarkers(pendingRound.actionStart);
                }
                activeRound  = { actionStart: pendingRound.actionStart, lastValidTime: pendingRound.lastValidTime, lastInferredStart: pendingRound.lastInferredStart, driftStrikes: 0, partial: pendingRound.partial, hasPlanted: false };
                pendingRound = null;
              }
            }
          } else {
            // Big jump before 40 s threshold → discard (highlight replay), restart candidate
            pendingRound = { actionStart: inferredStart, lastValidTime: t2, firstHitTime: t2, lastInferredStart: inferredStart, driftStrikes: 0, partial: isPartial };
          }

        } else {
          // Nothing active or buffered — start a new candidate
          pendingRound = { actionStart: inferredStart, lastValidTime: t2, firstHitTime: t2, lastInferredStart: inferredStart, driftStrikes: 0, partial: isPartial };
        }

      } else {
        // OCR miss: any unconfirmed candidate is immediately discarded (signal was too short)
        pendingRound = null;
        if (activeRound && t2 > activeRound.actionStart + 250) {
          if (!activeRound.partial) {
            // UI disappeared — Hunt Mode: 0.25 s precision scan for WON banner
            const endTime = await huntPrecisionWonEnd(activeRound.lastValidTime, Math.min(t2, activeRound.lastValidTime + 12));
            roundMarkerBuffer.push({ time: endTime, label: "Round End" });
            commitRound(activeRound.actionStart);
          } else {
            roundMarkerBuffer = [];
          }
          activeRound = null;
        }
      }

      // Adaptive step: 2 s near round-end or while planted, 10 s otherwise (Cruise Mode — no WON check here)
      const expectedRemaining = activeRound ? 180 - (t2 - activeRound.actionStart) : Infinity;
      const nextStep = (isPlanted || expectedRemaining <= 15) ? 2 : 10;

      t2 += nextStep;
      setAnalyzeProgress(Math.round(Math.min((t2 / videoDuration) * 100, 99)));
    }

    // Trailing: seal the last confirmed active round (pendingRound never reached threshold → discard)
    if (!abortRef.current && activeRound && !activeRound.partial) {
      const endTime = await huntPrecisionWonEnd(activeRound.lastValidTime, Math.min(videoDuration, activeRound.lastValidTime + 12));
      roundMarkerBuffer.push({ time: endTime, label: "Round End" });
      commitRound(activeRound.actionStart);
    }

    // ── Post-processing: sort → clean → commit ────────────────────────────────
    localMarkers.sort((a, b) => a.time - b.time);

    const cleanedMarkers: typeof localMarkers = [];
    for (let i = 0; i < localMarkers.length; i++) {
      const cur  = localMarkers[i];
      const next = localMarkers[i + 1];

      // Rule 1 — Drop Defuser Planted immediately superseded by Round End (< 15 s)
      if (cur.label === "Defuser Planted" && next?.label === "Round End" && next.time - cur.time < 15) {
        continue;
      }

      const last = cleanedMarkers[cleanedMarkers.length - 1];
      if (last) {
        const gap = cur.time - last.time;
        // Prep Phase → Action Phase is a canonical adjacent pair; never suppress it
        const isPrepActionPair = last.label === "Prep Phase" && cur.label === "Action Phase";

        if (!isPrepActionPair) {
          // Rule 2 — Two markers within 8 s: keep Round End, drop the other
          if (gap < 8) {
            if (cur.label === "Round End" && last.label !== "Round End") {
              cleanedMarkers.pop(); // evict the lower-priority predecessor
            } else {
              continue; // cur loses; discard it
            }
          // Rule 3 — Same label within 20 s: drop the duplicate
          } else if (cur.label === last.label && gap < 20) {
            continue;
          }
        }
      }

      cleanedMarkers.push(cur);
    }

    clearVideoMarkers();
    for (const m of cleanedMarkers) addVideoMarker(m);

    await worker.terminate();

    if (!abortRef.current) await seekTo(0);

    setIsAnalyzing(false);
  };

  // ── FFmpeg script export ─────────────────────────────────────────────────────

  const generateFFmpegScript = (os: "win" | "mac") => {
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
      cancel="input,button,select,textarea"
      defaultPosition={{ x: 60, y: 60 }}
      disabled={playerSize === "fullscreen"}
      position={playerSize === "fullscreen" ? { x: 0, y: 0 } : undefined}
    >
      <div
        ref={dragRef}
        className={cn(
          "absolute top-0 left-0 flex-col overflow-hidden rounded-2xl shadow-2xl bg-r6-surface-glass border border-r6-border backdrop-blur-lg",
          isVideoOpen ? "flex" : "hidden",
          playerSize === "fullscreen" && "inset-0 rounded-none"
        )}
        style={{
          zIndex: 9999,
          width:  playerSize === "fullscreen" ? "100%" : playerSize === "large" ? 800 : 480,
          height: playerSize === "fullscreen" ? "100%" : "auto",
        }}
      >
        {/* ── Title bar (drag handle) ─────────────────────────────────────── */}
        <div
          className="drag-handle flex cursor-grab items-center gap-2 px-3 py-2 select-none active:cursor-grabbing border-b border-r6-border bg-r6-surface-glass-dim"
          onDoubleClick={() => setPlayerSize((prev) => prev === "fullscreen" ? "standard" : "fullscreen")}
        >
          <GripHorizontal size={17} className="text-r6-muted-2 shrink-0" />
          <span className="flex-1 truncate text-[14px] font-medium text-r6-muted">
            {fileName || t("Video Review", language)}
          </span>

          {/* Size selector */}
          <div className="flex items-center rounded-lg overflow-hidden shrink-0 border border-r6-border bg-r6-surface-2">
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
                  className={cn(
                    "flex h-7 w-7 items-center justify-center transition-colors",
                    active ? "text-r6-accent bg-r6-accent-dim" : "text-r6-muted bg-transparent hover:text-r6-text",
                    size !== "fullscreen" && "border-r border-r6-border"
                  )}
                >
                  <Icon size={13} />
                </button>
              );
            })}
          </div>

          <button
            title="Open video file"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors bg-r6-surface-2 text-r6-muted border border-r6-border hover:text-r6-text hover:border-r6-border-light"
          >
            <FolderOpen size={13} />
            {t("Open", language)}
          </button>

          <button
            title="Close video player"
            onClick={toggleVideo}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors text-r6-muted hover:bg-r6-accent-dim hover:text-r6-accent"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Video area ──────────────────────────────────────────────────── */}
        <div
          className={cn(
            "relative flex items-center justify-center bg-black",
            playerSize === "fullscreen" ? "flex-1 min-h-0" : "flex-none aspect-video"
          )}
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
          ) : storeVideoFileName ? (
            /* ── Media Offline ───────────────────────────────────────────── */
            <div className="flex flex-col items-center gap-3 px-8 py-6 text-center">
              <AlertTriangle size={38} className="text-amber-400 shrink-0" />
              <span className="text-[15px] font-semibold text-amber-400">
                媒体离线 (Media Offline)
              </span>
              <span className="text-[13px] text-r6-muted leading-snug">
                当前战术板需要视频
                <br />
                <span className="font-mono text-amber-300 break-all">{storeVideoFileName}</span>
              </span>
              <button
                onClick={() => fileRef.current?.click()}
                className="mt-1 flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-colors border border-amber-500/50 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
              >
                <Link size={14} />
                重链接 (Relink Video)
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-3 rounded-2xl px-8 py-6 transition-colors text-r6-muted hover:bg-r6-surface-2 hover:text-r6-text"
            >
              <FolderOpen size={38} />
              <span className="text-[15px]">{t("Click to open", language)}</span>
              <span className="text-[13px] text-r6-muted-2">{t("File formats", language)}</span>
            </button>
          )}

          {/* Debug crop canvas — top-left, only during analysis */}
          {isAnalyzing && (
            <div className="absolute top-2 left-2 overflow-hidden rounded-lg border border-r6-accent bg-black">
              <canvas
                ref={debugCanvasRef}
                style={{ display: "block", width: 160, imageRendering: "pixelated" }}
              />
              <div className="px-1 py-0.5 text-center text-[11px] font-mono uppercase tracking-wider text-r6-accent"
                style={{ background: "rgba(0,0,0,0.8)" }}
              >
                {t("OCR crop", language)}
              </div>
            </div>
          )}

          {/* Analysis overlay — centered, semi-transparent */}
          {isAnalyzing && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]"
              style={{ background: "rgba(0,0,0,0.55)" }}
            >
              <Scan size={28} className="text-r6-accent animate-pulse" />
              <p className="text-[15px] font-semibold text-r6-text">
                {t("Analyzing", language)} {analyzeProgress}%
              </p>
              <div className="w-40 overflow-hidden rounded-full h-1 bg-r6-surface-3">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-r6-accent"
                  style={{ width: `${analyzeProgress}%` }}
                />
              </div>
              {videoMarkers.length > 0 && (
                <p className="text-[13px] text-yellow-400">
                  {videoMarkers.length} {t("phases found so far", language)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Controls + timeline (only when video loaded) ──────────────── */}
        {videoSrc && (
          <div className="border-t border-r6-border">

            {/* ── Custom seekable timeline ─────────────────────────────── */}
            <div className="px-3 pt-2 pb-1">
              <div className="relative rounded-full h-1.5 bg-r6-surface-3">
                {/* Invisible native range input — handles all seeking interactions */}
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step="any"
                  value={currentTime}
                  disabled={!duration || isAnalyzing}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (videoRef.current) videoRef.current.currentTime = val;
                    setCurrentTime(val);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0"
                />
                {/* Played portion */}
                <div
                  className="absolute left-0 top-0 h-full rounded-full pointer-events-none bg-r6-accent"
                  style={{ width: `${progressPct}%` }}
                />

                {/* Seek thumb */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full pointer-events-none bg-r6-accent border-2 border-white"
                  style={{
                    left: `${progressPct}%`,
                    boxShadow: "0 0 4px rgba(232,93,42,0.6)",
                  }}
                />

                {/* Phase marker ticks */}
                {videoMarkers.map((marker, i) => {
                  const pct    = duration > 0 ? (marker.time / duration) * 100 : 0;
                  const derivedColor = marker.label === "Round End"  ? "#ef4444"
                                   : marker.label === "Prep Phase" ? "#06b6d4"
                                   :                                 "#facc15";
                  const color  = marker.color ?? derivedColor;
                  const shadow = `0 0 4px ${color}b3`;
                  return (
                    <button
                      key={i}
                      title={`${marker.label} — ${fmt(marker.time)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const v = videoRef.current;
                        if (v) v.currentTime = marker.time;
                      }}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-md cursor-pointer w-[3px] h-3.5"
                      style={{
                        left: `${pct}%`,
                        background: color,
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
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors bg-r6-accent text-white",
                  isAnalyzing ? "opacity-40" : "opacity-100 hover:opacity-85"
                )}
              >
                {isPlaying ? <Pause size={15} /> : <Play size={15} />}
              </button>

              {/* Volume — icon toggles mute, slider sets level */}
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleMute}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-r6-surface-2",
                    volumeLevel === 0 ? "text-r6-accent" : "text-r6-muted"
                  )}
                  title={volumeLevel === 0 ? "Unmute" : "Mute"}
                >
                  {volumeLevel === 0  ? <VolumeX size={15} /> :
                   volumeLevel <= 0.5 ? <Volume1 size={15} /> :
                                        <Volume2 size={15} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volumeLevel}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-16 cursor-pointer h-1 accent-r6-accent"
                  title={`Volume: ${Math.round(volumeLevel * 100)}%`}
                />
              </div>

              {/* Time display */}
              <span className="text-[13px] font-mono tabular-nums text-r6-muted">
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
                      className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors text-r6-muted bg-r6-surface-2 border border-r6-border hover:text-r6-text hover:border-r6-muted-2"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span
                      className="text-[12px] rounded-lg px-2 py-0.5 font-medium text-yellow-400"
                      style={{
                        background: "rgba(250,204,21,0.12)",
                        border: "1px solid rgba(250,204,21,0.3)",
                      }}
                    >
                      {roundCount} {t("rounds found", language)}
                    </span>
                    <button
                      title="Next marker"
                      onClick={() => navBtn("next")}
                      className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors text-r6-muted bg-r6-surface-2 border border-r6-border hover:text-r6-text hover:border-r6-muted-2"
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
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors border",
                  isAnalyzing
                    ? "bg-r6-accent-dim text-r6-accent border-r6-accent opacity-70"
                    : "bg-r6-surface-2 text-r6-muted border-r6-border",
                  !duration && "opacity-70",
                  !isAnalyzing && duration && "hover:bg-r6-accent-dim hover:text-r6-accent hover:border-r6-accent"
                )}
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
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors whitespace-nowrap border",
                      isExportMenuOpen
                        ? "bg-r6-accent-dim text-r6-accent border-r6-accent"
                        : "bg-r6-surface-2 text-r6-muted border-r6-border hover:bg-r6-accent-dim hover:text-r6-accent hover:border-r6-accent"
                    )}
                  >
                    <Download size={14} />
                    {t("Export Clips", language)}
                  </button>

                  {isExportMenuOpen && (
                    <div
                      className="absolute bottom-full right-0 mb-2 rounded-xl py-1 text-[13px] bg-r6-surface border border-r6-border z-[100]"
                      style={{ boxShadow: "0 6px 20px rgba(0,0,0,0.55)", minWidth: 180 }}
                    >
                      {([
                        { label: "Export FFmpeg (.bat)", os: "win" as const },
                        { label: "Export FFmpeg (.sh)",  os: "mac" as const },
                      ]).map(({ label, os }) => (
                        <button
                          key={os}
                          onClick={() => generateFFmpegScript(os)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-r6-text hover:bg-r6-surface-2"
                        >
                          <Download size={13} className="text-r6-muted" />
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
