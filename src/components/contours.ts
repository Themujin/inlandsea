import { addProtocol, type Map as MlMap } from "maplibre-gl";
import mlcontour from "maplibre-contour";
import { BRAND } from "@/lib/brandColors";

// Elevation: AWS Terrain Tiles (Mapzen terrarium encoding), public and keyless.
// Contour lines are generated on the device from these tiles by maplibre-contour.
const DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const GLYPHS_URL = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

/** [minor, major] contour interval in metres by zoom. Qatar is low and flat: tight intervals. */
const THRESHOLDS: Record<number, [number, number]> = {
  10: [20, 100],
  12: [10, 50],
  13: [5, 25],
  15: [2, 10],
};

let dem: InstanceType<typeof mlcontour.DemSource> | null = null;

function demSource() {
  if (!dem) {
    dem = new mlcontour.DemSource({ url: DEM_URL, encoding: "terrarium", maxzoom: 13, worker: true });
    dem.setupMaplibre({ addProtocol } as unknown as Parameters<typeof dem.setupMaplibre>[0]);
  }
  return dem;
}

/** Adds contour lines (+ labels on major lines) below `beforeId`. */
export function addContours(map: MlMap, beforeId: string): void {
  map.addSource("contours", {
    type: "vector",
    tiles: [
      demSource().contourProtocolUrl({
        multiplier: 1,
        thresholds: THRESHOLDS,
        elevationKey: "ele",
        levelKey: "level",
        contourLayer: "contours",
      }),
    ],
    maxzoom: 15,
    attribution: "Elevation: AWS Terrain Tiles (Mapzen)",
  });
  map.addLayer(
    {
      id: "contour-lines",
      type: "line",
      source: "contours",
      "source-layer": "contours",
      paint: {
        "line-color": BRAND.foam,
        "line-opacity": ["match", ["get", "level"], 1, 0.75, 0.4],
        "line-width": ["match", ["get", "level"], 1, 1.3, 0.6],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "contour-labels",
      type: "symbol",
      source: "contours",
      "source-layer": "contours",
      filter: [">", ["get", "level"], 0],
      layout: {
        "symbol-placement": "line",
        "text-field": ["concat", ["number-format", ["get", "ele"], {}], " m"],
        "text-font": ["Open Sans Semibold"],
        "text-size": 11,
      },
      paint: { "text-color": BRAND.foam, "text-halo-color": BRAND.ink, "text-halo-width": 1.2 },
    },
    beforeId,
  );
}
