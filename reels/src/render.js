/*
 * Deterministic frame renderer for the Sufyan Mobile reel.
 *
 * One render pass at 120fps feeds BOTH the 120fps and the 60fps encoder
 * (frame k at 60fps == frame 2k at 120fps exactly, so 60fps costs nothing
 * extra and is not a resampled/decimated re-encode).
 * A second pass renders 90fps natively.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const DUR = 25.0;
const AUDIO = path.resolve(__dirname, 'build/track.wav');

function encoder(outPath, fps) {
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:0',
    '-i', AUDIO,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-x264-params', `keyint=${fps * 2}:min-keyint=${fps}:scenecut=0`,
    '-r', String(fps),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart',
    outPath,
  ];
  const p = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  p.stdin.on('error', e => { if (e.code !== 'EPIPE') throw e; });
  return p;
}

function write(proc, buf) {
  return proc.stdin.write(buf) ? Promise.resolve()
                               : new Promise(r => proc.stdin.once('drain', r));
}

const done = p => new Promise((res, rej) => {
  p.stdin.end();
  p.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)));
});

(async () => {
  const ratio = process.argv[2];                    // r916 | r11
  const pass  = process.argv[3];                    // '120' (also emits 60) | '90'
  const H = ratio === 'r11' ? 1080 : 1920;
  const outDir = path.resolve(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const tag = ratio === 'r11' ? '1x1' : '9x16';
  const jobs = [];
  if (pass === '120') {
    jobs.push({ fps: 120, every: 1, proc: encoder(`${outDir}/sufyan_${tag}_120fps.mp4`, 120) });
    jobs.push({ fps: 60,  every: 2, proc: encoder(`${outDir}/sufyan_${tag}_60fps.mp4`, 60) });
  } else {
    jobs.push({ fps: 90,  every: 1, proc: encoder(`${outDir}/sufyan_${tag}_90fps.mp4`, 90) });
  }

  const masterFps = pass === '120' ? 120 : 90;
  const total = Math.round(DUR * masterFps);

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars',
           '--disable-features=PaintHolding', '--font-render-hinting=none'],
  });
  const page = await browser.newPage({
    viewport: { width: 1080, height: H }, deviceScaleFactor: 1,
  });
  await page.goto('file://' + path.resolve(__dirname, 'ad.html'));
  await page.evaluate(r => window.__setRatio(r), ratio);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);

  const t0 = Date.now();
  for (let n = 0; n < total; n++) {
    const t = n / masterFps;
    await page.evaluate(tt => window.__seek(tt), t);
    const buf = await page.screenshot({ type: 'jpeg', quality: 98, animations: 'disabled' });
    for (const j of jobs) {
      if (n % j.every === 0) await write(j.proc, buf);
    }
    if (n % 300 === 0) {
      const el = (Date.now() - t0) / 1000;
      process.stderr.write(
        `${ratio} pass${pass}  ${n}/${total}  ${el.toFixed(0)}s  ` +
        `eta ${(el / Math.max(n, 1) * (total - n)).toFixed(0)}s\n`);
    }
  }

  await Promise.all(jobs.map(j => done(j.proc)));
  await browser.close();
  console.log(`${ratio} pass${pass} finished in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})();
