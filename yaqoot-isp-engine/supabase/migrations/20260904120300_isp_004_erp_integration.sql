-- ===========================================================================
-- ISP Engine — 004 — الربط بدفاتر ياقوت
-- ===========================================================================
-- هذه أخطر هجرة في الوحدة: هنا يلتقي نداء المزود الخارجي بدفتر المحل.
--
-- ترتيب التنفيذ المقصود (لا يمكن عكسه):
--   1) التطبيق يحجز مفتاح التكرار      isp_idempotency_begin()
--   2) التطبيق ينادي المزود            adapter.renewSubscription()
--   3a) نجاح مؤكد   ⇒ isp_renewal_post()          ← ينشئ الفاتورة ويحرّك الدين
--   3b) نتيجة غامضة ⇒ isp_reconciliation_open()   ← لا فاتورة ولا دين إطلاقاً
--   4) التطبيق يغلق المفتاح            isp_idempotency_finish()
--
-- قاعدة §25: إذا نجح التجديد لدى المزود وفشل التسجيل المحلي، تُفتح حالة
-- مطابقة — ولا يُعاد الطلب آلياً أبداً.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- قالب واتساب خاص بتجديد الإنترنت
-- --------------------------------------------------------------------------
-- بدونه سيستلم المشترك نص إيصال بيع الهواتف («أي استفسار أو مشكلة بالجهاز»)
-- لأن trg_wa_new_invoice يعمل على كل فاتورة.

insert into public.wa_templates (kind, enabled, body)
values (
  'isp_renewal',
  true,
  'هلا {اسم} 🌐' || E'\n' ||
  'تم تجديد اشتراك الإنترنت بنجاح.' || E'\n\n' ||
  '📦 الباقة: {الباقة}' || E'\n' ||
  '💵 المبلغ: {المبلغ} د.ع' || E'\n' ||
  '📅 ينتهي بتاريخ: {تاريخ_الانتهاء}' || E'\n' ||
  '{سطر_الدين}' || E'\n' ||
  'لأي انقطاع أو بطء بالخدمة راسلنا على نفس الرقم.' || E'\n' ||
  'مركز سفيان — سامراء، الحويش')
on conflict (kind) do nothing;

insert into public.wa_templates (kind, enabled, body)
values (
  'isp_expiry_reminder',
  true,
  'السلام عليكم {اسم} 🌐' || E'\n' ||
  'تذكير: اشتراك الإنترنت ({الباقة}) ينتهي بتاريخ {تاريخ_الانتهاء}.' || E'\n\n' ||
  'إذا تحب نجدده لك، رد على هذي الرسالة أو راجعنا بالمحل.' || E'\n' ||
  'مركز سفيان — سامراء، الحويش')
on conflict (kind) do nothing;

-- --------------------------------------------------------------------------
-- مساعدات
-- --------------------------------------------------------------------------

-- نفس شكل الأرقام المستخدم حالياً في الفواتير (٦ خانات) مع ضمان عدم التكرار.
create or replace function public.isp_next_invoice_number()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_num text; v_try int := 0;
begin
  loop
    v_num := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    exit when not exists (select 1 from public.invoices where invoice_number = v_num);
    v_try := v_try + 1;
    if v_try > 50 then
      -- احتياط: لا ندخل حلقة لا نهائية إذا امتلأ المدى.
      v_num := 'ISP-' || to_char(now(), 'YYMMDDHH24MISS');
      exit;
    end if;
  end loop;
  return v_num;
end;
$function$;

-- --------------------------------------------------------------------------
-- تسجيل تجديد ناجح
-- --------------------------------------------------------------------------

