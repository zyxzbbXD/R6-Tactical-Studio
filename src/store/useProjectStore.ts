/**
 * useProjectStore.ts
 *
 * Manages the list of saved projects and the currently-open project.
 * All disk I/O is delegated to projectManager.ts.
 *
 * Data flow on load:
 *   disk JSON / md → useProjectStore → useBoardStore (items, lines, notes)
 *                                    → useCanvasStore (mapId, floorId)
 */

import { create } from "zustand";
import {
  initProjectDir,
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  type ProjectData,
  type ProjectMeta,
} from "../utils/projectManager";
import { useBoardStore } from "./useBoardStore";
import { useCanvasStore } from "./canvasStore";
import { useUIStore } from "./useUIStore";

// ─── State shape ─────────────────────────────────────────────────────────────

interface ProjectState {
  /** All projects visible in the sidebar, sorted newest-first. */
  projectsList: ProjectMeta[];
  /** ID of the project currently open in the editor (null = unsaved new board). */
  currentProjectId: string | null;
  /** True while any async fs operation is running. */
  isBusy: boolean;
  /** True while a save is in-flight — used to prevent concurrent save corruption. */
  isSavingProcess: boolean;
  /** Last save timestamp shown in the toolbar (null = never saved). */
  lastSavedAt: number | null;

  // ── Actions ────────────────────────────────────────────────────────────────

