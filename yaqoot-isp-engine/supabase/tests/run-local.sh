#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# التحقق من هجرات وحدة الإنترنت على قاعدة محلية — لا يلمس الإنتاج إطلاقاً.
#
#   ./supabase/tests/run-local.sh
#
# يفترض وجود PostgreSQL 16 محلياً. ينشئ قاعدة مؤقتة، يحمّل عقد الاعتماد على
# ياقوت (erp_prerequisites.sql)، يطبّق كل الهجرات بالترتيب، ثم يشغّل اختبار
# التكامل. أي فشل يوقف السكربت برمز خروج غير صفري.
# ---------------------------------------------------------------------------
set -euo pipefail

PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
export PATH="$PG_BIN:$PATH"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPA_DIR="$(dirname "$HERE")"

PGHOST="${PGHOST:-}"
PGPORT="${PGPORT:-5433}"
DB="${DB:-ispval}"

if [[ -z "$PGHOST" ]]; then
  echo "!! اضبط PGHOST على مسار سوكِت خادم PostgreSQL محلي، مثال:" >&2
  echo "   PGHOST=/var/lib/postgresql/ispval/sock ./supabase/tests/run-local.sh" >&2
  exit 2
fi

psql_run() {
  psql -h "$PGHOST" -p "$PGPORT" -U postgres "$@"
}

echo "== إعادة إنشاء قاعدة الاختبار =="
psql_run -q -d postgres -c "drop database if exists $DB;" -c "create database $DB;"

echo "== عقد الاعتماد على ياقوت ERP =="
psql_run -q -d "$DB" -v ON_ERROR_STOP=1 -f "$SUPA_DIR/tests/erp_prerequisites.sql"

echo "== الهجرات =="
for f in "$SUPA_DIR"/migrations/*.sql; do
  echo "   -> $(basename "$f")"
  psql_run -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f"
done

echo "== اختبار التكامل =="
psql_run -q -d "$DB" -v ON_ERROR_STOP=1 -f "$SUPA_DIR/tests/isp_integration_test.sql" 2>&1 |
  sed -E 's/^psql:[^ ]+ //; s/^NOTICE:  //'

echo
echo "OK — الهجرات تُطبَّق واختبار التكامل ناجح."
