#!/usr/bin/env python3
"""
تجهيز ملفات PDF الجاهزة للمطبعة من صور الألواح المصدَّرة.
كل مجموعة تصبح ملف PDF واحد بدقة 300 نقطة/إنش.
"""
import os

from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PNG = os.path.join(HERE, "png")
PDF = os.path.join(HERE, "pdf")
os.makedirs(PDF, exist_ok=True)

# اسم الملف → (الألواح بالترتيب، الدقة المستهدفة)
JOBS = {
    "دليل-الهوية-البصرية.pdf": ([
        "book-01-cover", "book-02-about", "book-03-logo", "book-04-clearspace",
        "book-05-donts", "book-06-colors", "book-07-type", "book-08-pattern",
        "book-09-applications", "book-10-contact"], 150),
    "شيت-الستيكرات.pdf": (["stickers-sheet-a4"], 300),
    "بطاقة-العمل.pdf": (["card-front", "card-back"], 600),
    "التغليف.pdf": (["pack-bag-preview", "pack-bag-flat",
                     "pack-box-preview", "pack-box-dieline"], 150),
    "بوستات-انستغرام.pdf": (["post-1-intro", "post-2-offer", "post-3-accessories",
                             "post-4-internet", "post-5-visit"], 150),
}


def build():
    print("تجهيز ملفات PDF…")
    for name, (slugs, dpi) in JOBS.items():
        imgs = []
        for s in slugs:
            p = os.path.join(PNG, f"{s}.png")
            if not os.path.exists(p):
                print(f"  ! مفقود: {s}.png")
                continue
            im = Image.open(p)
            if im.mode in ("RGBA", "P"):
                bg = Image.new("RGB", im.size, "white")
                bg.paste(im, mask=im.convert("RGBA").split()[-1])
                im = bg
            imgs.append(im.convert("RGB"))
        if not imgs:
            continue
        out = os.path.join(PDF, name)
        imgs[0].save(out, "PDF", save_all=True, append_images=imgs[1:], resolution=dpi)
        print(f"  ✓ pdf/{name}  ({len(imgs)} صفحة · {dpi} نقطة/إنش · "
              f"{os.path.getsize(out) / 1024:,.0f} ك.ب)")


if __name__ == "__main__":
    build()
