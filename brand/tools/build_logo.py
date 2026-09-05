#!/usr/bin/env python3
"""
مولّد ملفات شعار «مكتب سفيان للموبايل»
=====================================
الفكرة: الحرف «س» مرسوم بأسنان متدرّجة الارتفاع تُقرأ في الوقت نفسه
كأعمدة إشارة الشبكة — الحرف الأول من «سفيان» + دلالة الموبايل.

كل الملفات الناتجة متجهة 100% (مسارات، بلا نصوص حيّة) فلا تحتاج
تنصيب خطوط عند فتحها في كانفا أو عند الطباعة.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from textpath import text_to_svg_path  # noqa: E402

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(HERE, "fonts")
OUT = os.path.join(HERE, "logo")
os.makedirs(OUT, exist_ok=True)

# ---------- الألوان ----------
DEEP = "#14343F"
TEAL = "#2F6F6B"
MIST = "#9CC0BB"
SAND = "#F2EDE4"
GOLD = "#C8A96A"

AR_NAME = "مكتب سفيان للموبايل"
LATIN = "SUFYAN MOBILE"

# ---------- 1. رسم الحرف «س» / أعمدة الإشارة ----------
# مرسوم داخل مربّع 240×240، حدوده الفعلية x:48–192  y:62–178 (مركزه 120,120)
# الطرف الأيسر الصاعد للحرف محذوف عمداً: القاعدة تنتهي مفتوحة
# فتقرأ الأعمدة الثلاثة كإشارة شبكة خلوية أوضح.
SEEN_STROKE = 24
MARK_VB = "48 62 144 116"


def seen_glyph(body=SAND, accent=GOLD, accent_on=True):
    """يعيد مجموعة <g> فيها الرمز: ثلاثة أعمدة متدرّجة على قاعدة مفتوحة."""
    a = accent if accent_on else body
    return f'''  <g fill="none" stroke-width="{SEEN_STROKE}" stroke-linecap="round" stroke-linejoin="round">
    <!-- القاعدة: تنعطف صاعدة من اليمين ثم تمتد وتنتهي مفتوحة يساراً -->
    <path d="M180,134 C180,154 166,166 142,166 L60,166" stroke="{body}"/>
    <!-- العمود الأوسط -->
    <path d="M133,92 L133,158" stroke="{body}"/>
    <!-- العمود الأقصر -->
    <path d="M84,108 L84,158" stroke="{body}"/>
    <!-- العمود الأطول — عمود الإشارة المميّز -->
    <path d="M180,74 L180,140" stroke="{a}"/>
  </g>'''


def rounded_square(fill=DEEP):
    return f'  <rect x="0" y="0" width="240" height="240" rx="62" fill="{fill}"/>'


HEAD = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb}" '
        'width="{w}" height="{h}" role="img" aria-label="{label}">\n'
        '  <title>{label}</title>\n')


def write(name, body, vb, w, h, label):
    svg = HEAD.format(vb=vb, w=w, h=h, label=label) + body + "\n</svg>\n"
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"  ✓ {name:28} {w}×{h}")


# ---------- 2. نصوص الشعار كمسارات ----------
def ar_word(size):
    return text_to_svg_path(AR_NAME, os.path.join(FONTS, "ElMessiri-arabic.woff2"),
                            weight=700, size=size, direction="rtl")


def latin_word(size, tracking_em=0.40):
    return text_to_svg_path(LATIN, os.path.join(FONTS, "Cairo-latin.woff2"),
                            weight=600, size=size, direction="ltr",
                            letter_spacing=size * tracking_em)


def placed(res, target_ink_w, x_center, y_top, fill):
    """يقيس النص، يقيسه على العرض المطلوب، ويضعه في مكانه. يعيد (svg, height)."""
    k = target_ink_w / res["ink_w"]
    x1, y1, _, y2 = res["bbox"]
    tx = x_center - (x1 * k) - target_ink_w / 2
    ty = y_top - (y1 * k)
    g = (f'  <g transform="translate({tx:.2f},{ty:.2f}) scale({k:.5f})">\n'
         f'    <path d="{res["d"]}" fill="{fill}"/>\n  </g>')
    return g, (y2 - y1) * k


def placed_right(res, target_ink_w, x_right, y_top, fill):
    """نفس السابق لكن بمحاذاة الحافة اليمنى (مناسب للاتجاه من اليمين لليسار)."""
    k = target_ink_w / res["ink_w"]
    x1, y1, _, y2 = res["bbox"]
    tx = x_right - (x1 * k) - target_ink_w
    ty = y_top - (y1 * k)
    g = (f'  <g transform="translate({tx:.2f},{ty:.2f}) scale({k:.5f})">\n'
         f'    <path d="{res["d"]}" fill="{fill}"/>\n  </g>')
    return g, (y2 - y1) * k


# ---------- 3. توليد كل الصيغ ----------
def build():
    print("توليد ملفات الشعار…")

    # --- أ. الأيقونة (مربّع دائري الزوايا) ---
    write("logo-icon.svg",
          rounded_square(DEEP) + "\n" + seen_glyph(SAND, GOLD),
          "0 0 240 240", 240, 240, "مكتب سفيان للموبايل — الأيقونة")

    write("logo-icon-light.svg",
          rounded_square(SAND) + "\n" + seen_glyph(DEEP, TEAL),
          "0 0 240 240", 240, 240, "مكتب سفيان للموبايل — الأيقونة الفاتحة")

    # --- ب. الرمز وحده بخلفية شفافة ---
    write("logo-mark.svg", seen_glyph(DEEP, GOLD), MARK_VB, 144, 116,
          "مكتب سفيان للموبايل — الرمز")

    write("logo-mark-sand.svg", seen_glyph(SAND, GOLD), MARK_VB, 144, 116,
          "مكتب سفيان للموبايل — الرمز الفاتح")

    # --- ج. الشعار العمودي (الصيغة الرئيسية) ---
    W = 880
    icon = 224
    pad_top = 52
    gap_1 = 58          # بين الأيقونة والاسم العربي
    gap_2 = 30          # بين الاسم العربي واللاتيني
    pad_bottom = 54

    ar = ar_word(100)
    la = latin_word(100)

    ar_g, ar_h = placed(ar, 520, W / 2, pad_top + icon + gap_1, DEEP)
    la_g, la_h = placed(la, 268, W / 2, pad_top + icon + gap_1 + ar_h + gap_2, TEAL)
    H = int(pad_top + icon + gap_1 + ar_h + gap_2 + la_h + pad_bottom)

    icon_g = (f'  <g transform="translate({(W - icon) / 2:.1f},{pad_top}) '
              f'scale({icon / 240:.5f})">\n'
              f'{rounded_square(DEEP)}\n{seen_glyph(SAND, GOLD)}\n  </g>')

    write("logo-primary.svg", "\n".join([icon_g, ar_g, la_g]),
          f"0 0 {W} {H}", W, H, "مكتب سفيان للموبايل — الشعار الرئيسي")

    # نفس التركيب لكن للخلفيات الداكنة
    icon_g_d = (f'  <g transform="translate({(W - icon) / 2:.1f},{pad_top}) '
                f'scale({icon / 240:.5f})">\n'
                f'{rounded_square(SAND)}\n{seen_glyph(DEEP, TEAL)}\n  </g>')
    ar_g_d, _ = placed(ar, 520, W / 2, pad_top + icon + gap_1, SAND)
    la_g_d, _ = placed(la, 268, W / 2, pad_top + icon + gap_1 + ar_h + gap_2, GOLD)
    write("logo-primary-onDark.svg", "\n".join([icon_g_d, ar_g_d, la_g_d]),
          f"0 0 {W} {H}", W, H, "مكتب سفيان للموبايل — الشعار على خلفية داكنة")

    # --- د. الشعار الأفقي (الأيقونة يميناً، النص يساراً) ---
    HW, HH = 1180, 300
    hi = 200                                   # قياس الأيقونة
    ix = HW - 40 - hi                          # الأيقونة على اليمين
    iy = (HH - hi) / 2
    text_right = ix - 46                       # حافة النص اليمنى

    har_g, har_h = placed_right(ar, 560, text_right, 0, DEEP)
    hla = latin_word(100)
    block_gap = 26
    hla_probe, hla_h = placed_right(hla, 250, text_right, 0, TEAL)
    total_text = har_h + block_gap + hla_h
    ty0 = (HH - total_text) / 2
    har_g, _ = placed_right(ar, 560, text_right, ty0, DEEP)
    hla_g, _ = placed_right(hla, 250, text_right, ty0 + har_h + block_gap, TEAL)

    hicon = (f'  <g transform="translate({ix:.1f},{iy:.1f}) scale({hi / 240:.5f})">\n'
             f'{rounded_square(DEEP)}\n{seen_glyph(SAND, GOLD)}\n  </g>')
    write("logo-horizontal.svg", "\n".join([hicon, har_g, hla_g]),
          f"0 0 {HW} {HH}", HW, HH, "مكتب سفيان للموبايل — الشعار الأفقي")

    hicon_d = (f'  <g transform="translate({ix:.1f},{iy:.1f}) scale({hi / 240:.5f})">\n'
               f'{rounded_square(SAND)}\n{seen_glyph(DEEP, TEAL)}\n  </g>')
    har_gd, _ = placed_right(ar, 560, text_right, ty0, SAND)
    hla_gd, _ = placed_right(hla, 250, text_right, ty0 + har_h + block_gap, GOLD)
    write("logo-horizontal-onDark.svg", "\n".join([hicon_d, har_gd, hla_gd]),
          f"0 0 {HW} {HH}", HW, HH, "مكتب سفيان للموبايل — الأفقي على خلفية داكنة")

    # --- هـ. النسخة الأحادية (للختم والطباعة بلون واحد) ---
    mono_icon = (f'  <g transform="translate({(W - icon) / 2:.1f},{pad_top}) '
                 f'scale({icon / 240:.5f})">\n'
                 f'  <rect x="7" y="7" width="226" height="226" rx="58" fill="none" '
                 f'stroke="{DEEP}" stroke-width="14"/>\n'
                 f'{seen_glyph(DEEP, DEEP, accent_on=False)}\n  </g>')
    mono_ar, _ = placed(ar, 520, W / 2, pad_top + icon + gap_1, DEEP)
    mono_la, _ = placed(la, 268, W / 2, pad_top + icon + gap_1 + ar_h + gap_2, DEEP)
    write("logo-mono.svg", "\n".join([mono_icon, mono_ar, mono_la]),
          f"0 0 {W} {H}", W, H, "مكتب سفيان للموبايل — نسخة أحادية اللون")

    # --- و. ختم دائري (للستيكرات والتغليف) ---
    stamp = f'''  <circle cx="120" cy="120" r="119" fill="{DEEP}"/>
  <circle cx="120" cy="120" r="107" fill="none" stroke="{GOLD}" stroke-width="1.6" opacity=".6"/>
  <g transform="translate(33.6,10) scale(0.72)">
{seen_glyph(SAND, GOLD)}
  </g>'''
    st_g, _ = placed(latin_word(100), 122, 120, 158, MIST)
    st_line = (f'  <path d="M84,182 L156,182" stroke="{GOLD}" stroke-width="1.6" '
               f'opacity=".45"/>')
    write("logo-stamp.svg", "\n".join([stamp, st_g, st_line]), "0 0 240 240", 240, 240,
          "مكتب سفيان للموبايل — الختم الدائري")

    print("تم توليد الشعار بكل صيغه ✓")


if __name__ == "__main__":
    build()
