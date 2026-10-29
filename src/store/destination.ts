import { create } from "zustand";
import type { LonLat } from "@/engine/types";

const KEY = "sg-destination";

function load(): LonLat | null {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) ? (v as LonLat) : null;
  } catch {
    return null;
  }
}

function save(dest: LonLat | null): void {
  try {
    if (dest) localStorage.setItem(KEY, JSON.stringify(dest));
    else localStorage.removeItem(KEY);
  } catch {}
}

interface DestinationState {
  /** Marked "go to" point. Stays on this device only (never sent anywhere). */
  destination: LonLat | null;
  setDestination(dest: LonLat | null): void;
}

export const useDestination = create<DestinationState>()((set) => ({
  destination: load(),
  setDestination(dest) {
    save(dest);
    set({ destination: dest });
  },
}));
