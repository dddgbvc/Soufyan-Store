-- ===========================================================================
-- ISP Engine — 002 — الحماية
-- ===========================================================================
-- النمط نفسه المتبع في قسم الشراء:
--   • RLS مُفعّل على كل جدول
--   • بلا سياسات إطلاقاً  ⇒  رفض افتراضي لكل من anon و authenticated
--   • كل وصول يمر عبر دوال SECURITY DEFINER تتحقق من رمز الجلسة والدور
--
-- النتيجة: حتى لو تسرّب مفتاح anon، لا يستطيع أحد قراءة سجل مشترك أو حركة
-- محفظة مباشرة عبر PostgREST.
-- ===========================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'isp_providers','isp_provider_connections','isp_provider_capabilities',
    'isp_agents','isp_packages','isp_package_prices',
    'isp_subscribers','isp_subscriptions',
    'isp_wallets','isp_wallet_transactions',
    'isp_transactions','isp_idempotency',
    'isp_sessions','isp_session_events','isp_test_accounts','isp_support_tickets',
    'isp_sync_jobs','isp_sync_logs','isp_api_requests',
    'isp_module_sessions','isp_audit','isp_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    -- FORCE يجعل القاعدة سارية حتى على مالك الجدول، فلا يبقى باب خلفي.
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- لا تُنشأ أي سياسة هنا عن قصد. أي سياسة مستقبلية يجب أن تُبرَّر كتابةً:
-- الوصول المقصود هو عبر دوال 003 فقط.
--
-- تنبيه للمراجع: لا تضع هنا
--   revoke execute on all functions in schema public from anon;
-- فهي تطال دوال النظام القائمة خارج هذه الوحدة (فحص anon للأقسام مثلاً)
-- وتكسرها. صلاحيات دوال هذه الوحدة تُمنح واحدة واحدة في 005.
