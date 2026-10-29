/** [lon, lat] in WGS84 degrees, GeoJSON order. */
export type LonLat = [number, number];

export interface Fix {
  lat: number;
  lon: number;
  /** Horizontal accuracy radius, metres (68% confidence). */
  accuracy: number;
  /** Ground speed, m/s. `null` when the device does not report it. */
  speed: number | null;
  /** Epoch milliseconds. */
  timestamp: number;
}

/** Mirrors public/config.json. Values live only there. */
export interface EngineConfig {
  dangerMeters: number;
  cautionMeters: number;
  /** Safety margin for tides: the waterline may sit this far landward of the mapped line. */
  tideMarginMeters: number;
  exitMarginMeters: number;
  maxAccuracyMeters: number;
  accuracyCapMeters: number;
  maxFixAgeMs: number;
  enterFixes: number;
  exitFixes: number;
  maxSpeedMps: number;
  parkedSpeedMps: number;
  parkedAfterMs: number;
  searchDegrees: number;
  includeInnerShore: boolean;
}

export type ZoneState = "DANGER" | "CAUTION" | "SAFE" | "OUT_OF_AREA" | "NO_FIX";

export interface ZoneResult {
  state: ZoneState;
  /** Distance to nearest shoreline, metres. `null` when not computed. */
  distanceM: number | null;
  /** distance − min(accuracy, accuracyCap) − tideMargin. Used for classification. */
  effectiveM: number | null;
  nearestPoint: LonLat | null;
  /** Compass bearing (deg from north) pointing from the shoreline to the user, i.e. inland. */
  bearingInland: number | null;
  accuracyM: number | null;
  /** Inside a confirmed-exempt area (exclusions layer). */
  excluded: boolean;
}

export interface ShoreSegment {
  a: LonLat;
  b: LonLat;
  inner: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
