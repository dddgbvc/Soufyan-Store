-- ============================================================================
--  قسم الشراء — الملف 006: صلاحيات تنفيذ الدوال
--
--  القاعدة:
--    • الدوال الداخلية (الحارس، السجل، الإعدادات، النواقص) — لا أحد ينفّذها
--      من الخارج إطلاقًا؛ تُستدعى فقط من داخل دوال أخرى تعمل بصلاحية المالك.
--    • دوال الواجهة — متاحة لـ anon و authenticated، لأن حمايتها الحقيقية
--      هي رمز الجلسة (purchase_login) وليست مفتاح الـ API.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) سحب التنفيذ من الجميع أولًا (نقطة بداية نظيفة)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'purchase%' or p.proname like 'supplier_payment%'
           or p.proname in ('doc_purchases','doc_suppliers','notify_new_purchase'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) دوال داخلية — تبقى بلا أي صلاحية خارجية
--    purchase_guard / purchase_log / purchase_setting / purchase_role_rank
--    purchase_sync_shortage / purchase_sessions_gc
--    purchases_append_only / purchase_audit_immutable / notify_new_purchase
-- ─────────────────────────────────────────────────────────────────────────────
-- (لا شيء يُمنح هنا عن قصد)

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) دوال الواجهة
-- ─────────────────────────────────────────────────────────────────────────────
grant execute on function public.purchase_login(text, text)             to anon, authenticated;
grant execute on function public.purchase_logout(text)                  to anon, authenticated;

-- قراءة
grant execute on function public.purchase_bootstrap(text)                       to anon, authenticated;
grant execute on function public.purchase_products_search(text, text, int)      to anon, authenticated;
grant execute on function public.purchase_suppliers_list(text, text, boolean)   to anon, authenticated;
grant execute on function public.purchase_list(text, text, date, date, text, int, int)
                                                                                to anon, authenticated;
grant execute on function public.purchase_get(text, uuid)                       to anon, authenticated;
grant execute on function public.purchase_shortages(text, boolean)              to anon, authenticated;
grant execute on function public.purchase_dashboard(text, int)                  to anon, authenticated;
grant execute on function public.purchase_supplier_statement(text, uuid)        to anon, authenticated;
grant execute on function public.purchase_returns_list(text, text, int)         to anon, authenticated;
grant execute on function public.purchase_payments_list(text, uuid, int)        to anon, authenticated;
grant execute on function public.purchase_audit_list(text, int)                 to anon, authenticated;

-- كتابة
grant execute on function public.purchase_post(text, jsonb)             to anon, authenticated;
grant execute on function public.purchase_cancel(text, uuid, text)      to anon, authenticated;
grant execute on function public.supplier_payment_post(text, jsonb)     to anon, authenticated;
grant execute on function public.purchase_return_post(text, jsonb)      to anon, authenticated;
grant execute on function public.purchase_supplier_save(text, jsonb)    to anon, authenticated;
grant execute on function public.purchase_settings_save(text, jsonb)    to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) تقارير بوت تلغرام — نفس وضع دوال doc_* القائمة (محميّة بـ bot_identify)
-- ─────────────────────────────────────────────────────────────────────────────
grant execute on function public.doc_purchases(bigint, text, date, date)
  to anon, authenticated, service_role;
grant execute on function public.doc_suppliers(bigint, text)
  to anon, authenticated, service_role;

commit;
