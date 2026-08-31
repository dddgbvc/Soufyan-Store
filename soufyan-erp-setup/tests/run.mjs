/**
 * مشغّل الاختبارات — يرفع خادمًا محليًا على الملفات كما هي، ثم يشغّل كل ملف.
 *
 * كل مجموعة تشغّل الصفحة نفسها في Chromium حقيقي، وتعترض نداءات Supabase وتردّ
 * بالعقود نفسها التي تعيدها دوال المشروع الحقيقية — `verify_employee_pin`
 * و`app_session_start/ping/end` ودالة الحافة `webauthn` — كما قُرئت من قاعدة
 * البيانات. فهي تختبر العميل مقابل عقد الخادم، لا مقابل خادم من اختراعنا.
 *
 *   node tests/run.mjs              # الكل
 *   node tests/run.mjs wizard       # ملف واحد
 *   SHOTS=/tmp/shots/ node tests/run.mjs      # مع حفظ لقطات الشاشة
 *
 * يحتاج playwright ومتصفّح Chromium. عيّن PW_CHROMIUM إن لم يكن في مكانه المعتاد.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8099);
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript',
  '.svg':'image/svg+xml', '.json':'application/json', '.css':'text/css' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, path === '/' ? 'index.html' : path);
  try{
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  }catch{ res.writeHead(404).end('not found'); }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const only = process.argv[2];
const suites = ['auth-flows', 'wizard', 'interface', 'failures'].filter(s => !only || s.includes(only));
let failed = 0;
for(const s of suites){
  console.log(`\n════ ${s} ════`);
  const code = await new Promise(done => {
    const c = spawn(process.execPath, [join(ROOT, 'tests', s + '.mjs')],
      { stdio:'inherit', env:{ ...process.env, SETUP_URL:`http://127.0.0.1:${PORT}/index.html` } });
    c.on('exit', done);
  });
  if(code) failed++;
}
server.close();
console.log(failed ? `\n${failed} suite(s) failed` : '\nكل المجموعات نجحت');
process.exit(failed ? 1 : 0);