  init: () => Promise<void>;
  refreshList: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  saveCurrentProject: () => Promise<void>;
  renameCurrentProject: (name: string) => Promise<void>;
  renameProject: (id: string, newName: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  /**
   * Save the current canvas/board state as a brand-new project with the given name.
   * Unlike createProject, this does NOT clear the board — it captures and persists the
   * existing state, then binds currentProjectId to the newly created project.
   */
  saveAsNewProject: (name: string) => Promise<void>;
  /** Clears the active project binding (sets currentProjectId to null). Called by resetWorkspace. */
  setActiveProjectId: (id: string | null) => void;
  /** Install an externally-loaded .mty file into the local workspace. */
  installImportedProject: (mty: {
    meta: { id: string; name: string; mapId: string | null; updatedAt: number };
    payload: {
      boardState: { items: unknown[]; lines: unknown[] };
      notes: string;
      floorId: string | null;
      activeFloorId?: string | null;
      activePhase?: number;
    };
  }) => Promise<void>;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectsList: [],
  currentProjectId: null,
  isBusy: false,
  isSavingProcess: false,
  lastSavedAt: null,

  // ── init ────────────────────────────────────────────────────────────────────

  init: async () => {
    console.log("[ProjectStore] init — setting up project directory");
    try {
      await initProjectDir();
      await get().refreshList();
      console.log("[ProjectStore] ✓ init complete");
    } catch (err) {
      console.error("[ProjectStore] ❌ init failed:", err);
    }
  },

  // ── refreshList ─────────────────────────────────────────────────────────────

  refreshList: async () => {
    try {
      const list = await listProjects();
      set({ projectsList: list });
      console.log(`[ProjectStore] ✓ refreshList — ${list.length} project(s)`);
    } catch (err) {
      console.error("[ProjectStore] ❌ refreshList failed:", err);
    }
  },

  // ── createProject ───────────────────────────────────────────────────────────

  createProject: async (name: string) => {
    const trimmed = name.trim() || "Untitled";
    console.log(`[ProjectStore] createProject name="${trimmed}"`);
    set({ isBusy: true });
    try {
      const id  = crypto.randomUUID();
      const now = Date.now();

      const data: ProjectData = {
        id,
        name:          trimmed,
        mapId:         null,
        floorId:       null,
        activeFloorId: null,
        activePhase:   1,
        boardState: {
          items: [], lines: [], throwableLines: [], texts: [],
          roomLabels: [], hiddenOperators: [], routeTimeMap: {}, videoMarkers: [],
          linkedVideoName: null,
        },
        notes:         "",
        updatedAt:     now,
      };

      await saveProject(data);
      console.log(`[ProjectStore] ✓ project created id=${id}`);

      // Reset board + canvas to blank state
      useBoardStore.getState().clearAll();
      useBoardStore.getState().setNotes("");
      useCanvasStore.getState().setMap("");

      set({ currentProjectId: id, lastSavedAt: now });
      await get().refreshList();
    } catch (err) {
      console.error("[ProjectStore] ❌ createProject failed:", err);
    } finally {
      set({ isBusy: false });
    }
  },

  // ── loadProject ─────────────────────────────────────────────────────────────

  loadProject: async (id: string) => {
    console.log(`[ProjectStore] loadProject id=${id}`);
    set({ isBusy: true });
    try {
      const data = await loadProject(id);
      if (!data) {
        console.error(`[ProjectStore] ❌ Project ${id} not found on disk`);
        return;
      }

      // Resolve the viewport to restore (with backwards-compat fallback)
      const items0 = data.boardState.items[0] as { floorId?: string; phase?: number } | undefined;
      const targetFloor: string | null = data.activeFloorId ?? data.floorId ?? items0?.floorId ?? null;
      const targetPhase: number        = data.activePhase   ?? items0?.phase   ?? 1;

      // Push ALL board state in one shot (reuses loadProjectData's safe-fallback logic)
      const board = useBoardStore.getState();
      board.loadProjectData({ ...data.boardState, notes: data.notes });
      board.setPhase(targetPhase);
      console.log(`[ProjectStore] ✓ board restored: ${data.boardState.items.length} items, phase=${targetPhase}`);

      // Push map / floor into canvas store atomically
      const canvas = useCanvasStore.getState();
      if (data.mapId) {
        if (targetFloor) canvas.setMapAndFloor(data.mapId, targetFloor);
        else canvas.setMap(data.mapId);
        console.log(`[ProjectStore] ✓ canvas set: map=${data.mapId} floor=${targetFloor}`);
      } else {
        canvas.setMap("");
      }

      set({ currentProjectId: id, lastSavedAt: data.updatedAt });
      useUIStore.getState().setTool("cursor");
      console.log(`[ProjectStore] ✓ loadProject complete`);
    } catch (err) {
      console.error(`[ProjectStore] ❌ loadProject failed for id=${id}:`, err);
    } finally {
      set({ isBusy: false });
    }
  },

  // ── saveCurrentProject ──────────────────────────────────────────────────────

  saveCurrentProject: async () => {
    const { currentProjectId, isSavingProcess } = get();
    if (!currentProjectId) {
      console.warn("[ProjectStore] saveCurrentProject — no project open, skipping");
      return;
    }
    if (isSavingProcess) {
      console.warn("[ProjectStore] saveCurrentProject — save already in-flight, skipping");
      return;
    }

    console.log(`[ProjectStore] saveCurrentProject id=${currentProjectId}`);
    set({ isBusy: true, isSavingProcess: true });
    try {
      const board  = useBoardStore.getState();
      const canvas = useCanvasStore.getState();

      // Retrieve the existing meta to preserve the name
      const existing = await loadProject(currentProjectId);
      if (!existing) {
        console.error(`[ProjectStore] ❌ Cannot save — project ${currentProjectId} not found on disk`);
        return;
      }

      const now = Date.now();
      const data: ProjectData = {
        ...existing,
        mapId:         canvas.currentMapId,
        floorId:       canvas.currentFloorId,
        activeFloorId: canvas.currentFloorId,
        activePhase:   board.currentPhase,
        boardState: {
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
        notes:         board.notes,
        updatedAt:     now,
      };

      await saveProject(data);
      set({ lastSavedAt: now });
      await get().refreshList();
      console.log(`[ProjectStore] ✓ saveCurrentProject complete`);
    } catch (err) {
      console.error("[ProjectStore] ❌ saveCurrentProject failed:", err);
    } finally {
      set({ isBusy: false, isSavingProcess: false });
    }
  },

  // ── renameCurrentProject ─────────────────────────────────────────────────────

  renameCurrentProject: async (name: string) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    console.log(`[ProjectStore] renameCurrentProject id=${currentProjectId} name="${name}"`);
    set({ isBusy: true });
    try {
      const existing = await loadProject(currentProjectId);
      if (!existing) return;
      await saveProject({ ...existing, name: name.trim() || existing.name, updatedAt: Date.now() });
      await get().refreshList();
      console.log(`[ProjectStore] ✓ rename complete`);
    } catch (err) {
      console.error("[ProjectStore] ❌ renameCurrentProject failed:", err);
    } finally {
      set({ isBusy: false });
    }
  },

  // ── renameProject ────────────────────────────────────────────────────────────

  renameProject: async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    console.log(`[ProjectStore] renameProject id=${id} name="${trimmed}"`);
    set({ isBusy: true });
    try {
      const existing = await loadProject(id);
      if (!existing) return;
      await saveProject({ ...existing, name: trimmed, updatedAt: Date.now() });
      await get().refreshList();
      console.log(`[ProjectStore] ✓ renameProject complete`);
    } catch (err) {
      console.error("[ProjectStore] ❌ renameProject failed:", err);
    } finally {
      set({ isBusy: false });
    }
  },

  // ── installImportedProject ───────────────────────────────────────────────────