create or replace function public.isp_renewal_post(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_s          public.isp_module_sessions;
  v_sub        public.isp_subscribers%rowtype;
  v_subscription public.isp_subscriptions%rowtype;
  v_pkg        public.isp_packages%rowtype;
  v_cust       public.customers%rowtype;
  v_key        text  := p_payload->>'idempotency_key';
  v_provider   uuid  := (p_payload->>'provider_id')::uuid;
  v_retail     numeric := coalesce((p_payload->>'retail_amount')::numeric, 0);
  v_cost       numeric := nullif(p_payload->>'cost_amount', '')::numeric;
  v_cost_orig  text  := coalesce(p_payload->>'cost_origin', 'unavailable');
  v_currency   text  := coalesce(p_payload->>'currency', 'IQD');
  v_pay_type   text  := coalesce(p_payload->>'payment_type', 'CASH');
  v_paid       numeric := coalesce((p_payload->>'paid_amount')::numeric, 0);
  v_expires    timestamptz := nullif(p_payload->>'new_expires_at', '')::timestamptz;
  v_extref     text  := p_payload->>'external_reference';
  v_invoice_id uuid;
  v_invoice_no text;
  v_tx_id      uuid;
  v_wallet_tx  uuid;
  v_wallet     public.isp_wallets%rowtype;
  v_remaining  numeric;
  v_existing   public.isp_transactions%rowtype;
begin
  v_s := public.isp_guard(p_token, 'CASHIER');

  if v_key is null or length(v_key) < 8 then
    raise exception 'مفتاح العملية مفقود' using errcode = '22023';
  end if;

  if v_pay_type not in ('CASH','DEBT') then
    raise exception 'نوع الدفع غير صالح' using errcode = '22023';
  end if;

  -- حماية ثانية ضد الازدواج على مستوى الجدول نفسه، لا على مستوى التطبيق فقط.
  select * into v_existing
    from public.isp_transactions
   where provider_id = v_provider and idempotency_key = v_key;

  if found then
    return jsonb_build_object(
      'ok', v_existing.state = 'SUCCESS', 'status', 'replayed',
      'state', v_existing.state, 'transaction_id', v_existing.id,
      'invoice_id', v_existing.erp_invoice_id);
  end if;

  select * into v_sub from public.isp_subscribers
   where id = (p_payload->>'subscriber_id')::uuid for update;
  if not found then
    raise exception 'المشترك غير موجود' using errcode = 'P0002';
  end if;

  select * into v_pkg from public.isp_packages
   where id = nullif(p_payload->>'package_id','')::uuid;

  select * into v_subscription from public.isp_subscriptions
   where subscriber_id = v_sub.id for update;

  -- الزبون: صريح في الحمولة، وإلا المربوط بالمشترك. قد لا يوجد أصلاً.
  select * into v_cust from public.customers
   where id = coalesce(nullif(p_payload->>'customer_id','')::uuid, v_sub.erp_customer_id)
   for update;

  if v_pay_type = 'DEBT' and not found then
    raise exception 'لا يمكن تسجيل دين بلا زبون مرتبط' using errcode = '22023';
  end if;

  -- 1) قيد العملية أولاً بحالة PROCESSING حتى لو فشل ما بعده يبقى أثر.
  insert into public.isp_transactions (
    provider_id, subscriber_id, subscription_id, package_id, kind, state,
    erp_customer_id, external_reference,
    retail_amount, cost_amount, cost_origin, currency,
    idempotency_key, request_id, actor, employee_id, metadata)
  values (
    v_provider, v_sub.id, v_subscription.id, v_pkg.id, 'renewal', 'PROCESSING',
    v_cust.id, v_extref,
    v_retail, v_cost, v_cost_orig, v_currency,
    v_key, p_payload->>'request_id', v_s.employee_name, v_s.employee_id,
    jsonb_build_object('payment_type', v_pay_type))
  returning id into v_tx_id;

  -- 2) فاتورة ياقوت الحقيقية (لا جدول فواتير خاص بالوحدة).
  v_invoice_no := public.isp_next_invoice_number();
  v_remaining  := greatest(v_retail - v_paid, 0);

  insert into public.invoices (
    invoice_number, customer_id, customer_name, customer_phone,
    total_amount, paid_amount, payment_type, notes, actor)
  values (
    v_invoice_no, v_cust.id,
    coalesce(v_cust.name, v_sub.full_name),
    coalesce(v_cust.phone, v_sub.phone_number),
    v_retail, v_paid, v_pay_type,
    format('تجديد إنترنت — %s (%s)',
           coalesce(v_pkg.display_name, 'باقة'), v_sub.external_subscriber_id),
    v_s.employee_name)
  returning id into v_invoice_id;

  insert into public.invoice_items (
    invoice_id, product_id, product_name, quantity, unit_price, discount, total)
  values (
    v_invoice_id, null,
    format('اشتراك إنترنت — %s', coalesce(v_pkg.display_name, 'باقة')),
    1, v_retail, 0, v_retail);

  -- 3) الدين: لا يوجد مشغّل يحرّك customers.balance، فالتحريك مسؤوليتنا.
  --    الرصيد الموجب = مبلغ على الزبون (نفس اصطلاح bot_record_debt_payment).
  if v_pay_type = 'DEBT' and v_remaining > 0 then
    update public.customers
       set balance = balance + v_remaining
     where id = v_cust.id;
  end if;

  -- 4) حركة محفظة المزود إن كان يكشفها.
  if p_payload ? 'wallet_transaction'
     and jsonb_typeof(p_payload->'wallet_transaction') = 'object' then
    select * into v_wallet from public.isp_wallets where provider_id = v_provider limit 1;
    if found then
      insert into public.isp_wallet_transactions (
        wallet_id, provider_transaction_id, type, direction, amount, currency,
        balance_before, balance_after, reference_type, reference_id, status)
      values (
        v_wallet.id,
        p_payload->'wallet_transaction'->>'provider_transaction_id',
        'renewal', 'debit',
        coalesce((p_payload->'wallet_transaction'->>'amount')::numeric, 0),
        v_currency,
        nullif(p_payload->'wallet_transaction'->>'balance_before','')::numeric,
        nullif(p_payload->'wallet_transaction'->>'balance_after','')::numeric,
        'isp_transactions', v_tx_id::text, 'posted')
      on conflict (wallet_id, provider_transaction_id) do nothing
      returning id into v_wallet_tx;

      if v_wallet_tx is not null then
        update public.isp_wallets
           set current_balance = coalesce(
                 nullif(p_payload->'wallet_transaction'->>'balance_after','')::numeric,
                 current_balance - coalesce((p_payload->'wallet_transaction'->>'amount')::numeric, 0)),
               available_balance = coalesce(
                 nullif(p_payload->'wallet_transaction'->>'balance_after','')::numeric,
                 available_balance - coalesce((p_payload->'wallet_transaction'->>'amount')::numeric, 0)),
               last_synced_at = now()
         where id = v_wallet.id;
      end if;
    end if;
  end if;

  -- 5) تحديث الاشتراك. تاريخ الانتهاء يأتي من المزود — لا يُحتسب هنا.
  if v_subscription.id is not null then
    update public.isp_subscriptions
       set status = 'active',
           package_id = coalesce(v_pkg.id, package_id),
           expires_at = coalesce(v_expires, expires_at),
           suspended_at = null,
           external_subscription_id = coalesce(external_subscription_id, v_extref),
           fetched_at = now()
     where id = v_subscription.id;

    update public.isp_subscribers set status = 'active', fetched_at = now()
     where id = v_sub.id;
  end if;

  -- 6) الإشعار: نستبدل إيصال بيع الهواتف الذي صفّه trg_wa_new_invoice تلقائياً.
  --    الصف ما زال 'pending' داخل هذه المعاملة، فاستبداله آمن وحتمي.
  update public.wa_messages
     set status = 'skipped', reason = 'استُبدلت برسالة تجديد الإنترنت'
   where ref_table = 'invoices' and ref_id = v_invoice_id and status = 'pending';

  if coalesce((p_payload->>'notify')::boolean, true) then
    perform public.wa_queue(
      p_kind        => 'isp_renewal',
      p_customer_id => v_cust.id,
      p_name        => coalesce(v_cust.name, v_sub.full_name, 'عزيزنا'),
      p_phone       => coalesce(v_sub.phone_number, v_cust.phone),
      p_vars        => jsonb_build_object(
                         'الباقة', coalesce(v_pkg.display_name, 'باقة إنترنت'),
                         'المبلغ', to_char(v_retail, 'FM999,999,999'),
                         'تاريخ_الانتهاء',
                           case when v_expires is null then 'يُحدَّث بعد المزامنة'
                                else public.بغداد(v_expires) end,
                         'سطر_الدين',
                           case when v_remaining > 0
                                then '⚠️ المتبقي عليك: ' ||
                                     to_char(v_remaining, 'FM999,999,999') || ' د.ع'
                                else '' end),
      p_ref_table   => 'isp_transactions',
      p_ref_id      => v_tx_id);
  end if;

  -- 7) إقفال العملية.
  update public.isp_transactions
     set state = 'SUCCESS',
         erp_invoice_id = v_invoice_id,
         wallet_transaction_id = v_wallet_tx
   where id = v_tx_id;

  perform public.isp_log(v_s, 'renewal', v_provider, 'isp_transactions', v_tx_id,
    jsonb_build_object('expires_at', v_subscription.expires_at),
    jsonb_build_object('expires_at', v_expires, 'invoice', v_invoice_no),
    'ok',
    jsonb_build_object(
      'subscriber', v_sub.external_subscriber_id,
      'package', coalesce(v_pkg.display_name, '—'),
      'retail', v_retail, 'cost', v_cost, 'payment_type', v_pay_type));

  return jsonb_build_object(
    'ok', true, 'status', 'posted',
    'transaction_id', v_tx_id,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_no,
    'remaining_debt', v_remaining,
    -- الربح يُحسب فقط عند معرفة الطرفين (§5).
    'profit', case when v_cost is null then null else v_retail - v_cost end);
