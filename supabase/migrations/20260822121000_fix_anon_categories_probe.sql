-- ============================================================
-- إصلاح خطأ 401 على GET /rest/v1/categories?select=id&limit=1
--
-- التشخيص من سجلات الحافة (edge_logs):
--   response.headers.proxy_status = PostgREST; error=42501
--   request.sb.apikey.apikey.prefix = sb_publishable_...
-- يعني الطلب يوصل بمفتاح publishable (دور anon)، و42501 = insufficient_privilege.
-- سببه إن جداول المشروع كلها بدون أي GRANT (relacl فارغ) — التصميم يعتمد
-- كلياً على دوال SECURITY DEFINER — فأي قراءة مباشرة من جدول ترجع 401.
-- (ملاحظة: RLS لحاله ما يرجع 401؛ الـSELECT الممنوع بالـRLS يرجع 200 بقائمة فارغة.)
--
-- الحل هنا: أقل صلاحية ممكنة تكفي لفحص الاتصال — قراءة عمود id فقط،
-- يعني تنكشف UUIDات الأقسام لا غير، بدون أسماء ولا أي عمود ثاني.
--
-- الحل الأنظف (بجانب البرنامج، سطر واحد): استبدال فحص الاتصال
--   supabase.from('categories').select('id').limit(1)
-- بـ
--   supabase.rpc('sync_ping')
-- لأن sync_ping() موجودة أصلاً ومصرّح بيها لـanon. وبعدها تنلغي هاي الصلاحية.
-- ============================================================

grant select (id) on public.categories to anon, authenticated;

drop policy if exists categories_probe_read on public.categories;
create policy categories_probe_read
  on public.categories
  for select
  to anon
  using (true);

comment on policy categories_probe_read on public.categories is
  'قراءة عمود id فقط لفحص اتصال البرنامج — تنشال إذا انتقل الفحص لـsync_ping()';
