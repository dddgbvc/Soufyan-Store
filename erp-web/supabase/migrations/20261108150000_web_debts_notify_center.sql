-- ياقوت ويب v8: زبون جديد + مركز إشعارات متكامل
--   • web_customer_create: زبون جديد (مع دين افتتاحي اختياري عبر web_debt_addition الموجودة)
--   • web_notifications: صندوق إشعارات داخل التطبيق لكل موظف (يعمل حتى بدون Push)
--   • تفضيلات: كل نوع، حد أدنى لمبلغ الفاتورة، ساعات الهدوء
--   • أنواع جديدة: دين جديد، تسديد دين
--   • إدارة: تفضيلات الموظفين، إشعار مخصص لموظفين محددين أو للكل، إحصاءات
-- يتطلب تطبيق 20261108140000_web_push_auto.sql قبله.

-- ------------------------------------------------------------------ زبون جديد
create or replace function public.web_customer_create(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s      public.app_sessions;
  v_name   text := nullif(btrim(coalesce(p_payload->>'name', '')), '');
  v_phone  text := regexp_replace(coalesce(p_payload->>'phone', ''), '[^0-9+]', '', 'g');
  v_client text;
  v_c      public.customers;
  v_dup    public.customers;
  v_res    jsonb;
begin
  v_s := public.web_guard(p_session_id, 'customers', 'customers.edit');
  v_client := public.web_client_id(p_payload);

  select * into v_c from public.customers where tenant_id = v_s.tenant_id and client_id = v_client;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'customer',
      jsonb_build_object('id', v_c.id, 'name', v_c.name, 'phone', v_c.phone, 'balance', v_c.balance, 'credit_limit', v_c.credit_limit));
  end if;

  if v_name is null or char_length(v_name) < 2 then
    raise exception 'اكتب اسم الزبون' using errcode = '22023';
  end if;
  if v_phone <> '' and v_phone !~ '^\+?\d{7,15}$' then
    raise exception 'رقم الهاتف غير صحيح' using errcode = '22023';
  end if;

  if v_phone <> '' and not coalesce((p_payload->>'allow_duplicate')::boolean, false) then
    select * into v_dup from public.customers
     where tenant_id = v_s.tenant_id and deleted_at is null and anonymized_at is null
       and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(v_phone, '\D', '', 'g'), 10)
     order by balance desc limit 1;
    if found then
      return jsonb_build_object('ok', false, 'reason', 'duplicate', 'existing',
        jsonb_build_object('id', v_dup.id, 'name', v_dup.name, 'phone', v_dup.phone, 'balance', v_dup.balance));
    end if;
  end if;

  insert into public.customers (name, phone, address, credit_limit, client_id, tenant_id)
  values (left(v_name, 120), nullif(v_phone, ''), left(nullif(btrim(coalesce(p_payload->>'address', '')), ''), 300),
          case when nullif(p_payload->>'credit_limit', '') is null then 500000
               else public.web_money(p_payload->'credit_limit', 'سقف الدين', true) end,
          v_client, v_s.tenant_id)
  returning * into v_c;

  v_res := jsonb_build_object('ok', true, 'customer',
    jsonb_build_object('id', v_c.id, 'name', v_c.name, 'phone', v_c.phone, 'balance', v_c.balance, 'credit_limit', v_c.credit_limit));

  if coalesce(nullif(p_payload->>'opening_debt', ''), '0') <> '0' then
    v_res := v_res || jsonb_build_object('debt', public.web_debt_addition(p_session_id, jsonb_build_object(
      'customer_id', v_c.id,
      'amount', p_payload->'opening_debt',
      'notes', coalesce(nullif(btrim(coalesce(p_payload->>'notes', '')), ''), 'رصيد افتتاحي'),
      'client_id', (p_payload->>'client_id') || '-d')));
  end if;
  return v_res;
end
$$;

