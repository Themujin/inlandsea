import { haversineM } from "@/engine/projection";

export interface TrackPoint {
  lat: number;
  lon: number;
  /** Epoch ms from <time>, or index-based seconds when the file has none. */
  time: number;
}

/** Minimal GPX reader: <trkpt lat lon><time/></trkpt>. Regex-based so it runs without a DOM. */
export function parseGpx(xml: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>|<trkpt\b([^>]*)\/>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const attrs = m[1] ?? m[3] ?? "";
    const lat = Number(/\blat="([^"]+)"/.exec(attrs)?.[1]);
    const lon = Number(/\blon="([^"]+)"/.exec(attrs)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const t = /<time>([^<]+)<\/time>/.exec(m[2] ?? "")?.[1];
    const parsed = t ? Date.parse(t) : NaN;
    points.push({ lat, lon, time: Number.isFinite(parsed) ? parsed : points.length * 1000 });
  }
  return points;
}

/** Ground speed (m/s) and heading (deg) between two track points. */
export function motion(a: TrackPoint, b: TrackPoint): { speed: number | null; heading: number | null } {
  const dt = (b.time - a.time) / 1000;
  if (dt <= 0) return { speed: null, heading: null };
  const d = haversineM([a.lon, a.lat], [b.lon, b.lat]);
  if (d === 0) return { speed: 0, heading: null };
  const y = Math.sin((b.lon - a.lon) * (Math.PI / 180)) * Math.cos(b.lat * (Math.PI / 180));
  const x =
    Math.cos(a.lat * (Math.PI / 180)) * Math.sin(b.lat * (Math.PI / 180)) -
    Math.sin(a.lat * (Math.PI / 180)) *
      Math.cos(b.lat * (Math.PI / 180)) *
      Math.cos((b.lon - a.lon) * (Math.PI / 180));
  const heading = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { speed: d / dt, heading };
}
