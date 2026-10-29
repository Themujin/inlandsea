"use client";

import { useEffect, useState } from "react";
import { evaluate } from "@/engine/evaluate";
import { ZoneTracker } from "@/engine/hysteresis";
import type { Dictionary, Locale } from "@/i18n";
import { loadEngineData } from "@/lib/engineData";
import { chime, setSiren } from "@/sensors/audio";
import { holdWakeLock, speak, vibrate } from "@/sensors/device";
import { watchGeolocation } from "@/sensors/geolocation";
import { SAMPLE_TRACK, replayGpx } from "@/sensors/simulate";
import type { PositionSource, SensorFix, SourceError } from "@/sensors/types";
import { useMonitor } from "@/store/monitor";

const SPEECH_LANG: Record<Locale, string> = { en: "en-GB", ar: "ar-QA" };
const STALE_CHECK_MS = 2000;

/**
 * Headless: owns the sensors while monitoring. Mounted in the locale layout so
 * monitoring survives navigation between the Monitor and Map screens.
 */
export function MonitorRunner({ locale, t }: { locale: Locale; t: Dictionary }) {
  const mode = useMonitor((s) => s.mode);
  const result = useMonitor((s) => s.result);
  const ackUntil = useMonitor((s) => s.ackUntil);
  const [rearm, setRearm] = useState(0);

  // Manifest shortcut "Start monitoring" opens /<locale>/?start=1, on whichever screen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("start") === "1" && useMonitor.getState().mode === null) {
      useMonitor.getState().start("gps");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Sensor pipeline: fix → evaluate → hysteresis → store.
  useEffect(() => {
    if (!mode) return;
    let cancelled = false;
    let source: PositionSource | null = null;
    let ticker: ReturnType<typeof setInterval> | undefined;
    let releaseWakeLock: (() => void) | null = null;

    loadEngineData()
      .then((data) => {
        if (cancelled) return;
        const tracker = new ZoneTracker(data.config);
        let last: SensorFix | null = null;
        const feed = (fix: SensorFix) => {
          const result = tracker.update(fix, evaluate(fix, data.geometry, data.config));
          useMonitor.setState({ fix, result });
        };
        const onFix = (fix: SensorFix) => {
          last = fix;
          useMonitor.setState({ error: null });
          feed(fix);
        };
        const onError = (error: SourceError) => {
          // A GPS "unavailable" is often transient; keep watching and just report it.
          if (mode === "gps" && error === "unavailable") useMonitor.setState({ error });
          else useMonitor.setState({ mode: null, status: "error", error });
        };

        useMonitor.setState({ data, status: "running" });
        source =
          mode === "gps"
            ? watchGeolocation(onFix, onError)
            : replayGpx(SAMPLE_TRACK, onFix, onError);
        // No new fix for maxFixAgeMs → re-evaluate the last one, which yields NO_FIX.
        ticker = setInterval(() => {
          if (last && Date.now() - last.timestamp > data.config.maxFixAgeMs) feed(last);
        }, STALE_CHECK_MS);
        releaseWakeLock = holdWakeLock((held) => useMonitor.setState({ wakeLock: held }));
      })
      .catch(() => useMonitor.setState({ mode: null, status: "error", error: "data" }));

    return () => {
      cancelled = true;
      source?.stop();
      clearInterval(ticker);
      releaseWakeLock?.();
      setSiren(false);
      useMonitor.setState({ siren: false, silenced: false, wakeLock: false });
    };
  }, [mode]);

  // One-shot cues on state transitions.
  useEffect(() => {
    if (!result?.changed) return;
    if (result.state === "DANGER") {
      vibrate([600, 200, 600, 200, 600]);
      speak(t.speech.DANGER, SPEECH_LANG[locale]);
    } else if (result.state === "CAUTION" && result.previous !== "DANGER") {
      chime();
      vibrate(250);
      speak(t.speech.CAUTION, SPEECH_LANG[locale]);
    }
  }, [result, t, locale]);

  // Continuous siren + vibration while in DANGER, unless parked or acknowledged.
  const danger = result?.state === "DANGER";
  const parked = result?.parked ?? false;
  useEffect(() => {
    const silencedFor = ackUntil - Date.now();
    const on = danger && !parked && silencedFor <= 0;
    setSiren(on);
    useMonitor.setState({ siren: on, silenced: danger && silencedFor > 0 });
    if (danger && silencedFor > 0) {
      const id = setTimeout(() => setRearm((n) => n + 1), silencedFor);
      return () => clearTimeout(id);
    }
    if (on) {
      const id = setInterval(() => vibrate([500, 250, 500]), 2500);
      return () => clearInterval(id);
    }
  }, [danger, parked, ackUntil, rearm]);

  return null;
}
