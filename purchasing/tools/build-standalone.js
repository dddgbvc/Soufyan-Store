#!/usr/bin/env node
/* ==========================================================================
   يبني نسخة بملف واحد: dist/purchases-standalone.html
   تدمج CSS و JS داخل الصفحة لتشغيل القسم بنقرة واحدة بلا خادم.

   ملاحظة أمنية: الدمج يُلزمنا بتخفيف سياسة script-src و style-src
   إلى 'unsafe-inline' — لأن الكود صار داخل الصفحة. النسخة متعدّدة
   الملفات (index.html) تبقى الأقوى أمنيًا وهي الموصى بها للاستعمال اليومي.

       node tools/build-standalone.js
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const css = read("assets/purchasing.css");
const cfg = read("assets/config.js");
const js = read("assets/purchasing.js");
let html = read("index.html");

// حارس: وسم الإغلاق داخل نصّ سكربت يُنهي الوسم مبكرًا
const guard = (s) => s.replace(/<\/script>/gi, "<\\/script>");

/* مهم: الاستبدال يمرّ عبر دالة لا عبر نصّ.
   نصّ الاستبدال يفسّر $$ و $& و $1 كرموز خاصة، فيتحوّل `$$(...)`
   في الكود إلى `$(...)` ويتلف الملف بصمت. الدالة تُدرج النص حرفيًا. */
const put = (s) => () => s;

html = html
  .replace(/<link rel="stylesheet" href="assets\/purchasing\.css">/,
    put("<style>\n" + css + "\n</style>"))
  .replace(/<script src="assets\/config\.js"><\/script>\s*<script src="assets\/purchasing\.js" defer><\/script>/,
    put("<script>\n" + guard(cfg) + "\n</script>\n<script>\n" + guard(js) + "\n</script>"))
  .replace(/script-src 'self';/,
    put("script-src 'self' 'unsafe-inline';"))
  .replace(/style-src 'self' https:\/\/fonts\.googleapis\.com;/,
    put("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;"));

// تحقّق من نجاح كل عملية دمج بدل تسليم ملف ناقص بصمت
const musts = [
  [css.slice(0, 40), "CSS"],
  ["SOUFYAN_PURCHASING_CONFIG", "config"],
  ["SoufyanPurchasing", "JS"],
  ["'unsafe-inline'", "CSP"]
];
for (const [needle, name] of musts) {
  if (!html.includes(needle)) {
    console.error("✕ فشل الدمج: " + name);
    process.exit(1);
  }
}
if (/src="assets\//.test(html)) {
  console.error("✕ بقيت مراجع لملفات خارجية");
  process.exit(1);
}

/* تحقّق حاسم: الكود المدموج مطابق حرفيًا للمصدر، سطرًا بسطر.
   يمسك أي تشويه من محرّك الاستبدال قبل أن يصل للمستخدم. */
for (const [src, name] of [[css, "CSS"], [guard(cfg), "config.js"], [guard(js), "purchasing.js"]]) {
  if (!html.includes(src)) {
    const lines = src.split("\n");
    const bad = lines.find((l) => l.trim() && !html.includes(l));
    console.error("✕ الملف المدموج غير مطابق للمصدر: " + name);
    if (bad) console.error("  أول سطر مختلف: " + bad.trim().slice(0, 90));
    process.exit(1);
  }
}

fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
const out = path.join(ROOT, "dist", "purchases-standalone.html");
fs.writeFileSync(out, html, "utf8");

console.log("✓ " + path.relative(ROOT, out) +
  "  (" + (Buffer.byteLength(html) / 1024).toFixed(1) + " KB)");
