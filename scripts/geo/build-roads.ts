// Builds the on-device road network (public/geo/roads.json) from data/osm/roads.json:
// split ways at junctions, drop non-public ways, drop every edge that enters the shore
// warning band (rule + tide margin), simplify geometry, write a compact graph.
// Run after scripts/geo/build.ts (needs the shipped shoreline). Usage: npx tsx scripts/geo/build-roads.ts
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import config from "../../public/config.json";
import { nearestShore } from "../../src/engine/evaluate";
import { buildGeometry, type FeatureCollection } from "../../src/engine/geometry";
import type { RoadData } from "../../src/engine/roads";
import { NO_ACCESS, ROAD_CLASSES, ROAD_SIMPLIFY_M } from "./roads-config";

type LonLat = [number, number];
const root = path.resolve(import.meta.dirname, "../..");
const R = 6_371_000;
const DEG = Math.PI / 180;
const BAND_M = config.dangerMeters + config.tideMarginMeters;
const SAMPLE_M = 10;

const distM = (a: LonLat, b: LonLat) => {
  const kx = R * DEG * Math.cos(((a[1] + b[1]) / 2) * DEG);
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * R * DEG);
};
const key = (p: LonLat) => `${p[0]},${p[1]}`;
const r6 = (x: number) => +x.toFixed(6);
const lengthM = (c: LonLat[]) => c.slice(1).reduce((s, p, i) => s + distM(c[i], p), 0);

/** Douglas–Peucker in local metres; keeps both ends. */
function simplify(line: LonLat[], tol: number): LonLat[] {
  if (line.length < 3) return line;
  const kx = R * DEG * Math.cos(line[0][1] * DEG);
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
      if (d > farD) [farD, far] = [d, i];
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

async function main() {
  const raw = JSON.parse(readFileSync(path.join(root, "data/osm/roads.json"), "utf8"));
  const load = (n: string) => JSON.parse(readFileSync(path.join(root, "public/geo", n), "utf8")) as FeatureCollection;
  const shore = buildGeometry({ corridor: load("corridor.geojson"), shoreline: load("shoreline.geojson") });

  type Way = { highway: string; oneway: string | null; access: string | null; coords: LonLat[] };
  const ways = (raw.ways as Way[]).filter(
    (w) => w.highway in ROAD_CLASSES && !(w.access && NO_ACCESS.has(w.access)) && w.coords.length > 1,
  );

  // Vertices: way ends and any coordinate shared by two or more ways (junctions).
  const uses = new Map<string, number>();
  for (const w of ways) for (const p of w.coords) uses.set(key(p), (uses.get(key(p)) ?? 0) + 1);
  const isVertex = (w: Way, i: number) => i === 0 || i === w.coords.length - 1 || uses.get(key(w.coords[i]))! > 1;

  const vertexId = new Map<string, number>();
  const v: number[] = [];
  const idOf = (p: LonLat) => {
    let id = vertexId.get(key(p));
    if (id === undefined) {
      id = v.length / 2;
      vertexId.set(key(p), id);
      v.push(r6(p[0]), r6(p[1]));
    }
    return id;
  };

  const out: Omit<RoadData, "osmBase"> = { v, e: [], len: [], cost: [], g: [] };
  let dropped = 0;
  let droppedKm = 0;
  for (const w of ways) {
    // "-1" means the way is drawn against its direction of travel.
    const coords = w.oneway === "-1" ? [...w.coords].reverse() : w.coords;
    const oneway = w.oneway === "yes" || w.oneway === "1" || w.oneway === "-1" ? 1 : 0;
    let start = 0;
    for (let i = 1; i < coords.length; i++) {
      if (!isVertex({ ...w, coords }, i)) continue;
      const piece = coords.slice(start, i + 1);
      start = i;
      const len = lengthM(piece);
      if (len < 0.5) continue;

      // Drop edges that enter the warning band anywhere.
      let inBand = false;
      for (let s = 1; s < piece.length && !inBand; s++) {
        const n = Math.max(1, Math.ceil(distM(piece[s - 1], piece[s]) / SAMPLE_M));
        for (let k = 0; k <= n && !inBand; k++) {
          const t = k / n;
          const p: LonLat = [
            piece[s - 1][0] + (piece[s][0] - piece[s - 1][0]) * t,
            piece[s - 1][1] + (piece[s][1] - piece[s - 1][1]) * t,
          ];
          const near = nearestShore(p, shore, config);
          if (near && near.distanceM < BAND_M) inBand = true;
        }
      }
      if (inBand) {
        dropped++;
        droppedKm += len / 1000;
        continue;
      }

      const simple = simplify(piece, ROAD_SIMPLIFY_M);
      out.e.push(idOf(piece[0]), idOf(piece.at(-1)!), oneway);
      out.len.push(Math.round(len));
      out.cost.push(ROAD_CLASSES[w.highway]);
      out.g.push(simple.slice(1, -1).flatMap(([x, y]) => [r6(x), r6(y)]));
    }
  }

  const data: RoadData = { osmBase: raw.osmBase, ...out };
  const text = JSON.stringify(data);
  await writeFile(path.join(root, "public/geo/roads.json"), text);
  const km = out.len.reduce((a, b) => a + b, 0) / 1000;
  console.log(
    `[roads] ${out.len.length} edges, ${v.length / 2} vertices, ${km.toFixed(0)} km; ` +
      `dropped ${dropped} edges (${droppedKm.toFixed(1)} km) inside the ${BAND_M} m band; ` +
      `${(text.length / 1024).toFixed(0)} KB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
