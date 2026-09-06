#!/usr/bin/env python3
"""
تجميع كل لوح تصميم في ملف HTML مستقل بذاته
==========================================
يدمج ملفات CSS والخطوط والشعارات والصور داخل الملف نفسه، فيصبح
قابلاً للفتح أو الاستيراد من أي مكان دون ملفات مرافقة —
وهذا ما يحتاجه استيراد كانفا من رابط.
"""
import base64
import os
import re

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = os.path.join(HERE, "pages")
DIST = os.path.join(HERE, "dist")
os.makedirs(DIST, exist_ok=True)

MIME = {".woff2": "font/woff2", ".svg": "image/svg+xml",
        ".png": "image/png", ".jpg": "image/jpeg"}


def data_uri(path):
    ext = os.path.splitext(path)[1].lower()
    with open(path, "rb") as f:
        b = base64.b64encode(f.read()).decode()
    return f"data:{MIME.get(ext, 'application/octet-stream')};base64,{b}"


def inline_css(css_path):
    css = open(css_path, encoding="utf-8").read()

    def repl(m):
        rel = m.group(1)
        target = os.path.normpath(os.path.join(os.path.dirname(css_path), rel))
        return f"url('{data_uri(target)}')" if os.path.exists(target) else m.group(0)

    return re.sub(r"url\(['\"]?([^'\")]+)['\"]?\)", repl, css)


# ملفات تُقسَّم لوحاً لوحاً لأن ألواحها بمقاسات مختلفة،
# وتصميم كانفا الواحد لا يقبل إلا مقاساً واحداً.
SPLIT = {"05-covers.html", "08-business-card.html", "09-service-ticket.html",
         "11-barcode-label.html", "14-invoice.html"}


def canva_safe(html):
    """يزيل ما لا يقرأه محوّل كانفا فيظهر كمستطيل رمادي."""
    return re.sub(r"\s*filter:\s*drop-shadow\([^;\"']*\)\s*;?", "", html)


def wrap(title, body):
    return (f'<!doctype html>\n<html lang="ar" dir="rtl">\n<head>\n'
            f'<meta charset="utf-8">\n<title>{title}</title>\n'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f'</head>\n<body>\n{body}\n</body>\n</html>\n')


def emit(name, title, body):
    dest = os.path.join(DIST, name)
    with open(dest, "w", encoding="utf-8") as f:
        f.write(wrap(title, body))
    kb = os.path.getsize(dest) / 1024
    print(f"  ✓ dist/{name:34} {kb:,.0f} ك.ب")


def build(page_file):
    src = open(os.path.join(PAGES, page_file), encoding="utf-8").read()

    title = (re.search(r"<title>(.*?)</title>", src, re.S) or [None, page_file])[1].strip()

    # 1. أدمج ملفات الأنماط الخارجية
    def css_repl(m):
        target = os.path.normpath(os.path.join(PAGES, m.group(1)))
        return "<style>\n" + inline_css(target) + "\n</style>"

    src = re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/?>', css_repl, src)

    # 2. أدمج ملفات السكربت الخارجية
    def js_repl(m):
        target = os.path.normpath(os.path.join(PAGES, m.group(1)))
        if not os.path.exists(target):
            return m.group(0)
        return "<script>\n" + open(target, encoding="utf-8").read() + "\n</script>"

    src = re.sub(r'<script src="([^"]+)"></script>', js_repl, src)

    # 3. حوّل كل صورة مرجعية إلى بيانات مضمّنة
    def img_repl(m):
        target = os.path.normpath(os.path.join(PAGES, m.group(2)))
        if not os.path.exists(target):
            return m.group(0)
        return f'{m.group(1)}src="{data_uri(target)}"'

    src = re.sub(r'(<img[^>]*?)src="([^"]+)"', img_repl, src)

    # 4. نظّف ما لا يدعمه محوّل كانفا
    src = re.sub(r'<meta charset="utf-8">\s*', "", src, count=1)
    src = re.sub(r"<title>.*?</title>\s*", "", src, count=1, flags=re.S)
    src = canva_safe(src)

    if page_file not in SPLIT:
        emit(page_file, title, src)
        return

    # 5. ملفات المقاسات المختلطة: لوح واحد لكل ملف
    style = "".join(re.findall(r"<style>.*?</style>", src, re.S))
    head = src[:src.rindex("</style>") + 8] if "</style>" in src else ""
    boards = re.findall(r'(<div class="[^"]*"[^>]*data-document-role="page"'
                        r'[^>]*data-slug="([^"]+)"[^>]*data-label="([^"]+)".*?)(?=\n<!--|\Z)',
                        src, re.S)
    scripts = "".join(re.findall(r"<script>.*?</script>", src, re.S))
    stem = page_file[:-5]
    for body, slug, label in boards:
        # اللوح الأخير يلتقط السكربتات ضمنه — نزيلها ثم نُلحقها مرة واحدة
        body = re.sub(r"<script>.*?</script>", "", body, flags=re.S).rstrip()
        emit(f"{stem}--{slug}.html", f"{label} — مكتب سفيان للموبايل",
             style + "\n" + body + "\n" + scripts)


if __name__ == "__main__":
    print("تجميع الملفات المستقلة…")
    for f in sorted(os.listdir(PAGES)):
        if f.endswith(".html") and not f.startswith("_"):
            build(f)
