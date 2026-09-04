-- ===========================================================================
-- ISP Engine — 005 — الصلاحيات
-- ===========================================================================
-- Postgres يمنح EXECUTE إلى PUBLIC افتراضياً، لذا نسحبها أولاً ثم نمنح
-- الدوال العامة فقط — نفس نمط purchasing_006_grants.
--
-- عام (anon + authenticated): ما يناديه التطبيق مباشرة.
-- داخلي (service_role فقط): الحراسة والتدقيق والمهام المجدولة.
-- ===========================================================================

do $$
declare
  v_public text[] := array[
    'isp_login(text,text)',
    'isp_logout(text)',
    'isp_bootstrap(text)',
    'isp_dashboard(text,uuid)',
    'isp_capabilities_sync(text,uuid,jsonb)',
    'isp_idempotency_begin(text,uuid,text,text)',
    'isp_idempotency_finish(text,text,text,jsonb)',
    'isp_renewal_post(text,jsonb)',
    'isp_reconciliation_open(text,jsonb)',
    'isp_reconciliation_resolve(text,uuid,text,text)'
  ];
  v_internal text[] := array[
    'isp_guard(text,text)',
    'isp_log(public.isp_module_sessions,text,uuid,text,uuid,jsonb,jsonb,text,jsonb)',
    'isp_setting(text,jsonb)',
    'isp_role_rank(text)',
    'isp_sessions_gc()',
    'isp_next_invoice_number()',
    'isp_queue_expiry_reminders(integer)',
    'isp_append_only()'
  ];
  v_fn text;
begin
  foreach v_fn in array v_public || v_internal loop
    execute format('revoke all on function public.%s from public, anon, authenticated', v_fn);
  end loop;

  foreach v_fn in array v_public loop
    execute format('grant execute on function public.%s to anon, authenticated', v_fn);
  end loop;

  -- الدوال الداخلية تبقى لـ service_role و postgres فقط (المالك ضمناً).
  foreach v_fn in array v_internal loop
    execute format('grant execute on function public.%s to service_role', v_fn);
  end loop;
end $$;

-- الجداول تبقى بلا صلاحيات مباشرة: 002 سحبها، ولا نعيدها هنا.
-- service_role يتجاوز RLS بطبيعته للمهام الخلفية (Edge Functions).

-- إعدادات افتراضية للوحدة.
insert into public.isp_settings (key, value) values
  ('session_ttl_hours',        '8'::jsonb),
  ('expiring_soon_days',       '7'::jsonb),
  ('sync_interval_seconds',    '300'::jsonb),
  ('stale_after_seconds',      '300'::jsonb),
  ('max_sync_retries',         '5'::jsonb),
  ('expiry_reminder_days',     '3'::jsonb)
on conflict (key) do nothing;
