#!/usr/bin/env python3
"""خادم محلي بسيط لتشغيل شاشة الزبون أثناء التطوير.

وحدات JavaScript الحديثة (ES Modules) لا تُحمَّل عبر بروتوكول file://، لذلك
نحتاج خادمًا. هذا الملف يعتمد على المكتبة القياسية فقط — بلا أي تبعيات.

    python3 customer-display/serve.py            # المنفذ 8080
    python3 customer-display/serve.py 9000       # منفذ مخصّص

ثم افتح:
    http://localhost:8080/customer-display/               شاشة الزبون
    http://localhost:8080/customer-display/cashier-demo.html   محاكي الكاشير
"""

from __future__ import annotations

import http.server
import socketserver
import sys
from pathlib import Path

# نخدم من جذر المستودع حتى يعمل مسار /customer-display/ كما في الإنتاج
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 8080


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".json": "application/json",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def end_headers(self):
        # أثناء التطوير نمنع التخزين المؤقت حتى تظهر التعديلات فورًا
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        # سجلّ مختصر: المسار فقط بدل سطر التنسيق الكامل
        sys.stderr.write(f"  {self.command} {self.path}\n")


def main() -> int:
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"منفذ غير صالح: {sys.argv[1]}", file=sys.stderr)
            return 1

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), Handler) as httpd:
        print(f"يخدم من: {PROJECT_ROOT}")
        print(f"  شاشة الزبون   : http://localhost:{port}/customer-display/")
        print(f"  محاكي الكاشير : http://localhost:{port}/customer-display/cashier-demo.html")
        print("للإيقاف: Ctrl+C")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nتم الإيقاف.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
