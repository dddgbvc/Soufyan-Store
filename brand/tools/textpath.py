#!/usr/bin/env python3
"""
تحويل النص العربي إلى مسارات SVG حقيقية (Outlines)
--------------------------------------------------
يستخدم HarfBuzz لتشكيل الحروف العربية بشكل صحيح (وصل/ابتداء/انتهاء)
ثم fontTools لاستخراج حدود كل حرف كمسار متجه.

الفائدة: ملفات الشعار تبقى متجهة 100% ولا تحتاج تنصيب أي خط
عند فتحها في كانفا أو الطابعة أو أي برنامج تصميم.
"""
import io
import os
import tempfile

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

_CACHE = {}


def _static_font(woff2_path: str, weight: int):
    """يفك ضغط woff2 ويثبّت محور الوزن على قيمة واحدة، ثم يخزّن النتيجة."""
    key = (os.path.abspath(woff2_path), weight)
    if key in _CACHE:
        return _CACHE[key]

    font = TTFont(woff2_path)
    if "fvar" in font:
        font = instancer.instantiateVariableFont(font, {"wght": weight}, inplace=False)

    buf = io.BytesIO()
    font.flavor = None            # احفظ كـ TTF عادي لا woff2
    font.save(buf)
    data = buf.getvalue()

    tmp = tempfile.NamedTemporaryFile(suffix=".ttf", delete=False)
    tmp.write(data)
    tmp.close()

    _CACHE[key] = (font, data, tmp.name)
    return _CACHE[key]


def text_to_svg_path(text: str, woff2_path: str, weight: int = 700,
                     size: float = 100.0, letter_spacing: float = 0.0,
                     direction: str = "rtl", features=None):
    """
    يعيد dict فيه:
      d      : مسار SVG واحد يجمع كل الحروف
      width  : العرض الكلي بالوحدات المطلوبة
      ascent / descent / upm
    الأصل (0,0) عند بداية خط الأساس؛ المحور Y لأعلى مقلوب ليناسب SVG.
    """
    font, data, ttf_path = _static_font(woff2_path, weight)
    upm = font["head"].unitsPerEm
    scale = size / upm

    face = hb.Face(data)
    hbfont = hb.Font(face)
    hbfont.scale = (upm, upm)
    hb.ot_font_set_funcs(hbfont)

    buf = hb.Buffer()
    buf.add_str(text)
    buf.direction = direction
    buf.script = "arab" if direction == "rtl" else "latn"
    buf.language = "ar" if direction == "rtl" else "en"
    hb.shape(hbfont, buf, features or {"kern": True, "liga": True, "calt": True})

    glyph_set = font.getGlyphSet()
    order = font.getGlyphOrder()

    pen_out = SVGPathPen(glyph_set, ntos=lambda v: f"{v:.2f}")
    bounds = BoundsPen(glyph_set)
    x = 0.0
    y = 0.0
    ls_units = letter_spacing / scale if scale else 0.0

    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        # مقلوب رأسياً لأن محور Y في SVG يتجه لأسفل
        t = Transform(scale, 0, 0, -scale, (x + pos.x_offset) * scale,
                      (y + pos.y_offset) * -scale)
        glyph_set[name].draw(TransformPen(pen_out, t))
        glyph_set[name].draw(TransformPen(bounds, t))
        x += pos.x_advance + ls_units
        y += pos.y_advance

    hhea = font["hhea"]
    bx = bounds.bounds or (0, 0, 0, 0)
    return {
        "d": pen_out.getCommands(),
        "width": x * scale,
        "ascent": hhea.ascent * scale,
        "descent": hhea.descent * scale,
        "upm": upm,
        # الحدود الضيقة الفعلية للنص المرسوم (x1,y1,x2,y2) في فضاء SVG
        "bbox": bx,
        "ink_w": bx[2] - bx[0],
        "ink_h": bx[3] - bx[1],
    }


if __name__ == "__main__":
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    r = text_to_svg_path("مكتب سفيان للموبايل",
                         os.path.join(here, "fonts", "ElMessiri-arabic.woff2"),
                         weight=700, size=100)
    print("width:", round(r["width"], 2), "| path chars:", len(r["d"]))
