// Step 1 of the shoreline pipeline (SPEC §7): download OSM natural=coastline ways in the
// study bbox and store them compactly in data/osm/coastline.json (ODbL, © OpenStreetMap contributors).
// Usage: npx tsx scripts/geo/fetch-osm.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BBOX } from "./area";

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

interface OverpassWay {
  type: "way";
  id: number;
  geometry: { lat: number; lon: number }[];
}

async function query(): Promise<{ osm3s: { timestamp_osm_base: string }; elements: OverpassWay[] }> {
  const [s, w, n, e] = [BBOX.minLat, BBOX.minLon, BBOX.maxLat, BBOX.maxLon];
  const body = new URLSearchParams({
    data: `[out:json][timeout:90];way["natural"="coastline"](${s},${w},${n},${e});out geom;`,
  });
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body,
        headers: { "User-Agent": "ShorelineGuard/0.1 (data pipeline)" },
      });
      if (res.ok) return await res.json();
      console.warn(`[fetch-osm] ${url}: HTTP ${res.status}`);
    } catch (err) {
      console.warn(`[fetch-osm] ${url}: ${(err as Error).message}`);
    }
  }
  throw new Error("All Overpass mirrors failed");
}

async function main() {
  const data = await query();
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
