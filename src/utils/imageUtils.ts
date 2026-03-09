export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * Scan a transparent PNG for its non-transparent pixel bounding box.
 * Downscales by 10× before scanning for performance.
 */
export function getBlueprintBoundingBox(img: HTMLImageElement): BoundingBox {
  const SCALE = 10;
  const sw = Math.max(1, Math.floor(img.naturalWidth  / SCALE));
  const sh = Math.max(1, Math.floor(img.naturalHeight / SCALE));

  const canvas = document.createElement("canvas");
  canvas.width  = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, sw, sh);

  const { data } = ctx.getImageData(0, 0, sw, sh);

  let minX = sw, maxX = 0, minY = sh, maxY = 0;
  const ALPHA_THRESHOLD = 10;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const alpha = data[(y * sw + x) * 4 + 3];
      if (alpha > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fallback: if nothing found, return full image bounds
  if (minX > maxX || minY > maxY) {
    return {
      minX: 0, maxX: img.naturalWidth,
      minY: 0, maxY: img.naturalHeight,
      width: img.naturalWidth, height: img.naturalHeight,
      centerX: img.naturalWidth / 2, centerY: img.naturalHeight / 2,
    };
  }

  // Scale back to original image coordinates
  const ox = minX * SCALE;
  const oy = minY * SCALE;
  const ow = (maxX - minX) * SCALE;
  const oh = (maxY - minY) * SCALE;

  return {
    minX: ox,
    maxX: ox + ow,
    minY: oy,
    maxY: oy + oh,
    width: ow,
    height: oh,
    centerX: ox + ow / 2,
    centerY: oy + oh / 2,
  };
}
