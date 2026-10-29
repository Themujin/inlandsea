"use client";

import dynamic from "next/dynamic";
import type { Dictionary } from "@/i18n";

// MapLibre touches window/WebGL at import time: never prerender it.
const MapView = dynamic(() => import("./MapView"), { ssr: false });

export function MapScreen({ t }: { t: Dictionary }) {
  return <MapView t={t} />;
}
