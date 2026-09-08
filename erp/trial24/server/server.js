/**
 * Trial24 — خادم HTTP (Node قياسي، بلا أي حزم خارجية)
 *
 *   node server/server.js            التشغيل على المنفذ 4024
 *   PORT=8080 node server/server.js  منفذ مخصص
 *
 * الخادم يقدّم:
 *   • واجهة REST تحت /api
 *   • ملفات الواجهة الثابتة من public/ (نفس الأصل — بلا CORS)
 *   • مجدولًا داخليًا يشغّل التذكيرات وانتهاء المدة كل 20 ثانية
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { db, DB_FILE } from './db.js';
import { seed } from './seed.js';
import { handleApi } from './api.js';
import { runDueJobs } from './domain/trials.js';
import { serverNow } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 4024;
const HOST = process.env.HOST || '0.0.0.0';
const TICK_MS = Number(process.env.TICK_MS) || 20_000;
const MAX_BODY = 256 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

// ————————————————————————————————————————————————
// الإقلاع
// ————————————————————————————————————————————————

if (!fs.existsSync(DB_FILE)) {
  const result = seed({ force: false, withDemo: !process.argv.includes('--empty') });
  console.log(`[trial24] ${result.message}`);
}
db.load();

/** تشغيل المجدول: تذكير قبل ساعة + انتهاء المدة. يعالج المتأخرات بعد أي توقف. */
function tick(reason = 'interval') {
  try {
    const result = runDueJobs(db, serverNow());
    if (result.changed) {
      db.persist();
      const { reminders, expirations } = result.fired;
      if (reminders.length) console.log(`[trial24] تذكيرات (${reason}): ${reminders.join(', ')}`);
      if (expirations.length) console.log(`[trial24] انتهت المدة (${reason}): ${expirations.join(', ')}`);
    }
    return result;
  } catch (err) {
    console.error('[trial24] فشل المجدول:', err);
    return { changed: false, fired: { reminders: [], expirations: [] } };
  }
}

tick('boot');
const timer = setInterval(() => tick('interval'), TICK_MS);
timer.unref?.();

// ————————————————————————————————————————————————
// أدوات الطلب/الاستجابة
// ————————————————————————————————————————————————

function sendJson(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** تقديم ملف ثابت مع منع الخروج خارج مجلد public. */
function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(PUBLIC_DIR, relative);
  if (!target.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let file = target;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // مسارات التطبيق أحادي الصفحة تعود إلى index.html
    if (path.extname(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('غير موجود');
      return;
    }
    file = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(file).toLowerCase();
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    // الواجهة تُحدَّث كثيرًا أثناء التطوير — لا تخزين وسيط
    'Cache-Control': ext === '.html' ? 'no-store' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

// ————————————————————————————————————————————————
// الخادم
// ————————————————————————————————————————————————

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (!pathname.startsWith('/api/')) {
    try {
      serveStatic(req, res, pathname);
    } catch (err) {
      console.error('[trial24] خطأ في الملفات الثابتة:', err);
      res.writeHead(500).end('Internal Error');
    }
    return;
  }

  // كل نداء API يمرّ أولًا على المجدول، فتبقى الحالات محدّثة لحظيًا
  tick('request');

  let body = {};
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    try {
      body = await readBody(req);
    } catch (err) {
      const message = err.message === 'BODY_TOO_LARGE' ? 'حجم الطلب كبير جدًا.' : 'صيغة JSON غير صالحة.';
      sendJson(res, 400, { ok: false, error: { code: err.message, message } });
      return;
    }
  }

  const query = Object.fromEntries(url.searchParams.entries());
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = v;

  const { status, body: payload } = handleApi(db, {
    method: req.method,
    pathname,
    query,
    body,
    headers,
  });
  sendJson(res, status, payload);
});

server.listen(PORT, HOST, () => {
  const open = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log('');
  console.log('  🕰️  تجربة جهاز 24 — Trial24');
  console.log(`  ▸ الواجهة:      http://${open}:${PORT}`);
  console.log(`  ▸ البيانات:     ${DB_FILE}`);
  console.log(`  ▸ المجدول:      كل ${TICK_MS / 1000} ثانية`);
  console.log(`  ▸ التجارب:      ${db.data.trials.length} | الأجهزة: ${db.data.devices.length}`);
  console.log('');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n[trial24] إيقاف الخادم وحفظ البيانات…');
    clearInterval(timer);
    try {
      db.persist();
    } catch (err) {
      console.error('[trial24] تعذّر الحفظ:', err);
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}

export { server, tick };
