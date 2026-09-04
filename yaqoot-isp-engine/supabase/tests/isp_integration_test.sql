-- ===========================================================================
-- اختبار تكامل وحدة الإنترنت مع دفاتر ياقوت
-- ===========================================================================
-- يُشغَّل على قاعدة محلية بعد erp_prerequisites.sql ثم هجرات الوحدة:
--   psql -d ispval -v ON_ERROR_STOP=1 -f supabase/tests/isp_integration_test.sql
--
-- يتحقق من الادعاءات المالية التي تقوم عليها الوحدة:
--   • التجديد ينشئ فاتورة ياقوت حقيقية ويحرّك دين الزبون
--   • إعادة نفس الطلب لا تنشئ فاتورة ثانية ولا تضاعف الدين
--   • إيصال بيع الهواتف التلقائي يُستبدل برسالة تجديد الإنترنت
--   • النتيجة الغامضة لا تُنتج أي أثر مالي إطلاقاً
-- ===========================================================================

\set ON_ERROR_STOP on
-- notice وليس warning: نتائج الفحص نفسها تُطبع عبر raise notice.
set client_min_messages to notice;

do $$
declare
  v_emp_id   uuid;
  v_pin      text := repeat('a1b2c3d4', 8);   -- ٦٤ حرفاً hex كما يرسله العميل
  v_login    jsonb;
  v_token    text;
  v_prov     uuid;
  v_pkg      uuid;
  v_cust     uuid;
  v_sub      uuid;
  v_subscr   uuid;
  v_wallet   uuid;
  v_res      jsonb;
  v_res2     jsonb;
  v_n        int;
  v_balance  numeric;
  v_invoices int;
