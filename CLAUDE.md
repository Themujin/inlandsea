# Shoreline Guard (Next.js static-export PWA)
Spec: docs/SPEC.md (source of truth)
- next.config.ts uses output: 'export'. No API routes, server actions, middleware or ISR.
- Anything touching navigator/window/AudioContext/IndexedDB/MapLibre is 'use client'
  and loaded via next/dynamic({ ssr: false }) or inside useEffect.
- src/engine is pure TS: no DOM, no React, no Next imports.
- Every engine change needs Vitest cases with expected metres (±1 m).
- Thresholds live only in public/config.json.
- Never send coordinates over the network.
- Run `npm run test && npm run build && npm run e2e` before every commit.
- Service worker: app/sw.ts is bundled by scripts/build-sw.ts (esbuild + @serwist/build
  injectManifest over out/) after `next build`, not by @serwist/next.

@AGENTS.md
- Brand: docs/BRAND.md. Colours/type come from app/brand.css tokens (bg-sea, bg-state-danger-strong, ...);
  never hard-code hex in components. White text only on -strong state shades.
