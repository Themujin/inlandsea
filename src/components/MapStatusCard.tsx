"use client";

import type { ZoneState } from "@/engine/types";
import type { Dictionary } from "@/i18n";
import { formatAccuracy, formatDistance } from "@/lib/format";
import { useMonitor } from "@/store/monitor";
import { InlandArrow } from "./InlandArrow";

// Same state colours as the Monitor screen (BRAND.md: white text only on -strong shades).
const CARD: Record<ZoneState, string> = {
  DANGER: "bg-state-danger-strong text-white",
  CAUTION: "bg-state-caution text-ink",
  SAFE: "bg-state-safe-strong text-white",
  OUT_OF_AREA: "bg-state-idle-strong text-white",
  NO_FIX: "bg-state-idle-strong text-white",
};

/** Monitor read-out on top of the map, so drivers never need to switch screens. */
export function MapStatusCard({ t }: { t: Dictionary }) {
  const status = useMonitor((s) => s.status);
  const mode = useMonitor((s) => s.mode);
  const result = useMonitor((s) => s.result);
  const fix = useMonitor((s) => s.fix);

  const state: ZoneState = result?.state ?? "NO_FIX";
  const near = state === "DANGER" || state === "CAUTION" || state === "SAFE";
  const accuracy = formatAccuracy(fix?.accuracy ?? null, t);

  return (
    // Clears the top-left (i) credit button.
    <div className="absolute inset-x-3 top-3 ms-12 flex justify-center">
      <div
        data-testid="map-status"
        data-state={state}
        aria-live="polite"
        className={`flex w-full max-w-sm items-center gap-3 rounded-card px-4 py-3 shadow-lg ${CARD[state]}`}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-lg font-extrabold leading-tight">
            {status === "starting" ? t.starting : t.states[state]}
            {mode === "sim" && (
              <span className="rounded-button bg-black/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                {t.simulation}
              </span>
            )}
          </p>
          {near ? (
            <p className="text-4xl font-extrabold leading-none tabular-nums" data-testid="map-distance">
              {formatDistance(result?.distanceM ?? null, t)}
            </p>
          ) : (
            <p className="text-sm opacity-90">{t.stateHints[state]}</p>
          )}
          {accuracy && <p className="mt-1 text-xs tabular-nums opacity-90">{accuracy}</p>}
        </div>
        {near && (
          <InlandArrow
            bearing={result?.bearingInland ?? null}
            heading={fix?.heading ?? null}
            speed={fix?.speed ?? null}
            t={t}
            size={64}
            compact
          />
        )}
      </div>
    </div>
  );
}
