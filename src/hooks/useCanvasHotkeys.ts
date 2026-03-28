/**
 * useCanvasHotkeys.ts
 *
 * Registers the global document-level keydown handler for the tactical board.
 * All Zustand state is read via .getState() inside the handler to avoid stale
 * closures; local React state is passed in as refs for the same reason.
 */

import { useEffect } from "react";
import type React from "react";
import type Konva from "konva";
import { useBoardStore, type BoardItem, type TextNode } from "../store/useBoardStore";
import { useUIStore } from "../store/useUIStore";
import { useCanvasStore } from "../store/canvasStore";
import { useProjectStore } from "../store/useProjectStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { t } from "../locales/i18n";

// ─── Clipboard types ──────────────────────────────────────────────────────────

/** Discriminated union for the copy-paste clipboard. */
export type CopiedPayload =
  | (BoardItem & { _type: "item" })
  | (TextNode  & { _type: "text" });

// ─── Options ──────────────────────────────────────────────────────────────────

export interface UseCanvasHotkeysOptions {
  /** Konva stage — used for arrow-key canvas pan. */
  stageRef: React.RefObject<Konva.Stage | null>;
  /** Current Konva stage position — kept in sync by the parent. */
  positionRef: React.MutableRefObject<{ x: number; y: number }>;
  /**
   * Clipboard for Ctrl+C / Ctrl+V.
   * Typed as CopiedPayload so both board items and text annotations can be stored.
   */
  copiedItemRef: React.MutableRefObject<CopiedPayload | null>;
  /**
   * Ref to the active room-label editor state — kept fresh by the parent.
   * Ctrl+Z closes the editor instead of undoing when this is non-null.
   */
  activeRoomEditRef: React.RefObject<{ id: string } | null>;
  /** Input ref for the save-as-new modal — focused automatically on open. */
  saveModalInputRef: React.RefObject<HTMLInputElement | null>;

  /**
   * Ref reflecting whether the user is actively editing a text node or room
   * label in the canvas (editingTextId !== null || activeRoomEdit !== null).
   * When true, ALL hotkeys are suppressed to prevent canvas commands from
   * firing while the user types inside an overlay input.
   */
  isEditingTextRef: React.MutableRefObject<boolean>;

  /**
   * Ref holding the currently selected item ID — kept fresh by the parent
   * so Delete / Backspace / Ctrl+C always see the latest value.
   */
  selectedIdRef: React.MutableRefObject<string | null>;

  // ── Stable setters (React guarantees useState setters never change) ────────
  /** Updates local MainCanvas selection state (drives the Konva Transformer). */
  setSelectedId: (id: string | null) => void;
  /** Close the room-label editor overlay (called with null). */
  setActiveRoomEdit: (v: null) => void;
  setSaveModalOpen: (open: boolean) => void;
  setSaveModalName: (name: string) => void;

  /** Show a toast notification in the canvas toolbar. */
  showToast: (msg: string) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCanvasHotkeys({
  stageRef,
  positionRef,
  copiedItemRef,
  activeRoomEditRef,
  saveModalInputRef,
  isEditingTextRef,
  selectedIdRef,
  setSelectedId,
  setActiveRoomEdit,
  setSaveModalOpen,
  setSaveModalName,
  showToast,
}: UseCanvasHotkeysOptions) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ── Guard: native text inputs ──────────────────────────────────────────
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // ── Guard: canvas text-node / room-label editor overlay ───────────────
      if (isEditingTextRef.current) return;

      // Compute modifier flag FIRST so single-key shortcuts are never confused
      // with Ctrl+key combos (e.g. Ctrl+V must not trigger the "V → cursor" shortcut).
      const mod = e.ctrlKey || e.metaKey;

      // ── Snapshot store state (stale-closure-safe) ─────────────────────────
      const board      = useBoardStore.getState();
      const ui         = useUIStore.getState();
      const canvas     = useCanvasStore.getState();
      const project    = useProjectStore.getState();
      const selectedId = selectedIdRef.current;

      // ── Delete / Backspace (only without modifier) ─────────────────────────
      if (!mod && (e.key === "Delete" || e.key === "Backspace")) {
        if (!selectedId) return;
        if (board.texts.some((t) => t.id === selectedId)) {
          board.removeText(selectedId);
          setSelectedId(null);
        } else if (board.roomLabels.some((rl) => rl.id === selectedId)) {
          board.removeRoomLabel(selectedId);
          setSelectedId(null);
        } else if (ui.tool === "route") {
          // Route mode: remove only the current step waypoint, not the whole operator
          board.deleteRouteStep(selectedId, board.currentRouteStep);
        } else {
          board.removeItem(selectedId);
          setSelectedId(null);
        }
        return;
      }

