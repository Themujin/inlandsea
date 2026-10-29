import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import type { ShoreGeometry } from "../geometry";
import type { LonLat } from "../types";
import {
  CONFIG,
  GEOMETRY,
  INNER_LON,
  LAT,
  NOW,
  SHIPPED_CONFIG,
  SHORE_LON,
  fixAt,
  metresToDegLon,
} from "./fixtures";

// Zero accuracy penalty so distance assertions are about geometry only.
const exact = { ...CONFIG, accuracyCapMeters: 0 };

describe("evaluate: distance accuracy", () => {
  const offsets = Array.from({ length: 50 }, (_, i) => i * 12.5 + 0.5); // 0.5 … 613 m

  it.each(offsets)("%f m inland measures within ±1 m", (d) => {
    const r = evaluate(fixAt(d), GEOMETRY, exact, NOW);
    expect(r.distanceM).not.toBeNull();
    expect(Math.abs(r.distanceM! - d)).toBeLessThanOrEqual(1);
  });

  it("returns the nearest shoreline point on the line", () => {
    const r = evaluate(fixAt(100), GEOMETRY, exact, NOW);
    expect(r.nearestPoint![0]).toBeCloseTo(SHORE_LON, 6);
    expect(r.nearestPoint![1]).toBeCloseTo(LAT, 6);
  });

  it("measures to the inner line's end point diagonally", () => {
    // 30 m north of the inner line's north end (24.85), 40 m east of it → 50 m.
    const fix = {
      lat: 24.85 + 30 / 111_195,
      lon: INNER_LON + metresToDegLon(40, 24.85),
      accuracy: 5,
      speed: 5,
      timestamp: NOW,
    };
    const r = evaluate(fix, GEOMETRY, exact, NOW);
    expect(Math.abs(r.distanceM! - 50)).toBeLessThanOrEqual(1);
  });
});

describe("evaluate: classification", () => {
  it.each([
    [0, "DANGER"],
    [15, "DANGER"],
    [29, "DANGER"],
    [31, "CAUTION"],
    [59, "CAUTION"],
    [61, "SAFE"],
    [500, "SAFE"],
  ] as const)("%i m → %s", (d, state) => {
    expect(evaluate(fixAt(d), GEOMETRY, exact, NOW).state).toBe(state);
  });

  it("treats a fix in the water as DANGER", () => {
    expect(evaluate(fixAt(-20), GEOMETRY, exact, NOW).state).toBe("DANGER");
  });
});

describe("evaluate: fix acceptance", () => {
  it("accuracy 51 m → NO_FIX", () => {
    expect(evaluate(fixAt(200, { accuracy: 51 }), GEOMETRY, CONFIG, NOW).state).toBe("NO_FIX");
  });

  it("accuracy 50 m is still accepted", () => {
    expect(evaluate(fixAt(200, { accuracy: 50 }), GEOMETRY, CONFIG, NOW).state).toBe("SAFE");
  });

  it("fix older than 10 s → NO_FIX", () => {
    const r = evaluate(fixAt(200, { timestamp: NOW - 10_001 }), GEOMETRY, CONFIG, NOW);
    expect(r.state).toBe("NO_FIX");
  });

  it("NaN accuracy → NO_FIX", () => {
    expect(evaluate(fixAt(200, { accuracy: NaN }), GEOMETRY, CONFIG, NOW).state).toBe("NO_FIX");
  });
});

describe("evaluate: accuracy-adjusted distance", () => {
  it("5 m accuracy at 33 m → effective 28 m → DANGER", () => {
    const r = evaluate(fixAt(33, { accuracy: 5 }), GEOMETRY, CONFIG, NOW);
    expect(r.effectiveM).toBeCloseTo(28, 0);
    expect(r.state).toBe("DANGER");
  });

  it("25 m accuracy at 50 m → effective 25 m → DANGER", () => {
    const r = evaluate(fixAt(50, { accuracy: 25 }), GEOMETRY, CONFIG, NOW);
    expect(r.effectiveM).toBeCloseTo(25, 0);
    expect(r.state).toBe("DANGER");
  });

  it("caps the accuracy penalty at 25 m", () => {
    const r = evaluate(fixAt(100, { accuracy: 45 }), GEOMETRY, CONFIG, NOW);
    expect(r.effectiveM).toBeCloseTo(75, 0);
    expect(r.state).toBe("SAFE");
  });
});