  installImportedProject: async (mty) => {
    console.log(`[ProjectStore] installImportedProject id=${mty.meta.id}`);
    set({ isBusy: true });
    try {
      const { projectsList } = get();
      const now = Date.now();

      // Collision guard: give a fresh ID + suffix when the same UUID already exists locally
      const idExists = projectsList.some((p) => p.id === mty.meta.id);
      const id   = idExists ? crypto.randomUUID() : mty.meta.id;
      const name = idExists ? `${mty.meta.name} (Imported)` : mty.meta.name;

      // Resolve the viewport to restore (backwards-compat: old files lack activeFloorId/activePhase)
      const items0 = (mty.payload.boardState.items[0] as { floorId?: string; phase?: number } | undefined);
      const targetFloor: string | null = mty.payload.activeFloorId ?? mty.payload.floorId ?? items0?.floorId ?? null;
      const targetPhase: number        = mty.payload.activePhase   ?? items0?.phase        ?? 1;

      // Safe-coerce the imported boardState — old files may lack newer fields
      const rawBs = mty.payload.boardState as Partial<ProjectData["boardState"]> | undefined;
      const boardState: ProjectData["boardState"] = {
        items:           Array.isArray(rawBs?.items)           ? rawBs!.items!           : [],
        lines:           Array.isArray(rawBs?.lines)           ? rawBs!.lines!           : [],
        throwableLines:  Array.isArray(rawBs?.throwableLines)  ? rawBs!.throwableLines!  : [],
        texts:           Array.isArray(rawBs?.texts)           ? rawBs!.texts!           : [],
        roomLabels:      Array.isArray(rawBs?.roomLabels)      ? rawBs!.roomLabels!      : [],
        hiddenOperators: Array.isArray(rawBs?.hiddenOperators) ? rawBs!.hiddenOperators! : [],
        routeTimeMap:    (rawBs?.routeTimeMap && typeof rawBs.routeTimeMap === "object")
                           ? rawBs.routeTimeMap
                           : {},
        videoMarkers:    Array.isArray(rawBs?.videoMarkers)    ? rawBs!.videoMarkers!    : [],
        linkedVideoName: typeof rawBs?.linkedVideoName === "string" ? rawBs.linkedVideoName : null,
      };

      const data: ProjectData = {
        id,
        name,
        mapId:         mty.meta.mapId,
        floorId:       mty.payload.floorId,
        activeFloorId: targetFloor,
        activePhase:   targetPhase,
        boardState,
        notes:         mty.payload.notes ?? "",
        updatedAt:     now,
      };

      // 1. Write .mty to disk
      await saveProject(data);
      console.log(`[ProjectStore] ✓ imported project written id=${id}`);

      // 2. Push ALL board state in one shot
      const board = useBoardStore.getState();
      board.loadProjectData({ ...data.boardState, notes: data.notes });
      board.setPhase(targetPhase);

      // 3. Push canvas state
      const canvas = useCanvasStore.getState();
      if (data.mapId && targetFloor) canvas.setMapAndFloor(data.mapId, targetFloor);
      else if (data.mapId) canvas.setMap(data.mapId);
      else canvas.setMap("");

      // 4. Mark as active project
      set({ currentProjectId: id, lastSavedAt: now });
      useUIStore.getState().setTool("cursor");

      // 5. Refresh sidebar list
      await get().refreshList();
      console.log(`[ProjectStore] ✓ installImportedProject complete`);
    } catch (err) {
      console.error("[ProjectStore] ❌ installImportedProject failed:", err);
    } finally {
      set({ isBusy: false });
    }
  },

  // ── saveAsNewProject ─────────────────────────────────────────────────────────

  saveAsNewProject: async (name: string) => {
    const trimmed = name.trim() || "Untitled";
    console.log(`[ProjectStore] saveAsNewProject name="${trimmed}"`);
    set({ isBusy: true, isSavingProcess: true });
    try {
      const board  = useBoardStore.getState();
      const canvas = useCanvasStore.getState();
      const id  = crypto.randomUUID();
      const now = Date.now();
      const data: ProjectData = {
        id,
        name:          trimmed,
        mapId:         canvas.currentMapId,
        floorId:       canvas.currentFloorId,
        activeFloorId: canvas.currentFloorId,
        activePhase:   board.currentPhase,
        boardState: {
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
        notes:         board.notes,
        updatedAt:     now,
      };
      await saveProject(data);
      set({ currentProjectId: id, lastSavedAt: now });
      await get().refreshList();
      console.log(`[ProjectStore] ✓ saveAsNewProject complete id=${id}`);
    } catch (err) {
      console.error("[ProjectStore] ❌ saveAsNewProject failed:", err);
    } finally {
      set({ isBusy: false, isSavingProcess: false });
    }
  },

  // ── setActiveProjectId ───────────────────────────────────────────────────────

  setActiveProjectId: (id) => set({ currentProjectId: id }),

  // ── deleteProject ────────────────────────────────────────────────────────────

  deleteProject: async (id: string) => {
    console.log(`[ProjectStore] deleteProject id=${id}`);
    set({ isBusy: true });
    try {
      await deleteProject(id);
      console.log(`[ProjectStore] deleteProject check: deleted=${id} current=${get().currentProjectId}`);
      if (get().currentProjectId === id) {
        useBoardStore.getState().clearAll();
        useBoardStore.getState().setNotes("");
        useCanvasStore.getState().setMap("");
        set({ currentProjectId: null, lastSavedAt: null });
        console.log(`[ProjectStore] ✓ active project deleted — editor reset`);
      } else {
        console.log(`[ProjectStore] deleted non-active project — no editor reset needed`);
      }
      await get().refreshList();
      console.log(`[ProjectStore] ✓ deleteProject complete`);
    } catch (err) {
      console.error("[ProjectStore] ❌ deleteProject failed:", err);
    } finally {
      set({ isBusy: false });
    }
  },
}));
