/**
 * projectManager.ts
 *
 * All project I/O goes through this file.
 *
 * File layout under $APPDATA/R6TacticalStudio/:
 *   {id}_meta.json  — board state, map/floor selection, timestamps
 *   {id}_notes.md   — plain markdown tactical notes
 *
 * Tauri v2 plugin-fs is used for every fs operation so the app stays
 * sandboxed within the AppData scope declared in capabilities/default.json.
 */

import {
  mkdir,
  readDir,
  readTextFile,
  writeTextFile,
  exists,
  remove,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import type { BoardItem, DrawnLine } from "../store/useBoardStore";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Full project state (board + notes combined). */
export interface ProjectData {
  id: string;
  name: string;
  mapId: string | null;
  floorId: string | null;
  boardState: {
    items: BoardItem[];
    lines: DrawnLine[];
  };
  notes: string;
  updatedAt: number; // unix ms
}

/**
 * What is persisted in {id}_meta.json.
 * Notes are NOT stored here — they live in {id}_notes.md.
 */
interface MetaFile {
  id: string;
  name: string;
  mapId: string | null;
  floorId: string | null;
  boardState: {
    items: BoardItem[];
    lines: DrawnLine[];
  };
  updatedAt: number;
}

/** Lightweight version stored in the list sidebar (no boardState / notes). */
export interface ProjectMeta {
  id: string;
  name: string;
  mapId: string | null;
  updatedAt: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DIR = "R6TacticalStudio";

// ─── Path helpers ─────────────────────────────────────────────────────────────

function metaPath(id: string)  { return `${DIR}/${id}_meta.json`; }
function notesPath(id: string) { return `${DIR}/${id}_notes.md`;  }

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
 * Persist a project to disk.
 * Writes {id}_meta.json and {id}_notes.md independently.
 */
export async function saveProject(data: ProjectData): Promise<void> {
  const mp = metaPath(data.id);
  const np = notesPath(data.id);
  console.log(`[PM] saveProject id=${data.id} name="${data.name}"`);
  console.log(`[PM]   meta  → $APPDATA/${mp}`);
  console.log(`[PM]   notes → $APPDATA/${np}`);

  try {
    // ── Write meta ──────────────────────────────────────────────────────────
    const meta: MetaFile = {
      id:         data.id,
      name:       data.name,
      mapId:      data.mapId,
      floorId:    data.floorId,
      boardState: data.boardState,
      updatedAt:  data.updatedAt,
    };
    await writeTextFile(mp, JSON.stringify(meta, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
    console.log(`[PM] ✓ meta written (${JSON.stringify(meta).length} bytes)`);

    // ── Write notes ─────────────────────────────────────────────────────────
    await writeTextFile(np, data.notes ?? "", {
      baseDir: BaseDirectory.AppData,
    });
    console.log(`[PM] ✓ notes written (${(data.notes ?? "").length} chars)`);
  } catch (err) {
    console.error(`[PM] ❌ saveProject failed for id=${data.id}:`, err);
    throw err;
  }
}

/**
 * Load a project from disk by id.
 * Returns null if the meta file doesn't exist or JSON is malformed.
 * A missing notes file is treated as empty string (not an error).
 */
export async function loadProject(id: string): Promise<ProjectData | null> {
  const mp = metaPath(id);
  const np = notesPath(id);
  console.log(`[PM] loadProject id=${id}`);
  console.log(`[PM]   meta  → $APPDATA/${mp}`);
  console.log(`[PM]   notes → $APPDATA/${np}`);

  try {
    // ── Read meta ───────────────────────────────────────────────────────────
    const metaExists = await exists(mp, { baseDir: BaseDirectory.AppData });
    if (!metaExists) {
      console.warn(`[PM] meta file not found for id=${id}`);
      return null;
    }
    const rawMeta = await readTextFile(mp, { baseDir: BaseDirectory.AppData });
    const meta = JSON.parse(rawMeta) as MetaFile;
    console.log(`[PM] ✓ meta loaded: name="${meta.name}"`);

    // ── Read notes (optional) ───────────────────────────────────────────────
    let notes = "";
    try {
      const notesExists = await exists(np, { baseDir: BaseDirectory.AppData });
      if (notesExists) {
        notes = await readTextFile(np, { baseDir: BaseDirectory.AppData });
        console.log(`[PM] ✓ notes loaded (${notes.length} chars)`);
      } else {
        console.log(`[PM] notes file absent — defaulting to ""`);
      }
    } catch (notesErr) {
      console.warn(`[PM] Could not read notes for id=${id} — defaulting to "":`, notesErr);
    }

    return {
      id:         meta.id,
      name:       meta.name,
      mapId:      meta.mapId,
      floorId:    meta.floorId,
      boardState: meta.boardState,
      notes,
      updatedAt:  meta.updatedAt,
    };
  } catch (err) {
    console.error(`[PM] ❌ loadProject failed for id=${id}:`, err);
    return null;
  }
}

/**
 * Return metadata for every project in the folder, newest-first.
 * Reads only *_meta.json files.
 */
export async function listProjects(): Promise<ProjectMeta[]> {
  console.log(`[PM] listProjects — scanning $APPDATA/${DIR}/`);
  try {
    const entries = await readDir(DIR, { baseDir: BaseDirectory.AppData });
    const metas: ProjectMeta[] = [];

    for (const entry of entries) {
      if (!entry.name?.endsWith("_meta.json")) continue;
      try {
        const raw  = await readTextFile(`${DIR}/${entry.name}`, { baseDir: BaseDirectory.AppData });
        const data = JSON.parse(raw) as MetaFile;
        metas.push({ id: data.id, name: data.name, mapId: data.mapId, updatedAt: data.updatedAt });
      } catch (e) {
        console.warn(`[PM] Skipping corrupt meta file "${entry.name}":`, e);
      }
    }

    metas.sort((a, b) => b.updatedAt - a.updatedAt);
    console.log(`[PM] ✓ found ${metas.length} project(s)`);
    return metas;
  } catch (err) {
    console.error(`[PM] ❌ listProjects failed:`, err);
    return [];
  }
}

/**
 * Delete both files for a project (ignore "not found" errors).
 */
export async function deleteProject(id: string): Promise<void> {
  const mp = metaPath(id);
  const np = notesPath(id);
  console.log(`[PM] deleteProject id=${id}`);

  for (const path of [mp, np]) {
    try {
      const fileExists = await exists(path, { baseDir: BaseDirectory.AppData });
      if (fileExists) {
        await remove(path, { baseDir: BaseDirectory.AppData });
        console.log(`[PM] ✓ deleted $APPDATA/${path}`);
      } else {
        console.log(`[PM] skip (not found): $APPDATA/${path}`);
      }
    } catch (err) {
      // Non-fatal — log and continue
      console.warn(`[PM] Could not delete $APPDATA/${path}:`, err);
    }
  }
}
