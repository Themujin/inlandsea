// Downloads drivable OSM ways for on-device routing → data/osm/roads.json
// (ODbL, © OpenStreetMap contributors): every drivable class (roads, tracks, 4x4 paths) in the
// coast bbox, plus sparser OUTER_TIERS (main roads) so routes can start from Doha and beyond.
// Usage: npx tsx scripts/geo/fetch-roads.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BBOX } from "./area";
import { overpass, type OverpassWay } from "./overpass";
import { OUTER_TIERS, ROAD_CLASSES } from "./roads-config";

type Box = { minLat: number; minLon: number; maxLat: number; maxLon: number };
const query = (classes: string[], b: Box) =>
  `[out:json][timeout:150];way["highway"~"^(${classes.join("|")})$"](${b.minLat},${b.minLon},${b.maxLat},${b.maxLon});out geom;`;

async function main() {
  const tiers = [{ name: "coast (all classes)", bbox: BBOX, classes: Object.keys(ROAD_CLASSES) }, ...OUTER_TIERS];
  const byId = new Map<number, OverpassWay>();
  let osmBase = "";
  for (const tier of tiers) {
    const data = await overpass(query(tier.classes, tier.bbox));
    osmBase = data.osm3s.timestamp_osm_base;
    for (const el of data.elements) if (el.type === "way" && el.tags?.highway) byId.set(el.id, el);
    console.log(`[fetch-roads] ${tier.name}: ${data.elements.length} ways`);
  }
  const ways = [...byId.values()].map((el) => ({
    id: el.id,
    highway: el.tags!.highway,
    oneway: el.tags!.oneway ?? null,
    access: el.tags!.access ?? el.tags!.motor_vehicle ?? null,
    coords: el.geometry.map((p) => [+p.lon.toFixed(7), +p.lat.toFixed(7)]),
  }));
  const out = {
    source: "OpenStreetMap highway=* via Overpass API",
    license: "ODbL 1.0 — © OpenStreetMap contributors",
    osmBase,
    tiers: tiers.map((t) => ({ name: t.name, bbox: t.bbox, classes: t.classes })),
    ways,
  };
  const dir = path.resolve(import.meta.dirname, "../../data/osm");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "roads.json"), JSON.stringify(out));
  console.log(`[fetch-roads] ${ways.length} unique ways (OSM base ${osmBase}) → data/osm/roads.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
