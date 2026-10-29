// Downloads drivable OSM ways (roads, tracks, 4x4 paths) in the study bbox for on-device
// routing → data/osm/roads.json (ODbL, © OpenStreetMap contributors).
// Usage: npx tsx scripts/geo/fetch-roads.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BBOX } from "./area";
import { overpass } from "./overpass";
import { ROAD_CLASSES } from "./roads-config";

async function main() {
  const [s, w, n, e] = [BBOX.minLat, BBOX.minLon, BBOX.maxLat, BBOX.maxLon];
  const classes = Object.keys(ROAD_CLASSES).join("|");
  const data = await overpass(
    `[out:json][timeout:150];way["highway"~"^(${classes})$"](${s},${w},${n},${e});out geom;`,
  );
  const ways = data.elements
    .filter((el) => el.type === "way" && el.tags?.highway)
    .map((el) => ({
      id: el.id,
      highway: el.tags!.highway,
      oneway: el.tags!.oneway ?? null,
      access: el.tags!.access ?? el.tags!.motor_vehicle ?? null,
      coords: el.geometry.map((p) => [+p.lon.toFixed(7), +p.lat.toFixed(7)]),
    }));
  const out = {
    source: "OpenStreetMap highway=* via Overpass API",
    license: "ODbL 1.0 — © OpenStreetMap contributors",
    osmBase: data.osm3s.timestamp_osm_base,
    bbox: BBOX,
    ways,
  };
  const dir = path.resolve(import.meta.dirname, "../../data/osm");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "roads.json"), JSON.stringify(out));
  console.log(`[fetch-roads] ${ways.length} ways (OSM base ${out.osmBase}) → data/osm/roads.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
