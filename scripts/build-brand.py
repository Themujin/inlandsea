"""Builds the Shoreline Guard icon set and brand kit (concept A: Shield)."""
import io, os, shutil
import cairosvg
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from PIL import Image

# Writes into ./brand-out (copy the app/ and public/ folders from there into the project).
OUT = os.path.abspath("brand-out")
FONTS = os.path.abspath("fonts")  # unpacked @fontsource tarballs
INTER_800 = f"{FONTS}/fontsource-inter-5.3.0/package/files/inter-latin-800-normal.woff2"
INTER_600 = f"{FONTS}/fontsource-inter-5.3.0/package/files/inter-latin-600-normal.woff2"
PLEX_AR_700 = f"{FONTS}/fontsource-ibm-plex-sans-arabic-5.3.0/package/files/ibm-plex-sans-arabic-arabic-700-normal.woff2"

# ---- palette ----
NAVY = "#0B3B5C"      # Deep sea
SAND = "#EBCB8F"      # Sand
LAGOON = "#1FA3A0"    # Lagoon
CHANNEL = "#12708A"   # Channel
ALERT = "#E5484D"     # Alert red
CREAM = "#F7F1E3"     # Foam
INK = "#0E2230"       # Night ink (dark UI ground)

SHIELD = "M256 76 L388 122 V248 C388 334 332 398 256 436 C180 398 124 334 124 248 V122 Z"


def shield_art(uid, outline, small=False):
    """Shield scene in the 512 frame. `outline` = rim colour."""
    rim = 20 if small else 12
    line_w = 20 if small else 11
    dash = 'stroke-dasharray="70 30"' if small else 'stroke-dasharray="24 16"'
    dot = "" if small else (
        f'<circle cx="256" cy="176" r="30" fill="{NAVY}"/>'
        f'<circle cx="256" cy="176" r="11" fill="{CREAM}"/>')
    return f'''<defs><clipPath id="{uid}"><path d="{SHIELD}"/></clipPath></defs>
<g clip-path="url(#{uid})">
<rect x="100" y="60" width="312" height="400" fill="{SAND}"/>
<path d="M100 304 C150 284 204 324 256 304 C308 284 362 324 412 304 V460 H100 Z" fill="{LAGOON}"/>
<path d="M100 356 C150 336 204 376 256 356 C308 336 362 376 412 356 V460 H100 Z" fill="{CHANNEL}"/>
<path d="M100 252 C150 232 204 272 256 252 C308 232 362 272 412 252" fill="none" stroke="{ALERT}" stroke-width="{line_w}" {dash} stroke-linecap="round"/>
</g>{dot}
<path d="{SHIELD}" fill="none" stroke="{outline}" stroke-width="{rim}" stroke-linejoin="round"/>'''


def svg(w, h, body, vb=None, label="Shoreline Guard"):
    vb = vb or f"0 0 {w} {h}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{vb}" '
            f'role="img" aria-label="{label}">\n{body}\n</svg>\n')


def app_icon(scale=1.0, small=False, radius=0):
    """Full-bleed navy square with the shield; scale < 1 shrinks the shield for maskable safe zone."""
    t = f'transform="translate(256 256) scale({scale}) translate(-256 -256)"'
    bg = f'<rect width="512" height="512" rx="{radius}" fill="{NAVY}"/>'
    return svg(512, 512, f'{bg}<g {t}>{shield_art("sg-clip", CREAM, small)}</g>')


def monochrome_icon():
    body = f'''<g fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round">
<g transform="translate(256 256) scale(0.82) translate(-256 -256)">
<path d="{SHIELD}" stroke-width="22"/>
<path d="M150 252 C190 236 224 268 256 252 C288 236 322 268 362 252" stroke-width="18" stroke-dasharray="34 26"/>
<path d="M150 318 C190 302 224 334 256 318 C288 302 322 334 362 318" stroke-width="18"/>
<circle cx="256" cy="176" r="22" fill="#FFFFFF" stroke="none"/>
</g></g>'''
    return svg(512, 512, body)


