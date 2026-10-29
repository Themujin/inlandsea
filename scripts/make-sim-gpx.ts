// Writes public/sim/coastal-drive.gpx: a looping test drive along the shipped shoreline.
// Approaches from 400 m inland, holds ~20 m from the water (DANGER), backs out, and
// returns to the start well inland so the loop has no position jump.
// Re-run after the shoreline changes (M4).
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type LonLat = [number, number];
const root = path.resolve(import.meta.dirname, "..");
const R = 6_371_000;
const DEG = Math.PI / 180;

const shoreline = JSON.parse(readFileSync(path.join(root, "public/geo/shoreline.geojson"), "utf8"));
const mainShore: LonLat[] = shoreline.features.find(
  (f: { properties: { inner?: boolean } }) => !f.properties.inner,
).geometry.coordinates;

// Local metric frame around the start of the drive.
const START_LAT = 24.83;
const lat0 = START_LAT;
const lon0 = mainShore[0][0];
const kx = R * DEG * Math.cos(lat0 * DEG);
const ky = R * DEG;
const toXY = ([lon, lat]: LonLat) => [(lon - lon0) * kx, (lat - lat0) * ky];
const toLonLat = (x: number, y: number): LonLat => [lon0 + x / kx, lat0 + y / ky];

// Shoreline vertices from START_LAT southward, in metres.
const line = mainShore
  .filter(([, lat]) => lat <= START_LAT)
  .sort((a, b) => b[1] - a[1]) // north → south, whatever order the file stores
  .map(toXY);

/** Point at arc length s along the line, pushed `offset` metres inland (west side). */
function at(s: number, offset: number): LonLat {
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (s <= len || i === line.length - 2) {
      const t = Math.min(s / len, 1);
      let nx = -(by - ay) / len;
      let ny = (bx - ax) / len;
      if (nx > 0) [nx, ny] = [-nx, -ny]; // inland = west
      return toLonLat(ax + (bx - ax) * t + nx * offset, ay + (by - ay) * t + ny * offset);
    }
    s -= len;
  }
  throw new Error("empty line");
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(Math.max(t, 0), 1);
const SPEED = 8; // m/s along the shore
const points: LonLat[] = [];

// Forward leg: 0–30 s approach 400→40 m, 30–45 s 40→20 m, 45–75 s hold 20 m, 75–95 s out to 120 m.
for (let i = 0; i <= 95; i++) {
  const offset =
    i < 30 ? lerp(400, 40, i / 30) : i < 45 ? lerp(40, 20, (i - 30) / 15) : i < 75 ? 20 : lerp(20, 120, (i - 75) / 20);
  points.push(at(i * SPEED, offset));
}
// Turn inland: 120→400 m over 20 s.
const end = 95 * SPEED;
for (let i = 1; i <= 20; i++) points.push(at(end, lerp(120, 400, i / 20)));
// Return leg at 400 m back to the start.
for (let i = 1; i <= 95; i++) points.push(at(end - i * SPEED, 400));

const t0 = Date.UTC(2026, 9, 31, 6, 0, 0);
const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Shoreline Guard scripts/make-sim-gpx.ts" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Sample coastal drive (placeholder shoreline)</name><trkseg>
${points
  .map(
    ([lon, lat], i) =>
      `    <trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"><time>${new Date(t0 + i * 1000).toISOString()}</time></trkpt>`,
  )
  .join("\n")}
  </trkseg></trk>
</gpx>
`;

async function main() {
  const dir = path.join(root, "public", "sim");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "coastal-drive.gpx"), gpx);
  console.log(`Wrote ${points.length} track points to public/sim/coastal-drive.gpx`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
