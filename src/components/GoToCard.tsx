"use client";

import type { GoToPlan } from "@/engine/route";
import type { Dictionary } from "@/i18n";
import { formatTripDistance } from "@/lib/format";
import { useDestination } from "@/store/destination";
import { useMonitor } from "@/store/monitor";

/** Below this speed the GPS heading is noise; show a north-up arrow instead. */
const MIN_HEADING_SPEED = 2;
/** Mention the off-road leg to the first track when it is at least this long. */
const OFFROAD_NOTE_M = 50;

interface Props {
  t: Dictionary;
  /** Plan from the current fix, or null when there is no fix yet. */
  route: GoToPlan | null;
  monitoring: boolean;
}

/** "Go to" read-out: distance and direction to the marked point, and a shore-band warning. */
export function GoToCard({ t, route, monitoring }: Props) {
  const fix = useMonitor((s) => s.fix);
  const clear = useDestination((s) => s.setDestination);

  const relative = fix?.heading != null && (fix.speed ?? 0) >= MIN_HEADING_SPEED;
  const rotation = route ? (relative ? route.bearing - fix!.heading! : route.bearing) : 0;

  return (
    <div data-testid="goto-card" className="flex items-center gap-3 rounded-card bg-[var(--app-bg)]/95 p-2 shadow-lg backdrop-blur">
      {route && (
        <svg
          width={40}
          height={40}
          viewBox="0 0 100 100"
          role="img"
          aria-label={t.goto.bearing}
          style={{ transform: `rotate(${rotation}deg)`, transition: "transform 300ms ease-out" }}
          className="shrink-0 text-channel dark:text-lagoon"
        >
          <path d="M50 8 L80 70 L50 56 L20 70 Z" fill="currentColor" />
        </svg>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {t.goto.title}
          {route && (
            <span className="ms-2 text-lg font-extrabold tabular-nums" data-testid="goto-distance">
              {formatTripDistance(route.distanceM, t)}
            </span>
          )}
        </p>
        {!route && !monitoring && <p className="text-xs text-muted">{t.goto.startForDistance}</p>}
        {route?.crossesBand && (
          <p role="alert" className="text-xs font-semibold text-state-danger-strong dark:text-state-danger">
            {t.goto.crosses}
          </p>
        )}
        {route && (
          <p className="text-xs text-muted">
            {route.kind === "roads" ? t.goto.viaRoads : t.goto.straight}
            {route.kind === "roads" &&
              route.accessM >= OFFROAD_NOTE_M &&
              ` · ${t.goto.offroad.replace("{n}", formatTripDistance(route.accessM, t))}`}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => clear(null)}
        className="shrink-0 rounded-button border border-line px-3 py-1 text-sm font-semibold"
      >
        {t.goto.clear}
      </button>
    </div>
  );
}