-- ------------------------------------------------------------------ صندوق الإشعارات
create table if not exists public.web_notifications (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null,
  employee_id uuid not null,
  kind        text not null,
  title       text not null,
  body        text not null,
  url         text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists web_notifications_emp_idx on public.web_notifications (employee_id, created_at desc);
create index if not exists web_notifications_unread_idx on public.web_notifications (employee_id) where read_at is null;
alter table public.web_notifications enable row level security;
revoke all on public.web_notifications from public, anon, authenticated;
grant select, insert, update, delete on public.web_notifications to service_role;

-- ------------------------------------------------------------------ الأنواع والتفضيلات
create or replace function public.web_push_kinds()
returns text[] language sql immutable set search_path to 'pg_catalog' as $$
  select array['invoice', 'debt_added', 'debt_paid', 'shortage', 'repair_ready',
               'report_daily', 'report_weekly', 'report_monthly', 'report_bimonthly', 'report_yearly']
$$;

create or replace function public.web_push_kind_perms(p_kind text)
returns text[] language sql immutable set search_path to 'pg_catalog' as $$
  select case
    when p_kind = 'invoice' then array['pos']
    when p_kind in ('debt_added', 'debt_paid') then array['customers']
    when p_kind = 'shortage' then array['shortages', 'inventory']
    when p_kind = 'repair_ready' then array['repairs']
    when p_kind like 'report\_%' then array['dashboard']
    else array[]::text[] end
$$;

create or replace function public.web_push_prefs_get(p_user text)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select (select jsonb_object_agg(k, coalesce((pr.prefs ->> k)::boolean, true)) from unnest(public.web_push_kinds()) k)
         || jsonb_build_object(
              'invoice_min', coalesce((pr.prefs ->> 'invoice_min')::numeric, 0),
              'quiet', coalesce((pr.prefs ->> 'quiet')::boolean, false),
              'quiet_from', coalesce(pr.prefs ->> 'quiet_from', '23:30'),
              'quiet_to', coalesce(pr.prefs ->> 'quiet_to', '08:00'))
    from (select (select prefs from public.web_push_prefs where user_id = p_user) as prefs) pr
$$;

create or replace function public.web_push_prefs_set(p_user text, p_prefs jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_clean jsonb := '{}'::jsonb;
  k text;
begin
  foreach k in array public.web_push_kinds() || array['quiet'] loop
    if jsonb_typeof(p_prefs -> k) = 'boolean' then
      v_clean := v_clean || jsonb_build_object(k, (p_prefs ->> k)::boolean);
    end if;
  end loop;
  if jsonb_typeof(p_prefs -> 'invoice_min') = 'number' and (p_prefs ->> 'invoice_min')::numeric between 0 and 1e12 then
    v_clean := v_clean || jsonb_build_object('invoice_min', round((p_prefs ->> 'invoice_min')::numeric));
  end if;
  foreach k in array array['quiet_from', 'quiet_to'] loop
    if coalesce(p_prefs ->> k, '') ~ '^([01]\d|2[0-3]):[0-5]\d$' then
      v_clean := v_clean || jsonb_build_object(k, p_prefs ->> k);
    end if;
  end loop;
  insert into public.web_push_prefs (user_id, prefs, updated_at)
  values (p_user, v_clean, now())
  on conflict (user_id) do update set prefs = public.web_push_prefs.prefs || excluded.prefs, updated_at = now();
  return public.web_push_prefs_get(p_user);
end
$$;

-- ساعات الهدوء بتوقيت بغداد (تدعم الفترات التي تعبر منتصف الليل)
create or replace function public.web_push_in_quiet(p jsonb)
returns boolean language sql stable set search_path to 'pg_catalog' as $$
  select coalesce((p ->> 'quiet')::boolean, false)
     and coalesce(p ->> 'quiet_from', '') ~ '^\d\d:\d\d$'
     and coalesce(p ->> 'quiet_to', '') ~ '^\d\d:\d\d$'
     and (select case when f <= t then n >= f and n < t else n >= f or n < t end
            from (select (p ->> 'quiet_from')::time f, (p ->> 'quiet_to')::time t,
                         (now() at time zone 'Asia/Baghdad')::time n) x)
$$;

-- ------------------------------------------------------------------ التوزيع: صندوق + أجهزة
-- لكل عنصر: يحدد المستلمين (صلاحية + تفضيل + حد الفاتورة، أو قائمة مخصصة)،
-- يكتب في صندوق كل موظف، ويعيد أجهزة Push خارج ساعات الهدوء (إلا العاجل).
create or replace function public.web_push_dispatch(p_tenant uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_out     jsonb := '[]'::jsonb;
  it        jsonb;
  v_kind    text;
  v_devices jsonb;
  v_count   int;
begin
  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_kind := it ->> 'kind';
    if to_regclass('pg_temp._web_rcp') is null then
      create temporary table _web_rcp (employee_id uuid, user_id text, prefs jsonb) on commit drop;
    end if;
    truncate _web_rcp;
    insert into _web_rcp
    select e.id, 'emp:' || e.id::text, public.web_push_prefs_get('emp:' || e.id::text)
      from public.employees e
     where e.tenant_id = p_tenant and e.status = 'active'
       and case when v_kind = 'custom'
                then jsonb_typeof(it -> 'targets') is distinct from 'array'
                     or jsonb_array_length(it -> 'targets') = 0 or (it -> 'targets') ? e.id::text
                else public.employee_permissions(e) && public.web_push_kind_perms(v_kind) end;
    delete from _web_rcp r
     where v_kind <> 'custom'
       and (not coalesce((r.prefs ->> v_kind)::boolean, true)
            or (v_kind = 'invoice' and coalesce((it ->> 'amount')::numeric, 0) < coalesce((r.prefs ->> 'invoice_min')::numeric, 0)));

    insert into public.web_notifications (tenant_id, employee_id, kind, title, body, url)
    select p_tenant, r.employee_id, v_kind, left(it ->> 'title', 120), left(it ->> 'body', 500), it ->> 'url' from _web_rcp r;
    get diagnostics v_count = row_count;

    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into v_devices
      from _web_rcp r join public.web_push_subscriptions s on s.user_id = r.user_id
     where coalesce((it ->> 'urgent')::boolean, false) or not public.web_push_in_quiet(r.prefs);

    v_out := v_out || jsonb_build_array(
      (it - 'amount' - 'targets' - 'urgent') || jsonb_build_object('devices', v_devices, 'recipients', v_count));
  end loop;
  return v_out;
end
$$;

-- ------------------------------------------------------------------ الجامع الدوري (يستبدل نسخة web_push_auto)
create or replace function public.web_push_collect()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_out     jsonb := '[]'::jsonb;
  v_items   jsonb;
  v_tenant  uuid;
  v_local   timestamp := (now() at time zone 'Asia/Baghdad');
  v_today   date := (now() at time zone 'Asia/Baghdad')::date;
  v_n       int;
  v_names   text;
  v_sum     numeric;
  r         record;
  v_from    timestamptz;
  v_to      timestamptz;
  v_rep     record;
  v_ids     uuid[];
begin
  if not pg_try_advisory_xact_lock(hashtext('web_push_collect')) then
    return v_out;
  end if;
  delete from public.web_push_seen where seen_at < now() - interval '4 days';
  delete from public.web_notifications where created_at < now() - interval '120 days';

  for v_tenant in
    select t.id from public.tenants t
     where t.status = 'active'
       and (exists (select 1 from public.web_store_devices d where d.tenant_id = t.id and d.revoked_at is null)
            or exists (select 1 from public.web_push_subscriptions s
                        join public.employees e on s.user_id = 'emp:' || e.id::text
                       where e.tenant_id = t.id))
  loop
    v_items := '[]'::jsonb;

    if not exists (select 1 from public.web_push_cursors where tenant_id = v_tenant and kind = 'init') then
      insert into public.web_push_cursors (tenant_id, kind) values (v_tenant, 'init');
      insert into public.web_push_seen (tenant_id, kind, ref_id)
        select v_tenant, 'invoice', id from public.invoices
         where tenant_id = v_tenant and created_at > now() - interval '3 days' on conflict do nothing;
      insert into public.web_push_seen (tenant_id, kind, ref_id)
        select v_tenant, 'repair_ready', id from public.repair_status_history
         where tenant_id = v_tenant and to_status = 'READY' and created_at > now() - interval '3 days' on conflict do nothing;
      insert into public.web_push_seen (tenant_id, kind, ref_id)
        select v_tenant, 'shortage', id from public.shortages
         where tenant_id = v_tenant and not coalesce(resolved, false) on conflict do nothing;
      insert into public.web_push_low_state (tenant_id, product_id)
        select v_tenant, id from public.products
         where tenant_id = v_tenant and not coalesce(is_service, false)
           and stock_quantity <= coalesce(min_stock_alert, 0) on conflict do nothing;
    end if;
    if not exists (select 1 from public.web_push_cursors where tenant_id = v_tenant and kind = 'init_debt') then
      insert into public.web_push_cursors (tenant_id, kind) values (v_tenant, 'init_debt');
      insert into public.web_push_seen (tenant_id, kind, ref_id)
        select v_tenant, 'debt', id from public.debt_payments
         where tenant_id = v_tenant and created_at > now() - interval '3 days' on conflict do nothing;
    end if;

    -- 1) فواتير جديدة
    with fresh as (
      insert into public.web_push_seen (tenant_id, kind, ref_id)
      select v_tenant, 'invoice', i.id from public.invoices i
       where i.tenant_id = v_tenant and i.created_at > now() - interval '3 days'
         and not exists (select 1 from public.web_push_seen x
                          where x.tenant_id = v_tenant and x.kind = 'invoice' and x.ref_id = i.id)
      on conflict do nothing
      returning ref_id
    )
    select array_agg(ref_id) into v_ids from fresh;
    v_n := coalesce(array_length(v_ids, 1), 0);
    if v_n between 1 and 3 then
      for r in select i.* from public.invoices i where i.id = any(v_ids) order by i.created_at loop
        v_items := v_items || jsonb_build_object(
          'kind', 'invoice', 'tag', 'inv-' || r.id, 'url', '/#invoices', 'amount', r.total_amount,
          'title', 'فاتورة جديدة ' || coalesce(r.invoice_number, ''),
          'body', public.web_push_money(r.total_amount)
                  || ' • ' || case when upper(coalesce(r.payment_type, '')) = 'DEBT' then 'آجل' else 'نقدي' end
                  || ' • ' || coalesce(nullif(r.customer_name, ''), 'زبون نقدي')
                  || coalesce(' • بواسطة ' || nullif(r.actor, ''), ''));
      end loop;
    elsif v_n > 3 then
      select sum(total_amount) into v_sum from public.invoices where id = any(v_ids);
      v_items := v_items || jsonb_build_object(
        'kind', 'invoice', 'tag', 'inv-batch-' || extract(epoch from now())::bigint, 'url', '/#invoices', 'amount', v_sum,
        'title', v_n || ' فواتير جديدة', 'body', 'المجموع ' || public.web_push_money(v_sum));
    end if;

    -- 2) ديون: إضافة / تسديد
    with fresh as (
      insert into public.web_push_seen (tenant_id, kind, ref_id)
      select v_tenant, 'debt', d.id from public.debt_payments d
       where d.tenant_id = v_tenant and d.created_at > now() - interval '3 days'
         and not exists (select 1 from public.web_push_seen x
                          where x.tenant_id = v_tenant and x.kind = 'debt' and x.ref_id = d.id)
      on conflict do nothing
      returning ref_id
    )
    select array_agg(ref_id) into v_ids from fresh;
    for r in select d.* from public.debt_payments d where d.id = any(coalesce(v_ids, '{}'::uuid[])) order by d.created_at limit 10 loop
      if r.movement_type = 'DEBT_ADDITION' then
        v_items := v_items || jsonb_build_object(
          'kind', 'debt_added', 'tag', 'debt-' || r.id, 'url', '/#customers',
          'title', 'دين جديد • ' || coalesce(r.customer_name, ''),
          'body', '+' || public.web_push_money(r.amount_paid) || ' • الرصيد ' || public.web_push_money(r.remaining_debt)
                  || coalesce(' • بواسطة ' || nullif(r.actor, ''), '') || coalesce(' • ' || left(nullif(r.notes, ''), 60), ''));
      else
        v_items := v_items || jsonb_build_object(
          'kind', 'debt_paid', 'tag', 'pay-' || r.id, 'url', '/#customers',
          'title', 'تسديد دين • ' || coalesce(r.customer_name, ''),
          'body', 'قبض ' || public.web_push_money(r.amount_paid)
                  || case when coalesce(r.waived_amount, 0) > 0 then ' • مسامحة ' || public.web_push_money(r.waived_amount) else '' end
                  || ' • المتبقي ' || public.web_push_money(r.remaining_debt)
                  || coalesce(' • بواسطة ' || nullif(r.actor, ''), ''));
      end if;
    end loop;

    -- 3) صيانة جاهزة
    with fresh as (
      insert into public.web_push_seen (tenant_id, kind, ref_id)
      select v_tenant, 'repair_ready', h.id from public.repair_status_history h
       where h.tenant_id = v_tenant and h.to_status = 'READY' and h.created_at > now() - interval '3 days'
         and not exists (select 1 from public.web_push_seen x
                          where x.tenant_id = v_tenant and x.kind = 'repair_ready' and x.ref_id = h.id)
      on conflict do nothing
      returning ref_id
    )
    select array_agg(ref_id) into v_ids from fresh;
    for r in
      select rp.* from public.repair_status_history h join public.repairs rp on rp.id = h.repair_id
       where h.id = any(coalesce(v_ids, '{}'::uuid[])) limit 10
    loop
      v_items := v_items || jsonb_build_object(
        'kind', 'repair_ready', 'tag', 'rep-' || r.id, 'url', '/#repairs',
        'title', 'صيانة جاهزة للتسليم ' || coalesce(r.ticket_no, ''),
        'body', coalesce(btrim(r.device), 'جهاز') || ' • ' || coalesce(r.customer_name, '')
                || coalesce(' • ' || nullif(r.customer_phone, ''), '')
                || ' • المتبقي ' || public.web_push_money(coalesce(r.cost, 0) + coalesce(r.labour, 0) - coalesce(r.prepaid, 0)));
    end loop;

    -- 4) نواقص
    with fresh as (
      insert into public.web_push_seen (tenant_id, kind, ref_id)
      select v_tenant, 'shortage', s.id from public.shortages s
       where s.tenant_id = v_tenant and not coalesce(s.resolved, false)
         and not exists (select 1 from public.web_push_seen x
                          where x.tenant_id = v_tenant and x.kind = 'shortage' and x.ref_id = s.id)
      on conflict do nothing
      returning ref_id
    )
    select string_agg(s.name, '، '), count(*) into v_names, v_n
      from fresh f join public.shortages s on s.id = f.ref_id;
    if v_n > 0 then
      v_items := v_items || jsonb_build_object(
        'kind', 'shortage', 'tag', 'short-' || extract(epoch from now())::bigint, 'url', '/#shortages',
        'title', case when v_n = 1 then 'نقص جديد مسجّل' else v_n || ' نواقص جديدة' end, 'body', left(v_names, 180));
    end if;

    delete from public.web_push_low_state l
     where l.tenant_id = v_tenant
       and not exists (select 1 from public.products p
                        where p.id = l.product_id and not coalesce(p.is_service, false)
                          and p.stock_quantity <= coalesce(p.min_stock_alert, 0));
    with fresh as (
      insert into public.web_push_low_state (tenant_id, product_id)
      select v_tenant, p.id from public.products p
       where p.tenant_id = v_tenant and not coalesce(p.is_service, false)
         and p.stock_quantity <= coalesce(p.min_stock_alert, 0)
      on conflict do nothing
      returning product_id
    )
    select string_agg(p.name || ' (' || p.stock_quantity || ')', '، '), count(*) into v_names, v_n
      from fresh f join public.products p on p.id = f.product_id;
    if v_n > 0 then
      v_items := v_items || jsonb_build_object(
        'kind', 'shortage', 'tag', 'low-' || extract(epoch from now())::bigint, 'url', '/#shortages',
        'title', case when v_n = 1 then 'منتج تحت حد التنبيه' else v_n || ' منتجات تحت حد التنبيه' end, 'body', left(v_names, 180));
    end if;

    -- 5) التقارير الدورية (بتوقيت بغداد)
    for v_rep in
      select * from (values
        ('report_daily', extract(hour from v_local) >= 23,
          v_today::timestamp, (v_today + 1)::timestamp, v_today::text, 'التقرير اليومي • ' || v_today::text),
        ('report_weekly', extract(isodow from v_local) = 5 and extract(hour from v_local) >= 23,
          (v_today - 6)::timestamp, (v_today + 1)::timestamp, (v_today - 6)::text,
          'التقرير الأسبوعي • ' || (v_today - 6)::text || ' ← ' || v_today::text),
        ('report_monthly', extract(day from v_local) = 1 and extract(hour from v_local) >= 9,
          (date_trunc('month', v_local) - interval '1 month'), date_trunc('month', v_local),
          to_char(date_trunc('month', v_local) - interval '1 month', 'YYYY-MM'),
          'التقرير الشهري • ' || to_char(date_trunc('month', v_local) - interval '1 month', 'YYYY-MM')),
        ('report_bimonthly', extract(day from v_local) = 1 and extract(month from v_local)::int % 2 = 1
                             and extract(hour from v_local) >= 9,
          (date_trunc('month', v_local) - interval '2 months'), date_trunc('month', v_local),
          to_char(date_trunc('month', v_local) - interval '2 months', 'YYYY-MM'),
          'تقرير الشهرين • ' || to_char(date_trunc('month', v_local) - interval '2 months', 'YYYY-MM')
            || ' و' || to_char(date_trunc('month', v_local) - interval '1 month', 'YYYY-MM')),
        ('report_yearly', extract(month from v_local) = 1 and extract(day from v_local) = 1
                          and extract(hour from v_local) >= 9,
          (date_trunc('year', v_local) - interval '1 year'), date_trunc('year', v_local),
          to_char(date_trunc('year', v_local) - interval '1 year', 'YYYY'),
          'التقرير السنوي • ' || to_char(date_trunc('year', v_local) - interval '1 year', 'YYYY'))
      ) as t(kind, due, p_from, p_to, period_key, title)
    loop
      continue when not v_rep.due;
      insert into public.web_push_report_runs (tenant_id, kind, period_key)
      values (v_tenant, v_rep.kind, v_rep.period_key) on conflict do nothing;
      continue when not found;
      v_from := v_rep.p_from at time zone 'Asia/Baghdad';
      v_to := least(v_rep.p_to at time zone 'Asia/Baghdad', now());
      v_items := v_items || jsonb_build_object(
        'kind', v_rep.kind, 'tag', v_rep.kind || '-' || v_rep.period_key, 'url', '/#dashboard',
        'title', v_rep.title, 'body', public.web_push_report_body(v_tenant, v_from, v_to));
    end loop;

    if jsonb_array_length(v_items) > 0 then
      v_out := v_out || public.web_push_dispatch(v_tenant, v_items);
    end if;
  end loop;

  return v_out;
