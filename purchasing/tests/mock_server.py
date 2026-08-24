#!/usr/bin/env python3
"""
خادم اختبار محلي يقلّد PostgREST فوق قاعدة الاختبار.

يخدم ملفات القسم ويحوّل POST /rest/v1/rpc/<fn> إلى نداء SQL عبر psql،
فتُختبر الواجهة الحقيقية مقابل الدوال الحقيقية بلا لمس قاعدة الإنتاج.

    python3 tests/mock_server.py --socket /tmp/pg/sock --db soufyan_test --port 8099
"""
import argparse, json, os, re, subprocess, sys, secrets
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = None

JSONB_PARAMS = {"p_payload", "p_rows"}


def lit(name, value):
    """قيمة SQL آمنة — الاقتباس بعلامة دولار عشوائية يمنع أي إفلات."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, (dict, list)) or name in JSONB_PARAMS:
        text, cast = json.dumps(value, ensure_ascii=False), "::jsonb"
    else:
        text, cast = str(value), ""
    tag = "q" + secrets.token_hex(4)
    while f"${tag}$" in text:
        tag = "q" + secrets.token_hex(4)
    return f"${tag}${text}${tag}${cast}"


def run_sql(fn, params):
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", fn):
        raise ValueError("bad function name")
    args = ", ".join(f"{k} := {lit(k, v)}" for k, v in params.items()
                     if re.fullmatch(r"p_[a-z_]+", k))
    sql = f'select public."{fn}"({args});'
    p = subprocess.run(
        ["psql", "-h", ARGS.socket, "-U", "postgres", "-d", ARGS.db,
         "-tAX", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True)
    if p.returncode != 0:
        m = re.search(r"ERROR:\s*(.+)", p.stderr)
        raise RuntimeError(m.group(1).strip() if m else p.stderr.strip()[:300])
    return p.stdout.strip()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        raw = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        if not self.path.startswith("/rest/v1/rpc/"):
            return self._send(404, '{"message":"not found"}')
        fn = self.path[len("/rest/v1/rpc/"):].split("?")[0]
        try:
            n = int(self.headers.get("Content-Length") or 0)
            params = json.loads(self.rfile.read(n) or b"{}")
            out = run_sql(fn, params if isinstance(params, dict) else {})
            self._send(200, out or "null")
        except Exception as e:
            self._send(400, json.dumps({"message": str(e)}, ensure_ascii=False))

    def do_GET(self):
        # config يشير إلى هذا الخادم، و CSP يسمح باتصال محلي
        if self.path.startswith("/assets/config.js"):
            return self._send(200, (
                'window.SOUFYAN_PURCHASING_CONFIG={'
                'supabaseUrl:location.origin,supabaseKey:"test-key",'
                'pinPepper:"SOUFYAN-PIN-v1:",idleMinutes:60,'
                'requestTimeout:20,currency:"IQD"};'
            ), "application/javascript; charset=utf-8")
        # النسخة أحادية الملف، بإعدادات محلية — لاختبارها بنفس مجموعة الفحوص
        if self.path.startswith("/standalone"):
            html = open(os.path.join(ROOT, "dist", "purchases-standalone.html"),
                        encoding="utf-8").read()
            html = re.sub(r"window\.SOUFYAN_PURCHASING_CONFIG\s*=\s*\{.*?\};",
                          lambda m: ('window.SOUFYAN_PURCHASING_CONFIG={'
                                     'supabaseUrl:location.origin,supabaseKey:"test-key",'
                                     'pinPepper:"SOUFYAN-PIN-v1:",idleMinutes:60,'
                                     'requestTimeout:20,currency:"IQD"};'),
                          html, count=1, flags=re.S)
            html = re.sub(r"[ \t]*<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\s*\n?",
                          "", html)
            return self._send(200, html, "text/html; charset=utf-8")

        if self.path in ("/", "/index.html"):
            html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
            # نُبقي سياسة الأمان كما هي (connect-src فيها 'self' أصلًا)،
            # ونحذف روابط الخطوط الخارجية فقط ليبقى الاختبار محليًا بالكامل.
            html = re.sub(r"[ \t]*<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\s*\n?",
                          "", html)
            return self._send(200, html, "text/html; charset=utf-8")
        return super().do_GET()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--socket", default="/tmp/pg/sock")
    ap.add_argument("--db", default="soufyan_test")
    ap.add_argument("--port", type=int, default=8099)
    ARGS = ap.parse_args()
    print(f"mock PostgREST on http://127.0.0.1:{ARGS.port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", ARGS.port), Handler).serve_forever()
