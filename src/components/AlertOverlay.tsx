"use client";

import type { Dictionary, Locale } from "@/i18n";
import { formatDistance } from "@/lib/format";
import { useMonitor } from "@/store/monitor";
import { InlandArrow } from "./InlandArrow";

/**
 * FR-04: DANGER takes over the screen on every page, in both languages.
 * After Acknowledge (or once parked) it shrinks to a red banner so the map stays usable.
 */
interface Props {
  t: Dictionary;
  /** The other language's dictionary: the alert is always shown in Arabic and English. */
  other: Dictionary;
  otherLocale: Locale;
}

export function AlertOverlay({ t, other, otherLocale }: Props) {
  const result = useMonitor((s) => s.result);
  const fix = useMonitor((s) => s.fix);
  const siren = useMonitor((s) => s.siren);
  const silenced = useMonitor((s) => s.silenced);
  const acknowledge = useMonitor((s) => s.acknowledge);

  if (result?.state !== "DANGER") return null;
  const distance = formatDistance(result.distanceM, t);

  if (silenced || result.parked) {
    return (
      <div
        role="alert"
        data-testid="danger-banner"
        data-siren={siren ? "on" : "off"}
        className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-state-danger-strong px-4 py-3 text-white"
      >
        <span className="text-lg font-bold">
          {t.states.DANGER} · {distance}
        </span>
        <span className="text-sm">{result.parked ? t.parked : t.silenced}</span>
      </div>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby="danger-title"
      data-testid="danger-overlay"
      data-siren={siren ? "on" : "off"}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-state-danger-strong px-6 text-center text-white"
    >
      <div>
        <p id="danger-title" className="text-state font-extrabold">
          {t.states.DANGER}
        </p>
        <p className="mt-1 text-2xl font-bold opacity-90" lang={otherLocale}>
          {other.states.DANGER}
        </p>
      </div>
      <p className="text-distance font-extrabold tabular-nums">{distance}</p>
      <p className="text-lg">{t.stateHints.DANGER}</p>
      <InlandArrow
        bearing={result.bearingInland}
        heading={fix?.heading ?? null}
        speed={fix?.speed ?? null}
        t={t}
        size={120}
      />
      <button
        type="button"
        onClick={acknowledge}
        className="rounded-button bg-white px-6 py-4 text-lg font-bold text-state-danger-strong"
      >
        {t.acknowledge}
      </button>
    </div>
  );
}
