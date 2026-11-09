-- تطبيقات الهاتف: واتساب المحل المتصل بالبرنامج، وملخص الودجت/الجزيرة الديناميكية.
--
-- 1) واتساب: نفس طابور البرنامج (telegram_whatsapp_outbox) الذي يرسله برنامج ويندوز أو بوابة واتساب ويب.
--    • لا يُرسل إلا لزبون وافق على واتساب (whatsapp_consent) — نفس قاعدة البرنامج.
--    • منع التكرار: إيصال الحركة مربوط بـ payment_id (فريد)، والرسالة اليدوية مربوطة بـ client_ref (فريد لكل محل).
--    • تغييرات الجدول إضافية فقط: payment_id يصبح اختيارياً للرسائل غير المرتبطة بحركة دين،
--      وثلاثة أعمدة جديدة. المرسل الحالي يقرأ (id, claim_token, phone, body) فقط فلا يتأثر.
-- 2) web_native_summary: أرقام مختصرة للودجت بالرمز السري للجهاز (مثل web_native_poll)، بصلاحيات الموظف نفسها.

alter table public.telegram_whatsapp_outbox alter column payment_id drop not null;
alter table public.telegram_whatsapp_outbox add column if not exists kind text not null default 'receipt';
alter table public.telegram_whatsapp_outbox add column if not exists client_ref text;
alter table public.telegram_whatsapp_outbox add column if not exists created_by uuid;
create unique index if not exists telegram_whatsapp_outbox_client_ref_key
  on public.telegram_whatsapp_outbox (tenant_id, client_ref) where client_ref is not null;

-- ------------------------------------------------------------------ حالة واتساب المحل
create or replace function public.web_whatsapp_overview(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_limit int := least(greatest(coalesce((p_params->>'limit')::int, 60), 1), 200);
  v_ctl public.yaqoot_baileys_sender_control;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  select * into v_ctl from public.yaqoot_baileys_sender_control where tenant_id = v_s.tenant_id;
  return jsonb_build_object(
    'ok', true,
    'gateway', jsonb_build_object(
      'location', coalesce(v_ctl.active_location, 'disabled'),
      'online', coalesce(v_ctl.active_location, 'disabled') <> 'disabled' and v_ctl.lease_until > now(),
      'lease_until', v_ctl.lease_until),
    'desktop_last_claim', (select max(coalesce(o.sent_at, o.lease_until)) from public.telegram_whatsapp_outbox o
                            where o.tenant_id = v_s.tenant_id and o.claimed_session_id is not null),
    'last_sent', (select max(sent_at) from public.telegram_whatsapp_outbox where tenant_id = v_s.tenant_id),
    'stats', (select jsonb_build_object(
                'pending', count(*) filter (where status = 'pending'),
                'claimed', count(*) filter (where status = 'claimed'),
                'sent', count(*) filter (where status = 'sent'),
                'uncertain', count(*) filter (where status = 'uncertain'),
                'skipped', count(*) filter (where status = 'skipped'))
              from public.telegram_whatsapp_outbox where tenant_id = v_s.tenant_id),
    'consent', (select jsonb_build_object('yes', count(*) filter (where whatsapp_consent), 'total', count(*))
                from public.customers where tenant_id = v_s.tenant_id and deleted_at is null and anonymized_at is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'kind', o.kind, 'status', o.status, 'reason', o.reason, 'body', o.body, 'phone', o.phone,
        'customer_id', o.customer_id, 'customer_name', c.name, 'created_at', o.created_at, 'sent_at', o.sent_at) order by o.created_at desc)
      from (select * from public.telegram_whatsapp_outbox where tenant_id = v_s.tenant_id order by created_at desc limit v_limit) o
      left join public.customers c on c.id = o.customer_id), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------------ واتساب زبون واحد
create or replace function public.web_whatsapp_customer(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_c public.customers;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  select * into v_c from public.customers
   where id = nullif(p_params->>'id', '')::uuid and tenant_id = v_s.tenant_id and deleted_at is null;
  if not found then raise exception 'الزبون غير موجود' using errcode = '22023'; end if;
  return jsonb_build_object(
    'ok', true,
    'consent', coalesce(v_c.whatsapp_consent, false),
    'phone', public.normalize_iraqi_phone(v_c.phone),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'status', o.status, 'reason', o.reason,
                                          'body', o.body, 'created_at', o.created_at, 'sent_at', o.sent_at) order by o.created_at desc)
      from (select * from public.telegram_whatsapp_outbox where tenant_id = v_s.tenant_id and customer_id = v_c.id
            order by created_at desc limit 20) o), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------------ إرسال عبر واتساب المحل
