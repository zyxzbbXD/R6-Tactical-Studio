import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type Konva from "konva";
import { useShallow } from "zustand/react/shallow";
import { useBoardStore } from "../store/useBoardStore";
import { useCanvasStore } from "../store/canvasStore";

// ─── PDF export helpers ───────────────────────────────────────────────────────

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseCanvasExportParams {
  stageRef: RefObject<Konva.Stage | null>;
}

export function useCanvasExport({ stageRef }: UseCanvasExportParams) {
  const [isExporting,    setIsExporting]    = useState(false);
  const [isExportingGif, setIsExportingGif] = useState(false);

  // ── Store slices ────────────────────────────────────────────────────────────
  const {
    notes,
    exportPhases, exportVisibility,
    items, lines, throwableLines,
    currentPhase, setPhase,
    currentRouteStep, setCurrentRouteStep,
    gifExportRequested, setGifExportRequested,
    imageExportRequested, setImageExportRequested,
    allPhasesExportRequested, setAllPhasesExportRequested,
  } = useBoardStore(useShallow((s) => ({
    notes: s.notes,
    exportPhases: s.exportPhases, exportVisibility: s.exportVisibility,
    items: s.items, lines: s.lines, throwableLines: s.throwableLines,
    currentPhase: s.currentPhase, setPhase: s.setPhase,
    currentRouteStep: s.currentRouteStep, setCurrentRouteStep: s.setCurrentRouteStep,
    gifExportRequested: s.gifExportRequested, setGifExportRequested: s.setGifExportRequested,
    imageExportRequested: s.imageExportRequested, setImageExportRequested: s.setImageExportRequested,
    allPhasesExportRequested: s.allPhasesExportRequested, setAllPhasesExportRequested: s.setAllPhasesExportRequested,
  })));

  const { currentFloorId, currentMap, currentFloor, setFloor } = useCanvasStore(useShallow((s) => ({
    currentFloorId: s.currentFloorId,
    currentMap: s.currentMap,
    currentFloor: s.currentFloor,
    setFloor: s.setFloor,
  })));

  // ── Export: PNG of current view ─────────────────────────────────────────────
  const handleExportImage = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = "R6-Tactic.png";
    a.click();
  };

  // ── Export: PDF (pure jsPDF — no html2canvas, no DOM cloning) ──────────────
  const handleExport = async () => {
    const stage = stageRef.current;
    if (!stage || isExporting) return;

    setIsExporting(true);
    try {
      // ── Page 1: Tactical Board (canvas screenshot) ──────────────────────
      const dataUrl = stage.toDataURL({ pixelRatio: 2 });
      console.log("🔥 Konva Snapshot Length:", dataUrl.length);

      const { jsPDF } = await import("jspdf");
      const map      = currentMap();
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
      void y; // used above; referenced to suppress unused-var lint

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

  // ── Export: all phases as individual PNGs ───────────────────────────────────
  // Loop through phases 1-4, capture each, download as individual PNGs.
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

  // ── Export: GIF pipeline ────────────────────────────────────────────────────
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

    const map       = currentMap();
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

  // ── Export request triggers (from FloatingExportWindow) ────────────────────
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

  return {
    handleExport,
    handleExportGif,
    handleExportAllPhases,
    handleExportImage,
    isExporting,
    isExportingGif,
  };
}
