import { inAnyPolygon, inBbox, type ShoreGeometry } from "./geometry";
import { closestOnSegmentToOrigin, makeProjection } from "./projection";
import type { EngineConfig, Fix, LonLat, ZoneResult, ZoneState } from "./types";

const EMPTY = {
  distanceM: null,
  effectiveM: null,
  nearestPoint: null,
  bearingInland: null,
  excluded: false,
} as const;

/** Search box grows by this factor until a segment is found or the cap is hit. */
const SEARCH_GROWTH = 4;
const SEARCH_STEPS = 3;
/** Below this the user is on the line and the inland direction is undefined. */
const ON_LINE_M = 0.01;

export function classify(effectiveM: number, config: EngineConfig): ZoneState {
  if (effectiveM < config.dangerMeters) return "DANGER";
  if (effectiveM < config.cautionMeters) return "CAUTION";
  return "SAFE";
}

/**
 * Pure, per-fix zone evaluation (no smoothing). See docs/SPEC.md §4.
 * `now` is injectable for tests; defaults to the wall clock.
 */
export function evaluate(
  fix: Fix,
  geometry: ShoreGeometry,
  config: EngineConfig,
  now: number = Date.now(),
): ZoneResult {
  const accuracyM = Number.isFinite(fix.accuracy) ? fix.accuracy : null;

  // 1. Accept the fix.
  if (
    accuracyM === null ||
    accuracyM > config.maxAccuracyMeters ||
    now - fix.timestamp > config.maxFixAgeMs
  ) {
    return { state: "NO_FIX", accuracyM, ...EMPTY };
  }

  // 2. Corridor test.
  const p: LonLat = [fix.lon, fix.lat];
  if (!inBbox(p, geometry.corridorBbox) || !inAnyPolygon(p, geometry.corridor)) {
    return { state: "OUT_OF_AREA", accuracyM, ...EMPTY };
  }

  // 3–4. Candidate segments, then nearest point in a local projection centred on the user.
  const proj = makeProjection(fix.lon, fix.lat);
  let best = Infinity;
  let bx = 0;
  let by = 0;
  let d = config.searchDegrees;
  for (let step = 0; step < SEARCH_STEPS && best === Infinity; step++, d *= SEARCH_GROWTH) {
    const candidates = geometry.index.search({
      minX: fix.lon - d,
      minY: fix.lat - d,
      maxX: fix.lon + d,
      maxY: fix.lat + d,
    });
    for (const s of candidates) {
      if (s.inner && !config.includeInnerShore) continue;
      const [ax, ay] = proj.toXY(s.a);
      const [sx, sy] = proj.toXY(s.b);
      const [cx, cy] = closestOnSegmentToOrigin(ax, ay, sx, sy);
      const dist2 = cx * cx + cy * cy;
      if (dist2 < best) {
        best = dist2;
        bx = cx;
        by = cy;
      }
    }
  }

  const excluded = geometry.exclusions.length > 0 && inAnyPolygon(p, geometry.exclusions);

  if (best === Infinity) {
    // No shoreline anywhere near: inside the corridor but far from the water.
    return { ...EMPTY, state: "SAFE", accuracyM, excluded };
  }

  const distanceM = Math.sqrt(best);
  // 5. Accuracy-adjusted distance: assume the worst case within the error radius, and that
  // the waterline has moved tideMarginMeters landward of the mapped shoreline.
  const effectiveM =
    distanceM - Math.min(accuracyM, config.accuracyCapMeters) - config.tideMarginMeters;
  // 8. Inland bearing: vector from nearest shore point (bx, by) to the user (origin).
  const bearingInland =
    distanceM > ON_LINE_M ?((Math.atan2(-bx, -by) * 180) / Math.PI + 360) % 360 : null;

  return {
    state: excluded ? "SAFE" : classify(effectiveM, config),
    distanceM,
    effectiveM,
    nearestPoint: proj.toLonLat(bx, by),
    bearingInland,
    accuracyM,
    excluded,
  };
}
