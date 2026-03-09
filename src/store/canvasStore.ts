import { create } from "zustand";
import { MAPS, type MapConfig, type FloorConfig, type FloorImages } from "../config/assets";

export type ViewMode = "default" | "blueprint" | "isometric";
export type OverlayKey = "vert" | "props" | "stairs" | "names";

interface AddCustomMapImagePayload {
  fileUrl: string;
  mapName: string;
  floorId: string;
  floorLabel: string;
  imageType: keyof FloorImages;
}

interface CanvasState {
  // ── Dynamic map list ──────────────────────────────────────────────────────
  maps: MapConfig[];

  // ── Map / floor selection ──────────────────────────────────────────────────
  currentMapId: string | null;
  currentFloorId: string | null;

  // ── View mode & overlay toggles ───────────────────────────────────────────
  currentView: ViewMode;
  overlays: Record<OverlayKey, boolean>;
  blueprintScaleMode: "default" | "standard";

  // ── Derived helpers (computed on demand) ──────────────────────────────────
  currentMap: () => MapConfig | null;
  currentFloor: () => FloorConfig | null;

  // ── Actions ────────────────────────────────────────────────────────────────
  setMap: (mapId: string) => void;
  setFloor: (floorId: string) => void;
  setView: (view: ViewMode) => void;
  toggleOverlay: (key: OverlayKey) => void;
  setBlueprintScaleMode: (mode: "default" | "standard") => void;
  addCustomMapImage: (payload: AddCustomMapImagePayload) => void;
}

const DEFAULT_OVERLAYS: Record<OverlayKey, boolean> = {
  vert: false, props: false, stairs: false, names: false,
};

export const useCanvasStore = create<CanvasState>((set, get) => ({
  maps: MAPS,
  currentMapId: null,
  currentFloorId: null,
  currentView: "default",
  overlays: { ...DEFAULT_OVERLAYS },
  blueprintScaleMode: "default",

  currentMap: () => {
    const { currentMapId, maps } = get();
    return maps.find((m) => m.id === currentMapId) ?? null;
  },

  currentFloor: () => {
    const { currentMapId, currentFloorId, maps } = get();
    const map = maps.find((m) => m.id === currentMapId);
    return map?.floors.find((f) => f.id === currentFloorId) ?? null;
  },

  setMap: (mapId) => {
    const map = get().maps.find((m) => m.id === mapId);
    set({
      currentMapId: mapId,
      currentFloorId: map?.floors[0]?.id ?? null,
      currentView: "default",
      overlays: { ...DEFAULT_OVERLAYS },
    });
  },

  setFloor: (floorId) => set({ currentFloorId: floorId }),
  setView: (view) => set({ currentView: view }),
  setBlueprintScaleMode: (mode) => set({ blueprintScaleMode: mode }),
  toggleOverlay: (key) =>
    set((s) => ({ overlays: { ...s.overlays, [key]: !s.overlays[key] } })),

  addCustomMapImage: ({ fileUrl, mapName, floorId, floorLabel, imageType }) => {
    // Deep-copy the maps array so we can mutate freely
    const maps: MapConfig[] = get().maps.map((m) => ({
      ...m,
      floors: m.floors.map((f) => ({ ...f, images: { ...f.images } })),
    }));

    const mapId = `custom-${mapName.toLowerCase().replace(/\s+/g, "-")}`;
    let mapIdx = maps.findIndex((m) => m.id === mapId);
    if (mapIdx === -1) {
      maps.push({ id: mapId, name: mapName, floors: [] });
      mapIdx = maps.length - 1;
    }

    const targetMap = maps[mapIdx];
    let floorIdx = targetMap.floors.findIndex((f) => f.id === floorId);
    if (floorIdx === -1) {
      targetMap.floors.push({ id: floorId, label: floorLabel, images: { default: fileUrl } });
      floorIdx = targetMap.floors.length - 1;
    }

    const floor = targetMap.floors[floorIdx];
    floor.images[imageType] = fileUrl;
    if (!floor.images.default) floor.images.default = fileUrl;

    const isViewMode = imageType === "default" || imageType === "blueprint" || imageType === "isometric";
    const newOverlays = { ...DEFAULT_OVERLAYS };
    if (imageType === "verticality") newOverlays.vert = true;
    if (imageType === "roomNames")   newOverlays.names = true;

    set({
      maps,
      currentMapId: mapId,
      currentFloorId: floorId,
      currentView: isViewMode ? (imageType as ViewMode) : "default",
      overlays: newOverlays,
    });
  },
}));
