import type { Dictionary } from "@/i18n";

export function formatDistance(m: number | null, t: Dictionary): string {
  if (m === null) return t.farAway;
  if (m >= 1000) return t.farAway;
  return `${Math.round(m)} ${t.metres}`;
}

export function formatAccuracy(m: number | null, t: Dictionary): string | null {
  return m === null ? null : t.accuracy.replace("{n}", String(Math.round(m)));
}
