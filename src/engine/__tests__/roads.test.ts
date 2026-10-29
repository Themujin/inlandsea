import { describe, expect, it } from "vitest";
import { type RoadData, buildRoadGraph, routeOnRoads, snapToRoad } from "../roads";
import type { LonLat } from "../types";

// A 1 km square of roads near the coast, in local metres (x east, y north).
const LON0 = 51.4;
const LAT0 = 24.8;
const M_LAT = 111_195;
const M_LON = M_LAT * Math.cos((LAT0 * Math.PI) / 180);
const at = (x: number, y: number): LonLat => [LON0 + x / M_LON, LAT0 + y / M_LAT];

//   3 ──(2)── 2
//   │         │
//  (3)       (1)
//   │         │
//   0 ──(0)── 1
function square(opts: { leftCost?: number; rightOneway?: boolean; midpoints?: boolean } = {}): RoadData {
  const corners = [at(0, 0), at(1000, 0), at(1000, 1000), at(0, 1000)];
  const mid = (a: LonLat, b: LonLat) => (opts.midpoints ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : []);
  const pairs = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ];
  return {
    osmBase: "test",
    v: corners.flat(),
    e: pairs.flatMap(([a, b], i) => [a, b, i === 1 && opts.rightOneway ? 1 : 0]),
    len: [1000, 1000, 1000, 1000],
    cost: [1, 1, 1, opts.leftCost ?? 1],
    g: pairs.map(([a, b]) => mid(corners[a], corners[b])),
  };
}

const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;

describe("snapToRoad", () => {
  const graph = buildRoadGraph(square({ midpoints: true }));

  it("finds the nearest point on an edge", () => {
    const s = snapToRoad(graph, at(300, -40), 500)!;
    expect(s.edge).toBe(0);
    expect(near(s.distanceM, 40)).toBe(true);
    expect(near(s.alongM, 300)).toBe(true);
  });

  it("returns null beyond the snap limit", () => {
    expect(snapToRoad(graph, at(500, -3000), 1000)).toBeNull();
  });
});

describe("routeOnRoads", () => {
  it("takes the shorter way round the square", () => {
    const r = routeOnRoads(buildRoadGraph(square()), at(200, -50), at(200, 1050))!;
    expect(near(r.accessM, 50)).toBe(true);
    expect(near(r.egressM, 50)).toBe(true);
    expect(near(r.roadM, 1400, 5)).toBe(true); // 200 + 1000 (left side) + 200
    expect(near(r.totalM, 1500, 5)).toBe(true);
  });

  it("prefers cheaper road classes over a shorter but costly side", () => {
    const r = routeOnRoads(buildRoadGraph(square({ leftCost: 3 })), at(200, -50), at(200, 1050))!;
    expect(near(r.roadM, 2600, 5)).toBe(true); // 800 + 1000 (right side) + 800
  });

  it("respects one-way edges", () => {
    // Right side is one-way 1 → 2 (north). Going south from the top-right must avoid it.
    const graph = buildRoadGraph(square({ rightOneway: true }));
    const up = routeOnRoads(graph, at(1050, 100), at(1050, 900))!;
    expect(near(up.roadM, 800, 5)).toBe(true);
    const down = routeOnRoads(graph, at(1050, 900), at(1050, 100))!;
    expect(near(down.roadM, 100 + 1000 + 1000 + 1000 + 100, 5)).toBe(true);
  });

  it("routes along a single edge when both ends snap to it", () => {
    const r = routeOnRoads(buildRoadGraph(square({ midpoints: true })), at(100, -30), at(900, -30))!;
    expect(near(r.roadM, 800, 5)).toBe(true);
    expect(r.coords[0]).toEqual(at(100, -30));
    expect(r.coords.at(-1)).toEqual(at(900, -30));
  });

  it("returns null when an end is too far from any road", () => {
    expect(routeOnRoads(buildRoadGraph(square()), at(200, -50), at(200, 9000), 2000)).toBeNull();
  });

  it("returns a continuous path: you → join … leave → pin", () => {
    const r = routeOnRoads(buildRoadGraph(square({ midpoints: true })), at(-60, 500), at(1060, 500))!;
    expect(r.coords[1]).toEqual(r.join);
    expect(r.coords.at(-2)).toEqual(r.leave);
    for (let i = 1; i < r.coords.length; i++) {
      const [a, b] = [r.coords[i - 1], r.coords[i]];
      expect(Math.hypot((b[0] - a[0]) * M_LON, (b[1] - a[1]) * M_LAT)).toBeLessThan(1100);
    }
  });
});
