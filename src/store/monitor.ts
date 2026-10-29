import { create } from "zustand";
import type { TrackedResult } from "@/engine/hysteresis";
import type { EngineData } from "@/lib/engineData";
import { unlockAudio } from "@/sensors/audio";
import type { SensorFix, SourceError } from "@/sensors/types";

export type SourceMode = "gps" | "sim";
export type MonitorError = SourceError | "data";

/** FR-04: Acknowledge silences the siren for this long, then it re-arms. */
export const ACK_MS = 2 * 60 * 1000;

interface MonitorState {
  /** Requested source; MonitorRunner starts/stops sensors when this changes. */
  mode: SourceMode | null;
  status: "idle" | "starting" | "running" | "error";
  error: MonitorError | null;
  data: EngineData | null;
  fix: SensorFix | null;
  result: TrackedResult | null;
  /** Siren silenced until this epoch ms. */
  ackUntil: number;
  /** Siren currently sounding / currently silenced by Acknowledge. Set by MonitorRunner. */
  siren: boolean;
  silenced: boolean;
  wakeLock: boolean;

  start(mode: SourceMode): void;
  stop(): void;
  acknowledge(): void;
}

export const useMonitor = create<MonitorState>()((set) => ({
  mode: null,
  status: "idle",
  error: null,
  data: null,
  fix: null,
  result: null,
  ackUntil: 0,
  siren: false,
  silenced: false,
  wakeLock: false,

  start(mode) {
    // Called from the Start tap: the only moment browsers let us unlock audio.
    unlockAudio();
    set({ mode, status: "starting", error: null, fix: null, result: null, ackUntil: 0 });
  },
  stop() {
    set({ mode: null, status: "idle", fix: null, result: null, ackUntil: 0 });
  },
  acknowledge() {
    set({ ackUntil: Date.now() + ACK_MS });
  },
}));
