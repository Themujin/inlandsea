import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { buildGeometry, type FeatureCollection } from "../geometry";
import type { LonLat } from "../types";
import { CONFIG, NOW, metresToDegLon } from "./fixtures";

// Checks the shipped public/geo files (OSM-derived, scripts/geo/build.ts):
// they load, index and classify real points on the Sealine – Khor Al Adaid coast.
const geoDir = path.resolve(import.meta.dirname, "../../../public/geo");
const load = (name: string) =>
  JSON.parse(readFileSync(path.join(geoDir, name), "utf8")) as FeatureCollection;

const shoreline = load("shoreline.geojson");
const geometry = buildGeometry({
  corridor: load("corridor.geojson"),
  shoreline,
  exclusions: load("exclusions.geojson"),
});
const exact = { ...CONFIG, accuracyCapMeters: 0 };
const fix = ([lon, lat]: LonLat) => ({ lon, lat, accuracy: 5, speed: 5, timestamp: NOW });

const lineOf = (inner: boolean) =>
  (shoreline.features.find((f) => f.properties?.inner === inner)!.geometry as { coordinates: LonLat[] })
    .coordinates;

/** A point `m` metres inland (the side away from the water) of vertex i, along the local normal. */
function inlandOf(line: LonLat[], i: number, m: number, side: "west" | "north"): LonLat {
  const [a, b] = [line[i - 1], line[i + 1]];
  const kx = metresToDegLon(1, line[i][1]);
  const ky = 1 / 111_195;
  const dx = (b[0] - a[0]) / kx;
  const dy = (b[1] - a[1]) / ky;
  const len = Math.hypot(dx, dy);
  let [nx, ny] = [-dy / len, dx / len];
  if ((side === "west" && nx > 0) || (side === "north" && ny < 0)) [nx, ny] = [-nx, -ny];
  return [line[i][0] + nx * m * kx, line[i][1] + ny * m * ky];
}

const nearestVertex = (line: LonLat[], lat: number) =>
  line.reduce((best, p, i) => (Math.abs(p[1] - lat) < Math.abs(line[best][1] - lat) ? i : best), 1);

describe("shipped OSM geometry", () => {
  const open = lineOf(false);
  const inner = lineOf(true);

  it("covers Sealine to the Khor channel with ≤ 200 m segments", () => {
    expect(open.at(-1)![1]).toBeGreaterThan(24.9);
    expect(inner[0][1]).toBeLessThan(24.6);
    expect(geometry.segmentCount).toBeGreaterThan(500);
  });

  it.each([
    [24.81, 0],
    [24.81, 15],
    [24.81, 29],
    [24.81, 31],
    [24.81, 59],
    [24.81, 61],
    [24.81, 500],
    [24.7, 15],
    [24.7, 45],
    [24.88, 15],
    [24.88, 200],
  ])("lat %f, %i m inland: distance ±1 m and correct state", (lat, m) => {
    const i = nearestVertex(open, lat);
    const r = evaluate(fix(inlandOf(open, i, m, "west")), geometry, exact, NOW);
    // Another stretch of coast can be closer than the vertex we offset from, never farther.
    expect(r.distanceM!).toBeLessThanOrEqual(m + 1);
    if (m <= 61) expect(Math.abs(r.distanceM! - m)).toBeLessThanOrEqual(1);
    const expected = r.distanceM! < 30 ? "DANGER" : r.distanceM! < 60 ? "CAUTION" : "SAFE";
    expect(r.state).toBe(expected);
  });

  it("channel shore (inner) is in the corridor and counts by default", () => {
    const p = inlandOf(inner, Math.floor(inner.length / 2), 15, "north");
    const r = evaluate(fix(p), geometry, exact, NOW);
    expect(r.state).toBe("DANGER");
  });

  it("Doha is OUT_OF_AREA", () => {
    expect(evaluate(fix([51.53, 25.29]), geometry, exact, NOW).state).toBe("OUT_OF_AREA");
  });

  it("5 km inland is OUT_OF_AREA", () => {
    const i = nearestVertex(open, 24.81);
    expect(evaluate(fix(inlandOf(open, i, 5000, "west")), geometry, exact, NOW).state).toBe("OUT_OF_AREA");
  });
});
