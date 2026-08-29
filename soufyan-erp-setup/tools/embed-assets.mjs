/**
 * يضمّن ملفات assets/setup/*.svg داخل index.html كنسخة احتياطية،
 * فيعمل الملف وحده حتى بدون المجلد، ويبقى استبدال أي SVG من المجلد ممكنًا.
 * التشغيل:  node tools/embed-assets.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'assets', 'setup');
const HTML = join(ROOT, 'index.html');

const map = {};
for(const f of readdirSync(DIR).filter(f => f.endsWith('.svg')).sort()){
  map[f.replace(/\.svg$/, '')] = readFileSync(join(DIR, f), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s*/g, ' ').trim();
}
const json = JSON.stringify(map).replace(/<\/script>/gi, '<\\/script>');
let html = readFileSync(HTML, 'utf8');
const re = /(<script id="illus-fallback" type="application\/json">)[\s\S]*?(<\/script>)/;
if(!re.test(html)) throw new Error('fallback slot not found in index.html');
html = html.replace(re, (_, a, b) => a + json + b);
writeFileSync(HTML, html, 'utf8');
console.log(`✔ embedded ${Object.keys(map).length} SVG assets (${(json.length / 1024).toFixed(1)} KB)`);
