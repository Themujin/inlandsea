# Shoreline Guard — PWA Spec (Next.js)

**As of:** 29 October 2026 · **Author:** Khan

An installable PWA that uses the phone's GPS to warn drivers when they are within 30 m of the shoreline on the regulated coast from Sealine to Khor Al Adaid (Inland Sea), Qatar.

---

## 1. The rule

Since 23 October 2026, vehicles on the coast from Sealine to Khor Al Adaid must stay at least 30 m from the shoreline. Offenders face imprisonment and/or a fine of up to QR 100,000.

| Item | Detail |
| --- | --- |
| Announced by | Internal Security Force (Lekhwiya), Environmental Security Group, with MoECC's Department of Natural Reserves |
| Announced | Friday, 23 October 2026 (official announcement + awareness video on X) |
| Area | Beaches from Sealine south to Khor Al Adaid |
| Rule | No driving along the beach; keep at least 30 m from the shoreline |
| Penalty | Imprisonment, a fine up to QR 100,000, or either |
| Legal basis | Law No. 19 of 2004 on the protection of wildlife and its natural habitats |
| Purpose | Beachgoer safety and protection of the coastal environment |

**Open questions the announcements don't answer**

- How "shoreline" is measured: high-tide line, current waterline, or a surveyed line. Tides move the waterline by tens of metres on flat sabkha shores.
- Whether the rule covers parked vehicles, camps and the Sealine motorhome beach, or only moving vehicles.
- Exact northern/southern endpoints, and whether the Khor's inner lagoon shore counts.
- Whether an official geofence/map will be published.

---

## 2. Product summary

**Goals**

- Show SAFE / CAUTION (30–60 m) / DANGER (< 30 m) within 2 s of a GPS fix.
- Work fully offline — the corridor has weak or no coverage.
- Usable in a phone mount while driving: big colours, sound, vibration, no taps needed.
- Arabic/English with RTL.

**Non-goals (v1)**

- Legal certainty — it is an aid, not an official compliance tool.
- Navigation or route planning.
- Accounts, cloud sync or user tracking. Location never leaves the device.
- Background tracking with the screen off (not possible in a PWA).

**Users:** weekend 4x4 drivers and campers, desert safari operators, motorhome visitors at Sealine.

---

## 3. Danger-zone model

The zone = shoreline polyline + distance rule (not a hand-drawn polygon), so the 30 m threshold stays a config value.

**Geometry layers** (GeoJSON, WGS84, in `public/geo/`)

| Layer | Type | Purpose |
| --- | --- | --- |
| `corridor.geojson` | Polygon | Regulated stretch, ~2 km inland. Outside → OUT OF AREA, no shoreline maths. |
| `shoreline.geojson` | (Multi)LineString | Line the 30 m is measured from, split into ≤ 200 m segments. Inner Khor shore flagged `inner: true`. |
| `exclusions.geojson` | Polygon (optional) | Paved roads, resort car park, motorhome beach — only if confirmed exempt. |
| `meta.json` | JSON | Version, sources, date, SHA-256 per file |

**States** (thresholds in `public/config.json`)

| State | Distance | UI |
| --- | --- | --- |
| DANGER | < 30 m (`dangerMeters`) | Red full screen, siren, vibration, "Move inland" + arrow |
| CAUTION | 30–60 m (`cautionMeters`) | Amber, single chime |
| SAFE | > 60 m, inside corridor | Green, distance shown |
| OUT_OF_AREA | Outside corridor | Grey |
| NO_FIX | No position or accuracy > 50 m | Grey, "Waiting for GPS" + accuracy |

**Rough extent (approximate):** lat 24.45°–24.95° N, lon 51.00°–51.65° E — pre-filter only; the corridor polygon is authoritative.

**Tide margin:** trace the shoreline at the landward (high-water) edge and keep `dangerMeters = 30`. Warn early, never late.

---

## 4. Detection logic

One pure function per fix: `evaluate(fix, geometry, config) → ZoneResult`, < 5 ms on a mid-range phone.

1. **Accept the fix** — reject if `accuracy > 50 m` or older than 10 s → NO_FIX.
2. **Corridor test** — bbox pre-check, then point-in-polygon → else OUT_OF_AREA.
3. **Candidate segments** — RBush query, ±0.01° box.
4. **Distance** — min point-to-segment distance + nearest point.
5. **Accuracy-adjusted** — `effective = distance − min(accuracy, 25)`.
6. **Classify** against `dangerMeters` / `cautionMeters`.
7. **Smooth** with hysteresis; fire alerts only on transitions.
8. **Escape bearing** — from nearest shoreline point to user (inland arrow).

