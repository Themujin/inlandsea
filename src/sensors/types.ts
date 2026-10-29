import type { Fix } from "@/engine/types";

/** Engine fix plus direction of travel, which the engine does not need. */
export interface SensorFix extends Fix {
  /** Degrees clockwise from north; `null` when stationary or unknown. */
  heading: number | null;
}

export type SourceError = "denied" | "unavailable" | "unsupported";

/** A running position source. Call `stop()` to end it. */
export interface PositionSource {
  stop(): void;
}
