import { buildGeometry, type FeatureCollection, type ShoreGeometry } from "@/engine/geometry";
import type { EngineConfig } from "@/engine/types";

export interface GeoMeta {
  version: string;
  placeholder?: boolean;
  date: string;
  sources: string[];
}

export interface EngineData {
  geometry: ShoreGeometry;
  config: EngineConfig;
  meta: GeoMeta;
  /** Raw layers for the map. */
  layers: { corridor: FeatureCollection; shoreline: FeatureCollection };
}

let pending: Promise<EngineData> | null = null;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Loads geometry and thresholds once (precached by the service worker, so works offline). */
export function loadEngineData(): Promise<EngineData> {
  pending ??= (async () => {
    const [corridor, shoreline, exclusions, config, meta] = await Promise.all([
      getJson<FeatureCollection>("/geo/corridor.geojson"),
      getJson<FeatureCollection>("/geo/shoreline.geojson"),
      getJson<FeatureCollection>("/geo/exclusions.geojson"),
      getJson<EngineConfig>("/config.json"),
      getJson<GeoMeta>("/geo/meta.json"),
    ]);
    return {
      geometry: buildGeometry({ corridor, shoreline, exclusions }),
      config,
      meta,
      layers: { corridor, shoreline },
    };
  })().catch((err) => {
    pending = null;
    throw err;
  });
  return pending;
}
