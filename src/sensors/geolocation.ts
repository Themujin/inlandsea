import type { PositionSource, SensorFix, SourceError } from "./types";

// FR-02: high accuracy, never a cached position, 15 s timeout per attempt.
const OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 };

export function watchGeolocation(
  onFix: (fix: SensorFix) => void,
  onError: (error: SourceError) => void,
): PositionSource {
  if (!("geolocation" in navigator)) {
    onError("unsupported");
    return { stop() {} };
  }
  const id = navigator.geolocation.watchPosition(
    ({ coords, timestamp }) =>
      onFix({
        lat: coords.latitude,
        lon: coords.longitude,
        accuracy: coords.accuracy,
        speed: coords.speed,
        heading: coords.heading === null || Number.isNaN(coords.heading) ? null : coords.heading,
        timestamp,
      }),
    (err) => {
      // TIMEOUT is not fatal: the watch keeps running and staleness turns into NO_FIX.
      if (err.code === err.PERMISSION_DENIED) onError("denied");
      else if (err.code === err.POSITION_UNAVAILABLE) onError("unavailable");
    },
    OPTIONS,
  );
  return { stop: () => navigator.geolocation.clearWatch(id) };
}
