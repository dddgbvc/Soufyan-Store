#!/usr/bin/env node
// Renders reel.html frame by frame in headless Chromium and encodes the MP4.
//
//   node render.cjs                      # full reel → out/sufyan-rebrand-reel.mp4
//   node render.cjs --stills 1,3.5,7     # PNG stills → build/still-<t>.png
//
// Each 30 fps frame averages 8 sub-frames across a 180° shutter (1/60 s),
// which gives natural motion blur on fast moves.

const fs = require("fs");
const http = require("http");
const path = require("path");
const { execSync, spawn } = require("child_process");

let playwright;
try { playwright = require("playwright"); } catch {
  playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
}

const ROOT = __dirname;
const BUILD = path.join(ROOT, "build");
const OUT = path.join(ROOT, "out");
const FPS = 30;
const SAMPLES = 8;
const SHUTTER = 0.5 / FPS;
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const MIME = { ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".woff2": "font/woff2" };

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end();
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { return execSync(`python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"`).toString().trim(); }
  catch { return "ffmpeg"; }
}

async function main() {
  fs.mkdirSync(BUILD, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/reel.html`;
  const browser = await playwright.chromium.launch({ args: ["--force-color-profile=srgb"] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on("pageerror", e => console.error("page error:", e.message));
  await page.goto(url);
  await page.waitForFunction("window.READY === true", null, { timeout: 30000 });
  const dur = await page.evaluate("window.DUR");

  const grab = async (t, samples = SAMPLES) => {
    const b64 = await page.evaluate(([t, n, sh]) => {
      window.renderFrame(t, n, sh);
      return document.getElementById("c").toDataURL("image/png").slice(22);
    }, [t, samples, SHUTTER]);
    return Buffer.from(b64, "base64");
  };

  const stills = opt("--stills");
  if (stills) {
    for (const s of stills.split(",").map(Number)) {
      const f = path.join(BUILD, `still-${s.toFixed(2)}.png`);
      fs.writeFileSync(f, await grab(s));
      console.log(f);
    }
    await browser.close(); server.close();
    return;
  }

  const audio = path.join(BUILD, "audio.wav");
  const out = opt("--out") || path.join(OUT, "sufyan-rebrand-reel.mp4");
  const total = Math.round(dur * FPS);
  const ff = spawn(ffmpegPath(), [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    ...(fs.existsSync(audio) ? ["-i", audio] : []),
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-tune", "animation", "-profile:v", "high", "-level", "4.2",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
    "-movflags", "+faststart", "-t", String(dur),
    out,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => ff.on("close", c => c === 0 ? res() : rej(new Error("ffmpeg exited " + c))));

  const started = Date.now();
  for (let i = 0; i < total; i++) {
    const frame = await grab(i / FPS);
    if (!ff.stdin.write(frame)) await new Promise(r => ff.stdin.once("drain", r));
    if (i % 60 === 0) process.stdout.write(`\rframe ${i}/${total}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await done;
  process.stdout.write(`\rframe ${total}/${total}  done\n`);
  console.log(out);
  await browser.close(); server.close();
}

main().catch(e => { console.error(e); process.exit(1); });