end
$$;

-- ------------------------------------------------------------------ صندوق الموظف
create or replace function public.web_notify_inbox(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s      public.app_sessions;
  v_limit  int := least(greatest(coalesce((p_params->>'limit')::int, 40), 1), 100);
  v_before bigint := nullif(p_params->>'before', '')::bigint;
  v_kind   text := nullif(p_params->>'kind', '');
  v_unread boolean := coalesce((p_params->>'unread_only')::boolean, false);
begin
  v_s := public.web_guard(p_session_id);
  return jsonb_build_object('ok', true,
    'unread', (select count(*) from public.web_notifications where employee_id = v_s.employee_id and read_at is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'url', n.url,
                                          'created_at', n.created_at, 'read', n.read_at is not null) order by n.id desc)
        from (select * from public.web_notifications
               where employee_id = v_s.employee_id
                 and (v_before is null or id < v_before)
                 and (v_kind is null or kind = v_kind or (v_kind = 'report' and kind like 'report\_%')
                      or (v_kind = 'debt' and kind in ('debt_added', 'debt_paid')))
                 and (not v_unread or read_at is null)
               order by id desc limit v_limit) n), '[]'::jsonb));
end
$$;

create or replace function public.web_notify_mark(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
begin
  v_s := public.web_guard(p_session_id);
  update public.web_notifications set read_at = now()
   where employee_id = v_s.employee_id and read_at is null
     and (coalesce((p_payload->>'all')::boolean, false)
          or id in (select (x #>> '{}')::bigint from jsonb_array_elements(coalesce(p_payload->'ids', '[]'::jsonb)) x));
  return jsonb_build_object('ok', true,
    'unread', (select count(*) from public.web_notifications where employee_id = v_s.employee_id and read_at is null));
end
$$;

-- ------------------------------------------------------------------ لوحة الإدارة
create or replace function public.web_notify_admin(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
begin
  v_s := public.web_guard(p_session_id, 'employees', 'employees.permissions');
  return jsonb_build_object('ok', true,
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', coalesce(e.display_name, e.name), 'role', e.role,
        'permissions', to_jsonb(public.employee_permissions(e)),
        'prefs', public.web_push_prefs_get('emp:' || e.id::text),
        'devices', (select count(*) from public.web_push_subscriptions s where s.user_id = 'emp:' || e.id::text),
        'device_names', (select coalesce(jsonb_agg(s.device_name), '[]'::jsonb) from public.web_push_subscriptions s where s.user_id = 'emp:' || e.id::text),
        'unread', (select count(*) from public.web_notifications n where n.employee_id = e.id and n.read_at is null),
        'last_at', (select max(n.created_at) from public.web_notifications n where n.employee_id = e.id))
        order by (e.role = 'ADMIN') desc, coalesce(e.display_name, e.name))
        from public.employees e where e.tenant_id = v_s.tenant_id and e.status = 'active'), '[]'::jsonb),
    'stats', coalesce((
      select jsonb_object_agg(kind, c) from (
        select kind, count(*) c from public.web_notifications
         where tenant_id = v_s.tenant_id and created_at > now() - interval '7 days' group by kind) x), '{}'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'title', title, 'body', body, 'created_at', created_at, 'recipients', c) order by created_at desc)
        from (select kind, title, body, min(created_at) created_at, count(*) c
                from public.web_notifications
               where tenant_id = v_s.tenant_id and created_at > now() - interval '7 days'
               group by kind, title, body order by min(created_at) desc limit 30) r), '[]'::jsonb));
