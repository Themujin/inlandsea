// The regulated stretch, as inputs to the shoreline pipeline. Coordinates are [lon, lat].

/** Overpass download box (SPEC §3 rough extent, widened a little). */
export const BBOX = { minLat: 24.5, minLon: 51.2, maxLat: 25.0, maxLon: 51.7 };

/** North end: Sealine / south of Mesaieed. */
export const NORTH_END: [number, number] = [51.578, 24.934];
/** South end: inside the Khor Al Adaid channel, Qatar-side bank. */
export const SOUTH_END: [number, number] = [51.3562, 24.5737];
/** Where the channel meets the open sea. Shore south-west of here is flagged inner: true. */
export const KHOR_MOUTH: [number, number] = [51.4187, 24.6398];

/** Endpoints must snap to the coastline within this distance, or the build fails. */
export const MAX_SNAP_M = 500;
/** Douglas–Peucker tolerance and maximum segment length (SPEC §7). */
export const SIMPLIFY_M = 2;
export const MAX_SEGMENT_M = 200;
/** Corridor half-width around the shoreline (SPEC §3: ~2 km inland). */
export const CORRIDOR_M = 2000;
