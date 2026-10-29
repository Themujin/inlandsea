import RBush from "rbush";
import type { LonLat, ShoreSegment } from "./types";

type Ring = LonLat[];
/** Polygon = outer ring followed by holes. */
type Polygon = Ring[];

interface GeoJSONGeometry {
  type: string;
  coordinates: unknown;
}
interface GeoJSONFeature {
  type: "Feature";
  geometry: GeoJSONGeometry | null;
  properties?: Record<string, unknown> | null;
}
export interface FeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ShoreGeometry {
  corridor: Polygon[];
  corridorBbox: Bbox;
  exclusions: Polygon[];
  index: RBush<ShoreSegment>;
  segmentCount: number;
}

function polygonsOf(fc: FeatureCollection | undefined): Polygon[] {
  if (!fc) return [];
  const out: Polygon[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") out.push(g.coordinates as Polygon);
    else if (g.type === "MultiPolygon") out.push(...(g.coordinates as Polygon[]));
  }
  return out;
}

function linesOf(fc: FeatureCollection): { line: LonLat[]; inner: boolean }[] {
  const out: { line: LonLat[]; inner: boolean }[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const inner = f.properties?.inner === true;
    if (g.type === "LineString") out.push({ line: g.coordinates as LonLat[], inner });
    else if (g.type === "MultiLineString")
      for (const line of g.coordinates as LonLat[][]) out.push({ line, inner });
  }
  return out;
}

function bboxOf(polys: Polygon[]): Bbox {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const poly of polys)
    for (const [x, y] of poly[0]) {
      if (x < b.minX) b.minX = x;
      if (y < b.minY) b.minY = y;
      if (x > b.maxX) b.maxX = x;
      if (y > b.maxY) b.maxY = y;
    }
  return b;
}

export function buildGeometry(input: {
  corridor: FeatureCollection;
  shoreline: FeatureCollection;
  exclusions?: FeatureCollection;
}): ShoreGeometry {
  const segments: ShoreSegment[] = [];
  for (const { line, inner } of linesOf(input.shoreline)) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      segments.push({
        a,
        b,
        inner,
        minX: Math.min(a[0], b[0]),
        minY: Math.min(a[1], b[1]),
        maxX: Math.max(a[0], b[0]),
        maxY: Math.max(a[1], b[1]),
      });
    }
  }
  const index = new RBush<ShoreSegment>();
  index.load(segments);
  const corridor = polygonsOf(input.corridor);
  return {
    corridor,
    corridorBbox: bboxOf(corridor),
    exclusions: polygonsOf(input.exclusions),
    index,
    segmentCount: segments.length,
  };
}

function inRing(p: LonLat, ring: Ring): boolean {
  const [x, y] = p;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inPolygon(p: LonLat, poly: Polygon): boolean {
  if (!inRing(p, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) if (inRing(p, poly[h])) return false;
  return true;
}

export function inAnyPolygon(p: LonLat, polys: Polygon[]): boolean {
  return polys.some((poly) => inPolygon(p, poly));
}

export function inBbox(p: LonLat, b: Bbox): boolean {
  return p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY;
}