end;
$function$;

comment on function public.isp_renewal_post(text, jsonb) is
  'يسجّل تجديداً ناجحاً: فاتورة ياقوت + دين + حركة محفظة + إشعار + تدقيق، بمفتاح تكرار.';

-- --------------------------------------------------------------------------
-- فتح حالة مطابقة (نتيجة غامضة من المزود)
-- --------------------------------------------------------------------------

create or replace function public.isp_reconciliation_open(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_s      public.isp_module_sessions;
  v_tx_id  uuid;
  v_key    text := p_payload->>'idempotency_key';
begin
  v_s := public.isp_guard(p_token, 'CASHIER');

  -- لا فاتورة، لا دين، لا حركة محفظة. مجرد قيد يقول: «لا نعرف ماذا حدث».
  insert into public.isp_transactions (
    provider_id, subscriber_id, package_id, kind, state, failure_reason,
    external_reference, retail_amount, cost_amount, cost_origin, currency,
    idempotency_key, request_id, actor, employee_id, metadata)
  values (
    (p_payload->>'provider_id')::uuid,
    nullif(p_payload->>'subscriber_id','')::uuid,
    nullif(p_payload->>'package_id','')::uuid,
    coalesce(p_payload->>'kind', 'renewal'),
    'REQUIRES_RECONCILIATION',
    p_payload->>'reason',
    p_payload->>'external_reference',
    coalesce((p_payload->>'retail_amount')::numeric, 0),
    nullif(p_payload->>'cost_amount','')::numeric,
    coalesce(p_payload->>'cost_origin', 'unavailable'),
    coalesce(p_payload->>'currency', 'IQD'),
    v_key, p_payload->>'request_id', v_s.employee_name, v_s.employee_id,
    jsonb_build_object('note', p_payload->>'note'))
  on conflict (provider_id, idempotency_key) do update
     set state = 'REQUIRES_RECONCILIATION',
         failure_reason = excluded.failure_reason
  returning id into v_tx_id;

  perform public.isp_log(v_s, 'reconciliation_open',
    (p_payload->>'provider_id')::uuid, 'isp_transactions', v_tx_id,
    null, null, 'pending',
    jsonb_build_object('reason', p_payload->>'reason'));

  return jsonb_build_object('ok', true, 'transaction_id', v_tx_id,
                            'state', 'REQUIRES_RECONCILIATION');
end;
$function$;

comment on function public.isp_reconciliation_open(text, jsonb) is
  'يفتح حالة مطابقة عند نتيجة غامضة من المزود — بلا أي أثر مالي محلي.';

-- إغلاق حالة المطابقة بقرار بشري. مقصور على المدير فما فوق.
create or replace function public.isp_reconciliation_resolve(
  p_token text, p_transaction_id uuid, p_resolution text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_s  public.isp_module_sessions;
  v_tx public.isp_transactions%rowtype;
begin
  v_s := public.isp_guard(p_token, 'MANAGER');

  if p_resolution not in ('confirmed','cancelled') then
    raise exception 'قرار غير صالح' using errcode = '22023';
  end if;

  select * into v_tx from public.isp_transactions
   where id = p_transaction_id for update;
  if not found then
    raise exception 'العملية غير موجودة' using errcode = 'P0002';
  end if;

  if v_tx.state <> 'REQUIRES_RECONCILIATION' then
    raise exception 'هذه العملية ليست بانتظار مطابقة' using errcode = '22023';
  end if;

  update public.isp_transactions
     set state = case when p_resolution = 'confirmed' then 'SUCCESS' else 'CANCELLED' end,
         metadata = metadata || jsonb_build_object(
           'resolved_by', v_s.employee_name, 'resolved_at', now(), 'note', p_note)
   where id = p_transaction_id;

  perform public.isp_log(v_s, 'reconciliation_resolve', v_tx.provider_id,
    'isp_transactions', p_transaction_id,
    jsonb_build_object('state', v_tx.state),
    jsonb_build_object('state', p_resolution),
    'ok', jsonb_build_object('note', p_note));

  return jsonb_build_object('ok', true, 'state', p_resolution);
end;
$function$;

-- --------------------------------------------------------------------------
-- تقارير
-- --------------------------------------------------------------------------

create or replace function public.isp_dashboard(p_token text, p_provider_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_s public.isp_module_sessions;
begin
  v_s := public.isp_guard(p_token, 'CASHIER');

  return jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'subscribers', (
      select jsonb_object_agg(status, n) from (
        select status, count(*) as n from public.isp_subscribers
         where p_provider_id is null or provider_id = p_provider_id
         group by status) q),
    'expiring_soon', (
      select count(*) from public.isp_subscriptions
       where status = 'active'
         and expires_at between now() and now() + interval '7 days'
         and (p_provider_id is null or provider_id = p_provider_id)),
    'online_now', (
      select count(*) from public.isp_sessions s
        join public.isp_subscribers b on b.id = s.subscriber_id
       where s.online and (p_provider_id is null or b.provider_id = p_provider_id)),
    -- الإيراد = ما له فاتورة فعلية في دفتر ياقوت، لا مجرد عملية ناجحة.
    -- بدون هذا الشرط تُحتسب عملية طوبقت يدوياً ولم تُفوتَر، فتختلف اللوحة
    -- عن الدفتر. الرقم هنا يطابق public.invoices دائماً بحكم البناء.
    'revenue_today', coalesce((
      select sum(retail_amount) from public.isp_transactions
       where state = 'SUCCESS' and erp_invoice_id is not null
         and public.بغداد_يوم(created_at) = public.بغداد_يوم(now())
         and (p_provider_id is null or provider_id = p_provider_id)), 0),
    -- الكلفة والربح يُحسبان فقط من العمليات التي عُرفت كلفتها.
    'cost_today', coalesce((
      select sum(cost_amount) from public.isp_transactions
       where state = 'SUCCESS' and erp_invoice_id is not null and cost_amount is not null
         and public.بغداد_يوم(created_at) = public.بغداد_يوم(now())
         and (p_provider_id is null or provider_id = p_provider_id)), 0),
    'cost_known_ratio', coalesce((
      select round(
        count(*) filter (where cost_amount is not null)::numeric
        / nullif(count(*), 0) * 100, 1)
        from public.isp_transactions
       where state = 'SUCCESS' and erp_invoice_id is not null
         and public.بغداد_يوم(created_at) = public.بغداد_يوم(now())
         and (p_provider_id is null or provider_id = p_provider_id)), 0),
    'pending_reconciliation', (
      select count(*) from public.isp_transactions
       where state = 'REQUIRES_RECONCILIATION'
         and (p_provider_id is null or provider_id = p_provider_id)),
    -- عمليات أُكِّدت مع المزود ولم تُفوتَر بعد. تظهر صراحةً بدل أن تختفي
    -- بين الإيراد وحالات المطابقة.
    'confirmed_unposted', (
      select count(*) from public.isp_transactions
       where state = 'SUCCESS' and erp_invoice_id is null
         and (p_provider_id is null or provider_id = p_provider_id)),
    'wallets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'provider_id', w.provider_id,
               'currency', w.currency,
               'current_balance', w.current_balance,
               'available_balance', w.available_balance,
               'low_balance_threshold', w.low_balance_threshold,
               'last_synced_at', w.last_synced_at))
        from public.isp_wallets w
       where p_provider_id is null or w.provider_id = p_provider_id), '[]'::jsonb));
