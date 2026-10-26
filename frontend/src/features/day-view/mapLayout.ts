import type { LatLng } from '../../domain/types';

export type MapPoint = { x: number; y: number };

export type MapBox = { width: number; height: number; padTop: number; padRight: number; padBottom: number; padLeft: number };

const SEPARATION_PASSES = 40;

/**
 * Fits coordinates into the box, keeping north up and distances in proportion,
 * then nudges apart any pins closer than `minGap` so none hide another.
 * Stand-in for the Google map until an API key is set.
 */
export function layoutPoints(points: LatLng[], box: MapBox, minGap: number): MapPoint[] {
  if (points.length === 0) return [];
  const midLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lngScale = Math.cos((midLat * Math.PI) / 180);
  const raw = points.map((p) => ({ x: p.lng * lngScale, y: -p.lat }));

  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(Math.max(...xs) - minX, 1e-6);
  const spanY = Math.max(Math.max(...ys) - minY, 1e-6);

  const innerW = box.width - box.padLeft - box.padRight;
  const innerH = box.height - box.padTop - box.padBottom;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const offsetX = box.padLeft + (innerW - spanX * scale) / 2;
  const offsetY = box.padTop + (innerH - spanY * scale) / 2;

  const placed = raw.map((p) => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale }));

  for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= minGap) continue;
        const push = (minGap - d) / 2 / d;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }
  }

  return placed.map((p) => ({
    x: Math.min(box.width - box.padRight, Math.max(box.padLeft, p.x)),
    y: Math.min(box.height - box.padBottom, Math.max(box.padTop, p.y)),
  }));
}
