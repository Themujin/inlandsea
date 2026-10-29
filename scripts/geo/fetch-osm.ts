// Step 1 of the shoreline pipeline (SPEC §7): download OSM natural=coastline ways in the
// study bbox and store them compactly in data/osm/coastline.json (ODbL, © OpenStreetMap contributors).
// Usage: npx tsx scripts/geo/fetch-osm.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BBOX } from "./area";
import { overpass } from "./overpass";

async function main() {
  const [s, w, n, e] = [BBOX.minLat, BBOX.minLon, BBOX.maxLat, BBOX.maxLon];
  const data = await overpass(`[out:json][timeout:90];way["natural"="coastline"](${s},${w},${n},${e});out geom;`);
  const ways = data.elements
    .filter((el) => el.type === "way")
    .map((el) => ({
      id: el.id,
      coords: el.geometry.map((p) => [+p.lon.toFixed(7), +p.lat.toFixed(7)]),
    }));
  const out = {
    source: "OpenStreetMap natural=coastline via Overpass API",
    license: "ODbL 1.0 — © OpenStreetMap contributors",
    osmBase: data.osm3s.timestamp_osm_base,
    bbox: BBOX,
    ways,
  };
  const dir = path.resolve(import.meta.dirname, "../../data/osm");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "coastline.json"), JSON.stringify(out));
  console.log(`[fetch-osm] ${ways.length} ways (OSM base ${out.osmBase}) → data/osm/coastline.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
