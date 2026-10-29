import { nearestShore } from "./evaluate";
import type { ShoreGeometry } from "./geometry";
import { haversineM } from "./projection";
import type { EngineConfig, LonLat } from "./types";

export interface RouteCheck {
  /** Straight-line distance, metres. */
  distanceM: number;
  /** Initial compass bearing from `from` to `to`, degrees. */
  bearing: number;
  /** True when any point of the straight path is inside the warning band (rule + tide margin). */
  crossesBand: boolean;
  /** Closest the path comes to the shoreline, metres; null if no shoreline nearby. */
  minShoreM: number | null;
}

/** Sample spacing: fine enough that an 80 m wide band can't be stepped over. */
const MIN_STEP_M = 10;
const MAX_SAMPLES = 3000;

const DEG = Math.PI / 180;

export function initialBearing(from: LonLat, to: LonLat): number {
  const [l1, p1] = [from[0] * DEG, from[1] * DEG];
  const [l2, p2] = [to[0] * DEG, to[1] * DEG];
  const y = Math.sin(l2 - l1) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

/**
 * Checks the straight "go to" path between two points against the shoreline band.
 * Off-road desert driving has no road network, so the path is a straight line.
 */
export function checkRoute(
  from: LonLat,
  to: LonLat,
  geometry: ShoreGeometry,
  config: EngineConfig,
): RouteCheck {
  const distanceM = haversineM(from, to);
  const bandM = config.dangerMeters + config.tideMarginMeters;
  const step = Math.max(MIN_STEP_M, distanceM / MAX_SAMPLES);
  const n = Math.max(1, Math.ceil(distanceM / step));
  let minShoreM: number | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p: LonLat = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    const near = nearestShore(p, geometry, config);
    if (near && (minShoreM === null || near.distanceM < minShoreM)) minShoreM = near.distanceM;
  }
  return {
    distanceM,
    bearing: initialBearing(from, to),
    crossesBand: minShoreM !== null && minShoreM < bandM,
    minShoreM,
  };
}
