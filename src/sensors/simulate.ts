import { motion, parseGpx } from "./gpx";
import type { PositionSource, SensorFix, SourceError } from "./types";

export const SAMPLE_TRACK = "/sim/coastal-drive.gpx";

/**
 * FR-11: replays a GPX track in real time, looping, as if it came from the GPS.
 * Fix timestamps are the wall clock at emission so staleness checks behave normally.
 */
export function replayGpx(
  url: string,
  onFix: (fix: SensorFix) => void,
  onError: (error: SourceError) => void,
): PositionSource {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  fetch(url)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
    .then((xml) => {
      const pts = parseGpx(xml);
      if (stopped || pts.length < 2) return;
      let i = 0;
      const step = () => {
        if (stopped) return;
        const p = pts[i];
        const next = pts[i + 1];
        const { speed, heading } = motion(pts[Math.max(0, i - 1)], i === 0 ? next : p);
        onFix({ lat: p.lat, lon: p.lon, accuracy: 5, speed, heading, timestamp: Date.now() });
        const wait = next ? Math.max(200, next.time - p.time) : 1000;
        i = next ? i + 1 : 0;
        timer = setTimeout(step, wait);
      };
      step();
    })
    .catch(() => onError("unavailable"));

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
