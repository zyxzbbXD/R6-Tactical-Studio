/**
 * useNativeMenu.ts
 *
 * Registers all Tauri native-menu event listeners (menu-new, menu-open,
 * menu-save, menu-export, menu-undo, menu-redo) in a single useEffect with
 * an empty dependency array.
 *
 * All Zustand state is accessed via .getState() inside each callback to avoid
 * stale closures and prevent the effect from re-subscribing on every render.
 *
 * Async unlisten functions are tracked with a cancellation flag so that if the
 * component unmounts before all listeners are registered, any that were already
 * registered are still properly cleaned up.
 */

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBoardStore } from "../store/useBoardStore";
import { useUIStore } from "../store/useUIStore";
import { useCanvasStore } from "../store/canvasStore";
import { useProjectStore } from "../store/useProjectStore";
import { generateMtyPayload, downloadMtyFile, sanitizeFileName } from "../utils/mtySerializer";

export function useNativeMenu() {
  useEffect(() => {
    // cancelled flips to true in cleanup so any listener registered after
    // unmount is immediately unregistered.
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    (async () => {
      // ── menu-new: prompt for a name, then create a blank project ─────────
      const ulNew = await listen("menu-new", async () => {
        const name = window.prompt("New project name:", "Untitled Project");
        if (name === null) return; // user cancelled
        await useProjectStore.getState().createProject(name.trim() || "Untitled Project");
      });
      if (cancelled) { ulNew(); return; }
      unlisteners.push(ulNew);

      // ── menu-open: native file dialog → read → install project ───────────
      const ulOpen = await listen("menu-open", async () => {
        try {
          const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
          const { readTextFile }     = await import("@tauri-apps/plugin-fs");

          const selected = await openDialog({
            multiple: false,
            filters: [{ name: "R6 Tactical Project", extensions: ["mty"] }],
          });
          if (!selected) return;
          const filePath = typeof selected === "string" ? selected : selected[0];
          if (!filePath) return;

          const raw = await readTextFile(filePath);
          const parsed = JSON.parse(raw);
          const fallbackName =
            filePath.split(/[/\\]/).pop()?.replace(/\.mty$/i, "").trim() ||
            "Untitled_Project";

          if (parsed.payload) {
            if (!parsed.meta?.name?.trim()) {
              parsed.meta = { ...parsed.meta, name: fallbackName };
            }
            await useProjectStore.getState().installImportedProject(parsed);
          } else {
            useBoardStore.getState().loadProjectData(parsed);
            useUIStore.getState().setTool("cursor");
          }
        } catch (err) {
          console.error("❌ [menu-open] Failed to open file:", err);
        }
      });
      if (cancelled) { ulOpen(); return; }
      unlisteners.push(ulOpen);

      // ── menu-save: persist current project to disk via project store ──────
      const ulSave = await listen("menu-save", async () => {
        await useProjectStore.getState().saveCurrentProject();
      });
      if (cancelled) { ulSave(); return; }
      unlisteners.push(ulSave);

      // ── menu-export: build + download a .mty file via shared serializer ───
      const ulExport = await listen("menu-export", () => {
        const board   = useBoardStore.getState();
        const canvas  = useCanvasStore.getState();
        const { currentProjectId, projectsList } = useProjectStore.getState();
        const projectName =
          projectsList.find((p) => p.id === currentProjectId)?.name ??
          "Untitled_Project";

        const mty = generateMtyPayload(
          currentProjectId,
          projectName,
          canvas.currentMapId,
          {
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
          { currentFloorId: canvas.currentFloorId, activePhase: board.currentPhase },
          board.notes,
        );
        downloadMtyFile(mty, `${sanitizeFileName(projectName)}.mty`);
      });
      if (cancelled) { ulExport(); return; }
      unlisteners.push(ulExport);

      // ── Shared guard: skip undo/redo while the user is typing ────────────
      const isEditingText = () => {
        const el = document.activeElement;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
        if (useUIStore.getState().isEditingRoomLabel) return true;
        return false;
      };

      // ── menu-undo ─────────────────────────────────────────────────────────
      const ulUndo = await listen("menu-undo", () => {
        if (isEditingText()) return;
        useBoardStore.temporal.getState().undo();
      });
      if (cancelled) { ulUndo(); return; }
      unlisteners.push(ulUndo);

      // ── menu-redo ─────────────────────────────────────────────────────────
      const ulRedo = await listen("menu-redo", () => {
        if (isEditingText()) return;
        useBoardStore.temporal.getState().redo();
      });
      if (cancelled) { ulRedo(); return; }
      unlisteners.push(ulRedo);
    })();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, []);
}
