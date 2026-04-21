/**
 * projectManager.ts
 *
 * All project I/O goes through this file.
 *
 * File layout under $APPDATA/R6TacticalStudio/:
 *   projects_index.json — lightweight array of ProjectMeta (O(1) list reads)
 *   {id}.mty            — single-file project: version + meta + boardState + notes
 *
 * Tauri v2 plugin-fs is used for every fs operation so the app stays
 * sandboxed within the AppData scope declared in capabilities/default.json.
 */

import {
  mkdir,
  readTextFile,
  writeTextFile,
  exists,
  remove,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import type {
  BoardItem,
  DrawnLine,
  ThrowableLine,
  TextNode,
  RoomLabel,
  VideoMarker,
} from "../store/useBoardStore";
import type { ViewMode } from "../store/canvasStore";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Lightweight metadata stored in the global index and used by the sidebar. */
export interface ProjectMeta {
  id: string;
  name: string;
  mapId: string | null;
  updatedAt: number; // unix ms
}

/** Complete board state that is persisted inside a .mty file. */
export interface PersistedBoardState {
  items:            BoardItem[];
  lines:            DrawnLine[];
  throwableLines:   ThrowableLine[];
  texts:            TextNode[];
  roomLabels:       RoomLabel[];
  hiddenOperators:  string[];
  routeTimeMap:     Record<string, Record<number, number>>;
  videoMarkers:     VideoMarker[];
  /** Original filename of the video linked to this board, used for Media-Offline detection on load. */
  linkedVideoName:  string | null;
}

/** Full project state (board + notes combined). */
export interface ProjectData {
  id: string;
  name: string;
  mapId: string | null;
  floorId: string | null;
  /** The floor that was active when the project was last saved. */
  activeFloorId: string | null;
  /** The phase (1-4) that was active when the project was last saved. */
  activePhase: number;
  /** The view mode (default/blueprint/isometric) that was active at save time. */
  activeView?: ViewMode;
  boardState: PersistedBoardState;
  notes: string;
  updatedAt: number; // unix ms
}

/** On-disk format for a .mty file. */
interface MtyFile {
  version: string;
  meta: ProjectMeta;
  payload: {
    boardState: PersistedBoardState;
    notes: string;
    floorId: string | null;
    /** Active floor at save time — used to restore viewport on load. */
    activeFloorId: string | null;
    /** Active phase (1-4) at save time — used to restore viewport on load. */
    activePhase: number;
    /** Active view mode at save time — used to lock the view on load. */
    activeView?: ViewMode;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MTY_VERSION = "1.0";
const DIR         = "R6TacticalStudio";
const INDEX_PATH  = `${DIR}/projects_index.json`;

// ─── Path helpers ─────────────────────────────────────────────────────────────

function mtyPath(id: string) { return `${DIR}/${id}.mty`; }

// ─── Index helpers ────────────────────────────────────────────────────────────

async function readIndex(): Promise<ProjectMeta[]> {
  try {
    const indexExists = await exists(INDEX_PATH, { baseDir: BaseDirectory.AppData });
    if (!indexExists) return [];
    const raw = await readTextFile(INDEX_PATH, { baseDir: BaseDirectory.AppData });
    return JSON.parse(raw) as ProjectMeta[];
  } catch (err) {
    console.warn(`[PM] Could not read index — returning []:`, err);
    return [];
  }
}

async function writeIndex(index: ProjectMeta[]): Promise<void> {
  await writeTextFile(INDEX_PATH, JSON.stringify(index, null, 2), {
    baseDir: BaseDirectory.AppData,
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Call once on app startup.
 * Creates R6TacticalStudio/ inside $APPDATA if it doesn't already exist.
 */
export async function initProjectDir(): Promise<void> {
  console.log(`[PM] initProjectDir — checking ${DIR} in $APPDATA`);
  try {
    const dirExists = await exists(DIR, { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      console.log(`[PM] Directory not found — creating ${DIR}`);
      await mkdir(DIR, { baseDir: BaseDirectory.AppData, recursive: true });
      console.log(`[PM] ✓ Directory created`);
    } else {
      console.log(`[PM] ✓ Directory already exists`);
    }
  } catch (err) {
    console.error(`[PM] ❌ initProjectDir failed:`, err);
    throw err;
  }
}

/**
 * Persist a project to disk as a single {id}.mty file,
 * then upsert its metadata in projects_index.json.
 */
export async function saveProject(data: ProjectData): Promise<void> {
  const path = mtyPath(data.id);
  console.log(`[PM] saveProject id=${data.id} name="${data.name}"`);

  const mty: MtyFile = {
    version: MTY_VERSION,
    meta: {
      id:        data.id,
      name:      data.name,
      mapId:     data.mapId,
      updatedAt: data.updatedAt,
    },
    payload: {
      boardState:    data.boardState,
      notes:         data.notes ?? "",
      floorId:       data.floorId,
      activeFloorId: data.activeFloorId,
      activePhase:   data.activePhase,
      activeView:    data.activeView,
    },
  };

  try {
    await writeTextFile(path, JSON.stringify(mty, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
    console.log(`[PM] ✓ .mty written`);

    // ── Upsert entry in global index ─────────────────────────────────────
    const index   = await readIndex();
    const idx     = index.findIndex((m) => m.id === data.id);
    const updated = idx >= 0
      ? [...index.slice(0, idx), mty.meta, ...index.slice(idx + 1)]
      : [...index, mty.meta];
    updated.sort((a, b) => b.updatedAt - a.updatedAt);
    await writeIndex(updated);
    console.log(`[PM] ✓ index updated (${updated.length} project(s))`);
  } catch (err) {
    console.error(`[PM] ❌ saveProject failed for id=${data.id}:`, err);
    throw err;
  }
}

/**
 * Load a project from its {id}.mty file.
 * Returns null if the file doesn't exist or JSON is malformed.
 */
export async function loadProject(id: string): Promise<ProjectData | null> {
  const path = mtyPath(id);
  console.log(`[PM] loadProject id=${id}`);

  try {
    const fileExists = await exists(path, { baseDir: BaseDirectory.AppData });
    if (!fileExists) {
      console.warn(`[PM] .mty file not found for id=${id}`);
      return null;
    }

    const raw = await readTextFile(path, { baseDir: BaseDirectory.AppData });
    const mty = JSON.parse(raw) as MtyFile;
    console.log(`[PM] ✓ .mty loaded: name="${mty.meta.name}"`);

    // Backwards-compat: old files may lack fields added in later versions.
    const bs = mty.payload.boardState as Partial<PersistedBoardState> | undefined;
    const items = bs?.items as Array<{ floorId?: string; phase?: number }> | undefined;
    const boardState: PersistedBoardState = {
      items:           Array.isArray(bs?.items)           ? bs!.items!           : [],
      lines:           Array.isArray(bs?.lines)           ? bs!.lines!           : [],
      throwableLines:  Array.isArray(bs?.throwableLines)  ? bs!.throwableLines!  : [],
      texts:           Array.isArray(bs?.texts)           ? bs!.texts!           : [],
      roomLabels:      Array.isArray(bs?.roomLabels)      ? bs!.roomLabels!      : [],
      hiddenOperators: Array.isArray(bs?.hiddenOperators) ? bs!.hiddenOperators! : [],
      routeTimeMap:    (bs?.routeTimeMap && typeof bs.routeTimeMap === "object")
                         ? bs.routeTimeMap
                         : {},
      videoMarkers:    Array.isArray(bs?.videoMarkers)    ? bs!.videoMarkers!    : [],
      linkedVideoName: typeof bs?.linkedVideoName === "string" ? bs.linkedVideoName : null,
    };
    // Validate the stored view mode — guard against stale or corrupted values.
    const storedView = mty.payload.activeView;
    const activeView: ViewMode | undefined =
      storedView === "default" || storedView === "blueprint" || storedView === "isometric"
        ? storedView
        : undefined;

    return {
      id:            mty.meta.id,
      name:          mty.meta.name,
      mapId:         mty.meta.mapId,
      floorId:       mty.payload.floorId,
      activeFloorId: mty.payload.activeFloorId ?? mty.payload.floorId ?? items?.[0]?.floorId ?? null,
      activePhase:   mty.payload.activePhase   ?? items?.[0]?.phase   ?? 1,
      activeView,
      boardState,
      notes:         mty.payload.notes ?? "",
      updatedAt:     mty.meta.updatedAt,
    };
  } catch (err) {
    console.error(`[PM] ❌ loadProject failed for id=${id}:`, err);
    return null;
  }
}

/**
 * Return metadata for every project, newest-first.
 * Reads only the lightweight projects_index.json — O(1) regardless of
 * how many projects exist.
 */
export async function listProjects(): Promise<ProjectMeta[]> {
  console.log(`[PM] listProjects — reading index`);
  const index = await readIndex();
  index.sort((a, b) => b.updatedAt - a.updatedAt);
  console.log(`[PM] ✓ found ${index.length} project(s)`);
  return index;
}

/**
 * Delete {id}.mty and remove its entry from projects_index.json.
 */
export async function deleteProject(id: string): Promise<void> {
  const path = mtyPath(id);
  console.log(`[PM] deleteProject id=${id}`);

  try {
    const fileExists = await exists(path, { baseDir: BaseDirectory.AppData });
    if (fileExists) {
      await remove(path, { baseDir: BaseDirectory.AppData });
      console.log(`[PM] ✓ deleted $APPDATA/${path}`);
    } else {
      console.log(`[PM] skip (not found): $APPDATA/${path}`);
    }
  } catch (err) {
    console.warn(`[PM] Could not delete $APPDATA/${path}:`, err);
  }

  // ── Remove from index ──────────────────────────────────────────────────
  try {
    const index   = await readIndex();
    const updated = index.filter((m) => m.id !== id);
    await writeIndex(updated);
    console.log(`[PM] ✓ index updated after delete (${updated.length} project(s))`);
  } catch (err) {
    console.warn(`[PM] Could not update index after delete for id=${id}:`, err);
  }
}
