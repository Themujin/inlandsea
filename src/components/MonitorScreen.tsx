"use client";

import type { ZoneState } from "@/engine/types";
import type { Dictionary } from "@/i18n";
import { formatAccuracy, formatDistance } from "@/lib/format";
import { useMonitor } from "@/store/monitor";
import { InlandArrow } from "./InlandArrow";

// White text sits on the -strong shades; CAUTION keeps the bright fill with ink text (BRAND.md).
const PANEL: Record<ZoneState, string> = {
  DANGER: "bg-state-danger-strong text-white",
  CAUTION: "bg-state-caution text-ink",
  SAFE: "bg-state-safe-strong text-white",
  OUT_OF_AREA: "bg-state-idle-strong text-white",
  NO_FIX: "bg-state-idle-strong text-white",
};

/** FR-02/FR-03: one-tap start/stop and the big at-a-glance state panel. */
export function MonitorScreen({ t }: { t: Dictionary }) {
  const mode = useMonitor((s) => s.mode);
  const status = useMonitor((s) => s.status);
  const error = useMonitor((s) => s.error);
  const result = useMonitor((s) => s.result);
  const fix = useMonitor((s) => s.fix);
  const wakeLock = useMonitor((s) => s.wakeLock);
  const start = useMonitor((s) => s.start);
  const stop = useMonitor((s) => s.stop);

  if (!mode) {
    return (
      <section className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-card border-2 border-state-danger p-4">
            <p className="font-semibold">{t.errors[error]}</p>
            {error === "denied" && <p className="mt-1 text-sm text-muted">{t.errors.deniedSteps}</p>}
          </div>
        )}
        <button
          type="button"
          onClick={() => start("gps")}
          className="rounded-button bg-sea px-6 py-5 text-xl font-bold text-foam shadow-lg dark:bg-lagoon dark:text-ink"
        >
          {t.start}
        </button>
        <button
          type="button"
          onClick={() => start("sim")}
          className="rounded-button border border-line px-6 py-3 font-semibold"
        >
          {t.simulate}
        </button>
        <p className="text-center text-sm text-muted">{t.simulateHint}</p>
      </section>
    );
  }

  const state: ZoneState = result?.state ?? "NO_FIX";
  const showDistance = state === "DANGER" || state === "CAUTION" || state === "SAFE";
  const accuracy = formatAccuracy(fix?.accuracy ?? null, t);

  return (
    <section className="flex flex-col gap-4">
      <div
        data-testid="status-panel"
        data-state={state}
        aria-live="polite"
        className={`flex min-h-[55dvh] flex-col items-center justify-center gap-4 rounded-card p-6 text-center ${PANEL[state]}`}
      >
        {mode === "sim" && (
          <span className="rounded-button bg-black/25 px-3 py-1 text-xs font-bold uppercase tracking-wide">
            {t.simulation}
          </span>
        )}
        <p className="text-state font-extrabold">{status === "starting" ? t.starting : t.states[state]}</p>
        {showDistance ? (
          <>
            <p className="text-distance font-extrabold tabular-nums" data-testid="distance">
              {formatDistance(result?.distanceM ?? null, t)}
            </p>
            <p className="text-lg opacity-90">{t.fromShore}</p>
          </>
        ) : (
          <p className="text-lg opacity-90">{t.stateHints[state]}</p>
        )}
        {showDistance && (
          <InlandArrow
            bearing={result?.bearingInland ?? null}
            heading={fix?.heading ?? null}
            speed={fix?.speed ?? null}
            t={t}
          />
        )}
        {accuracy && <p className="text-sm tabular-nums opacity-90">{accuracy}</p>}
      </div>

      {error === "unavailable" && <p className="text-center text-sm text-muted">{t.errors.unavailable}</p>}
      {status === "running" && !wakeLock && (
        <p className="text-center text-sm text-muted">{t.wakeLockOff}</p>
      )}

      <button
        type="button"
        onClick={stop}
        className="rounded-button border border-line px-6 py-3 font-semibold"
      >
        {t.stop}
      </button>
    </section>
  );
}