def mark_only(outline=NAVY):
    """Transparent mark, tight viewBox, for lockups and in-app header."""
    return svg(288, 384, shield_art("sg-mark", outline), vb="112 64 288 384")


# ---- text to outlines ----
_fonts = {}

def _font(path):
    if path not in _fonts:
        tt = TTFont(path)
        buf = io.BytesIO(); tt.flavor = None; tt.save(buf)
        _fonts[path] = (TTFont(io.BytesIO(buf.getvalue())), buf.getvalue())
    return _fonts[path]


def text_outline(path, text, size, x, y, fill, tracking=0.0, rtl=False):
    """Returns (svg <path>, advance width) for text shaped with HarfBuzz and outlined."""
    tt, data = _font(path)
    face = hb.Face(data); font = hb.Font(face)
    upem = face.upem; font.scale = (upem, upem)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    if rtl:
        buf.direction = "rtl"
    hb.shape(font, buf, {"kern": True, "liga": True})
    gs = tt.getGlyphSet(); order = tt.getGlyphOrder()
    pen = SVGPathPen(gs)
    s = size / upem
    cx = 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        tp = TransformPen(pen, (s, 0, 0, -s, x + (cx + pos.x_offset) * s, y - pos.y_offset * s))
        gs[name].draw(tp)
        cx += pos.x_advance + tracking * upem
    width = (cx - tracking * upem) * s
    return f'<path d="{pen.getCommands()}" fill="{fill}"/>', width


EN_NAME = "Shoreline Guard"
AR_NAME = "حارس الشاطئ"
TAGLINE = "30 m coastal buffer alert"


def lockup(variant="light", lang="bi"):
    """Horizontal lockup. lang: 'en', 'ar', 'bi' (EN over AR)."""
    text_col = NAVY if variant == "light" else CREAM
    sub_col = CHANNEL if variant == "light" else LAGOON
    rim = NAVY if variant == "light" else CREAM
    mark_h = 160; mark_w = mark_h * 288 / 384
    gap = 36; pad = 24
    mark = (f'<svg x="{{mx}}" y="{pad}" width="{mark_w:.1f}" height="{mark_h}" viewBox="112 64 288 384">'
            f'{shield_art("sg-lock-" + variant + lang, rim)}</svg>')
    parts = []
    if lang == "en":
        p, w = text_outline(INTER_800, EN_NAME, 64, 0, 0, text_col, tracking=-0.02)
        t, tw = text_outline(INTER_600, TAGLINE, 26, 0, 0, sub_col)
        text_w = max(w, tw); H = mark_h + 2 * pad
        tx = pad + mark_w + gap
        parts.append(f'<g transform="translate({tx:.1f} {pad + 92})">{p}</g>')
        parts.append(f'<g transform="translate({tx:.1f} {pad + 138})">{t}</g>')
        W = tx + text_w + pad
        body = mark.replace("{mx}", str(pad)) + "".join(parts)
    elif lang == "ar":
        p, w = text_outline(PLEX_AR_700, AR_NAME, 72, 0, 0, text_col, rtl=True)
        H = mark_h + 2 * pad
        W = pad + w + gap + mark_w + pad
        parts.append(f'<g transform="translate({pad} {pad + 106})">{p}</g>')
        body = "".join(parts) + mark.replace("{mx}", f"{pad + w + gap:.1f}")
    else:
        p, w = text_outline(INTER_800, EN_NAME, 64, 0, 0, text_col, tracking=-0.02)
        a, aw = text_outline(PLEX_AR_700, AR_NAME, 46, 0, 0, sub_col, rtl=True)
        tx = pad + mark_w + gap; H = mark_h + 2 * pad
        parts.append(f'<g transform="translate({tx:.1f} {pad + 82})">{p}</g>')
        parts.append(f'<g transform="translate({tx:.1f} {pad + 146})">{a}</g>')
        W = tx + max(w, aw) + pad
        body = mark.replace("{mx}", str(pad)) + "".join(parts)
    label = {"en": EN_NAME, "ar": AR_NAME, "bi": f"{EN_NAME} · {AR_NAME}"}[lang]
    return svg(round(W), round(H), body, label=label)


