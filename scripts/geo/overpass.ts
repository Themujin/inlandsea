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

export async function overpass(query: string): Promise<OverpassResult> {
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
  throw new Error("All Overpass mirrors failed");
}
