import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../../public/config.json";
import { evaluate } from "@/engine/evaluate";
import { buildGeometry, type FeatureCollection } from "@/engine/geometry";
import { ZoneTracker } from "@/engine/hysteresis";
import { motion, parseGpx } from "../gpx";

const pub = path.resolve(import.meta.dirname, "../../../public");
const read = (p: string) => readFileSync(path.join(pub, p), "utf8");

describe("parseGpx", () => {
  it("reads points, times and self-closing trkpts", () => {
    const pts = parseGpx(`<gpx><trk><trkseg>
      <trkpt lat="24.8" lon="51.5"><time>2026-10-31T06:00:00Z</time></trkpt>
      <trkpt lon="51.5001" lat="24.8001"><ele>2</ele><time>2026-10-31T06:00:01Z</time></trkpt>
      <trkpt lat="24.8002" lon="51.5002"/>
      <trkpt lat="bad" lon="51"/>
    </trkseg></trk></gpx>`);
    expect(pts).toHaveLength(3);
    expect(pts[1]).toEqual({ lat: 24.8001, lon: 51.5001, time: Date.parse("2026-10-31T06:00:01Z") });
    expect(pts[2].time).toBe(2000); // index-based fallback
  });

  it("derives speed and heading", () => {
    const a = { lat: 24.8, lon: 51.5, time: 0 };
    const north = motion(a, { lat: 24.8 + 10 / 111_195, lon: 51.5, time: 1000 });
    expect(north.speed!).toBeCloseTo(10, 0);
    expect(north.heading!).toBeCloseTo(0, 0);
    const west = motion(a, { lat: 24.8, lon: 51.4999, time: 1000 });
    expect(west.heading!).toBeCloseTo(270, 0);
  });
});

describe("sample drive (public/sim/coastal-drive.gpx)", () => {
  const pts = parseGpx(read("sim/coastal-drive.gpx"));
  const geometry = buildGeometry({
    corridor: JSON.parse(read("geo/corridor.geojson")) as FeatureCollection,
    shoreline: JSON.parse(read("geo/shoreline.geojson")) as FeatureCollection,
  });

  it("loops without a position jump", () => {
    const first = pts[0];
    const last = pts.at(-1)!;
    expect(motion(last, { ...first, time: last.time + 1000 }).speed!).toBeLessThan(60);
  });

  it("passes through SAFE → CAUTION → DANGER → back out", () => {
    const tracker = new ZoneTracker(config);
    const seen = pts.map((p) => {
      const fix = { lat: p.lat, lon: p.lon, accuracy: 5, speed: 8, timestamp: p.time };
      return tracker.update(fix, evaluate(fix, geometry, config, p.time)).state;
    });
    const order = seen.filter((s, i) => s !== seen[i - 1]);
    expect(order.slice(0, 3)).toEqual(["SAFE", "CAUTION", "DANGER"]);
    expect(seen.at(-1)).toBe("SAFE");
  });
});
