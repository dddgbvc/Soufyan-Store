// يبني القوالب من src/ إلى:
//   dist/print-templates.json  — الحزمة اللي يقرأها البرنامج (نفس شكل print_templates_get)
//   dist/preview.html          — معاينة وطباعة كل القوالب ببيانات المثال
//   supabase/seed_print_templates.sql — تعبئة جدول print_templates بالقوالب الافتراضية
// التشغيل: node print-templates/build.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => join(here, 'src', ...p);
const read = (p) => readFileSync(p, 'utf8').trim();

const meta = JSON.parse(readFileSync(src('templates.json'), 'utf8'));
const partials = Object.fromEntries(
  readdirSync(src('partials')).filter((f) => f.endsWith('.html')).sort()
    .map((f) => [f.replace(/\.html$/, ''), read(src('partials', f))]));

const bundle = {
  ok: true,
  version: meta.version,
  shop: meta.shop,
  base: { css: read(src('base.css')), js: read(src('base.js')), partials },
  templates: meta.templates.map((t) => ({
    key: t.key, kind: t.kind, name: t.name, width_mm: t.width_mm, height_mm: t.height_mm,
    html: read(src('templates', t.key + '.html')), css: read(src('templates', t.key + '.css')),
    fields: t.fields, sample: t.sample,
  })),
};

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'print-templates.json'), JSON.stringify(bundle, null, 2) + '\n');

// ---------- المعاينة ----------
const preview = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>قوالب الطباعة</title>
<link rel="stylesheet" href="../fonts/fonts.css">
<style>
body{margin:0;padding:24px 16px;background:#eceae5;font-family:'El Messiri',sans-serif;color:#111}
h1{font-size:22px;margin:0 0 4px}p{margin:0 0 20px;color:#555;font-size:14px}
.grid{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
figure{margin:0;background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
figcaption{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:14px;margin-bottom:8px}
figcaption small{color:#666;direction:ltr;unicode-bidi:isolate}
button{font:inherit;font-size:13px;border:1px solid #111;background:#fff;border-radius:6px;padding:2px 10px;cursor:pointer}
iframe{display:block;border:0;background:#fff}
</style></head><body>
<h1>قوالب الطباعة — مكتب سفيان للموبايل</h1>
<p>معاينة ببيانات المثال. زر «طباعة» يطبع القالب بمقاسه.</p>
<div class="grid" id="grid"></div>
<script src="../render.js"></script>
<script>
const BUNDLE = ${JSON.stringify(bundle).replace(/</g, '\\u003c')};
const grid = document.getElementById('grid');
for (const t of BUNDLE.templates) {
  const f = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.innerHTML = '<span>' + t.name + ' <small>' + t.width_mm + (t.height_mm ? '×' + t.height_mm : '') + 'mm</small></span>';
  const btn = document.createElement('button'); btn.textContent = 'طباعة'; cap.appendChild(btn);
  const fr = document.createElement('iframe');
  fr.style.width = t.width_mm + 'mm';
  fr.style.height = (t.height_mm || 140) + 'mm';
  fr.srcdoc = SufyanPrint.render(BUNDLE, t.key, t.sample, { fontsCss: '../fonts/fonts.css' });
  fr.onload = () => { if (!t.height_mm) { const d = fr.contentDocument; const fit = () => fr.style.height = d.documentElement.scrollHeight + 'px'; d.addEventListener('print-ready', fit); fit(); } };
  btn.onclick = () => fr.contentWindow.print();
  f.append(cap, fr); grid.appendChild(f);
}
</script></body></html>
`;
writeFileSync(join(here, 'dist', 'preview.html'), preview);

// ---------- تعبئة سوبابيس ----------
const q = (s) => { if (s.includes('$pt$')) throw new Error('النص يحتوي $pt$'); return '$pt$' + s + '$pt$'; };
const j = (o) => q(JSON.stringify(o)) + '::jsonb';
const num = (v) => (v == null ? 'null' : String(v));
const rows = [
  `(null, '_base', 'base', 'الأساس المشترك', null, null, '', ${q(bundle.base.css)}, ${q(bundle.base.js)}, ${j(partials)}, '[]'::jsonb, ${j({ shop: meta.shop })}, ${meta.version})`,
  ...bundle.templates.map((t) =>
    `(null, ${q(t.key)}, ${q(t.kind)}, ${q(t.name)}, ${num(t.width_mm)}, ${num(t.height_mm)}, ${q(t.html)}, ${q(t.css)}, '', '{}'::jsonb, ${j(t.fields)}, ${j(t.sample)}, ${meta.version})`),
];
const seed = `-- مولَّد من print-templates/build.mjs — لا تعدّله بالإيد
insert into public.print_templates (tenant_id, key, kind, name, width_mm, height_mm, html, css, js, partials, fields, sample, version)
values
${rows.join(',\n')}
on conflict on constraint print_templates_tenant_key do update set
  kind = excluded.kind, name = excluded.name, width_mm = excluded.width_mm, height_mm = excluded.height_mm,
  html = excluded.html, css = excluded.css, js = excluded.js, partials = excluded.partials,
  fields = excluded.fields, sample = excluded.sample, version = excluded.version, updated_at = now();
`;
writeFileSync(join(here, 'supabase', 'seed_print_templates.sql'), seed);
console.log('templates:', bundle.templates.length, '| seed bytes:', Buffer.byteLength(seed));
