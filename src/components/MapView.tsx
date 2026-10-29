"use client";

import { AttributionControl, GeoJSONSource, Map as MlMap, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/i18n";
import { BRAND } from "@/lib/brandColors";
import { loadEngineData } from "@/lib/engineData";
import { checkRoute, type RouteCheck } from "@/engine/route";
import type { LonLat } from "@/engine/types";
import { vibrate } from "@/sensors/device";
import type { SensorFix } from "@/sensors/types";
import { useDestination } from "@/store/destination";
import { useMonitor } from "@/store/monitor";
import { GLYPHS_URL, addContours } from "./contours";
import { GoToCard } from "./GoToCard";
import { MapStatusCard } from "./MapStatusCard";

setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

const BASEMAP_KEY = "sg-satellite";
const CONTOURS_KEY = "sg-contours";
/** Long-press duration that drops a "go to" pin on touch screens. */
const LONG_PRESS_MS = 600;
const GROUND = { id: "ground", type: "background", paint: { "background-color": BRAND.ink } } as const;

/** No tiles at all: fully private and offline, just our own layers on a plain ground. */
const BLANK_STYLE: StyleSpecification = { version: 8, glyphs: GLYPHS_URL, sources: {}, layers: [GROUND] };

// Satellite imagery: Esri World Imagery. Its licence terms for this use are unconfirmed;
// check them before a public launch and swap the source here if needed.
// Offline, the tiles fail and the plain ground shows through.
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS_URL,
  sources: {
    satellite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [GROUND, { id: "satellite", type: "raster", source: "satellite" }],
};

const INITIAL_ZOOM_IN = 1;
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

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

function routeFeatures(from: SensorFix | null, to: LonLat | null, crosses: boolean) {
  const features: GeoJSON.Feature[] = [];
  if (to) features.push({ type: "Feature", properties: { kind: "dest" }, geometry: { type: "Point", coordinates: to } });
  if (from && to)
    features.push({
      type: "Feature",
      properties: { kind: "path", crosses },
      geometry: { type: "LineString", coordinates: [[from.lon, from.lat], to] },
    });
  return { type: "FeatureCollection" as const, features };
}

function readContours(): boolean {
  try {
    return localStorage.getItem(CONTOURS_KEY) === "1";
  } catch {
    return false;
  }
}

function readBasemap(): boolean {
  try {
    // On unless the viewer turned it off.
    return localStorage.getItem(BASEMAP_KEY) !== "0";
  } catch {
    return true;
  }
}

/** FR-07: corridor, shoreline, shaded 30 m band, user dot + accuracy circle. */
export default function MapView({ t }: { t: Dictionary }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [basemap, setBasemap] = useState(readBasemap);
  const [contours, setContours] = useState(readContours);
  const [follow, setFollow] = useState(false);
  const [route, setRoute] = useState<RouteCheck | null>(null);
  const destination = useDestination((s) => s.destination);
  const followRef = useRef(follow);
  const mode = useMonitor((s) => s.mode);
  const error = useMonitor((s) => s.error);
  const start = useMonitor((s) => s.start);
  const stop = useMonitor((s) => s.stop);

  useEffect(() => {
    followRef.current = follow;
    // Jump to the current position as soon as Follow is ticked, not on the next fix.
    const fix = useMonitor.getState().fix;
    if (follow && fix && mapRef.current)
      mapRef.current.easeTo({ center: [fix.lon, fix.lat], zoom: Math.max(mapRef.current.getZoom(), 16) });
  }, [follow]);

  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;
    const map = new MlMap({
      container: container.current,
      style: basemap ? SATELLITE_STYLE : BLANK_STYLE,
      center: [51.47, 24.77],
      zoom: 9,
      attributionControl: false,
    });
    // Top-left so the imagery credit never sits under the legend panel.
    // Always shown: our shoreline layer is OSM-derived (ODbL), whether or not imagery is on.
    map.addControl(
      new AttributionControl({ compact: true, customAttribution: "Shoreline © OpenStreetMap contributors" }),
      "top-left",
    );
    mapRef.current = map;
    Promise.all([loadEngineData(), map.once("load")]).then(([data]) => {
      if (cancelled) return;
      const lat = (data.geometry.corridorBbox.minY + data.geometry.corridorBbox.maxY) / 2;
      map.addSource("corridor", { type: "geojson", data: data.layers.corridor as GeoJSON.FeatureCollection });
      map.addSource("shoreline", { type: "geojson", data: data.layers.shoreline as GeoJSON.FeatureCollection });
      map.addSource("user", { type: "geojson", data: userFeatures(null, null) });
      map.addSource("route", { type: "geojson", data: EMPTY_FC });

      map.addLayer({ id: "corridor-fill", type: "fill", source: "corridor", paint: { "fill-color": BRAND.lagoon, "fill-opacity": 0.12 } });
      map.addLayer({
        id: "corridor-line",
        type: "line",
        source: "corridor",
        paint: { "line-color": BRAND.lagoon, "line-width": 1.5, "line-dasharray": [3, 2] },
      });
      // Warning distance (rule + tide margin) each side of the line = a stroke twice as wide.
      map.addLayer({
        id: "band",
        type: "line",
        source: "shoreline",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": BRAND.alert,
          "line-opacity": 0.35,
          "line-width": metresToPixels(2 * (data.config.dangerMeters + data.config.tideMarginMeters), lat),
        },
      });
      // Dark casing keeps the sand-coloured line readable over bright desert imagery.
      map.addLayer({
        id: "shoreline-casing",
        type: "line",
        source: "shoreline",
        paint: { "line-color": BRAND.ink, "line-width": 4, "line-opacity": 0.6 },
      });
      map.addLayer({
        id: "shoreline",
        type: "line",
        source: "shoreline",
        paint: { "line-color": BRAND.sand, "line-width": 2 },
      });
      map.addLayer({
        id: "path",
        type: "line",
        source: "route",
        filter: ["==", ["get", "kind"], "path"],
        layout: { "line-cap": "round" },
        paint: {
          "line-color": ["case", ["get", "crosses"], BRAND.alert, BRAND.lagoon],
          "line-width": 3,
          "line-dasharray": [2, 1.5],
        },
      });
      map.addLayer({
        id: "dest",
        type: "circle",
        source: "route",
        filter: ["==", ["get", "kind"], "dest"],
        paint: { "circle-radius": 9, "circle-color": BRAND.sand, "circle-stroke-color": BRAND.ink, "circle-stroke-width": 3 },
      });
      if (contours) addContours(map, "corridor-fill");
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
      // Open a step closer than the whole stretch; the ends are a pan away.
      map.jumpTo({ zoom: map.getZoom() + INITIAL_ZOOM_IN });
      // Start the credit collapsed to its (i) button so it does not cover the status card.
      container.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      map.setMaxBounds([b.minX - 0.3, b.minY - 0.3, b.maxX + 0.3, b.maxY + 0.3]);

      // Straight "go to" path from the current fix, checked against the shore band.
      const pushRoute = () => {
        const fix = useMonitor.getState().fix;
        const dest = useDestination.getState().destination;
        const check = fix && dest ? checkRoute([fix.lon, fix.lat], dest, data.geometry, data.config) : null;
        setRoute(check);
        (map.getSource("route") as GeoJSONSource | undefined)?.setData(
          routeFeatures(fix, dest, check?.crossesBand ?? false),
        );
      };
      const push = () => {
        const { fix, result } = useMonitor.getState();
        (map.getSource("user") as GeoJSONSource | undefined)?.setData(
          userFeatures(fix, result?.nearestPoint ?? null),
        );
        pushRoute();
        if (fix && followRef.current) map.easeTo({ center: [fix.lon, fix.lat], zoom: Math.max(map.getZoom(), 16) });
      };
      push();
      const offFix = useMonitor.subscribe((s, prev) => {
        if (s.fix !== prev.fix) push();
      });
      const offDest = useDestination.subscribe(pushRoute);

      // Long-press (touch) or right-click (desktop) marks the destination.
      const mark = (ll: { lng: number; lat: number }) => {
        useDestination.getState().setDestination([ll.lng, ll.lat]);
        vibrate(40);
      };
      let pressTimer: ReturnType<typeof setTimeout> | undefined;
      const cancelPress = () => clearTimeout(pressTimer);
      map.on("touchstart", (e) => {
        cancelPress();
        if (e.points.length === 1) pressTimer = setTimeout(() => mark(e.lngLat), LONG_PRESS_MS);
      });
      map.on("touchend", cancelPress);
      map.on("touchmove", cancelPress);
      map.on("dragstart", cancelPress);
      map.on("contextmenu", (e) => mark(e.lngLat));

      map.once("remove", () => {
        offFix();
        offDest();
        cancelPress();
      });
    });

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, [basemap, contours]);

  const toggleBasemap = () => {
    const next = !basemap;
    try {
      localStorage.setItem(BASEMAP_KEY, next ? "1" : "0");
    } catch {}
    setBasemap(next);
  };

  const toggleContours = () => {
    const next = !contours;
    try {
      localStorage.setItem(CONTOURS_KEY, next ? "1" : "0");
    } catch {}
    setContours(next);
  };

  // Starting from the map means driving: follow the car by default.
  const startDriving = () => {
    setFollow(true);
    start("gps");
  };

  return (
    <div className="relative flex-1">
      {/* maplibre-gl.css forces position: relative on the map element, so size it from a wrapper. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" data-testid="map" />
      </div>

      {mode && <MapStatusCard t={t} />}

      <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-card bg-[var(--app-bg)]/90 p-3 text-sm shadow-lg backdrop-blur">
        {destination && <GoToCard t={t} route={route} monitoring={!!mode} />}
        {/* The map is the home screen, so monitoring can start right here. */}
        {mode ? (
          <button
            type="button"
            onClick={stop}
            className="rounded-button border border-line px-5 py-2 text-base font-semibold"
          >
            {t.stop}
          </button>
        ) : (
          <button
            type="button"
            onClick={startDriving}
            className="rounded-button bg-sea px-5 py-3 text-lg font-bold text-foam shadow dark:bg-lagoon dark:text-ink"
          >
            {t.start}
          </button>
        )}
        {error && !mode && <p className="font-semibold text-state-danger-strong">{t.errors[error]}</p>}
        {/* While driving, keep the panel small: the map and status card matter most. */}
        {!mode && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Legend swatch={<span className="h-1 w-5 rounded bg-sand" />} label={t.map.legendShore} />
            <Legend swatch={<span className="h-3 w-5 rounded bg-alert/40" />} label={t.map.legendBand} />
            <Legend
              swatch={<span className="h-3 w-5 rounded border border-dashed border-lagoon bg-lagoon/15" />}
              label={t.map.legendCorridor}
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            {t.map.follow}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={basemap} onChange={toggleBasemap} />
            {t.map.basemap}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={contours} onChange={toggleContours} />
            {t.map.contours}
          </label>
        </div>
        {!destination && !mode && <p className="text-xs text-muted">{t.goto.hint}</p>}
        {basemap && !mode && <p className="text-xs text-muted">{t.map.basemapNote}</p>}
        {contours && !mode && <p className="text-xs text-muted">{t.map.contoursNote}</p>}
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