      // ── Single-key shortcuts — skipped entirely when Ctrl/Cmd is held ──────
      if (!mod) {
        if (e.key === "Escape") {
          ui.setPendingOperator(null);
          ui.setTool("cursor");
          return;
        }

        if (e.key === "v" || e.key === "V") { ui.setTool("cursor");  return; }
        if (e.key === "p" || e.key === "P") { ui.setTool("pen");     return; }
        if (e.key === "a" || e.key === "A") { ui.setTool("arrow");   return; }
        if (e.key === "e" || e.key === "E") { ui.setTool("eraser");  return; }
        if (e.key === "r" || e.key === "R") { ui.setTool("route");   return; }
        if (e.key === "x" || e.key === "X") { ui.setTool("text");    return; }

        if (e.key === "t" || e.key === "T") {
          // Room-name overlay is incompatible with isometric view
          if (canvas.currentView !== "isometric") board.toggleRoomNames();
          return;
        }

        // Space → play / pause timeline
        if (e.key === " ") {
          e.preventDefault();
          board.setIsPlaying(!board.isPlaying);
          return;
        }

        // Number keys 1–5 → jump to route step
        if (ui.tool === "route" && e.key >= "1" && e.key <= "5") {
          board.setCurrentRouteStep(parseInt(e.key, 10) as 1 | 2 | 3 | 4 | 5);
          return;
        }

        // Arrow keys → canvas pan (40 px per press, no React state involved)
        if (
          e.key === "ArrowUp"   || e.key === "ArrowDown" ||
          e.key === "ArrowLeft" || e.key === "ArrowRight"
        ) {
          e.preventDefault();
          const stage = stageRef.current;
          if (!stage) return;
          const PAN_STEP = 40;
          const dx = e.key === "ArrowLeft" ? PAN_STEP : e.key === "ArrowRight" ? -PAN_STEP : 0;
          const dy = e.key === "ArrowUp"   ? PAN_STEP : e.key === "ArrowDown"  ? -PAN_STEP : 0;
          const newPos = { x: positionRef.current.x + dx, y: positionRef.current.y + dy };
          positionRef.current = newPos;
          stage.position(newPos);
          stage.batchDraw();
          return;
        }

        return; // any other bare key — ignore
      }

      // ── Ctrl / Cmd shortcuts ────────────────────────────────────────────────

      // Ctrl+C — copy selected item or text annotation
      if (e.key.toLowerCase() === "c") {
        if (selectedId) {
          const srcItem = board.items.find((i) => i.id === selectedId);
          if (srcItem) {
            // Operators (atk/def) are bound to the timeline and must remain unique —
            // only gadgets (side === "neutral") may be duplicated.
            if (srcItem.side !== "neutral") {
              showToast(t("copy_operator_blocked", useSettingsStore.getState().language));
              return;
            }
            copiedItemRef.current = { ...JSON.parse(JSON.stringify(srcItem)), _type: "item" };
            return;
          }
          const srcText = board.texts.find((t) => t.id === selectedId);
          if (srcText) {
            copiedItemRef.current = { ...JSON.parse(JSON.stringify(srcText)), _type: "text" };
          }
        }
        return;
      }

      // Ctrl+V — paste the clipboard item or text annotation
      if (e.key.toLowerCase() === "v") {
        const copied = copiedItemRef.current;
        if (!copied) return;

        const newId = crypto.randomUUID();

        if (copied._type === "item") {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _type, ...rest } = copied;
          const pasted: BoardItem = { ...rest, id: newId, x: copied.x + 20, y: copied.y + 20 };
          useBoardStore.setState((s) => ({ items: [...s.items, pasted] }));
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _type, ...rest } = copied;
          const pasted: TextNode = { ...rest, id: newId, x: copied.x + 20, y: copied.y + 20 };
          useBoardStore.setState((s) => ({ texts: [...s.texts, pasted] }));
        }

        // Update both local Transformer state and UIStore for cross-component access
        setSelectedId(newId);
        useUIStore.getState().setSelectedId(newId);
        return;
      }

      // Ctrl+Z — undo (or close room-label editor if open)
      if (e.key === "z") {
        e.preventDefault();
        // Closing the textarea overlay is safer than running undo while it's mounted
        if (activeRoomEditRef.current) { setActiveRoomEdit(null); return; }
        useBoardStore.temporal.getState().undo();
        return;
      }

      // Ctrl+S — save project
      if (e.key === "s") {
        e.preventDefault();
        if (project.currentProjectId) {
          project.saveCurrentProject().then(() => showToast("项目已覆盖保存"));
        } else {
          setSaveModalName("");
          setSaveModalOpen(true);
          setTimeout(() => saveModalInputRef.current?.focus(), 0);
        }
        return;
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // All deps are stable refs + useState setters + useCallback → registers once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
