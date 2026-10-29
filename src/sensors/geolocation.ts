import type { PositionSource, SensorFix, SourceError } from "./types";

// FR-02: high accuracy, never a cached position, 15 s timeout per attempt.
const OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 };

/**
 * Browsers often stop calling watchPosition while the phone is stationary. Without fresh fixes
 * a parked car would go stale and drop to NO_FIX (silencing a DANGER alert), so after this
 * long without an update we ask for a fresh position explicitly.
 */
const REFRESH_AFTER_MS = 4_000;

export function watchGeolocation(
  onFix: (fix: SensorFix) => void,
  onError: (error: SourceError) => void,
): PositionSource {
  if (!("geolocation" in navigator)) {
    onError("unsupported");
    return { stop() {} };
  }

  let lastAt = Date.now();
  let refreshing = false;

  const emit = ({ coords, timestamp }: GeolocationPosition, confirmedNow = false) => {
    lastAt = Date.now();
    // A refresh with maximumAge 0 vouches for the position *now*, but some browsers hand back
    // the previous fix's timestamp when nothing moved; stamp it with the time it was confirmed.
    if (confirmedNow) timestamp = Math.max(timestamp, lastAt);
    onFix({
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy: coords.accuracy,
      speed: coords.speed,
      heading: coords.heading === null || Number.isNaN(coords.heading) ? null : coords.heading,
      timestamp,
    });
  };
  const fail = (err: GeolocationPositionError) => {
    // TIMEOUT is not fatal: the watch keeps running and staleness turns into NO_FIX.
    if (err.code === err.PERMISSION_DENIED) onError("denied");
    else if (err.code === err.POSITION_UNAVAILABLE) onError("unavailable");
  };

  const id = navigator.geolocation.watchPosition((pos) => emit(pos), fail, OPTIONS);
  const refresher = setInterval(() => {
    if (refreshing || Date.now() - lastAt < REFRESH_AFTER_MS) return;
    refreshing = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        refreshing = false;
        emit(pos, true);
      },
      (err) => {
        refreshing = false;
        fail(err);
      },
      OPTIONS,
    );
  }, 1_000);

  return {
    stop: () => {
      clearInterval(refresher);
      navigator.geolocation.clearWatch(id);
    },
  };
}
