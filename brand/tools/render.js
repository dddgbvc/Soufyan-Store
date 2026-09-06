#!/usr/bin/env node
/**
 * محرّك التصدير — يحوّل ألواح التصميم (HTML) إلى صور PNG بمقاسها الحقيقي.
 *
 * كل عنصر يحمل  data-document-role="page"  يُعتبر لوح تصميم مستقل
 * ويُصدَّر كملف PNG باسم مأخوذ من data-slug.
 *
 *   node tools/render.js  pages/03-posts.html  [--scale 2]
 *   node tools/render.js  --all
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'png');
const PORT = 8477;

function serve() {
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json',
  };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}

async function renderFile(page, relPath, scale) {
  await page.goto(`http://127.0.0.1:${PORT}/${relPath}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);

  const boards = await page.$$('[data-document-role="page"]');
  const made = [];
  for (let i = 0; i < boards.length; i++) {
    const slug = (await boards[i].getAttribute('data-slug'))
      || `${path.basename(relPath, '.html')}-${i + 1}`;
    const out = path.join(OUT, `${slug}.png`);
    // scale:'device' (الافتراضي) هو ما يجعل deviceScaleFactor يُطبَّق فعلاً؛
    // 'css' كان يصدّر بمقاس البكسل المنطقي ويتجاهل المضاعف.
    await boards[i].screenshot({ path: out, omitBackground: false });
    // اقرأ الأبعاد من ترويسة PNG نفسها حتى لا يُبلَّغ عن مقاس لم يُكتب
    const head = fs.readFileSync(out).subarray(16, 24);
    made.push(`${slug}.png  ${head.readUInt32BE(0)}×${head.readUInt32BE(4)}`);
  }
  return made;
}

(async () => {
  const args = process.argv.slice(2);
  const scaleIdx = args.indexOf('--scale');
  const scale = scaleIdx > -1 ? Number(args[scaleIdx + 1]) : 2;
  let targets = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--scale');
  if (args.includes('--all') || targets.length === 0) {
    targets = fs.readdirSync(path.join(ROOT, 'pages'))
      .filter((f) => f.endsWith('.html')).sort().map((f) => `pages/${f}`);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
  const page = await browser.newPage({ deviceScaleFactor: scale, viewport: { width: 1600, height: 1200 } });

  for (const t of targets) {
    const made = await renderFile(page, t, scale);
    console.log(`\n${t}`);
    made.forEach((m) => console.log('  ✓ ' + m));
  }

  await browser.close();
  server.close();
})().catch((e) => { console.error('ERR', e); process.exit(1); });
