import config from "../../../public/config.json";
import { buildGeometry, type FeatureCollection } from "../geometry";
import { EARTH_RADIUS_M } from "../projection";
import type { EngineConfig, Fix, LonLat } from "../types";

/** The shipped config, tide margin included. */
export const SHIPPED_CONFIG: EngineConfig = config;
/** Shipped config with no tide margin, so threshold tests read as the plain 30/60 m rule. */
export const CONFIG: EngineConfig = { ...config, tideMarginMeters: 0 };
export const NOW = 1_800_000_000_000;

/** Synthetic straight N–S shoreline at lon 51.5; sea to the east, land to the west. */
export const SHORE_LON = 51.5;
export const LAT = 24.8;
/** Inner (lagoon) shore, flagged inner: true, 2 km west of the main line. */
export const INNER_LON = 51.48;

const DEG = Math.PI / 180;
export const metresToDegLon = (m: number, lat = LAT) =>
  m / (EARTH_RADIUS_M * DEG * Math.cos(lat * DEG));

/** Split a straight N–S line into ≤ 200 m segments like the real pipeline does. */
function nsLine(lon: number, lat0: number, lat1: number): LonLat[] {
  const step = 200 / (EARTH_RADIUS_M * DEG);
  const pts: LonLat[] = [];
  for (let lat = lat0; lat < lat1; lat += step) pts.push([lon, lat]);
  pts.push([lon, lat1]);
  return pts;
}

const corridor: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [51.46, 24.7],
            [51.51, 24.7],
            [51.51, 24.9],
            [51.46, 24.9],
            [51.46, 24.7],
          ],
        ],
      },
    },
  ],
};

const shoreline: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: nsLine(SHORE_LON, 24.7, 24.9) },
    },
    {
      type: "Feature",
      properties: { inner: true },
      geometry: { type: "LineString", coordinates: nsLine(INNER_LON, 24.75, 24.85) },
    },
  ],
};

export const GEOMETRY = buildGeometry({ corridor, shoreline });

/** Fix `metres` west (inland) of the main shoreline. Negative = in the water. */
export function fixAt(metres: number, opts: Partial<Fix> = {}): Fix {
  const lat = opts.lat ?? LAT;
  return {
    lat,
    lon: SHORE_LON - metresToDegLon(metres, lat),
    accuracy: 5,
    speed: 10,
    timestamp: NOW,
    ...opts,
  };
}
