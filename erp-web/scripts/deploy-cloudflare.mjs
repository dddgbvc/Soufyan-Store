// نشر على Cloudflare Workers بعد `pnpm build`.
//   CF_WORKER_NAME   اسم العامل (يحدد الرابط: <name>.<subdomain>.workers.dev) — لا يُحفظ في Git
//   CLOUDFLARE_API_TOKEN و CLOUDFLARE_ACCOUNT_ID لأداة wrangler
//   CF_EMBED_ASSETS=1  تضمين ملفات الواجهة داخل العامل بدل رفعها كـ Static Assets
//                      (مفيد خلف بروكسي يستبدل ترويسة Authorization في خطوة رفع الملفات)
import {readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join, relative, extname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const name = process.env.CF_WORKER_NAME || '';
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) throw new Error('CF_WORKER_NAME مطلوب: حروف صغيرة وأرقام وشرطة، حتى 63 حرفاً.');

const serverDir = fileURLToPath(new URL('../dist/server/', import.meta.url));
const clientDir = fileURLToPath(new URL('../dist/client/', import.meta.url));
const configPath = join(serverDir, 'wrangler.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
config.name = name;
config.topLevelName = name;
config.workers_dev = true;
config.preview_urls = false;
// كل البيانات (ومنها الإشعارات) في Supabase؛ لا قواعد D1.
config.d1_databases = [];
// الإشعارات التلقائية (فواتير، نواقص، صيانة، تقارير): فحص كل دقيقة.
config.triggers = {crons: ['* * * * *']};

if (process.env.CF_EMBED_ASSETS === '1') {
  const types = {
    '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  };
  const skip = new Set(['_headers', '.assetsignore', 'wrangler.json', '.dev.vars']);
  const files = {};
  const walk = dir => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = '/' + relative(clientDir, full).split('\\').join('/');
      if (skip.has(entry) || rel.startsWith('/.vite')) continue;
      if (statSync(full).isDirectory()) walk(full);
      else files[rel] = {t: types[extname(entry)] || 'application/octet-stream', b: readFileSync(full).toString('base64')};
    }
  };
  walk(clientDir);
  writeFileSync(join(serverDir, 'embedded-assets.js'), 'export default ' + JSON.stringify(files) + ';\n');
  writeFileSync(join(serverDir, 'embedded-entry.js'), `import app from './${config.main}';
import files from './embedded-assets.js';
const cache = new Map();
function bytes(path) {
  let b = cache.get(path);
  if (!b) { const raw = atob(files[path].b); b = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) b[i] = raw.charCodeAt(i); cache.set(path, b); }
  return b;
}
export default {
  ...app,
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    const file = files[url.pathname];
    if (file && (request.method === 'GET' || request.method === 'HEAD')) {
      const headers = {'Content-Type': file.t, 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': url.pathname.startsWith('/_next/static/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate'};
      return new Response(request.method === 'HEAD' ? null : bytes(url.pathname), {headers});
    }
    return app.fetch(request, env, ctx);
  },
};
`);
  config.main = 'embedded-entry.js';
  delete config.assets;
  console.log(`تضمين ${Object.keys(files).length} ملفاً داخل العامل.`);
}

writeFileSync(configPath, JSON.stringify(config));

const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const r = spawnSync(process.execPath, [wrangler, 'deploy', '--config', configPath], {stdio: 'inherit'});
process.exit(r.status ?? 1);