end
$$;

create or replace function public.web_notify_admin_set(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s   public.app_sessions;
  v_emp public.employees;
begin
  v_s := public.web_guard(p_session_id, 'employees', 'employees.permissions');
  select * into v_emp from public.employees
   where id = nullif(p_payload->>'employee_id', '')::uuid and tenant_id = v_s.tenant_id;
  if not found then raise exception 'الموظف غير موجود' using errcode = '23503'; end if;
  perform public.log_security_event('web.notify.prefs', 'ok', v_s.employee_id, v_s.terminal_id,
    jsonb_build_object('target', v_emp.id));
  return jsonb_build_object('ok', true, 'prefs',
    public.web_push_prefs_set('emp:' || v_emp.id::text, coalesce(p_payload->'prefs', '{}'::jsonb)));
end
$$;

-- إشعار مخصص من الإدارة (للكل أو لموظفين محددين)، يُرسل فوراً من الخادم.
create or replace function public.web_notify_broadcast(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s     public.app_sessions;
  v_title text := nullif(btrim(coalesce(p_payload->>'title', '')), '');
  v_body  text := nullif(btrim(coalesce(p_payload->>'body', '')), '');
  v_from  text;
  v_items jsonb;
begin
  v_s := public.web_guard(p_session_id, 'employees', 'employees.permissions');
  if v_title is null or char_length(v_title) > 80 then raise exception 'العنوان مطلوب (حتى 80 حرفاً)' using errcode = '22023'; end if;
  if v_body is null or char_length(v_body) > 300 then raise exception 'نص الإشعار مطلوب (حتى 300 حرف)' using errcode = '22023'; end if;
  select coalesce(display_name, name) into v_from from public.employees where id = v_s.employee_id;
  v_items := public.web_push_dispatch(v_s.tenant_id, jsonb_build_array(jsonb_build_object(
    'kind', 'custom', 'tag', 'custom-' || extract(epoch from now())::bigint, 'url', '/#notifications',
    'title', v_title, 'body', v_body || ' — ' || v_from,
    'targets', case when jsonb_typeof(p_payload->'employee_ids') = 'array' then p_payload->'employee_ids' end,
    'urgent', coalesce((p_payload->>'urgent')::boolean, false))));
  perform public.log_security_event('web.notify.broadcast', 'ok', v_s.employee_id, v_s.terminal_id,
    jsonb_build_object('title', v_title, 'recipients', v_items->0->'recipients'));
  return jsonb_build_object('ok', true, 'item', v_items->0);
end
$$;

-- ------------------------------------------------------------------ الصلاحيات
revoke execute on function public.web_customer_create(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_push_in_quiet(jsonb) from public, anon, authenticated;
revoke execute on function public.web_push_dispatch(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_notify_inbox(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_notify_mark(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_notify_admin(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_notify_admin_set(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_notify_broadcast(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_push_kinds() from public, anon, authenticated;
revoke execute on function public.web_push_kind_perms(text) from public, anon, authenticated;
revoke execute on function public.web_push_prefs_get(text) from public, anon, authenticated;
revoke execute on function public.web_push_prefs_set(text, jsonb) from public, anon, authenticated;
revoke execute on function public.web_push_collect() from public, anon, authenticated;
grant execute on function public.web_customer_create(uuid, jsonb) to service_role;
grant execute on function public.web_push_in_quiet(jsonb) to service_role;
grant execute on function public.web_push_dispatch(uuid, jsonb) to service_role;
grant execute on function public.web_notify_inbox(uuid, jsonb) to service_role;
grant execute on function public.web_notify_mark(uuid, jsonb) to service_role;
grant execute on function public.web_notify_admin(uuid, jsonb) to service_role;
grant execute on function public.web_notify_admin_set(uuid, jsonb) to service_role;
grant execute on function public.web_notify_broadcast(uuid, jsonb) to service_role;
grant execute on function public.web_push_kinds() to service_role;
grant execute on function public.web_push_kind_perms(text) to service_role;
grant execute on function public.web_push_prefs_get(text) to service_role;
grant execute on function public.web_push_prefs_set(text, jsonb) to service_role;
grant execute on function public.web_push_collect() to service_role;
