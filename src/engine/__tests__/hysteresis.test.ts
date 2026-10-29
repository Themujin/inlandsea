import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { ZoneTracker, type TrackedResult } from "../hysteresis";
import type { ZoneState } from "../types";
import { CONFIG, GEOMETRY, LAT, NOW, fixAt } from "./fixtures";

const exact = { ...CONFIG, accuracyCapMeters: 0 };
const M_PER_DEG_LAT = 111_195;

/** Drive a tracker through distances, one fix every 5 s, moving 10 m north per fix. */
function drive(distances: number[], tracker = new ZoneTracker(exact), speed: number | null = 10) {
  return distances.map((d, i) => {
    const fix = fixAt(d, {
      timestamp: NOW + i * 5000,
      lat: LAT + (i * 10) / M_PER_DEG_LAT,
      speed,
    });
    return tracker.update(fix, evaluate(fix, GEOMETRY, exact, fix.timestamp));
  });
}
const states = (rs: { state: ZoneState }[]) => rs.map((r) => r.state);

describe("ZoneTracker", () => {
  it("first valid fix is taken as-is", () => {
    expect(states(drive([10]))).toEqual(["DANGER"]);
  });

  it("enters DANGER after 2 consecutive fixes < 30 m", () => {
    expect(states(drive([100, 100, 20, 20]))).toEqual(["SAFE", "SAFE", "SAFE", "DANGER"]);
  });

  it("a single fix < 30 m does not trigger DANGER", () => {
    expect(states(drive([100, 20, 100, 100]))).toEqual(["SAFE", "SAFE", "SAFE", "SAFE"]);
  });

  it("exits DANGER only after 3 consecutive fixes > 35 m", () => {
    expect(states(drive([10, 40, 40, 33, 40, 40, 40]))).toEqual([
      "DANGER",
      "DANGER",
      "DANGER",
      "DANGER",
      "DANGER",
      "DANGER",
      "CAUTION",
    ]);
  });

  it("CAUTION uses 60 m enter / 65 m exit", () => {
    expect(states(drive([100, 55, 55, 62, 62, 62, 66, 66, 66]))).toEqual([
      "SAFE",
      "SAFE",
      "CAUTION",
      "CAUTION",
      "CAUTION",
      "CAUTION",
      "CAUTION",
      "CAUTION",
      "SAFE",
    ]);
  });

  it("drops straight from DANGER to SAFE when far away for 3 fixes", () => {
    expect(states(drive([10, 200, 200, 200]))).toEqual(["DANGER", "DANGER", "DANGER", "SAFE"]);
  });

  it("oscillating 28–33 m enters DANGER at most once per minute", () => {
    const d = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 28 : 33));
    const rs = drive([100, ...d]);
    const entries = rs.filter((r) => r.changed && r.state === "DANGER").length;
    expect(entries).toBeLessThanOrEqual(1);
  });

  it("coastal drive flips to DANGER within 2 fixes and never shows SAFE inside 30 m", () => {
    const path = [300, 200, 120, 80, 50, 29, 25, 20, 15, 20, 25, 29, 28];
    const rs = drive(path);
    const firstInside = path.findIndex((d) => d < 30);
    const firstDanger = rs.findIndex((r) => r.state === "DANGER");
    expect(firstDanger - firstInside).toBeLessThanOrEqual(1);
    rs.forEach((r, i) => {
      if (path[i] < 30) expect(r.state).not.toBe("SAFE");
    });
  });

  it("reports transitions only when the displayed state changes", () => {
    const rs = drive([100, 100, 50, 20, 20, 20]);
    expect(states(rs)).toEqual(["SAFE", "SAFE", "SAFE", "CAUTION", "DANGER", "DANGER"]);
    expect(rs.map((r) => r.changed)).toEqual([true, false, false, true, true, false]);
    expect(rs[4].previous).toBe("CAUTION");
  });

  it("ignores jumps implying > 60 m/s", () => {
    const t = new ZoneTracker(exact);
    const a = fixAt(100, { timestamp: NOW });
    t.update(a, evaluate(a, GEOMETRY, exact, NOW));
    const b = fixAt(10, { timestamp: NOW + 1000, lat: LAT + 0.01 }); // ~1.1 km in 1 s
    const r = t.update(b, evaluate(b, GEOMETRY, exact, b.timestamp));
    expect(r.ignored).toBe(true);
    expect(r.state).toBe("SAFE");
    expect(r.changed).toBe(false);
  });

  it("NO_FIX passes through and the next valid fix is taken as-is", () => {
    const t = new ZoneTracker(exact);
    expect(states(drive([100, 100], t))).toEqual(["SAFE", "SAFE"]);
    const bad = fixAt(10, { accuracy: 80, timestamp: NOW + 10_000 });
    expect(t.update(bad, evaluate(bad, GEOMETRY, exact, bad.timestamp)).state).toBe("NO_FIX");
    const good = fixAt(10, { timestamp: NOW + 15_000, lat: LAT + 20 / M_PER_DEG_LAT });
    expect(t.update(good, evaluate(good, GEOMETRY, exact, good.timestamp)).state).toBe("DANGER");
  });

  it("flags parked after 60 s below 1.5 m/s in DANGER", () => {
    const t = new ZoneTracker(exact);
    let last: TrackedResult | undefined;
    for (let i = 0; i <= 61; i++) {
      const fix = fixAt(10, { timestamp: NOW + i * 1000, speed: 0.2 });
      last = t.update(fix, evaluate(fix, GEOMETRY, exact, fix.timestamp));
      if (i === 30) expect(last.parked).toBe(false);
    }
    expect(last!.state).toBe("DANGER");
    expect(last!.parked).toBe(true);
  });

  it("derives speed from positions when the device reports none", () => {
    const t = new ZoneTracker(exact);
    let last: TrackedResult | undefined;
    for (let i = 0; i <= 61; i++) {
      const fix = fixAt(10, { timestamp: NOW + i * 1000, speed: null });
      last = t.update(fix, evaluate(fix, GEOMETRY, exact, fix.timestamp));
    }
    expect(last!.parked).toBe(true);

    // Start moving north at 10 m/s, continuing the timeline.
    const moving = [1, 2].map((k) => {
      const fix = fixAt(10, {
        timestamp: NOW + (61 + k) * 1000,
        lat: LAT + (k * 10) / M_PER_DEG_LAT,
        speed: null,
      });
      return t.update(fix, evaluate(fix, GEOMETRY, exact, fix.timestamp));
    });
    expect(moving.at(-1)!.parked).toBe(false);
  });
});
