// Steps 2–5 of the shoreline pipeline (SPEC §7): stitch → trim → simplify → split →
// corridor → validate → write public/geo/*.geojson + meta.json.
// Input: data/osm/coastline.json (run fetch-osm.ts first). Usage: npx tsx scripts/geo/build.ts
import buffer from "@turf/buffer";
import { lineString } from "@turf/helpers";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CORRIDOR_M,
  KHOR_MOUTH,
  MAX_SEGMENT_M,
  MAX_SNAP_M,
  NORTH_END,
  SIMPLIFY_M,
  SOUTH_END,
} from "./area";

type LonLat = [number, number];
const root = path.resolve(import.meta.dirname, "../..");
const R = 6_371_000;
const DEG = Math.PI / 180;

const distM = (a: LonLat, b: LonLat) => {
  const kx = R * DEG * Math.cos(((a[1] + b[1]) / 2) * DEG);
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * R * DEG);
};
const key = (p: LonLat) => `${p[0]},${p[1]}`;
const round = (p: LonLat): LonLat => [+p[0].toFixed(6), +p[1].toFixed(6)];

/** Join ways that share endpoints into the longest possible lines. */
function stitch(ways: LonLat[][]): LonLat[][] {
  const lines = ways.map((w) => [...w]);
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < lines.length && !merged; i++) {
      for (let j = 0; j < lines.length && !merged; j++) {
        if (i === j || key(lines[i].at(-1)!) !== key(lines[j][0])) continue;
        lines[i] = [...lines[i], ...lines[j].slice(1)];
        lines.splice(j, 1);
        merged = true;
      }
    }
  }
  return lines;
}

function nearestIndex(line: LonLat[], p: LonLat): { i: number; d: number } {
  let best = { i: -1, d: Infinity };
  line.forEach((q, i) => {
    const d = distM(p, q);
    if (d < best.d) best = { i, d };
  });
  return best;
}

/** Douglas–Peucker in local metres. */
function simplify(line: LonLat[], tol: number): LonLat[] {
  if (line.length < 3) return line;
  const lat0 = line[0][1];
  const kx = R * DEG * Math.cos(lat0 * DEG);
  const xy = line.map(([x, y]) => [x * kx, y * R * DEG]);
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1;
    let farD = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / len;
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** Insert vertices so no segment exceeds maxM. */
function split(line: LonLat[], maxM: number): LonLat[] {
  const out: LonLat[] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const n = Math.ceil(distM(a, b) / maxM);
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

function fail(msg: string): never {
  throw new Error(`[geo] validation failed: ${msg}`);
}

async function main() {
  const raw = JSON.parse(readFileSync(path.join(root, "data/osm/coastline.json"), "utf8"));
  const lines = stitch(raw.ways.map((w: { coords: LonLat[] }) => w.coords));

  // Pick the stitched line that passes both ends of the regulated stretch.
  const scored = lines.map((line) => ({ line, n: nearestIndex(line, NORTH_END), s: nearestIndex(line, SOUTH_END) }));
  const pick = scored.find((c) => c.n.d <= MAX_SNAP_M && c.s.d <= MAX_SNAP_M);
  if (!pick) fail(`no coastline passes within ${MAX_SNAP_M} m of both ends`);
  const [from, to] = [pick.s.i, pick.n.i].sort((a, b) => a - b);
  let coast = pick.line.slice(from, to + 1);
  if (distM(coast[0], SOUTH_END) > distM(coast[0], NORTH_END)) coast = coast.reverse(); // south → north

  const mouth = nearestIndex(coast, KHOR_MOUTH);
  if (mouth.d > MAX_SNAP_M) fail(`Khor mouth is ${mouth.d.toFixed(0)} m from the coastline`);

  const inner = split(simplify(coast.slice(0, mouth.i + 1), SIMPLIFY_M), MAX_SEGMENT_M).map(round);
  const open = split(simplify(coast.slice(mouth.i), SIMPLIFY_M), MAX_SEGMENT_M).map(round);

  // Corridor: buffer around the whole stretch, then thin its outline.
  const full = [...inner, ...open.slice(1)];
  const buffered = buffer(lineString(full), CORRIDOR_M / 1000, { units: "kilometers", steps: 8 });
  if (!buffered || buffered.geometry.type !== "Polygon") fail("corridor buffer is not a single polygon");
  // A closed ring has equal ends, which degenerates Douglas–Peucker: simplify two halves.
  const outline = buffered.geometry.coordinates[0] as LonLat[];
  const mid = Math.floor(outline.length / 2);
  const ring = [...simplify(outline.slice(0, mid + 1), 25), ...simplify(outline.slice(mid), 25).slice(1)].map(round);
  if (ring.length < 4 || key(ring[0]) !== key(ring.at(-1)!)) fail("corridor ring is degenerate");

  // Validate (SPEC §7): connected line, segment lengths, ends snapped.
  for (const part of [inner, open])
    for (let i = 1; i < part.length; i++) {
      const d = distM(part[i - 1], part[i]);
      if (d > MAX_SEGMENT_M + 1) fail(`segment of ${d.toFixed(0)} m > ${MAX_SEGMENT_M} m`);
    }
  if (key(inner.at(-1)!) !== key(open[0])) fail("inner and open shore do not connect");

  const fc = (features: object[]) => ({ type: "FeatureCollection", features });
  const files: Record<string, object> = {
    "shoreline.geojson": fc([
      {
        type: "Feature",
        properties: { name: "Open-sea shore, Sealine – Khor Al Adaid mouth", inner: false },
        geometry: { type: "LineString", coordinates: open },
      },
      {
        type: "Feature",
        properties: { name: "Khor Al Adaid channel shore (Qatar side)", inner: true },
        geometry: { type: "LineString", coordinates: inner },
      },
    ]),
    "corridor.geojson": fc([
      {
        type: "Feature",
        properties: { name: `Regulated corridor: ${CORRIDOR_M / 1000} km either side of the shoreline` },
        geometry: { type: "Polygon", coordinates: [ring] },
      },
    ]),
    "exclusions.geojson": fc([]),
  };

  const geoDir = path.join(root, "public/geo");
  const hashes: Record<string, string> = {};
  const sizes: Record<string, number> = {};
  for (const [name, data] of Object.entries(files)) {
    const text = JSON.stringify(data);
    await writeFile(path.join(geoDir, name), text);
    hashes[name] = createHash("sha256").update(text).digest("hex");
    sizes[name] = text.length;
  }
  const meta = {
    version: `osm-${raw.osmBase.slice(0, 10)}`,
    placeholder: false,
    date: new Date().toISOString().slice(0, 10),
    sources: [
      `OpenStreetMap natural=coastline (OSM base ${raw.osmBase}). © OpenStreetMap contributors, ODbL 1.0.`,
      `Simplified ${SIMPLIFY_M} m, split ≤ ${MAX_SEGMENT_M} m. Not an official survey.`,
    ],
    sha256: hashes,
  };
  await writeFile(path.join(geoDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");

  const km = (l: LonLat[]) => l.slice(1).reduce((s, p, i) => s + distM(l[i], p), 0) / 1000;
  console.log(
    `[geo] open shore ${km(open).toFixed(1)} km (${open.length} pts), inner ${km(inner).toFixed(1)} km (${inner.length} pts), ` +
      `corridor ${ring.length} pts; snap N ${pick.n.d.toFixed(0)} m, S ${pick.s.d.toFixed(0)} m, mouth ${mouth.d.toFixed(0)} m`,
  );
  console.log(`[geo] sizes: ${Object.entries(sizes).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)} KB`).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
