import { create } from "zustand";
import { MAPS, type MapConfig, type FloorConfig } from "../config/assets";

interface CanvasState {
  // ── Map / floor selection ──────────────────────────────────────────────────
  currentMapId: string | null;
  currentFloorId: string | null;

  // ── Derived helpers (computed on demand) ──────────────────────────────────
  currentMap: () => MapConfig | null;
  currentFloor: () => FloorConfig | null;

  // ── Actions ────────────────────────────────────────────────────────────────
  setMap: (mapId: string) => void;
  setFloor: (floorId: string) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  currentMapId: null,
  currentFloorId: null,

  currentMap: () => {
    const { currentMapId } = get();
    return MAPS.find((m) => m.id === currentMapId) ?? null;
  },

  currentFloor: () => {
    const { currentMapId, currentFloorId } = get();
    const map = MAPS.find((m) => m.id === currentMapId);
    return map?.floors.find((f) => f.id === currentFloorId) ?? null;
  },

  setMap: (mapId) => {
    const map = MAPS.find((m) => m.id === mapId);
    set({
      currentMapId: mapId,
      currentFloorId: map?.floors[0]?.id ?? null,
    });
  },

  setFloor: (floorId) => set({ currentFloorId: floorId }),
}));
