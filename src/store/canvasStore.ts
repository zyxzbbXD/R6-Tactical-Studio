import { create } from "zustand";
import { MAPS, type MapConfig, type FloorConfig, type FloorImages } from "../config/assets";

export type ViewMode = "default" | "blueprint" | "isometric";

interface AddCustomMapImagePayload {
  fileUrl: string;
  mapName: string;
  floorId: string;
  floorLabel: string;
  imageType: keyof FloorImages;
}

interface CanvasState {
  // ── Dynamic map list (starts with static MAPS, grows with custom imports) ─
  maps: MapConfig[];

  // ── Map / floor selection ──────────────────────────────────────────────────
  currentMapId: string | null;
  currentFloorId: string | null;

  // ── View mode & overlay toggles ───────────────────────────────────────────
  currentView: ViewMode;
  showVerticality: boolean;
  showRoomNames: boolean;
  showBlueprintDetails: boolean;

  // ── Derived helpers (computed on demand) ──────────────────────────────────
  currentMap: () => MapConfig | null;
  currentFloor: () => FloorConfig | null;
  currentBaseImagePath: () => string;

  // ── Actions ────────────────────────────────────────────────────────────────
  setMap: (mapId: string) => void;
  setFloor: (floorId: string) => void;
  setView: (view: ViewMode) => void;
  toggleVerticality: () => void;
  toggleRoomNames: () => void;
  toggleBlueprintDetails: () => void;
  addCustomMapImage: (payload: AddCustomMapImagePayload) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  maps: MAPS,
  currentMapId: null,
  currentFloorId: null,
  currentView: "default",
  showVerticality: false,
  showRoomNames: false,
  showBlueprintDetails: false,

  currentMap: () => {
    const { currentMapId, maps } = get();
    return maps.find((m) => m.id === currentMapId) ?? null;
  },

  currentFloor: () => {
    const { currentMapId, currentFloorId, maps } = get();
    const map = maps.find((m) => m.id === currentMapId);
    return map?.floors.find((f) => f.id === currentFloorId) ?? null;
  },

  currentBaseImagePath: () => {
    const { currentView } = get();
    const floor = get().currentFloor();
    if (!floor) return "";
    return floor.images[currentView] ?? floor.images.default ?? "";
  },

  setMap: (mapId) => {
    const map = get().maps.find((m) => m.id === mapId);
    set({
      currentMapId: mapId,
      currentFloorId: map?.floors[0]?.id ?? null,
      currentView: "default",
      showVerticality: false,
      showRoomNames: false,
    });
  },

  setFloor: (floorId) => set({ currentFloorId: floorId }),
  setView: (view) => set({ currentView: view }),
  toggleVerticality: () => set((s) => ({ showVerticality: !s.showVerticality })),
  toggleRoomNames: () => set((s) => ({ showRoomNames: !s.showRoomNames })),
  toggleBlueprintDetails: () => set((s) => ({ showBlueprintDetails: !s.showBlueprintDetails })),

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
    // Ensure there is always a default image so the floor renders
    if (!floor.images.default) floor.images.default = fileUrl;

    const isViewMode = imageType === "default" || imageType === "blueprint" || imageType === "isometric";
    set({
      maps,
      currentMapId: mapId,
      currentFloorId: floorId,
      currentView: isViewMode ? (imageType as ViewMode) : "default",
      showVerticality: imageType === "verticality",
      showRoomNames: imageType === "roomNames",
    });
  },
}));
