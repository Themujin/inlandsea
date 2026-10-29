import type { LonLat } from "./types";

export const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

/**
 * Local equirectangular projection centred on (lon0, lat0).
 * x = R·Δλ·cos φ0, y = R·Δφ. Sub-metre error over < 1 km at 25° N.
 */
export function makeProjection(lon0: number, lat0: number) {
  const kx = EARTH_RADIUS_M * DEG * Math.cos(lat0 * DEG);
  const ky = EARTH_RADIUS_M * DEG;
  return {
    toXY(p: LonLat): [number, number] {
      return [(p[0] - lon0) * kx, (p[1] - lat0) * ky];
    },
    toLonLat(x: number, y: number): LonLat {
      return [lon0 + x / kx, lat0 + y / ky];
    },
  };
}

/** Closest point on segment AB to the origin, in projected metres. */
export function closestOnSegmentToOrigin(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return [ax, ay];
  let t = -(ax * dx + ay * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return [ax + t * dx, ay + t * dy];
}

/** Haversine distance in metres. Used for jump filtering, not classification. */
export function haversineM(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