**Distance maths:** local equirectangular projection around the user's latitude, then Euclidean point-to-segment. At 24.8° N over < 1 km, error is well under 1 m.

```
x = R · Δλ · cos(φ0),   y = R · Δφ,   R = 6,371,000 m
```

Turf.js `pointToLineDistance` is an acceptable drop-in.

**Hysteresis & noise**

- Enter DANGER after 2 consecutive fixes < 30 m; exit after 3 consecutive fixes > 35 m. CAUTION: 60 / 65 m.
- `speed < 1.5 m/s` for 60 s → "Parked within 30 m" (stays red, siren off).
- Ignore jumps implying > 60 m/s.

---

## 5. Functional requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-01 | Onboarding explains the rule and requests location; handles "denied" with re-enable steps. | Must |
| FR-02 | One-tap start/stop; `watchPosition` with `enableHighAccuracy: true, maximumAge: 0, timeout: 15000`. | Must |
| FR-03 | Show state, distance (m), GPS accuracy, inland arrow. | Must |
| FR-04 | DANGER entry: red screen, Web Audio siren, `navigator.vibrate`, AR + EN text. Stops on exit or "Acknowledge" (re-arms after 2 min). | Must |
| FR-05 | Screen Wake Lock while monitoring; re-acquire on `visibilitychange`. | Must |
| FR-06 | Fully offline after first load (shell, geometry, map tiles). | Must |
| FR-07 | Map: corridor, shoreline, shaded 30 m band, user dot + accuracy circle. | Should |
| FR-08 | Voice alerts via `speechSynthesis`. | Should |
| FR-09 | Settings: language, sound/vibration, caution distance (60–150 m), inner Khor toggle. | Should |
| FR-10 | On-device trip log (IndexedDB), GPX/CSV export, one-tap delete. | Could |
| FR-11 | Simulate mode replaying a GPX track. | Must (dev) |
| FR-12 | Geometry version in About; check for update when online. | Should |
| FR-13 | Persistent disclaimer (first run + About). | Must |

---

## 6. Architecture & tech stack (Next.js)

The app is client-only. Next.js is used as a build and routing framework with **static export** (`output: 'export'`) — no server runtime, no API routes in v1. Deploy the `out/` folder to Azure Static Web Apps, Vercel, GitHub Pages or any CDN over HTTPS.

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js (latest stable, App Router) + React 19 + TypeScript strict | `output: 'export'`, `images.unoptimized: true`, `trailingSlash: true` |
| PWA / service worker | Serwist (`@serwist/next`) | Successor to `next-pwa`. Precache shell + `public/geo/*`; runtime cache for tiles. If its Turbopack support isn't stable for your Next version, run production builds with `next build --webpack`. |
| Manifest | `app/manifest.ts` (Next metadata route) | AR/EN name, `display: standalone`, `orientation: portrait`, maskable icons |
| Geo maths | Turf.js (modular imports) + RBush | Point-in-polygon, point-to-line, spatial index |
| Map | MapLibre GL JS + PMTiles | Load via `next/dynamic` with `ssr: false`; PMTiles file in `public/tiles/` |
| State | Zustand | Zone state, settings, monitoring flag |
| Storage | IndexedDB via `idb` | Trip log, settings |
| i18n | `next-intl` in static mode, or a light client dictionary | Locale segments `/en`, `/ar` with `generateStaticParams`; `<html dir="rtl">` for Arabic |
| Styling | Tailwind CSS v4 | High-contrast, large touch targets, logical properties for RTL |
| Tests | Vitest (engine), Playwright (E2E with mocked geolocation) | |

**Client-only rules (important in Next.js)**

- Every component touching `navigator`, `window`, `AudioContext`, `IndexedDB` or MapLibre is a Client Component (`'use client'`).
- Browser-only modules are imported dynamically (`next/dynamic`, `ssr: false`) or inside `useEffect`, so the static prerender never touches them.
- The engine stays framework-free and is imported by client components only.

**Folder layout**

