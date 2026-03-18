import type { MapConfig } from "../config/assets";

/**
 * Hidden HTML preloader — forces the browser to download and cache every
 * image asset for the currently-selected map so that Konva's use-image hook
 * resolves from RAM (0ms) when switching floors or triggering Undo, preventing
 * the white-flash that would otherwise appear while the GPU re-uploads textures.
 *
 * Rendered outside the Konva Stage so it doesn't affect Canvas hit-graph perf.
 */
export default function MapPreloader({ currentMap }: { currentMap: MapConfig | null }) {
  if (!currentMap) return null;

  const urls: string[] = [];
  for (const floor of currentMap.floors) {
    const { default: def, blueprint, isometric, verticality, roomNames, props, stairs } = floor.images;
    if (def)          urls.push(def);
    if (blueprint)    urls.push(blueprint);
    if (isometric)    urls.push(isometric);
    if (verticality)  urls.push(verticality);
    if (roomNames)    urls.push(roomNames);
    if (props)        urls.push(props);
    if (stairs)       urls.push(stairs);
  }

  return (
    <div style={{ display: "none" }} aria-hidden="true">
      {urls.map((url) => (
        <img key={url} src={url} alt="" />
      ))}
    </div>
  );
}
