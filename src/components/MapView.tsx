"use client";

import { GeoJSONSource, Map as MlMap, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/i18n";
import { BRAND } from "@/lib/brandColors";
import { loadEngineData } from "@/lib/engineData";
import { formatDistance } from "@/lib/format";
import type { SensorFix } from "@/sensors/types";
import { useMonitor } from "@/store/monitor";

setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const BASEMAP_KEY = "sg-basemap";
/** Offline, private default: no tiles at all, just our own layers on a plain ground. */
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "ground", type: "background", paint: { "background-color": BRAND.ink } }],
};

const BAND_M = 30;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

/** Line width in px that spans `metres` on the ground at `lat` (MapLibre uses 512 px tiles). */
function metresToPixels(metres: number, lat: number) {
  const px = (zoom: number) =>
    metres / ((EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom));
  return ["interpolate", ["exponential", 2], ["zoom"], 6, px(6), 22, px(22)] as unknown as number;
}

function circle(lon: number, lat: number, radiusM: number, steps = 48): [number, number][] {
  const dLat = radiusM / 111_195;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
  });
}

function userFeatures(fix: SensorFix | null, nearest: [number, number] | null) {
  if (!fix) return { type: "FeatureCollection" as const, features: [] };
  const features: GeoJSON.Feature[] = [
    {
      type: "Feature",
      properties: { kind: "accuracy" },
      geometry: { type: "Polygon", coordinates: [circle(fix.lon, fix.lat, fix.accuracy)] },
    },
    { type: "Feature", properties: { kind: "user" }, geometry: { type: "Point", coordinates: [fix.lon, fix.lat] } },
  ];
  if (nearest)
    features.push({
      type: "Feature",
      properties: { kind: "nearest" },
      geometry: { type: "LineString", coordinates: [nearest, [fix.lon, fix.lat]] },
    });
  return { type: "FeatureCollection" as const, features };
}

function readBasemap(): boolean {
  try {
    return localStorage.getItem(BASEMAP_KEY) === "1";
  } catch {
    return false;
  }
}

/** FR-07: corridor, shoreline, shaded 30 m band, user dot + accuracy circle. */
export default function MapView({ t }: { t: Dictionary }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [basemap, setBasemap] = useState(readBasemap);
  const [follow, setFollow] = useState(false);
  const followRef = useRef(follow);
  const result = useMonitor((s) => s.result);
  const mode = useMonitor((s) => s.mode);

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;
    const map = new MlMap({
      container: container.current,
      style: basemap ? BASEMAP_STYLE : BLANK_STYLE,
      center: [51.47, 24.77],
      zoom: 9,
      attributionControl: basemap ? { compact: true } : false,
    });
    mapRef.current = map;
    Promise.all([loadEngineData(), map.once("load")]).then(([data]) => {
      if (cancelled) return;
      const lat = (data.geometry.corridorBbox.minY + data.geometry.corridorBbox.maxY) / 2;
      map.addSource("corridor", { type: "geojson", data: data.layers.corridor as GeoJSON.FeatureCollection });
      map.addSource("shoreline", { type: "geojson", data: data.layers.shoreline as GeoJSON.FeatureCollection });
      map.addSource("user", { type: "geojson", data: userFeatures(null, null) });

      map.addLayer({ id: "corridor-fill", type: "fill", source: "corridor", paint: { "fill-color": BRAND.lagoon, "fill-opacity": 0.12 } });
      map.addLayer({
        id: "corridor-line",
        type: "line",
        source: "corridor",
        paint: { "line-color": BRAND.lagoon, "line-width": 1.5, "line-dasharray": [3, 2] },
      });
      // 30 m each side of the line = a 60 m wide stroke.
      map.addLayer({
        id: "band",
        type: "line",
        source: "shoreline",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": BRAND.alert, "line-opacity": 0.35, "line-width": metresToPixels(2 * BAND_M, lat) },
      });
      map.addLayer({
        id: "shoreline",
        type: "line",
        source: "shoreline",
        paint: { "line-color": BRAND.sand, "line-width": 2 },
      });
      map.addLayer({
        id: "accuracy",
        type: "fill",
        source: "user",
        filter: ["==", ["get", "kind"], "accuracy"],
        paint: { "fill-color": BRAND.lagoon, "fill-opacity": 0.2 },
      });
      map.addLayer({
        id: "nearest",
        type: "line",
        source: "user",
        filter: ["==", ["get", "kind"], "nearest"],
        paint: { "line-color": BRAND.foam, "line-width": 1.5, "line-dasharray": [2, 2] },
      });
      map.addLayer({
        id: "user",
        type: "circle",
        source: "user",
        filter: ["==", ["get", "kind"], "user"],
        paint: {
          "circle-radius": 7,
          "circle-color": BRAND.lagoon,
          "circle-stroke-color": BRAND.foam,
          "circle-stroke-width": 3,
        },
      });

      const b = data.geometry.corridorBbox;
      map.fitBounds([b.minX, b.minY, b.maxX, b.maxY], { padding: 24, duration: 0 });
      map.setMaxBounds([b.minX - 0.3, b.minY - 0.3, b.maxX + 0.3, b.maxY + 0.3]);

      const push = () => {
        const { fix, result } = useMonitor.getState();
        (map.getSource("user") as GeoJSONSource | undefined)?.setData(
          userFeatures(fix, result?.nearestPoint ?? null),
        );
        if (fix && followRef.current) map.easeTo({ center: [fix.lon, fix.lat], zoom: Math.max(map.getZoom(), 16) });
      };
      push();
      const unsubscribe = useMonitor.subscribe((s, prev) => {
        if (s.fix !== prev.fix) push();
      });
      map.once("remove", unsubscribe);
    });

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, [basemap]);

  const toggleBasemap = () => {
    const next = !basemap;
    try {
      localStorage.setItem(BASEMAP_KEY, next ? "1" : "0");
    } catch {}
    setBasemap(next);
  };

  const state = result?.state;
  return (
    <div className="relative flex-1">
      {/* maplibre-gl.css forces position: relative on the map element, so size it from a wrapper. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" data-testid="map" />
      </div>

      {mode && state && (
        <div className="absolute inset-x-3 top-3 flex justify-center">
          <span
            data-state={state}
            className={`rounded-button px-4 py-2 font-bold shadow-lg ${
              state === "DANGER"
                ? "bg-state-danger-strong text-white"
                : state === "CAUTION"
                  ? "bg-state-caution text-ink"
                  : state === "SAFE"
                    ? "bg-state-safe-strong text-white"
                    : "bg-state-idle-strong text-white"
            }`}
          >
            {t.states[state]}
            {result?.distanceM !== null && result?.distanceM !== undefined && ` · ${formatDistance(result.distanceM, t)}`}
          </span>
        </div>
      )}

      <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-card bg-[var(--app-bg)]/90 p-3 text-sm shadow-lg backdrop-blur">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Legend swatch={<span className="h-1 w-5 rounded bg-sand" />} label={t.map.legendShore} />
          <Legend swatch={<span className="h-3 w-5 rounded bg-alert/40" />} label={t.map.legendBand} />
          <Legend swatch={<span className="h-3 w-5 rounded border border-dashed border-lagoon bg-lagoon/15" />} label={t.map.legendCorridor} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            {t.map.follow}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={basemap} onChange={toggleBasemap} />
            {t.map.basemap}
          </label>
        </div>
        {basemap && <p className="text-xs text-muted">{t.map.basemapNote}</p>}
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-2">
      {swatch}
      {label}
    </span>
  );
}