```
shoreline-guard/
├─ app/
│  ├─ [locale]/
│  │  ├─ layout.tsx          # html lang/dir, fonts, providers
│  │  ├─ page.tsx            # Monitor screen (client)
│  │  ├─ map/page.tsx        # Map screen (MapLibre, dynamic import)
│  │  ├─ settings/page.tsx
│  │  ├─ about/page.tsx      # disclaimer, geometry version
│  │  └─ onboarding/page.tsx
│  ├─ manifest.ts
│  ├─ sw.ts                  # Serwist service worker source
│  └─ globals.css
├─ src/
│  ├─ engine/                # pure TS: evaluate(), index, hysteresis — no DOM/React
│  │  ├─ evaluate.ts
│  │  ├─ geometry.ts
│  │  ├─ hysteresis.ts
│  │  └─ __tests__/
│  ├─ sensors/               # geolocation, wakeLock, audio, vibrate, speech
│  ├─ store/                 # Zustand stores
│  ├─ components/            # StatusPanel, InlandArrow, AlertOverlay, ...
│  └─ i18n/                  # en.json, ar.json
├─ public/
│  ├─ geo/                   # corridor, shoreline, exclusions, meta.json
│  ├─ tiles/corridor.pmtiles
│  ├─ config.json            # thresholds
│  └─ icons/
├─ scripts/                  # shoreline data pipeline (Node/tsx)
├─ e2e/                      # Playwright specs + GPX fixtures
├─ docs/SPEC.md              # this file
├─ CLAUDE.md
└─ next.config.ts
```

**`next.config.ts` sketch**

```ts
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist({
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
});
```

---

## 7. Shoreline data pipeline

A generic world coastline is 50–500 m off here — useless for a 30 m rule. The line must be traced.

| Source | Resolution | Use |
| --- | --- | --- |
| OpenStreetMap `natural=coastline` (Overpass) | Variable | Starting line |
| Sentinel-2 NDWI water mask at several tide states | 10 m | Derive high-water line |
| Manual QGIS tracing over satellite imagery | ~5 m | Fix OSM errors; mark inner Khor shore |
| Official MoECC / Lekhwiya geofence | Unknown | Replace all if published |

**Scripts** (run with `tsx`):

1. `fetch-osm.ts` — Overpass query within the bbox → raw GeoJSON.
2. `clip.ts` — clip to corridor; drop unreachable islands.
3. `simplify.ts` — Douglas–Peucker, 2 m tolerance; split into ≤ 200 m segments.
4. `validate.ts` — no gaps > 50 m, no self-intersections, test points classify correctly.
5. `build-meta.ts` — `meta.json` with version, sources, date, hashes.

**Size targets:** shoreline < 400 KB (gzip < 100 KB), corridor < 20 KB.

---

## 8. Constraints & disclaimers

| Constraint | Impact | Mitigation |
| --- | --- | --- |
| No background geolocation in PWAs | Alerts stop when screen locks / app is backgrounded | Wake Lock; mount phone with app open; v2 = Capacitor wrapper around the static export |
| iOS has no `navigator.vibrate` | No haptics on iPhone | Sound + visuals; prompt to unmute |
| Audio autoplay rules | Siren blocked until user gesture | "Start monitoring" tap unlocks AudioContext |
| HTTPS required | Geolocation blocked on HTTP | HTTPS hosting; `localhost` for dev |
| Static export limits | No API routes, middleware, ISR or Image Optimization | Not needed in v1; add a separate API if ever required |
| GPS accuracy 3–15 m in open desert | Close to the 30 m threshold | Accuracy-adjusted distance, hysteresis, NO_FIX > 50 m |
| Undefined official shoreline | App line may differ from patrols' | High-water trace; show source + date |

**Disclaimer (EN, translate to AR):**
> Shoreline Guard is an unofficial safety aid. Distances are estimates based on your phone's GPS and mapped shoreline data, which may be inaccurate. Always follow signs, ranger and Lekhwiya instructions. You remain responsible for complying with the law.

**Privacy:** no analytics on location, no network calls carrying coordinates; trip log stays in IndexedDB until deleted.

---

## 9. Claude Code build plan

Six milestones, each ending with green tests and a commit.

