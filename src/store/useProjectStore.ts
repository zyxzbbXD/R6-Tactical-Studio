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

// ─── State shape ─────────────────────────────────────────────────────────────

interface ProjectState {
  /** All projects visible in the sidebar, sorted newest-first. */
  projectsList: ProjectMeta[];
  /** ID of the project currently open in the editor (null = unsaved new board). */
  currentProjectId: string | null;
  /** True while any async fs operation is running. */
  isBusy: boolean;
  /** Last save timestamp shown in the toolbar (null = never saved). */
  lastSavedAt: number | null;

  // ── Actions ────────────────────────────────────────────────────────────────

  init: () => Promise<void>;
  refreshList: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  saveCurrentProject: () => Promise<void>;
  renameCurrentProject: (name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectsList: [],
  currentProjectId: null,
  isBusy: false,
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
        name:       trimmed,
        mapId:      null,
        floorId:    null,
        boardState: { items: [], lines: [] },
        notes:      "",
        updatedAt:  now,
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

      // Push state into board store
      const board = useBoardStore.getState();
      board.clearAll();
      data.boardState.items.forEach((item) => board.addItem(item));
      data.boardState.lines.forEach((line) => board.addLine(line));
      board.setNotes(data.notes);
      console.log(`[ProjectStore] ✓ board restored: ${data.boardState.items.length} items, ${data.boardState.lines.length} lines`);

      // Push map / floor into canvas store
      const canvas = useCanvasStore.getState();
      if (data.mapId) {
        canvas.setMap(data.mapId);
        if (data.floorId) canvas.setFloor(data.floorId);
        console.log(`[ProjectStore] ✓ canvas set: map=${data.mapId} floor=${data.floorId}`);
      } else {
        canvas.setMap("");
      }

      set({ currentProjectId: id, lastSavedAt: data.updatedAt });
      console.log(`[ProjectStore] ✓ loadProject complete`);
    } catch (err) {
      console.error(`[ProjectStore] ❌ loadProject failed for id=${id}:`, err);
    } finally {
      set({ isBusy: false });
    }
  },

  // ── saveCurrentProject ──────────────────────────────────────────────────────

  saveCurrentProject: async () => {
    const { currentProjectId } = get();
    if (!currentProjectId) {
      console.warn("[ProjectStore] saveCurrentProject — no project open, skipping");
      return;
    }
    console.log(`[ProjectStore] saveCurrentProject id=${currentProjectId}`);
    set({ isBusy: true });
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
        mapId:      canvas.currentMapId,
        floorId:    canvas.currentFloorId,
        boardState: { items: board.items, lines: board.lines },
        notes:      board.notes,
        updatedAt:  now,
      };

      await saveProject(data);
      set({ lastSavedAt: now });
      await get().refreshList();
      console.log(`[ProjectStore] ✓ saveCurrentProject complete`);
    } catch (err) {
      console.error("[ProjectStore] ❌ saveCurrentProject failed:", err);
    } finally {
      set({ isBusy: false });
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