describe("evaluate: tide margin (shipped config: 30 m rule + 10 m)", () => {
  const shipped = { ...SHIPPED_CONFIG, accuracyCapMeters: 0 };

  it("ships a 10 m margin", () => {
    expect(SHIPPED_CONFIG.tideMarginMeters).toBe(10);
  });

  it.each([
    [25, "DANGER"],
    [39, "DANGER"],
    [41, "CAUTION"],
    [69, "CAUTION"],
    [71, "SAFE"],
  ] as const)("%i m → %s", (d, state) => {
    const r = evaluate(fixAt(d), GEOMETRY, shipped, NOW);
    expect(r.state).toBe(state);
    // The displayed distance stays the true distance to the mapped shoreline.
    expect(Math.abs(r.distanceM! - d)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.effectiveM! - (d - 10))).toBeLessThanOrEqual(1);
  });

  it("stacks with the accuracy penalty: 5 m accuracy at 44 m → effective 29 m → DANGER", () => {
    const r = evaluate(fixAt(44, { accuracy: 5 }), GEOMETRY, SHIPPED_CONFIG, NOW);
    expect(r.effectiveM).toBeCloseTo(29, 0);
    expect(r.state).toBe("DANGER");
  });
});

describe("evaluate: corridor", () => {
  it("outside the corridor polygon → OUT_OF_AREA", () => {
    expect(evaluate(fixAt(200, { lat: 25.2 }), GEOMETRY, CONFIG, NOW).state).toBe("OUT_OF_AREA");
  });

  it("inside the corridor but far from any segment → SAFE with no distance", () => {
    // South-west corner: > 2 km from both lines and outside the inner line's lat range.
    const fix = { lat: 24.701, lon: 51.461, accuracy: 5, speed: 5, timestamp: NOW };
    const r = evaluate(fix, GEOMETRY, { ...CONFIG, searchDegrees: 0.001 }, NOW);
    expect(r.state).toBe("SAFE");
  });
});

describe("evaluate: inland bearing", () => {
  it("points west (270°) when the sea is east", () => {
    const r = evaluate(fixAt(100), GEOMETRY, CONFIG, NOW);
    expect(r.bearingInland).toBeCloseTo(270, 1);
  });

  it("points east (90°) when the fix is east of the line", () => {
    const r = evaluate(fixAt(-10), GEOMETRY, CONFIG, NOW);
    expect(r.bearingInland).toBeCloseTo(90, 1);
  });

  it("is null exactly on the line", () => {
    expect(evaluate(fixAt(0), GEOMETRY, CONFIG, NOW).bearingInland).toBeNull();
  });
});

describe("evaluate: inner Khor shore toggle", () => {
  const nearInner = {
    lat: 24.8,
    lon: INNER_LON + metresToDegLon(10),
    accuracy: 5,
    speed: 5,
    timestamp: NOW,
  };

  it("counts the inner shore when enabled", () => {
    const r = evaluate(nearInner, GEOMETRY, { ...exact, includeInnerShore: true }, NOW);
    expect(Math.abs(r.distanceM! - 10)).toBeLessThanOrEqual(1);
    expect(r.state).toBe("DANGER");
  });

  it("ignores the inner shore when disabled", () => {
    const r = evaluate(nearInner, GEOMETRY, { ...exact, includeInnerShore: false }, NOW);
    expect(r.distanceM!).toBeGreaterThan(1900);
    expect(r.state).toBe("SAFE");
  });
});

describe("evaluate: exclusions", () => {
  it("exempt polygon → SAFE but still reports distance", () => {
    const ring: LonLat[] = [
      [51.49, 24.79],
      [51.5, 24.79],
      [51.5, 24.81],
      [51.49, 24.81],
      [51.49, 24.79],
    ];
    const g: ShoreGeometry = { ...GEOMETRY, exclusions: [[ring]] };
    const r = evaluate(fixAt(10), g, exact, NOW);
    expect(r.excluded).toBe(true);
    expect(r.state).toBe("SAFE");
    expect(Math.abs(r.distanceM! - 10)).toBeLessThanOrEqual(1);
  });
});

describe("evaluate: performance", () => {
  it("1,000 evaluations: p95 < 5 ms", () => {
    const times: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const fix = fixAt((i * 7) % 900, { lat: 24.71 + (i % 180) * 0.001 });
      const t0 = performance.now();
      evaluate(fix, GEOMETRY, CONFIG, NOW);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[949]).toBeLessThan(5);
  });
});