1. **M1 — Scaffold.** `create-next-app` (TS, App Router, Tailwind, ESLint), static export config, Serwist, `app/manifest.ts`, Vitest, Playwright, locale routing `/en` `/ar`.
2. **M2 — Engine.** `src/engine/` with `evaluate()`, RBush index, hysteresis; placeholder geometry; full unit coverage.
3. **M3 — Sensors + Monitor screen.** Geolocation hook, Wake Lock, Web Audio siren, vibration, speech; big state UI; Simulate mode from GPX.
4. **M4 — Data pipeline.** `scripts/` fetch → clip → simplify → validate → meta; replace placeholder geometry.
5. **M5 — Map + offline.** MapLibre via `next/dynamic` (`ssr: false`), PMTiles, 30 m band layer; Serwist precache; verify airplane mode.
6. **M6 — Polish.** RTL, settings, onboarding, disclaimer, trip log, Lighthouse PWA/perf ≥ 95.

**`CLAUDE.md`**

```markdown
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
```

**Kickoff prompt**

```markdown
Read docs/SPEC.md. Build milestones M1 and M2 only.

Create a Next.js (latest stable, App Router, TypeScript strict) PWA called Shoreline Guard
configured for static export (output: 'export', trailingSlash, images.unoptimized).
Add Tailwind, Serwist (@serwist/next) with app/sw.ts, app/manifest.ts, Vitest and Playwright,
and /en and /ar locale segments using generateStaticParams (dir="rtl" for ar).

Implement src/engine/evaluate.ts as pure TypeScript: given a GPS fix
{lat, lon, accuracy, speed, timestamp}, the corridor polygon and shoreline segments,
return {state, distanceM, effectiveM, nearestPoint, bearingInland}.
States: DANGER <30 m, CAUTION <60 m, SAFE, OUT_OF_AREA,
NO_FIX (accuracy >50 m or fix older than 10 s). effective = distance - min(accuracy, 25).
Use an RBush index and a local equirectangular projection for point-to-segment distance.
Add hysteresis (enter after 2 fixes, exit after 3 fixes beyond threshold + 5 m).
Test against a synthetic straight shoreline and assert distances to ±1 m.

Confirm `next build` produces out/ with sw.js and manifest.webmanifest.
Stop after M2 and summarise what to verify.
```

---

## 10. Testing & acceptance

Done when a simulated coastal drive flips to DANGER within 2 fixes of crossing 30 m and never shows SAFE inside it.

| Test | Method | Pass |
| --- | --- | --- |
| Distance accuracy | Vitest, synthetic line, 50 known offsets | ≤ 1 m error |
| Real geometry | Vitest, 20 points at 0/15/29/31/59/61/500 m | Correct state each |
| Accuracy handling | Fixes at 5, 25, 51 m accuracy | 51 → NO_FIX; 25 m fix at 50 m → DANGER |
| Hysteresis | GPX oscillating 28–33 m | ≤ 1 DANGER entry/min |
| Performance | 1,000 evaluations | p95 < 5 ms, mid-range Android |
| Static build | `next build` | `out/` contains all locale pages, `sw.js`, manifest |
| Offline | Playwright, offline after first load | App, geometry, tiles load |
| E2E alerts | Playwright, mocked geolocation | Red overlay + audio on DANGER |
| Field test | Sealine → Khor in a 4x4, iOS + Android vs handheld GPS, low and high tide | Alert ≤ 5 s after crossing; no misses |

---

## 11. Sources

- [Lekhwiya bans vehicles on beaches from Sealine to Inland Sea — Qatar Tribune](https://www.qatar-tribune.com/article/260699/latest-news/lekhwiya-bans-vehicles-on-beaches-from-sealine-to-inland-sea)
- [Driving Within 30 Metres of Shoreline Prohibited from Sealine to Khor Al Adaid — Qatar Living](https://www.qatarliving.com/en/article/driving-within-30-metres-of-shoreline-prohibited-sealine-khor-al-adaid)
- [لخويا تحذر: ترك مسافة 30 مترًا شرط للقيادة بمحاذاة شواطئ سيلين وخور العديد — Al Raya](https://www.raya.com/2026/10/23/لخويا-تحذر-ترك-مسافة-30-مترا-شرط-للقيادة-بمحاذاة-شواطئ-سيلين-وخور-العديد)
- [البيئة ولخويا تحذران من قيادة المركبات بمحاذاة شواطئ سيلين وخور العديد — Al Raya](https://www.raya.com/2026/10/24/البيئة-ولخويا-تحذران-من-قيادة-المركبات-بمحاذاة-شواطئ-سيلين-وخور-العديد)
