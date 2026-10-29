// Which OSM highway classes the router may use, and how much it prefers each.
// Cost = length × factor; lower is preferred. Paths are often 4x4 trails in Qatari OSM data,
// so they are allowed but ranked below tracks.
export const ROAD_CLASSES: Record<string, number> = {
  motorway: 0.6,
  motorway_link: 0.6,
  trunk: 0.6,
  trunk_link: 0.6,
  primary: 0.65,
  primary_link: 0.65,
  secondary: 0.7,
  secondary_link: 0.7,
  tertiary: 0.75,
  tertiary_link: 0.75,
  unclassified: 0.85,
  residential: 0.9,
  road: 0.9,
  service: 0.95,
  track: 1.0,
  path: 1.4,
};

/** Access values that rule a way out for private vehicles. */
export const NO_ACCESS = new Set(["no", "private"]);

/** Geometry simplification for drawing routes (metres). */
export const ROAD_SIMPLIFY_M = 4;

type Box = { minLat: number; minLon: number; maxLat: number; maxLon: number };

/**
 * Extra, sparser road tiers beyond the coast bbox so routes can start from Doha and the
 * rest of Qatar: each tier adds only the listed classes inside its box.
 */
export const OUTER_TIERS: { name: string; bbox: Box; classes: string[] }[] = [
  {
    name: "Qatar main roads",
    bbox: { minLat: 24.4, minLon: 50.7, maxLat: 26.2, maxLon: 51.7 },
    classes: ["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"],
  },
  {
    name: "Doha south to Sealine",
    bbox: { minLat: 24.4, minLon: 50.75, maxLat: 25.45, maxLon: 51.65 },
    classes: ["secondary", "secondary_link", "tertiary", "tertiary_link"],
  },
];
