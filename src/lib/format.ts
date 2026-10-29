import type { Dictionary } from "@/i18n";

export function formatDistance(m: number | null, t: Dictionary): string {
  if (m === null) return t.farAway;
  if (m >= 1000) return t.farAway;
  return `${Math.round(m)} ${t.metres}`;
}

export function formatAccuracy(m: number | null, t: Dictionary): string | null {
  return m === null ? null : t.accuracy.replace("{n}", String(Math.round(m)));
}

/** Trip distances: metres below 1 km, then km with one decimal. */
export function formatTripDistance(m: number, t: Dictionary): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} ${t.metres}`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} ${t.km}`;
}