def og_image():
    """1200x630 social / link preview card."""
    p, w = text_outline(INTER_800, EN_NAME, 84, 0, 0, CREAM, tracking=-0.02)
    a, aw = text_outline(PLEX_AR_700, AR_NAME, 56, 0, 0, SAND, rtl=True)
    t, tw = text_outline(INTER_600, "Stay 30 m back from the shore · Sealine to Khor Al Adaid", 26, 0, 0, LAGOON)
    body = f'''<rect width="1200" height="630" fill="{NAVY}"/>
<path d="M0 520 C150 495 300 545 450 520 C600 495 750 545 900 520 C1000 503 1100 530 1200 515 V630 H0 Z" fill="{LAGOON}" opacity="0.9"/>
<path d="M0 572 C150 547 300 597 450 572 C600 547 750 597 900 572 C1000 555 1100 582 1200 567 V630 H0 Z" fill="{CHANNEL}"/>
<path d="M60 470 C210 445 360 495 510 470 C660 445 810 495 960 470 C1040 457 1100 470 1140 466" fill="none" stroke="{ALERT}" stroke-width="10" stroke-dasharray="30 20" stroke-linecap="round"/>
<svg x="80" y="90" width="240" height="320" viewBox="112 64 288 384">{shield_art("sg-og", CREAM)}</svg>
<g transform="translate(370 210)">{p}</g>
<g transform="translate(370 300)">{a}</g>
<g transform="translate(370 370)">{t}</g>'''
    return svg(1200, 630, body)


def write(path, text):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(text)
    return full


def png(svg_text, path, size=None, w=None, h=None):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    kw = {}
    if size: kw = {"output_width": size, "output_height": size}
    if w: kw = {"output_width": w, "output_height": h}
    cairosvg.svg2png(bytestring=svg_text.encode(), write_to=full, **kw)
    return full


def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)

    icon = app_icon()
    icon_small = app_icon(small=True)
    maskable = app_icon(scale=0.8)
    mono = monochrome_icon()

    # Next.js app/ metadata files
    write("app/icon.svg", app_icon(radius=112))
    png(icon, "app/apple-icon.png", 180)
    ico_src = [Image.open(png(icon_small, f"_tmp/fav-{s}.png", s)) for s in (16, 32, 48)]
    ico_src[2].save(os.path.join(OUT, "app/favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)],
                    append_images=ico_src[:2])

    # PWA manifest icons
    write("public/icons/icon.svg", icon)
    write("public/icons/icon-maskable.svg", maskable)
    write("public/icons/icon-monochrome.svg", mono)
    for s in (192, 512):
        png(icon, f"public/icons/icon-{s}.png", s)
        png(maskable, f"public/icons/icon-maskable-{s}.png", s)
    png(mono, "public/icons/icon-monochrome-512.png", 512)
    png(icon_small, "public/icons/favicon-32.png", 32)
    png(icon_small, "public/icons/favicon-16.png", 16)

    # Brand marks and lockups
    write("public/brand/mark.svg", mark_only(NAVY))
    write("public/brand/mark-on-dark.svg", mark_only(CREAM))
    for variant in ("light", "dark"):
        for lang in ("en", "ar", "bi"):
            s = lockup(variant, lang)
            write(f"public/brand/logo-{lang}-{variant}.svg", s)
            png(s, f"public/brand/png/logo-{lang}-{variant}@2x.png",
                w=int(s.split('width="')[1].split('"')[0]) * 2,
                h=int(s.split('height="')[1].split('"')[0]) * 2)
    og = og_image()
    write("public/brand/og-image.svg", og)
    png(og, "public/og-image.png", w=1200, h=630)
    png(mark_only(NAVY), "public/brand/png/mark@2x.png", w=288 * 2, h=384 * 2)

    shutil.rmtree(os.path.join(OUT, "_tmp"))
    print("built", OUT)


if __name__ == "__main__":
    main()