create or replace function public.web_whatsapp_send(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_c public.customers;
  v_kind text := coalesce(nullif(p_payload->>'kind', ''), 'reminder');
  v_phone text;
  v_body text;
  v_id uuid;
  v_pay public.debt_payments;
  v_client text;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  if v_kind not in ('reminder', 'receipt') then raise exception 'نوع رسالة غير معروف' using errcode = '22023'; end if;

  select * into v_c from public.customers
   where id = nullif(p_payload->>'customer_id', '')::uuid and tenant_id = v_s.tenant_id and deleted_at is null;
  if not found then raise exception 'الزبون غير موجود' using errcode = '22023'; end if;
  if not coalesce(v_c.whatsapp_consent, false) then
    return jsonb_build_object('ok', false, 'reason', 'no_consent',
      'message', 'الزبون لم يوافق على رسائل واتساب. فعّل موافقته أولاً من ملفه.');
  end if;
  v_phone := public.normalize_iraqi_phone(v_c.phone);
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_phone', 'message', 'رقم هاتف الزبون غير صالح لواتساب.');
  end if;

  if v_kind = 'receipt' then
    -- إيصال لحركة دين أنشأها التطبيق: نفس صيغة البرنامج، ومرة واحدة لكل حركة.
    v_client := public.web_client_id(jsonb_build_object('client_id', p_payload->>'operation_id'));
    select * into v_pay from public.debt_payments
     where tenant_id = v_s.tenant_id and client_id = v_client and customer_id = v_c.id;
    if not found then raise exception 'لم تُعثر على الحركة المطلوبة' using errcode = '22023'; end if;
    v_body := 'مرحباً ' || v_c.name || E'\n'
      || case when v_pay.movement_type = 'DEBT_ADDITION' then '➕ أُضيف إلى حسابك: ' else '✅ استلمنا منك: ' end
      || to_char(v_pay.amount_paid, 'FM999,999,999,999,990') || ' د.ع' || E'\n'
      || 'الرصيد السابق: ' || to_char(v_pay.previous_debt, 'FM999,999,999,999,990') || E' د.ع\n'
      || 'الدين المتبقي: ' || to_char(v_pay.remaining_debt, 'FM999,999,999,999,990') || E' د.ع\n'
      || 'التاريخ: ' || to_char(v_pay.created_at at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI');
    insert into public.telegram_whatsapp_outbox (tenant_id, payment_id, customer_id, phone, body, status, kind, created_by)
    values (v_s.tenant_id, v_pay.id, v_c.id, v_phone, v_body, 'pending', 'receipt', v_s.employee_id)
    on conflict (payment_id) do nothing
    returning id into v_id;
  else
    v_body := left(btrim(coalesce(p_payload->>'body', '')), 1000);
    if char_length(v_body) < 5 then raise exception 'اكتب نص الرسالة' using errcode = '22023'; end if;
    if (select count(*) from public.telegram_whatsapp_outbox
         where tenant_id = v_s.tenant_id and created_by = v_s.employee_id and created_at > now() - interval '10 minutes') >= 30 then
      raise exception 'رسائل كثيرة خلال وقت قصير. انتظر قليلاً.' using errcode = 'P0001';
    end if;
    insert into public.telegram_whatsapp_outbox (tenant_id, customer_id, phone, body, status, kind, client_ref, created_by)
    values (v_s.tenant_id, v_c.id, v_phone, v_body, 'pending', 'reminder', public.web_client_id(p_payload), v_s.employee_id)
    on conflict (tenant_id, client_ref) where client_ref is not null do nothing
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'queued', v_id is not null, 'replayed', v_id is null, 'id', v_id);
end $$;

-- ------------------------------------------------------------------ موافقة الزبون على واتساب
create or replace function public.web_whatsapp_consent(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_on boolean := coalesce((p_payload->>'consent')::boolean, false);
begin
  v_s := public.web_guard(p_session_id, 'customers', 'customers.edit');
  update public.customers set whatsapp_consent = v_on
   where id = nullif(p_payload->>'customer_id', '')::uuid and tenant_id = v_s.tenant_id and deleted_at is null;
  if not found then raise exception 'الزبون غير موجود' using errcode = '22023'; end if;
  return jsonb_build_object('ok', true, 'consent', v_on);
end $$;

-- ------------------------------------------------------------------ ملخص الودجت (بالرمز السري للجهاز)
create or replace function public.web_native_summary(p_token_hash text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_sub public.web_push_subscriptions;
  v_emp public.employees;
  v_perms text[];
  v_t uuid;
  v_today date := (now() at time zone 'Asia/Baghdad')::date;
  v_day0 timestamptz := (((now() at time zone 'Asia/Baghdad')::date)::timestamp at time zone 'Asia/Baghdad');
  v_admin boolean;
  v_res jsonb;
begin
  select * into v_sub from public.web_push_subscriptions where id = p_token_hash and endpoint like 'native:%';
  if not found then return jsonb_build_object('ok', false, 'reason', 'unregistered'); end if;
  select * into v_emp from public.employees where id = substr(v_sub.user_id, 5)::uuid and status = 'active';
  if not found or not exists (select 1 from public.tenants t where t.id = v_emp.tenant_id and t.status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;
  v_t := v_emp.tenant_id;
  v_perms := public.employee_permissions(v_emp);
  v_admin := upper(coalesce(v_emp.role, '')) = 'ADMIN';

  v_res := jsonb_build_object('ok', true, 'at', now(), 'today', v_today,
    'store_name', (select name from public.tenants where id = v_t),
    'employee', coalesce(v_emp.display_name, v_emp.name),
    'unread', (select count(*) from public.web_notifications where employee_id = v_emp.id and read_at is null));

  -- نفس معادلات web_dashboard.
  if 'dashboard' = any(v_perms) then
    v_res := v_res || jsonb_build_object('sales', (
      select jsonb_build_object('today_total', coalesce(sum(total_amount), 0), 'today_count', count(*), 'today_paid', coalesce(sum(paid_amount), 0))
      from public.invoices where tenant_id = v_t and created_at >= v_day0),
      'collected_today', (select coalesce(sum(amount_paid), 0) from public.debt_payments
                           where tenant_id = v_t and created_at >= v_day0 and movement_type is distinct from 'DEBT_ADDITION'));
  elsif 'pos' = any(v_perms) then
    v_res := v_res || jsonb_build_object('my_sales', (
      select jsonb_build_object('total', coalesce(sum(total_amount), 0), 'count', count(*))
      from public.invoices where tenant_id = v_t and created_at >= v_day0 and actor = coalesce(v_emp.display_name, v_emp.name)));
  end if;
  if 'vaults' = any(v_perms) then
    v_res := v_res || jsonb_build_object('vault_balance', public.vault_balance(v_t));
  end if;
  if 'customers' = any(v_perms) then
    v_res := v_res || jsonb_build_object('debts', (
      select jsonb_build_object('total', coalesce(sum(balance) filter (where balance > 0), 0), 'debtors', count(*) filter (where balance > 0))
      from public.customers where tenant_id = v_t and anonymized_at is null and deleted_at is null),
      -- نفس قاعدة web_isp_overview: المدير يرى كل الحسابات، والموظف ما أُعطي له فقط.
      'isp', (select jsonb_build_object(
                'expired', count(*) filter (where s.expires_at < now()),
                'soon', count(*) filter (where s.expires_at >= now() and s.expires_at < now() + interval '3 days'),
                'total', count(*))
              from public.isp_subscribers s
              where s.tenant_id = v_t and s.reseller_account_id in (
                select a.id from public.sas_reseller_accounts a
                 where a.tenant_id = v_t and a.deleted_at is null
                   and (v_admin or exists (select 1 from public.sas_employee_account_access x
                                            where x.reseller_account_id = a.id and x.tenant_id = a.tenant_id
                                              and x.employee_id = v_emp.id and x.is_active)))));
  end if;
  if 'repairs' = any(v_perms) then
    v_res := v_res || jsonb_build_object('repairs_ready', (select count(*) from public.repairs where tenant_id = v_t and status = 'READY'));
  end if;
  return v_res;
end $$;

revoke execute on function public.web_whatsapp_overview(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_whatsapp_customer(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_whatsapp_send(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_whatsapp_consent(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_native_summary(text) from public, anon, authenticated;
grant execute on function public.web_whatsapp_overview(uuid, jsonb) to service_role;
grant execute on function public.web_whatsapp_customer(uuid, jsonb) to service_role;
grant execute on function public.web_whatsapp_send(uuid, jsonb) to service_role;
grant execute on function public.web_whatsapp_consent(uuid, jsonb) to service_role;
grant execute on function public.web_native_summary(text) to service_role;
