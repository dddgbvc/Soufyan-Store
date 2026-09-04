-- ===========================================================================
-- بذرة تجريبية لوحدة الإنترنت — للتطوير والعرض فقط
-- ===========================================================================
-- تُنشئ مزوداً تجريبياً واحداً مع اتصال وباقات ومحفظة، بلا أي بيانات زبائن
-- حقيقية. آمنة للتشغيل أكثر من مرة (ON CONFLICT DO NOTHING).
--
--   psql "$DATABASE_URL" -f supabase/seed/isp_seed.sql
--
-- ملاحظة: المشتركون لا يُبذَرون هنا — يأتون من المحوّل التجريبي عبر المزامنة،
-- وهذا هو المسار الحقيقي الذي نريد اختباره.
-- ===========================================================================

insert into public.isp_providers
  (adapter_key, name, display_name, accent_color, country, currency, timezone, api_version, status)
values
  ('mock', 'mock', 'مزود تجريبي', '#5B6EFF', 'IQ', 'IQD', 'Asia/Baghdad', 'v2', 'active'),
  -- Earthlink مُعرَّف لكن غير مُفعّل: لا توجد وثائق واجهة برمجية رسمية.
  ('earthlink', 'earthlink', 'Earthlink', null, 'IQ', 'IQD', 'Asia/Baghdad', null, 'inactive')
on conflict (adapter_key) do nothing;

insert into public.isp_provider_connections
  (provider_id, connection_name, environment, status, health_status)
select id, 'افتراضي', 'sandbox', 'disconnected', 'unknown'
  from public.isp_providers where adapter_key = 'mock'
on conflict (provider_id, connection_name) do nothing;

insert into public.isp_agents (provider_id, external_agent_id, name, status)
select id, 'AGENT-001', 'وكيل مركز سفيان', 'active'
  from public.isp_providers where adapter_key = 'mock'
on conflict (provider_id, external_agent_id) do nothing;

-- الباقات: لاحظ أن الأخيرة بلا سعر جملة عمداً، لاختبار حالة
-- «الكلفة غير متاحة» وامتناع النظام عن حساب الربح.
insert into public.isp_packages
  (provider_id, external_package_id, name, display_name, technology,
   download_speed, upload_speed, duration_value, duration_unit,
   renewal_semantics, retail_price, currency, billing_model, active)
select p.id, v.ext, v.name, v.display, v.tech,
       v.down, v.up, v.dur, 'day', 'extend_from_expiry', v.retail, 'IQD', 'prepaid', true
  from public.isp_providers p,
       (values
         ('P-4M-30',  'home-4m',  'منزلي ٤ ميغا',  'pppoe',  4,   2,  30,  25000),
         ('P-8M-30',  'home-8m',  'منزلي ٨ ميغا',  'pppoe',  8,   4,  30,  40000),
         ('P-16M-30', 'home-16m', 'منزلي ١٦ ميغا', 'pppoe',  16,  8,  30,  65000),
         ('P-F50-30', 'fiber-50', 'ألياف ٥٠ ميغا', 'ftth',   50,  25, 30, 110000)
       ) as v(ext, name, display, tech, down, up, dur, retail)
 where p.adapter_key = 'mock'
on conflict (provider_id, external_package_id) do nothing;

-- سعر الجملة لثلاث باقات فقط. الرابعة تبقى بلا كلفة معروفة عمداً،
-- فتظهر «غير متاح» ولا يُحتسب لها ربح.
insert into public.isp_package_prices (package_id, kind, amount, currency, origin, note)
select k.id, 'wholesale', v.amount, 'IQD', 'provider', 'من كشف أسعار المزود'
  from public.isp_packages k
  join public.isp_providers p on p.id = k.provider_id
  join (values ('P-4M-30', 19000), ('P-8M-30', 31000), ('P-16M-30', 52000))
       as v(ext, amount) on v.ext = k.external_package_id
 where p.adapter_key = 'mock'
on conflict do nothing;

insert into public.isp_wallets
  (provider_id, agent_id, currency, current_balance, available_balance,
   credit_limit, low_balance_threshold, last_synced_at)
select p.id, a.id, 'IQD', 3500000, 3500000, 1000000, 500000, now()
  from public.isp_providers p
  join public.isp_agents a on a.provider_id = p.id
 where p.adapter_key = 'mock'
on conflict (provider_id, agent_id) do nothing;
