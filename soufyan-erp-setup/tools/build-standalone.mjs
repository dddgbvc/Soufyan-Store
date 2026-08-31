#!/usr/bin/env node
/**
 * build-standalone.mjs — ملف واحد يعمل بلا إنترنت وبلا مجلدات مجاورة
 * ---------------------------------------------------------------------------
 * `index.html` يحتاج خمسة موارد خارجية: ثلاثة ملفات في `vendor/` ووصلة خطوط
 * Google. وهذا يكفي لتعطيله على الآيباد: محرّرات مثل Textastic تعاين الملف
 * وحده، فلا يصل `vendor/`، ولا يصل خطّ من الإنترنت إن كانت المعاينة معزولة.
 *
 * هذه الأداة تُنتج نسخة قائمة بذاتها:
 *   • محرّكات الحركة مُضمَّنة داخل الصفحة (بلا vendor/)
 *   • وصلة خطوط Google محذوفة — تبقى خطوط النظام (وiOS يحمل خطًّا عربيًا)
 *   • CSP معدّلة لتناسب file:// ولا تفرض ترقية https
 *   • رسوم SVG لها نسخة مضمَّنة أصلًا داخل الصفحة، فلا تحتاج assets/
 *
 * النتيجة: ملف واحد يُفتح من Textastic أو Files أو مرفق بريد، بلا شبكة.
 *
 *   node tools/build-standalone.mjs
 *   ⇒ soufyan-erp-setup-standalone.html
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "index.html");
const OUT = join(ROOT, "soufyan-erp-setup-standalone.html");

let html = readFileSync(SRC, "utf8");
const before = html.length;

/* -- 1) تضمين محرّكات الحركة ------------------------------------------------
   `</script>` داخل نصّ مكتبة ينهي الوسم مبكّرًا، فيُهرَّب. */
const VENDOR = ["vendor/gsap.min.js", "vendor/CustomEase.min.js", "vendor/motion.min.js"];
let inlined = 0;
for (const rel of VENDOR) {
  const tag = `<script src="${rel}"></script>`;
  if (!html.includes(tag)) {
    console.error(`build-standalone: لم يُعثر على ${tag}`);
    process.exit(1);
  }
  const code = readFileSync(join(ROOT, rel), "utf8").replace(/<\/script/gi, "<\\/script");
  html = html.replace(tag, `<script>/* ${rel} */\n${code}\n</script>`);
  inlined++;
}

/* -- 2) حذف الخطوط البعيدة --------------------------------------------------
   `--font` يحمل بدائل نظام صالحة للعربية على iOS و Windows و Android. */
const FONT_TAGS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n',
  '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">\n',
];
let fontsRemoved = 0;
for (const tag of FONT_TAGS) {
  if (html.includes(tag)) { html = html.replace(tag, ""); fontsRemoved++; }
}

// بديل عربي صريح لـ iOS ("Geeza Pro") قبل الاعتماد على system-ui.
html = html.replace(
  '--font:"IBM Plex Sans Arabic","Segoe UI",Tahoma,"Noto Sans Arabic",system-ui,sans-serif;',
  '--font:"IBM Plex Sans Arabic","Segoe UI",Tahoma,"Noto Sans Arabic","Geeza Pro",system-ui,sans-serif;',
);

/* -- 3) CSP بلا مصادر بعيدة ------------------------------------------------- */
html = html.replace(/ https:\/\/fonts\.googleapis\.com/g, "")
           .replace(/ https:\/\/fonts\.gstatic\.com/g, "");

/* -- 4) وسم يقول ما هذه النسخة ---------------------------------------------- */
html = html.replace(
  "<title>",
  `<!-- ===========================================================================
     نسخة قائمة بذاتها — وُلِّدت بـ tools/build-standalone.mjs
     ملف واحد بلا vendor/ وبلا assets/ وبلا خطوط من الإنترنت.
     لا تُحرَّر مباشرةً: عدّل index.html ثم أعد توليدها.
     ========================================================================== -->
<title>`,
);

writeFileSync(OUT, html, "utf8");

const kb = (n) => Math.round(n / 1024) + " KB";
console.log(`build-standalone: ${OUT.split("/").pop()}`);
console.log(`  محرّكات مُضمَّنة : ${inlined}`);
console.log(`  وصلات خطوط محذوفة: ${fontsRemoved}`);
console.log(`  الحجم           : ${kb(before)} → ${kb(statSync(OUT).size)}`);

/* حارس: لا يبقى أي مرجع خارجي. */
const leftovers = [...html.matchAll(/(?:src|href)="(?!#|data:)([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:)?\/\/|^data:/.test(u) === false || /^https?:/.test(u));
if (leftovers.length) {
  console.error("  ⚠ مراجع خارجية باقية:", [...new Set(leftovers)].slice(0, 5));
  process.exit(1);
}
console.log("  مراجع خارجية    : لا شيء ✓");
