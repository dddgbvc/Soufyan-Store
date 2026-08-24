#!/usr/bin/env bash
# ============================================================================
#  تشغيل اختبارات قسم الشراء على قاعدة PostgreSQL محلية مؤقتة.
#  لا يلمس قاعدة الإنتاج إطلاقًا.
#
#      bash tests/run.sh
#
#  المتطلبات: postgresql (initdb + psql). على أوبنتو:
#      sudo apt install postgresql
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PGBIN/initdb" ] || { echo "لم أجد أدوات PostgreSQL — عيّن PGBIN"; exit 1; }

WORK="${WORK:-/tmp/soufyan-pgtest}"
DB=soufyan_test

cleanup() { "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▸ تهيئة قاعدة اختبار مؤقتة في $WORK"
rm -rf "$WORK"; mkdir -p "$WORK/data" "$WORK/sock"

# initdb يرفض العمل كـ root — نستعمل مستخدمًا غير جذر عند اللزوم
RUN=""
if [ "$(id -u)" = "0" ]; then
  id pgt >/dev/null 2>&1 || useradd -m pgt
  chown -R pgt "$WORK"
  RUN="su pgt -c"
fi

run() { if [ -n "$RUN" ]; then su pgt -c "$1"; else bash -c "$1"; fi; }

run "$PGBIN/initdb -D $WORK/data -U postgres -E UTF8 --locale=C.UTF-8 -A trust" >/dev/null 2>&1
run "$PGBIN/pg_ctl -D $WORK/data -o \"-k $WORK/sock -c listen_addresses='' -c log_min_messages=warning\" -l $WORK/log start" >/dev/null
sleep 2

PSQL="psql -h $WORK/sock -U postgres -d $DB -v ON_ERROR_STOP=1 -q"
psql -h "$WORK/sock" -U postgres -d postgres -q \
  -c "create database $DB encoding 'UTF8' template template0;"

echo "▸ تحميل نسخة من مخطط النظام القائم"
$PSQL -f "$HERE/000_baseline_fixture.sql" >/dev/null

echo "▸ تركيب قسم الشراء"
for f in "$ROOT"/sql/001_schema.sql "$ROOT"/sql/002_security.sql \
         "$ROOT"/sql/003_functions.sql "$ROOT"/sql/004_queries.sql \
         "$ROOT"/sql/005_integrations.sql "$ROOT"/sql/006_grants.sql; do
  $PSQL -f "$f" >/dev/null 2>&1 || { echo "✕ فشل $(basename "$f")"; exit 1; }
  echo "  ✓ $(basename "$f")"
done

echo "▸ تشغيل الاختبارات"
OUT="$($PSQL -f "$HERE/010_tests.sql" 2>&1)" || { echo "$OUT" | grep -E "❌|ERROR" ; exit 1; }
echo "$OUT" | grep -E "━━━|✅|❌" | sed 's/^psql:[^ ]* //; s/NOTICE:  //'
PASS="$(echo "$OUT" | grep -c "✅" || true)"

echo
echo "▸ اختبار التراجع"
$PSQL -f "$ROOT/sql/999_rollback.sql" >/dev/null 2>&1
LEFT="$($PSQL -tAc "select count(*) from information_schema.tables
                    where table_schema='public'
                      and (table_name like 'purchase%' or table_name='suppliers');")"
PERMS="$($PSQL -tAc "select array_to_string(permissions_for('ADMIN'), ',');")"
if [ "$LEFT" = "0" ] && [[ "$PERMS" != *purchases* ]]; then
  echo "  ✅ التراجع أزال القسم وأعاد الدوال الأصلية"
else
  echo "  ❌ التراجع غير مكتمل (جداول متبقية: $LEFT)"; exit 1
fi

echo
echo "════════════════════════════════════════"
echo "   ✅ نجحت $PASS عملية تحقّق"
echo "════════════════════════════════════════"