begin
  -- ---------------------------------------------------------------- إعداد
  insert into public.employees (name, display_name, role, status, pin_hash)
  values ('موظف الاختبار', 'اختبار', 'MANAGER', 'active',
          extensions.crypt(v_pin, extensions.gen_salt('bf')))
  returning id into v_emp_id;

  insert into public.customers (name, phone, balance)
  values ('زبون الاختبار', '07731644450', 0)
  returning id into v_cust;

  insert into public.isp_providers (adapter_key, name, display_name)
  values ('mock', 'mock', 'مزود الاختبار')
  returning id into v_prov;

  insert into public.isp_packages
    (provider_id, external_package_id, name, display_name,
     duration_value, duration_unit, renewal_semantics, retail_price)
  values (v_prov, 'P-8M-30', 'home-8m', 'منزلي ٨ ميغا',
          30, 'day', 'extend_from_expiry', 40000)
  returning id into v_pkg;

  insert into public.isp_subscribers
    (provider_id, external_subscriber_id, erp_customer_id, full_name,
     phone_number, status, username)
  values (v_prov, 'SUB-01001', v_cust, 'مشترك الاختبار',
          '07731644450', 'expired', 'u01001')
  returning id into v_sub;

  insert into public.isp_subscriptions
    (subscriber_id, provider_id, external_subscription_id, package_id,
     status, expires_at)
  values (v_sub, v_prov, 'SUBS-01001', v_pkg, 'expired', now() - interval '3 days')
  returning id into v_subscr;

  insert into public.isp_wallets
    (provider_id, currency, current_balance, available_balance)
  values (v_prov, 'IQD', 1000000, 1000000)
  returning id into v_wallet;

  -- ------------------------------------------------------------- الدخول
  v_login := public.isp_login(v_pin, 'TEST-TERMINAL');
  if not (v_login->>'ok')::boolean then
    raise exception 'FAIL: تعذر تسجيل الدخول: %', v_login->>'message';
  end if;
  v_token := v_login->>'token';
  raise notice 'PASS: تسجيل الدخول ونشوء رمز الجلسة';

  -- رمز خاطئ يجب أن يُرفض.
  begin
    perform public.isp_guard('deadbeef', 'CASHIER');
    raise exception 'FAIL: قُبل رمز جلسة غير صالح';
  exception when sqlstate '28000' then
    raise notice 'PASS: رُفض رمز الجلسة غير الصالح';
  end;

  -- --------------------------------------------------- تجديد بالدين
  v_res := public.isp_renewal_post(v_token, jsonb_build_object(
    'idempotency_key', 'test-renewal-key-0001',
    'provider_id',     v_prov,
    'subscriber_id',   v_sub,
    'package_id',      v_pkg,
    'external_reference', 'TX-TEST-1',
    'new_expires_at',  (now() + interval '27 days')::text,
    'retail_amount',   40000,
    'cost_amount',     31000,
    'cost_origin',     'provider',
    'currency',        'IQD',
    'payment_type',    'DEBT',
    'paid_amount',     10000,
    'notify',          true,
    'wallet_transaction', jsonb_build_object(
      'provider_transaction_id', 'TX-TEST-1',
      'amount', 31000, 'balance_before', 1000000, 'balance_after', 969000)));

  if not (v_res->>'ok')::boolean then
    raise exception 'FAIL: فشل تسجيل التجديد: %', v_res::text;
  end if;
  raise notice 'PASS: سُجّل التجديد — فاتورة %', v_res->>'invoice_number';

  -- الفاتورة موجودة فعلاً في دفتر ياقوت.
  select count(*) into v_invoices from public.invoices
   where id = (v_res->>'invoice_id')::uuid;
  if v_invoices <> 1 then
    raise exception 'FAIL: لم تُنشأ فاتورة ياقوت';
  end if;
  raise notice 'PASS: أُنشئت فاتورة في public.invoices';

  -- سطر الفاتورة يحمل اسم الباقة لا اسم منتج.
  select count(*) into v_n from public.invoice_items
   where invoice_id = (v_res->>'invoice_id')::uuid
     and product_id is null and product_name like '%منزلي ٨ ميغا%';
  if v_n <> 1 then
    raise exception 'FAIL: سطر الفاتورة غير صحيح';
  end if;
  raise notice 'PASS: سطر الفاتورة يشير إلى الباقة';

  -- الدين تحرّك بالمتبقي فقط (٤٠٠٠٠ − ١٠٠٠٠).
  select balance into v_balance from public.customers where id = v_cust;
  if v_balance <> 30000 then
    raise exception 'FAIL: الدين المتوقع 30000 والفعلي %', v_balance;
  end if;
  raise notice 'PASS: ارتفع دين الزبون بالمتبقي فقط (30000)';

  -- الربح يُحسب لأن الكلفة معروفة.
  if (v_res->>'profit')::numeric <> 9000 then
    raise exception 'FAIL: الربح المتوقع 9000 والفعلي %', v_res->>'profit';
  end if;
  raise notice 'PASS: حُسب الربح (9000) لأن الكلفة معروفة';

  -- إيصال بيع الهواتف التلقائي استُبعد، ورسالة الإنترنت صُفّت.
  select count(*) into v_n from public.wa_messages
   where ref_table = 'invoices' and ref_id = (v_res->>'invoice_id')::uuid
     and kind = 'welcome' and status = 'skipped';
  if v_n <> 1 then
    raise exception 'FAIL: لم يُستبعد إيصال بيع الهواتف التلقائي';
  end if;
  select count(*) into v_n from public.wa_messages
   where kind = 'isp_renewal' and status = 'pending';
  if v_n <> 1 then
    raise exception 'FAIL: لم تُصفّ رسالة تجديد الإنترنت';
  end if;
  raise notice 'PASS: استُبدل إيصال الهواتف برسالة تجديد الإنترنت';

  -- تاريخ الانتهاء تحدّث والحالة صارت فعّالة.
  select count(*) into v_n from public.isp_subscriptions
   where id = v_subscr and status = 'active' and expires_at > now();
  if v_n <> 1 then
    raise exception 'FAIL: لم يتحدّث الاشتراك';
  end if;
  raise notice 'PASS: تحدّث الاشتراك وتاريخ انتهائه';

  -- حركة المحفظة سُجّلت والرصيد نزل.
  select current_balance into v_balance from public.isp_wallets where id = v_wallet;
  if v_balance <> 969000 then
    raise exception 'FAIL: رصيد المحفظة المتوقع 969000 والفعلي %', v_balance;
  end if;
  raise notice 'PASS: خُصمت كلفة الجملة من محفظة المزود';

  -- ------------------------------------------- إعادة نفس الطلب (idempotency)
  v_res2 := public.isp_renewal_post(v_token, jsonb_build_object(
    'idempotency_key', 'test-renewal-key-0001',
    'provider_id',     v_prov,
    'subscriber_id',   v_sub,
    'package_id',      v_pkg,
    'retail_amount',   40000,
    'payment_type',    'DEBT',
    'paid_amount',     10000));

  if v_res2->>'status' <> 'replayed' then
    raise exception 'FAIL: لم تُعامل إعادة الطلب كتكرار: %', v_res2::text;
  end if;

  select count(*) into v_invoices from public.invoices;
  if v_invoices <> 1 then
    raise exception 'FAIL: أُنشئت فاتورة ثانية عند التكرار (العدد %)', v_invoices;
  end if;

  select balance into v_balance from public.customers where id = v_cust;
  if v_balance <> 30000 then
    raise exception 'FAIL: تضاعف الدين عند التكرار (%)', v_balance;
  end if;
  raise notice 'PASS: إعادة الطلب لم تُنشئ فاتورة ثانية ولم تضاعف الدين';

  -- ------------------------------------------------ نتيجة غامضة = مطابقة
  v_res := public.isp_reconciliation_open(v_token, jsonb_build_object(
    'idempotency_key', 'test-ambiguous-key-0002',
    'provider_id',     v_prov,
    'subscriber_id',   v_sub,
    'package_id',      v_pkg,
    'kind',            'renewal',
    'reason',          'TIMEOUT',
    'retail_amount',   40000,
    'note',            'انقطع الاتصال بعد إرسال الطلب'));

  if v_res->>'state' <> 'REQUIRES_RECONCILIATION' then
    raise exception 'FAIL: لم تُفتح حالة مطابقة';
  end if;

  -- الادعاء الأهم: لا فاتورة ولا دين من عملية غامضة.
  select count(*) into v_invoices from public.invoices;
  if v_invoices <> 1 then
    raise exception 'FAIL: أنشأت العملية الغامضة فاتورة (العدد %)', v_invoices;
  end if;
  select balance into v_balance from public.customers where id = v_cust;
  if v_balance <> 30000 then
    raise exception 'FAIL: حرّكت العملية الغامضة الدين (%)', v_balance;
  end if;
  raise notice 'PASS: العملية الغامضة لم تُنتج أي أثر مالي';

  -- إقفال المطابقة بقرار بشري.
  v_res2 := public.isp_reconciliation_resolve(
    v_token,
    (select id from public.isp_transactions where idempotency_key = 'test-ambiguous-key-0002'),
    'confirmed', 'طوبقت مع كشف المزود');
  if not (v_res2->>'ok')::boolean then
    raise exception 'FAIL: تعذر إقفال المطابقة';
  end if;
  raise notice 'PASS: أُقفلت حالة المطابقة بقرار بشري';

  -- ------------------------------------------------------- سجل التدقيق
  select count(*) into v_n from public.isp_audit where action = 'renewal';
  if v_n < 1 then
    raise exception 'FAIL: لم يُسجَّل التجديد في سجل التدقيق';
  end if;

  begin
    update public.isp_audit set action = 'tampered' where action = 'renewal';
    raise exception 'FAIL: أمكن التعديل على سجل التدقيق';
  exception when sqlstate '42501' then
    raise notice 'PASS: سجل التدقيق غير قابل للتعديل';
  end;

  -- ------------------------------------------------------------ اللوحة
  v_res := public.isp_dashboard(v_token, v_prov);
  if (v_res->>'pending_reconciliation')::int <> 0 then
    raise exception 'FAIL: عدّاد المطابقة غير صحيح بعد الإقفال';
  end if;

  -- الادعاء الجوهري: الإيراد يطابق ما في public.invoices تماماً.
  -- العملية التي طوبقت يدوياً بلا فاتورة يجب ألا تُحتسب إيراداً.
  if (v_res->>'revenue_today')::numeric <> 40000 then
    raise exception 'FAIL: إيراد اليوم المتوقع 40000 والفعلي %', v_res->>'revenue_today';
  end if;

  select coalesce(sum(total_amount), 0) into v_balance from public.invoices;
  if (v_res->>'revenue_today')::numeric <> v_balance then
    raise exception 'FAIL: اللوحة (%) لا تطابق دفتر الفواتير (%)',
      v_res->>'revenue_today', v_balance;
  end if;
  raise notice 'PASS: إيراد اللوحة يطابق دفتر الفواتير تماماً';

  -- ومع ذلك لا تختفي: تظهر في عدّاد «مؤكدة بلا فاتورة».
  if (v_res->>'confirmed_unposted')::int <> 1 then
    raise exception 'FAIL: العملية المؤكدة بلا فاتورة لم تظهر في عدّادها (%)',
      v_res->>'confirmed_unposted';
  end if;
  raise notice 'PASS: العملية المؤكدة بلا فاتورة ظاهرة في عدّادها لا مخفية';

  raise notice '---';
  raise notice 'ALL INTEGRATION CHECKS PASSED';
end $$;