end;
$function$;

-- المشتركون المقبلون على الانتهاء — يغذّي تذكير واتساب.
create or replace function public.isp_queue_expiry_reminders(p_days integer default 3)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; v_n int := 0;
begin
  for r in
    select b.id, b.full_name, b.phone_number, b.erp_customer_id,
           s.expires_at, p.display_name as package_name
      from public.isp_subscriptions s
      join public.isp_subscribers b on b.id = s.subscriber_id
      left join public.isp_packages p on p.id = s.package_id
     where s.status = 'active'
       and s.expires_at between now() and now() + make_interval(days => greatest(p_days, 1))
       and b.phone_number is not null
       -- لا نكرر التذكير خلال أسبوع لنفس المشترك.
       and not exists (
         select 1 from public.wa_messages m
          where m.kind = 'isp_expiry_reminder'
            and m.ref_table = 'isp_subscribers' and m.ref_id = b.id
            and m.status <> 'failed'
            and m.created_at > now() - interval '7 days')
  loop
    perform public.wa_queue(
      p_kind        => 'isp_expiry_reminder',
      p_customer_id => r.erp_customer_id,
      p_name        => r.full_name,
      p_phone       => r.phone_number,
      p_vars        => jsonb_build_object(
                         'الباقة', coalesce(r.package_name, 'باقة إنترنت'),
                         'تاريخ_الانتهاء', public.بغداد(r.expires_at)),
      p_ref_table   => 'isp_subscribers',
      p_ref_id      => r.id);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

comment on function public.isp_queue_expiry_reminders(integer) is
  'يصفّ تذكيرات انتهاء الاشتراك. يُستدعى من مهمة مجدولة، لا من الواجهة.';
