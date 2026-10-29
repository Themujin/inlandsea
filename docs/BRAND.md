# Shoreline Guard · حارس الشاطئ — Brand kit

Concept A (Shield): sand on top, the sea below, and a dashed red line marking the 30 m buffer. The dot is "you are here".

## Drop-in

Copy the folders into the Next.js project root. Paths already match the spec's layout.

```
app/
  favicon.ico            16/32/48, simplified mark (auto-detected by Next.js)
  icon.svg               rounded master icon (auto-detected)
  apple-icon.png         180×180, full bleed (auto-detected)
  manifest.ts            PWA manifest (force-static for output: "export")
  brand.css              Tailwind v4 @theme tokens
  [locale]/layout.example.tsx   fonts, metadata, viewport, theme colour
public/
  icons/                 icon-192/512, icon-maskable-192/512, icon-monochrome-512, SVG sources
  brand/                 logos (SVG, text outlined), marks, og-image.svg; png/ has @2x PNGs
  og-image.png           1200×630 link preview
src/components/BrandLogo.tsx    locale- and dark-mode-aware logo
scripts/build-brand.py          regenerates every asset
```

Then in `app/globals.css`:

```css
@import "tailwindcss";
@import "./brand.css";
```

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| `sea` | #0B3B5C | Primary, icon ground, light-mode text |
| `sand` | #EBCB8F | Land, highlights |
| `lagoon` | #1FA3A0 | Accent; links on dark |
| `channel` | #12708A | Secondary; links on light |
| `alert` | #E5484D | The 30 m line, DANGER |
| `foam` | #F7F1E3 | Light ground; text on dark |
| `ink` | #0E2230 | Dark ground |

**Zone states.** Use the `-strong` shade for any surface that carries white text.

| State | Fill | With white text | Contrast (white) |
| --- | --- | --- | --- |
| DANGER | `state-danger` #E5484D | `state-danger-strong` #B4232A | 6.5:1 |
| CAUTION | `state-caution` #F5A524 (ink text, 8.0:1) | `state-caution-strong` #A85F00 | 4.9:1 |
| SAFE | `state-safe` #2E9E6A | `state-safe-strong` #1D7A4F | 5.3:1 |
| OUT OF AREA / NO FIX | `state-idle` #8A96A3 | `state-idle-strong` #4F5B66 | 7.0:1 |

Never rely on colour alone for state: always show the word (SAFE / CAUTION / DANGER) and the distance.

## Type

- **Inter** 800 for the wordmark and big numbers; 400–600 for UI.
- **IBM Plex Sans Arabic** 700 for the Arabic name; 400–600 for Arabic UI.
- Both load via `next/font/google` (self-hosted at build time, so they work offline).
- `text-distance` (88 px) and `text-state` (36 px) are sized for a phone in a car mount.

## Logo rules

- Lockups: `logo-en-*`, `logo-ar-*` (mark on the right for RTL), `logo-bi-*` (English over Arabic). `-light` for light grounds, `-dark` for dark.
- Clear space around a logo = the height of the shield's dot ring (about 1/5 of the mark's height).
- Minimum size: mark 24 px tall; lockup 32 px tall. Below 32 px use the favicon, which has thicker strokes.
- Don't recolour the scene, rotate it, drop the dashed line, or put the light lockup on a busy photo.
- All logo text is outlined to paths, so no font is needed to display it.

## Icons

| File | Purpose |
| --- | --- |
| `icon-192.png`, `icon-512.png` | Manifest `any` |
| `icon-maskable-*.png` | Manifest `maskable`; shield scaled to 80% to sit inside the safe zone |
| `icon-monochrome-512.png` | Android themed icons (white on transparent) |
| `favicon-16/32.png`, `favicon.ico` | Simplified: thicker rim and line, no dot |
| `apple-icon.png` | iOS home screen |

## Regenerating

```bash
pip install cairosvg uharfbuzz fonttools brotli pillow
npm pack @fontsource/inter @fontsource/ibm-plex-sans-arabic   # then untar into ./fonts
python3 scripts/build-brand.py   # writes to ./brand-out
```

Edit the palette constants at the top of the script and rerun to reskin everything.

Fonts: Inter and IBM Plex Sans Arabic, both under the SIL Open Font License.
