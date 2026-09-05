#!/usr/bin/env python3
"""
مولّد لوحة الواجهة المضيئة («قطعة النيون») لمكتب سفيان للموبايل
================================================================
ينتج ملفين متجهين بمقاس 1:1 بالمليمتر — 1800 × 620 مم:

  sign-lit.svg  — اللوحة مضاءة ليلاً (هالات توهّج + وجوه مضيئة)
  sign-off.svg  — اللوحة مطفأة نهاراً (أكريليك حليبي بلا توهّج)

التوهّج مبنيّ بطبقات خطوط متدرّجة السماكة لا بمرشّحات blur،
حتى يبقى الملف متجهاً بالكامل ويُستورد سليماً في كانفا والمطبعة.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from textpath import text_to_svg_path  # noqa: E402

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(HERE, "fonts")
OUT = os.path.join(HERE, "logo")

# ---------- الألوان ----------
DEEP = "#14343F"      # جسم اللوحة
PANEL = "#0C222A"     # وجه اللوحة ليلاً
GOLD = "#C8A96A"      # توهّج دافئ
MINT = "#7FE8DC"      # توهّج بارد لأنبوب الإطار
FACE_W = "#FFF6E6"    # وجه الحرف المضيء (أبيض دافئ)
FACE_C = "#E8FFFB"    # وجه بارد
OFF_FACE = "#DCD6C9"  # أكريليك حليبي مطفأ
OFF_EDGE = "#9AA6A4"

W, H = 1800, 620       # مقاس اللوحة بالمليمتر
R = 44                 # نصف قطر الزوايا

AR_NAME = "مكتب سفيان للموبايل"
LATIN = "SUFYAN MOBILE"

# هالات التوهّج: (زيادة السماكة، الشفافية) من الأوسع للأضيق
HALOS = [(78, 0.030), (60, 0.038), (46, 0.048), (34, 0.062),
         (24, 0.082), (16, 0.110), (9, 0.155), (4, 0.210)]


def glow_fill(d, color, face, lit=True):
    """مسار ممتلئ (نص) مع هالة توهّج حوله."""
    out = []
    if lit:
        for w, o in HALOS:
            out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
                       f'stroke-linejoin="round" opacity="{o}"/>')
    out.append(f'<path d="{d}" fill="{face}"/>')
    if not lit:
        out.append(f'<path d="{d}" fill="none" stroke="{OFF_EDGE}" stroke-width="3" '
                   f'stroke-linejoin="round" opacity=".7"/>')
    return "\n    ".join(out)


MARK_PATHS = [
    "M180,134 C180,154 166,166 142,166 L60,166",
    "M133,92 L133,158",
    "M84,108 L84,158",
    "M180,74 L180,140",
]


def glow_mark(k, tx, ty, color, face, lit=True):
    """الرمز كحرفٍ بارزٍ مضيء. k معامل التكبير من فضاء الرمز إلى المليمتر."""
    layers = []
    if lit:
        for w, o in HALOS:
            paths = "".join(f'<path d="{d}"/>' for d in MARK_PATHS)
            layers.append(f'<g stroke="{color}" stroke-width="{24 + w / k:.1f}" opacity="{o}">'
                          f'{paths}</g>')
    paths = "".join(f'<path d="{d}"/>' for d in MARK_PATHS)
    if not lit:
        layers.append(f'<g stroke="{OFF_EDGE}" stroke-width="27" opacity=".55">{paths}</g>')
    layers.append(f'<g stroke="{face}" stroke-width="24">{paths}</g>')
    inner = "\n      ".join(layers)
    return (f'  <g transform="translate({tx:.1f},{ty:.1f}) scale({k:.4f})" fill="none" '
            f'stroke-linecap="round" stroke-linejoin="round">\n      {inner}\n  </g>')


def frame_tube(lit=True):
    """أنبوب نيون فليكس يحيط بالإطار من الداخل."""
    inset = 30
    d = (f"M{inset + R},{inset} H{W - inset - R} A{R},{R} 0 0 1 {W - inset},{inset + R} "
         f"V{H - inset - R} A{R},{R} 0 0 1 {W - inset - R},{H - inset} "
         f"H{inset + R} A{R},{R} 0 0 1 {inset},{H - inset - R} "
         f"V{inset + R} A{R},{R} 0 0 1 {inset + R},{inset} Z")
    out = []
    if lit:
        for w, o in [(30, 0.10), (20, 0.16), (13, 0.28)]:
            out.append(f'<path d="{d}" fill="none" stroke="{MINT}" stroke-width="{w}" opacity="{o}"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{FACE_C}" stroke-width="6"/>')
    else:
        out.append(f'<path d="{d}" fill="none" stroke="{OFF_FACE}" stroke-width="7" opacity=".8"/>')
    return "  " + "\n  ".join(out)


def place_right(res, target_ink_w, x_right, y_top):
    """يقيس النص على العرض المطلوب ويحاذيه لليمين. يعيد (d, transform, height)."""
    k = target_ink_w / res["ink_w"]
    x1, y1, _, y2 = res["bbox"]
    tx = x_right - (x1 * k) - target_ink_w
    ty = y_top - (y1 * k)
    return res["d"], f"translate({tx:.2f},{ty:.2f}) scale({k:.5f})", (y2 - y1) * k


def build_sign(lit=True):
    body = []

    # جسم اللوحة
    bg = PANEL if lit else "#1B3F4B"
    body.append(f'  <rect x="0" y="0" width="{W}" height="{H}" rx="{R + 14}" fill="{bg}"/>')
    if lit:
        # انعكاس خفيف يوحي بلمعان الأكريليك
        body.append(f'  <rect x="0" y="0" width="{W}" height="{H}" rx="{R + 14}" '
                    f'fill="none" stroke="{MINT}" stroke-width="3" opacity=".22"/>')
    if lit:
        body.append(f'''  <defs>
    <radialGradient id="bloomWarm" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="{GOLD}" stop-opacity=".20"/>
      <stop offset="55%" stop-color="{GOLD}" stop-opacity=".07"/>
      <stop offset="100%" stop-color="{GOLD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bloomCool" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="{MINT}" stop-opacity=".16"/>
      <stop offset="100%" stop-color="{MINT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="{W * 0.42:.0f}" cy="{H / 2:.0f}" rx="{W * 0.40:.0f}" ry="{H * 0.46:.0f}" fill="url(#bloomWarm)"/>
  <ellipse cx="{W * 0.82:.0f}" cy="{H / 2:.0f}" rx="{W * 0.20:.0f}" ry="{H * 0.44:.0f}" fill="url(#bloomCool)"/>''')
    body.append(frame_tube(lit))

    face = FACE_W if lit else OFF_FACE

    # الرمز على اليمين
    mark_h = 296
    k = mark_h / 116.0                      # ارتفاع الرمز الفعلي 116 وحدة
    mark_w = 144 * k
    mx = W - 128 - mark_w                   # يبدأ من اليمين
    my = (H - mark_h) / 2
    # إحداثيات الرمز تبدأ من (48,62) فنزيحها إلى الأصل
    body.append(glow_mark(k, mx - 48 * k, my - 62 * k, GOLD, face, lit))

    # كتلة النص على يسار الرمز
    text_right = mx - 92
    ar = text_to_svg_path(AR_NAME, os.path.join(FONTS, "ElMessiri-arabic.woff2"),
                          weight=700, size=100, direction="rtl")
    la = text_to_svg_path(LATIN, os.path.join(FONTS, "Cairo-latin.woff2"),
                          weight=600, size=100, direction="ltr", letter_spacing=40)

    ar_w, la_w, gap = 900, 300, 46
    _, _, ar_h = place_right(ar, ar_w, text_right, 0)
    _, _, la_h = place_right(la, la_w, text_right, 0)
    y0 = (H - (ar_h + gap + la_h)) / 2

    d_ar, t_ar, _ = place_right(ar, ar_w, text_right, y0)
    d_la, t_la, _ = place_right(la, la_w, text_right, y0 + ar_h + gap)

    body.append(f'  <g transform="{t_ar}">\n    {glow_fill(d_ar, GOLD, face, lit)}\n  </g>')
    body.append(f'  <g transform="{t_la}">\n    '
                f'{glow_fill(d_la, MINT, FACE_C if lit else OFF_FACE, lit)}\n  </g>')

    name = "sign-lit.svg" if lit else "sign-off.svg"
    label = ("مكتب سفيان للموبايل — لوحة الواجهة مضاءة" if lit
             else "مكتب سفيان للموبايل — لوحة الواجهة مطفأة")
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
           f'width="{W}" height="{H}" role="img" aria-label="{label}">\n'
           f'  <title>{label}</title>\n' + "\n".join(body) + "\n</svg>\n")
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"  ✓ {name:16} {W}×{H} مم · {os.path.getsize(path) / 1024:,.0f} ك.ب")


if __name__ == "__main__":
    print("توليد لوحة الواجهة المضيئة…")
    build_sign(lit=True)
    build_sign(lit=False)
