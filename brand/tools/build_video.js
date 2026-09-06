#!/usr/bin/env node
/**
 * محرّك الفيديو — يحوّل مشهد HTML إلى ملف MP4.
 *
 * الفكرة: المشهد لا يتحرّك بنفسه. المحرّك يستدعي `__seek(t)` لكل إطار
 * ثم يصوّره، فيخرج الفيديو بتوقيت مضبوط تمامًا مهما بطؤ الرسم — عكس
 * تسجيل الشاشة الذي يُسقط إطارات عند الضغط.
 *
 *   node tools/build_video.js              # كل المقاسات
 *   node tools/build_video.js --size 916   # مقاس واحد
 *   node tools/build_video.js --fps 30
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const HERE = path.dirname(__dirname);
const OUT = path.join(HERE, 'video');
const PORT = 8479;

/** مسار ffmpeg المرفق مع حزمة imageio-ffmpeg. */
function ffmpegPath() {
  return execFileSync('python3',
    ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],
    { encoding: 'utf8' }).trim();
}

const SIZES = {
  '916': { w: 1080, h: 1920, cls: '', label: 'عمودي 9:16 — ريلز وستوري وحالة واتساب' },
  '11':  { w: 1080, h: 1080, cls: 'sq', label: 'مربّع 1:1 — منشور فيسبوك وإنستغرام' },
  '169': { w: 1920, h: 1080, cls: 'sq', label: 'أفقي 16:9 — شاشة المحل ويوتيوب' },
};

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
               '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2',
               '.svg': 'image/svg+xml', '.png': 'image/png' };

/** خادم محلي — لازم حتى تُحلّ مسارات الخطوط والأنماط النسبية. */
function serve() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.join(HERE, rel);
      if (!file.startsWith(HERE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    s.listen(PORT, () => resolve(s));
  });
}

async function render(browser, key, fps, ffmpeg) {
  const size = SIZES[key];
  const frameDir = path.join(require('os').tmpdir(), `sfn-frames-${key}`);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });

  const ctx = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();
  // نُعلم المشهد أننا نُصدّر حتى لا يشغّل حلقة المعاينة
  await page.addInitScript(() => { window.__exporting = true; });
  await page.goto(`http://127.0.0.1:${PORT}/video/reel.html`, { waitUntil: 'networkidle' });
  if (size.cls) await page.evaluate((c) => document.body.classList.add(c), size.cls);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  const duration = await page.evaluate(() => window.__duration);
  const total = Math.round(duration * fps);
  process.stdout.write(`  ${key}: ${size.w}×${size.h} · ${fps} إطار/ث · ${total} إطار\n`);

  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.__seek(t), i / fps);
    await page.screenshot({
      path: path.join(frameDir, String(i).padStart(5, '0') + '.jpg'),
      type: 'jpeg', quality: 94,
    });
    if (i % 60 === 0) process.stdout.write(`    …${i}/${total}\r`);
  }
  await ctx.close();

  const mp4 = path.join(OUT, `sufyan-reel-${key}.mp4`);
  execFileSync(ffmpeg, [
    '-y', '-loglevel', 'error',
    '-framerate', String(fps),
    '-i', path.join(frameDir, '%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
    '-pix_fmt', 'yuv420p',            // لازم حتى يشتغل على كل المشغّلات
    '-movflags', '+faststart',        // يبدأ التشغيل قبل اكتمال التحميل
    '-r', String(fps),
    mp4,
  ], { stdio: 'inherit' });

  // صورة الغلاف = الإطار الذي يكتمل فيه الشعار
  const cover = path.join(OUT, `sufyan-reel-${key}-cover.jpg`);
  fs.copyFileSync(path.join(frameDir, String(Math.round(2.9 * fps)).padStart(5, '0') + '.jpg'), cover);

  fs.rmSync(frameDir, { recursive: true, force: true });
  const kb = fs.statSync(mp4).size / 1024;
  process.stdout.write(`    ✓ video/${path.basename(mp4)}  ${(kb / 1024).toFixed(1)} م.ب — ${size.label}\n`);
}

(async () => {
  const args = process.argv.slice(2);
  const fps = +(args[args.indexOf('--fps') + 1]) || 30;
  const only = args.includes('--size') ? args[args.indexOf('--size') + 1] : null;
  // الأفقي 16:9 متاح بـ‎--size 169 لكنه ليس ضمن الافتراضي
  const keys = only ? [only] : ['916', '11'];

  fs.mkdirSync(OUT, { recursive: true });
  const ffmpeg = ffmpegPath();
  const server = await serve();
  const browser = await chromium.launch();

  console.log('تصدير الفيديو…');
  for (const k of keys) await render(browser, k, fps, ffmpeg);

  await browser.close();
  server.close();
})();
