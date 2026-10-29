# Shoreline Guard (Next.js static-export PWA)
Spec: docs/SPEC.md (source of truth)
- next.config.ts uses output: 'export'. No API routes, server actions, middleware or ISR.
- Anything touching navigator/window/AudioContext/IndexedDB/MapLibre is 'use client'
  and loaded via next/dynamic({ ssr: false }) or inside useEffect.
- src/engine is pure TS: no DOM, no React, no Next imports.
- Every engine change needs Vitest cases with expected metres (±1 m).
- Thresholds live only in public/config.json (dangerMeters 30 = the law; tideMarginMeters 10 is
  added on top). UI copy uses {rule}/{tide}/{danger}/{caution} placeholders filled in src/i18n.
- Never send coordinates over the network.
- Run `npm run test && npm run build && npm run e2e` before every commit.
- Service worker: app/sw.ts is bundled by scripts/build-sw.ts (esbuild + @serwist/build
  injectManifest over out/) after `next build`, not by @serwist/next.

@AGENTS.md
- Brand: docs/BRAND.md. Colours/type come from app/brand.css tokens (bg-sea, bg-state-danger-strong, ...);
  never hard-code hex in components. White text only on -strong state shades.
- Map: MapLibre worker is served from public/vendor (copied by scripts/copy-vendor.ts on
  predev/prebuild). Satellite (Esri World Imagery) is on by default at the owner's request; tile
  requests reveal the viewed area, and the toggle turns it off. Licence for this use is unconfirmed.
- Shoreline data: `npm run geo:fetch` (OSM coastline → data/osm/) then `npm run geo:build`
  (→ public/geo + sample GPX). Stretch ends and Khor mouth live in scripts/geo/area.ts.
- Contours (opt-in, online): AWS Terrain Tiles → maplibre-contour in a worker; labels use
  MapLibre demotiles glyphs. "Go to" pin is stored in localStorage only; path is a straight
  line checked against the band by src/engine/route.ts (no routing server: coordinates stay local).
