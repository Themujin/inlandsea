// Shared Overpass API client for the data pipeline, with mirror fallback.

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

export interface OverpassWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry: { lat: number; lon: number }[];
}

export interface OverpassResult {
  osm3s: { timestamp_osm_base: string };
  elements: OverpassWay[];
}

/** Public Overpass servers are often busy (502/504); retry the mirror list with backoff. */
const ROUNDS = 4;
const BACKOFF_MS = 20_000;

export async function overpass(query: string): Promise<OverpassResult> {
  for (let round = 0; round < ROUNDS; round++) {
    if (round > 0) {
      console.warn(`[overpass] all mirrors busy; retrying in ${(BACKOFF_MS * round) / 1000} s`);
      await new Promise((r) => setTimeout(r, BACKOFF_MS * round));
    }
    const result = await tryMirrors(query);
    if (result) return result;
  }
  throw new Error("All Overpass mirrors failed");
}

async function tryMirrors(query: string): Promise<OverpassResult | null> {
  const body = new URLSearchParams({ data: query });
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body,
        headers: { "User-Agent": "ShorelineGuard/0.1 (data pipeline)" },
      });
      if (res.ok) return (await res.json()) as OverpassResult;
      console.warn(`[overpass] ${url}: HTTP ${res.status}`);
    } catch (err) {
      console.warn(`[overpass] ${url}: ${(err as Error).message}`);
    }
  }
  return null;
}
