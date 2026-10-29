import { haversineM } from "./projection";
import type { EngineConfig, Fix, ZoneResult, ZoneState } from "./types";

export interface TrackedResult extends ZoneResult {
  /** Unsmoothed state from evaluate(). */
  raw: ZoneState;
  /** Displayed state differs from the previous displayed state: fire alerts. */
  changed: boolean;
  previous: ZoneState | null;
  /** DANGER while stationary for parkedAfterMs: keep red, silence the siren. */
  parked: boolean;
  /** Fix dropped as an implausible jump; output repeats the last result. */
  ignored: boolean;
}

type Level = 0 | 1 | 2;
const LEVEL_STATE: Record<Level, ZoneState> = { 0: "SAFE", 1: "CAUTION", 2: "DANGER" };
const STATE_LEVEL: Partial<Record<ZoneState, Level>> = { SAFE: 0, CAUTION: 1, DANGER: 2 };

/**
 * Smooths per-fix results (SPEC §4 "Hysteresis & noise"):
 * enter a stricter state after `enterFixes` consecutive fixes below its threshold,
 * leave it after `exitFixes` consecutive fixes beyond threshold + exitMargin.
 * After NO_FIX / OUT_OF_AREA the first valid fix is taken as-is (warn early, never late).
 */
export class ZoneTracker {
  private level: Level | null = null;
  private displayed: ZoneState | null = null;
  private belowDanger = 0;
  private belowCaution = 0;
  private clearDanger = 0;
  private clearCaution = 0;
  private lastFix: Fix | null = null;
  private slowSince: number | null = null;
  private last: TrackedResult | null = null;

  constructor(private readonly config: EngineConfig) {}

  reset(): void {
    this.level = null;
    this.displayed = null;
    this.resetStreaks();
    this.lastFix = null;
    this.slowSince = null;
    this.last = null;
  }

  get state(): ZoneState | null {
    return this.displayed;
  }

  update(fix: Fix, result: ZoneResult): TrackedResult {
    const c = this.config;
    const zoneLevel = STATE_LEVEL[result.state];

    if (zoneLevel !== undefined && this.lastFix && this.last) {
      const dt = (fix.timestamp - this.lastFix.timestamp) / 1000;
      if (dt > 0) {
        const jump = haversineM([this.lastFix.lon, this.lastFix.lat], [fix.lon, fix.lat]);
        if (jump / dt > c.maxSpeedMps) {
          return { ...this.last, changed: false, ignored: true };
        }
      }
    }

    let next: ZoneState;
    if (zoneLevel === undefined) {
      this.level = null;
      this.resetStreaks();
      this.slowSince = null;
      next = result.state;
    } else {
      const e = result.excluded || result.effectiveM === null ? Infinity : result.effectiveM;
      this.belowDanger = e < c.dangerMeters ? this.belowDanger + 1 : 0;
      this.belowCaution = e < c.cautionMeters ? this.belowCaution + 1 : 0;
      this.clearDanger = e > c.dangerMeters + c.exitMarginMeters ? this.clearDanger + 1 : 0;
      this.clearCaution = e > c.cautionMeters + c.exitMarginMeters ? this.clearCaution + 1 : 0;

      if (this.level === null) {
        this.level = zoneLevel;
      } else {
        if (this.level < 2 && this.belowDanger >= c.enterFixes) this.level = 2;
        else if (this.level < 1 && this.belowCaution >= c.enterFixes) this.level = 1;
        if (this.level === 2 && this.clearDanger >= c.exitFixes) this.level = 1;
        if (this.level === 1 && this.clearCaution >= c.exitFixes) this.level = 0;
      }
      next = LEVEL_STATE[this.level];
      this.trackSpeed(fix);
      this.lastFix = fix;
    }

    const parked =
      next === "DANGER" &&
      this.slowSince !== null &&
      fix.timestamp - this.slowSince >= c.parkedAfterMs;

    const out: TrackedResult = {
      ...result,
      state: next,
      raw: result.state,
      changed: next !== this.displayed,
      previous: this.displayed,
      parked,
      ignored: false,
    };
    this.displayed = next;
    this.last = out;
    return out;
  }

  private trackSpeed(fix: Fix): void {
    let speed = fix.speed;
    if (speed === null && this.lastFix) {
      const dt = (fix.timestamp - this.lastFix.timestamp) / 1000;
      if (dt > 0)
        speed = haversineM([this.lastFix.lon, this.lastFix.lat], [fix.lon, fix.lat]) / dt;
    }
    if (speed !== null && speed < this.config.parkedSpeedMps) this.slowSince ??= fix.timestamp;
    else if (speed !== null) this.slowSince = null;
  }

  private resetStreaks(): void {
    this.belowDanger = 0;
    this.belowCaution = 0;
    this.clearDanger = 0;
    this.clearCaution = 0;
  }
}
