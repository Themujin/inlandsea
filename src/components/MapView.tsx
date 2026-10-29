"use client";

import { AttributionControl, GeoJSONSource, Map as MlMap, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/i18n";
import { BRAND } from "@/lib/brandColors";
import { loadEngineData, loadRoads } from "@/lib/engineData";
import type { RoadGraph } from "@/engine/roads";
import { type GoToPlan, planGoTo } from "@/engine/route";
import type { LonLat } from "@/engine/types";
import { vibrate } from "@/sensors/device";
import type { SensorFix } from "@/sensors/types";
import { useDestination } from "@/store/destination";
import { useMonitor } from "@/store/monitor";
import { GoToCard } from "./GoToCard";
import { MapStatusCard } from "./MapStatusCard";

setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

const BASEMAP_KEY = "sg-satellite";
/** Long-press duration that drops a "go to" pin on touch screens. */
const LONG_PRESS_MS = 600;
const GROUND = { id: "ground", type: "background", paint: { "background-color": BRAND.ink } } as const;

/** No tiles at all: fully private and offline, just our own layers on a plain ground. */
const BLANK_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [GROUND] };

// Satellite imagery: Esri World Imagery. Its licence terms for this use are unconfirmed;
// check them before a public launch and swap the source here if needed.
// Offline, the tiles fail and the plain ground shows through.
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
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

function routeFeatures(to: LonLat | null, plan: GoToPlan | null) {
  const features: GeoJSON.Feature[] = [];
  if (to) features.push({ type: "Feature", properties: { kind: "dest" }, geometry: { type: "Point", coordinates: to } });
  if (plan)
    features.push({
      type: "Feature",
      properties: { kind: "path", crosses: plan.crossesBand },
      geometry: { type: "LineString", coordinates: plan.coords },
    });
  return { type: "FeatureCollection" as const, features };
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
  const [follow, setFollow] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [route, setRoute] = useState<GoToPlan | null>(null);
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
      // Solid with a dark casing, so the route never reads as the dashed corridor outline.
      map.addLayer({
        id: "path-casing",
        type: "line",
        source: "route",
        filter: ["==", ["get", "kind"], "path"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": BRAND.ink, "line-width": 7, "line-opacity": 0.7 },
      });
      map.addLayer({
        id: "path",
        type: "line",
        source: "route",
        filter: ["==", ["get", "kind"], "path"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["case", ["get", "crosses"], BRAND.alert, BRAND.lagoon],
          "line-width": 4,
        },
      });
      map.addLayer({
        id: "dest",
        type: "circle",
        source: "route",
        filter: ["==", ["get", "kind"], "dest"],
        paint: { "circle-radius": 9, "circle-color": BRAND.sand, "circle-stroke-color": BRAND.ink, "circle-stroke-width": 3 },
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
      // Open a step closer than the whole stretch; the ends are a pan away.
      map.jumpTo({ zoom: map.getZoom() + INITIAL_ZOOM_IN });
      // Start the credit collapsed to its (i) button so it does not cover the status card.
      container.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      map.setMaxBounds([b.minX - 0.3, b.minY - 0.3, b.maxX + 0.3, b.maxY + 0.3]);

      // "Go to" plan from the current fix: roads and tracks when the network is loaded and
      // nearby, otherwise a straight line; off-road parts are checked against the shore band.
      // The network is only loaded once a destination exists (it is ~0.7 MB to parse and index).
      let roads: RoadGraph | null = null;
      let roadsRequested = false;
      const pushRoute = () => {
        const fix = useMonitor.getState().fix;
        const dest = useDestination.getState().destination;
        if (dest && !roadsRequested) {
          roadsRequested = true;
          void loadRoads().then((graph) => {
            if (cancelled) return;
            roads = graph;
            pushRoute();
          });
        }
        const plan = fix && dest ? planGoTo([fix.lon, fix.lat], dest, data.geometry, data.config, roads) : null;
        setRoute(plan);
        (map.getSource("route") as GeoJSONSource | undefined)?.setData(routeFeatures(dest, plan));
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
      // Layers and handlers are in place (used by e2e tests to avoid racing the load).
      container.current?.setAttribute("data-ready", "true");

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
  }, [basemap]);

  const toggleBasemap = () => {
    const next = !basemap;
    try {
      localStorage.setItem(BASEMAP_KEY, next ? "1" : "0");
    } catch {}
    setBasemap(next);
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

      <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2">
        {layersOpen && (
          <div
            id="map-layers"
            className="flex flex-col gap-2 rounded-card bg-[var(--app-bg)]/95 p-3 text-sm shadow-lg backdrop-blur"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Legend swatch={<span className="h-1 w-5 rounded bg-sand" />} label={t.map.legendShore} />
              <Legend swatch={<span className="h-3 w-5 rounded bg-alert/40" />} label={t.map.legendBand} />
              <Legend
                swatch={<span className="h-3 w-5 rounded border border-dashed border-lagoon bg-lagoon/15" />}
                label={t.map.legendCorridor}
              />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={basemap} onChange={toggleBasemap} />
              {t.map.basemap}
            </label>
            {basemap && <p className="text-xs text-muted">{t.map.basemapNote}</p>}
            <p className="text-xs text-muted">{t.goto.hint}</p>
          </div>
        )}

        {destination && <GoToCard t={t} route={route} monitoring={!!mode} />}
        {error && !mode && (
          <p className="rounded-card bg-[var(--app-bg)]/95 px-3 py-2 text-sm font-semibold text-state-danger-strong shadow-lg">
            {t.errors[error]}
          </p>
        )}

        {/* One slim bar: the map is the home screen, so monitoring starts right here. */}
        <div className="flex items-center gap-2">
          {mode ? (
            <button
              type="button"
              onClick={stop}
              className="h-12 flex-1 rounded-button bg-[var(--app-bg)]/95 px-5 font-semibold shadow-lg backdrop-blur"
            >
              {t.stop}
            </button>
          ) : (
            <button
              type="button"
              onClick={startDriving}
              className="h-12 flex-1 rounded-button bg-sea px-5 text-lg font-bold text-foam shadow-lg dark:bg-lagoon dark:text-ink"
            >
              {t.start}
            </button>
          )}
          <RoundButton label={t.map.follow} pressed={follow} onClick={() => setFollow(!follow)}>
            {/* Crosshair */}
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
          </RoundButton>
          <RoundButton
            label={t.map.layers}
            pressed={layersOpen}
            controls="map-layers"
            onClick={() => setLayersOpen(!layersOpen)}
          >
            {/* Stacked layers */}
            <path d="M12 3 2 8l10 5 10-5-10-5Z" fill="currentColor" />
            <path d="m2 12 10 5 10-5M2 16l10 5 10-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </RoundButton>
        </div>
      </div>
    </div>
  );
}

interface RoundButtonProps {
  label: string;
  pressed: boolean;
  controls?: string;
  onClick: () => void;
  children: React.ReactNode;
}

/** 48 px round map control with an icon; the label is for screen readers and tooltips. */
function RoundButton({ label, pressed, controls, onClick, children }: RoundButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-controls={controls}
      onClick={onClick}
      className={`grid size-12 shrink-0 place-items-center rounded-full shadow-lg backdrop-blur ${
        pressed ? "bg-lagoon text-ink" : "bg-[var(--app-bg)]/95 text-fg"
      }`}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
    </button>
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
