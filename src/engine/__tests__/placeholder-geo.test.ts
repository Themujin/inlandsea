import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { buildGeometry, type FeatureCollection } from "../geometry";
import { CONFIG, NOW, metresToDegLon } from "./fixtures";

// Smoke test for the shipped public/geo files: they load, index and classify sanely.
// Positions are placeholders until the M4 pipeline replaces them.
const geoDir = path.resolve(import.meta.dirname, "../../../public/geo");
const load = (name: string) =>
  JSON.parse(readFileSync(path.join(geoDir, name), "utf8")) as FeatureCollection;

const geometry = buildGeometry({
  corridor: load("corridor.geojson"),
  shoreline: load("shoreline.geojson"),
  exclusions: load("exclusions.geojson"),
});
const exact = { ...CONFIG, accuracyCapMeters: 0 };
// A vertex on the open-sea shore (sea is east).
const [VLON, VLAT] = [51.495, 24.81];
const fix = (lon: number, lat: number) => ({ lon, lat, accuracy: 5, speed: 5, timestamp: NOW });

describe("shipped placeholder geometry", () => {
  it("indexes shoreline segments of at most 200 m", () => {
    expect(geometry.segmentCount).toBeGreaterThan(100);
  });

  it.each([
    [15, "DANGER"],
    [45, "CAUTION"],
    [500, "SAFE"],
  ] as const)("%i m west of the shore → %s", (m, state) => {
    const r = evaluate(fix(VLON - metresToDegLon(m, VLAT), VLAT), geometry, exact, NOW);
    expect(r.state).toBe(state);
  });

  it("Doha is OUT_OF_AREA", () => {
    expect(evaluate(fix(51.53, 25.29), geometry, exact, NOW).state).toBe("OUT_OF_AREA");
  });
});
