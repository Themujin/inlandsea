// Writes PLACEHOLDER geometry to public/geo/ so the app runs before the real
// pipeline (M4: fetch-osm → clip → simplify → validate → build-meta) exists.
// Hand-approximated from satellite imagery; positions may be off by hundreds of metres.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type LonLat = [number, number];

const outDir = path.resolve(import.meta.dirname, "..", "public", "geo");
const R = 6_371_000;
const DEG = Math.PI / 180;

// Sealine (north) → Khor Al Adaid mouth (south), open-sea shore.
const MAIN: LonLat[] = [
  [51.535, 24.93],
  [51.52, 24.89],
  [51.505, 24.85],
  [51.495, 24.81],
  [51.485, 24.77],
  [51.47, 24.73],
  [51.455, 24.69],
  [51.44, 24.655],
  [51.42, 24.63],
];

// Khor Al Adaid inner (lagoon) shore, flagged inner: true.
const INNER: LonLat[] = [
  [51.42, 24.63],
  [51.39, 24.62],
  [51.36, 24.61],
];

const CORRIDOR: LonLat[] = [
  ...MAIN.slice(0, 8).map(([x, y]): LonLat => [x + 0.006, y]),
  [51.43, 24.6],
  [51.35, 24.59],
  [51.35, 24.64],
  ...MAIN.slice(0, 8)
    .reverse()
    .map(([x, y]): LonLat => [x - 0.022, y]),
];
CORRIDOR.push(CORRIDOR[0]);

const round = (p: LonLat): LonLat => [+p[0].toFixed(6), +p[1].toFixed(6)];

/** Insert vertices so no segment exceeds maxM metres. */
function densify(line: LonLat[], maxM = 200): LonLat[] {
  const out: LonLat[] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    const dx = (x1 - x0) * DEG * R * Math.cos(((y0 + y1) / 2) * DEG);
    const dy = (y1 - y0) * DEG * R;
    const n = Math.ceil(Math.hypot(dx, dy) / maxM);
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out.map(round);
}

const fc = (features: object[]) => ({ type: "FeatureCollection", features });

const files: Record<string, object> = {
  "corridor.geojson": fc([
    {
      type: "Feature",
      properties: { name: "Sealine – Khor Al Adaid regulated corridor (placeholder)" },
      geometry: { type: "Polygon", coordinates: [CORRIDOR.map(round)] },
    },
  ]),
  "shoreline.geojson": fc([
    {
      type: "Feature",
      properties: { name: "Open-sea shore (placeholder)", inner: false },
      geometry: { type: "LineString", coordinates: densify(MAIN) },
    },
    {
      type: "Feature",
      properties: { name: "Khor Al Adaid inner shore (placeholder)", inner: true },
      geometry: { type: "LineString", coordinates: densify(INNER) },
    },
  ]),
  "exclusions.geojson": fc([]),
};

async function main() {
  await mkdir(outDir, { recursive: true });
  const hashes: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) {
    const text = JSON.stringify(data);
    await writeFile(path.join(outDir, name), text);
    hashes[name] = createHash("sha256").update(text).digest("hex");
  }
  const meta = {
    version: "0.0.0-placeholder",
    placeholder: true,
    date: new Date().toISOString().slice(0, 10),
    sources: ["Hand-approximated placeholder. Replace via the M4 data pipeline."],
    sha256: hashes,
  };
  await writeFile(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log(`Wrote placeholder geometry to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
