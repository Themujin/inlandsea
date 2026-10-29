import { describe, expect, it } from "vitest";
import { buildRoadGraph } from "../roads";
import { checkRoute, initialBearing, planGoTo } from "../route";
import type { LonLat } from "../types";
import { GEOMETRY, LAT, SHIPPED_CONFIG, SHORE_LON, metresToDegLon } from "./fixtures";

// Synthetic N–S shoreline at SHORE_LON; land to the west. Band = 30 m + 10 m tide = 40 m.
const at = (inlandM: number, northM = 0): LonLat => [
  SHORE_LON - metresToDegLon(inlandM),
  LAT + northM / 111_195,
];

describe("checkRoute", () => {
  it("parallel path 200 m inland does not cross the band", () => {
    const r = checkRoute(at(200, 0), at(200, 2000), GEOMETRY, SHIPPED_CONFIG);
    expect(r.crossesBand).toBe(false);
    expect(Math.abs(r.minShoreM! - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.distanceM - 2000)).toBeLessThanOrEqual(2);
    expect(r.bearing).toBeCloseTo(0, 0);
  });

  it("path to a point 20 m from the water crosses the band", () => {
    const r = checkRoute(at(500), at(20, 300), GEOMETRY, SHIPPED_CONFIG);
    expect(r.crossesBand).toBe(true);
    expect(r.minShoreM!).toBeLessThan(21);
  });

  it("destination 35 m from the water is inside the 40 m band (30 m rule + tide)", () => {
    const r = checkRoute(at(300), at(35), GEOMETRY, SHIPPED_CONFIG);
    expect(r.crossesBand).toBe(true);
  });

  it("path ending 45 m from the water stays clear of the 40 m band", () => {
    const r = checkRoute(at(300), at(45), GEOMETRY, SHIPPED_CONFIG);
    expect(r.crossesBand).toBe(false);
  });

  it("crossing to the other side of the shoreline is detected", () => {
    const r = checkRoute(at(300), at(-300), GEOMETRY, SHIPPED_CONFIG);
    expect(r.crossesBand).toBe(true);
    expect(r.minShoreM!).toBeLessThan(10);
  });

  it("far from any shoreline reports no shore and no crossing", () => {
    const r = checkRoute([50.9, 25.5], [50.95, 25.5], GEOMETRY, SHIPPED_CONFIG);
    expect(r.minShoreM).toBeNull();
    expect(r.crossesBand).toBe(false);
  });

  it("stays fast for a 30 km path", () => {
    const t0 = performance.now();
    checkRoute(at(500, -10_000), at(500, 20_000), GEOMETRY, SHIPPED_CONFIG);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("initialBearing", () => {
  it.each([
    [[51, 24.8], [51, 24.9], 0],
    [[51, 24.8], [51.1, 24.8], 90],
    [[51, 24.8], [51, 24.7], 180],
    [[51, 24.8], [50.9, 24.8], 270],
  ] as [LonLat, LonLat, number][])("%j → %j ≈ %i°", (a, b, deg) => {
    expect(initialBearing(a, b)).toBeCloseTo(deg, 0);
  });
});

describe("planGoTo", () => {
  it("falls back to a straight line without a road network", () => {
    const p = planGoTo(at(300, 0), at(300, 1000), GEOMETRY, SHIPPED_CONFIG, null);
    expect(p.kind).toBe("straight");
    expect(p.coords).toHaveLength(2);
    expect(p.crossesBand).toBe(false);
  });

  it("uses a road parallel to the shore and checks only the off-road legs", () => {
    // A straight road 300 m inland running north–south.
    const a = at(300, -2000);
    const b = at(300, 2000);
    const roads = buildRoadGraph({ osmBase: "t", v: [...a, ...b], e: [0, 1, 0], len: [4000], cost: [1], g: [[]] });
    const plan = planGoTo(at(500, 0), at(500, 1500), GEOMETRY, SHIPPED_CONFIG, roads);
    expect(plan.kind).toBe("roads");
    expect(Math.abs(plan.accessM - 200)).toBeLessThanOrEqual(2);
    expect(Math.abs(plan.distanceM - (200 + 1500 + 200))).toBeLessThanOrEqual(5);
    expect(plan.crossesBand).toBe(false);
    // First move: towards the road (east, to the shore side of us).
    expect(plan.bearing).toBeCloseTo(90, 0);
  });

  it("flags an off-road leg to a pin inside the band", () => {
    const a = at(300, -2000);
    const b = at(300, 2000);
    const roads = buildRoadGraph({ osmBase: "t", v: [...a, ...b], e: [0, 1, 0], len: [4000], cost: [1], g: [[]] });
    const plan = planGoTo(at(500, 0), at(15, 1500), GEOMETRY, SHIPPED_CONFIG, roads);
    expect(plan.kind).toBe("roads");
    expect(plan.crossesBand).toBe(true);
  });
});
