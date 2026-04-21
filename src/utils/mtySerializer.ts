/**
 * mtySerializer.ts
 *
 * Single source of truth for building and downloading .mty project files.
 * All three export entry points (menu-export, FloatingExportWindow, MainCanvas)
 * call generateMtyPayload + downloadMtyFile instead of duplicating this logic.
 */

import type { PersistedBoardState } from "./projectManager";
import type { ViewMode } from "../store/canvasStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MtyPayload {
  version: "1.0";
  meta: {
    id: string;
    name: string;
    mapId: string | null;
    updatedAt: number;
  };
  payload: {
    boardState: PersistedBoardState;
    notes: string;
    floorId: string | null;
    activeFloorId: string | null;
    activePhase: number;
    activeView?: ViewMode;
  };
}

// ─── Core serializer (pure function — no store access) ────────────────────────

/**
 * Build a standard .mty object from already-extracted store state.
 *
 * @param currentProjectId  ID from useProjectStore (null if no project is open)
 * @param projectName       Human-readable name from the project list
 * @param mapId             canvas.currentMapId
 * @param boardState        Snapshot of the board's persisted fields (items, lines, …)
 * @param canvasState       { currentFloorId, activePhase } from canvas + board stores
 * @param notes             board.notes
 */
export function generateMtyPayload(
  currentProjectId: string | null,
  projectName: string,
  mapId: string | null,
  boardState: PersistedBoardState,
  canvasState: { currentFloorId: string | null; activePhase: number; activeView?: ViewMode },
  notes: string,
): MtyPayload {
  return {
    version: "1.0",
    meta: {
      id:        currentProjectId ?? crypto.randomUUID(),
      name:      projectName,
      mapId,
      updatedAt: Date.now(),
    },
    payload: {
      boardState,
      notes,
      floorId:       canvasState.currentFloorId,
      activeFloorId: canvasState.currentFloorId,
      activePhase:   canvasState.activePhase,
      activeView:    canvasState.activeView,
    },
  };
}

// ─── Download helper ──────────────────────────────────────────────────────────

/**
 * Trigger a browser download of the serialized .mty payload.
 *
 * @param payload   Return value of generateMtyPayload
 * @param fileName  e.g. "MyProject.mty"
 */
export function downloadMtyFile(payload: MtyPayload, fileName: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Shared helper ────────────────────────────────────────────────────────────

/** Sanitize a project name for use as a filename (strips reserved chars). */
export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}
