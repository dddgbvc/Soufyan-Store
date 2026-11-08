-- ياقوت ويب: إشعارات تلقائية
--   فواتير جديدة • نواقص (يدوية + منتجات نزلت تحت الحد) • صيانة صارت جاهزة
--   تقارير: يومي (23:00) • أسبوعي (الجمعة 23:00، من السبت) • شهري (يوم 1 الساعة 09:00)
--           شهرين (يوم 1 من الأشهر الفردية 09:00) • سنوي (1 كانون الثاني 09:00) — بتوقيت بغداد
-- عامل Cloudflare يستدعي web_push_collect() كل دقيقة ويرسل الناتج.
-- لا تُضاف أي Triggers على جداول البرنامج: الاكتشاف بالاستعلام فقط، فلا خطر على تسجيل الفواتير.

create table if not exists public.web_push_prefs (
  user_id    text primary key,
  prefs      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
-- علامة تهيئة لكل محل/نوع: أول تشغيل يسجّل الموجود كـ"مُشاهَد" دون إرسال.
create table if not exists public.web_push_cursors (
  tenant_id  uuid not null,
  kind       text not null,
  started_at timestamptz not null default now(),
  primary key (tenant_id, kind)
);
create table if not exists public.web_push_seen (
  tenant_id uuid not null,
  kind      text not null,
  ref_id    uuid not null,
  seen_at   timestamptz not null default now(),
  primary key (tenant_id, kind, ref_id)
);
create index if not exists web_push_seen_time_idx on public.web_push_seen (seen_at);
create table if not exists public.web_push_low_state (
  tenant_id   uuid not null,
  product_id  uuid primary key,
  notified_at timestamptz not null default now()
);
create table if not exists public.web_push_report_runs (
  tenant_id  uuid not null,
  kind       text not null,
  period_key text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, kind, period_key)
);

alter table public.web_push_prefs enable row level security;
alter table public.web_push_cursors enable row level security;
alter table public.web_push_seen enable row level security;
alter table public.web_push_low_state enable row level security;
alter table public.web_push_report_runs enable row level security;
revoke all on public.web_push_prefs, public.web_push_cursors, public.web_push_seen,
  public.web_push_low_state, public.web_push_report_runs from public, anon, authenticated;
grant select, insert, update, delete on public.web_push_prefs, public.web_push_cursors, public.web_push_seen,
  public.web_push_low_state, public.web_push_report_runs to service_role;

-- ------------------------------------------------------------------
-- الأنواع، والصلاحية المطلوبة لكل نوع (يكفي واحدة منها)
create or replace function public.web_push_kind_perms(p_kind text)
returns text[] language sql immutable set search_path to 'pg_catalog' as $$
  select case p_kind
    when 'invoice' then array['pos']
    when 'shortage' then array['shortages', 'inventory']
    when 'repair_ready' then array['repairs']
    when 'report_daily' then array['dashboard']
    when 'report_weekly' then array['dashboard']
    when 'report_monthly' then array['dashboard']
    when 'report_bimonthly' then array['dashboard']
    when 'report_yearly' then array['dashboard']
    else array[]::text[] end
$$;

create or replace function public.web_push_kinds()
returns text[] language sql immutable set search_path to 'pg_catalog' as $$
  select array['invoice', 'shortage', 'repair_ready', 'report_daily', 'report_weekly',
               'report_monthly', 'report_bimonthly', 'report_yearly']
$$;

-- تفضيلات الموظف: كل الأنواع مفعّلة افتراضياً
create or replace function public.web_push_prefs_get(p_user text)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select jsonb_object_agg(k, coalesce((p.prefs ->> k)::boolean, true))
    from unnest(public.web_push_kinds()) k
    left join public.web_push_prefs p on p.user_id = p_user
$$;

create or replace function public.web_push_prefs_set(p_user text, p_prefs jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_clean jsonb := '{}'::jsonb;
  k text;
begin
  foreach k in array public.web_push_kinds() loop
    if jsonb_typeof(p_prefs -> k) = 'boolean' then
      v_clean := v_clean || jsonb_build_object(k, (p_prefs ->> k)::boolean);
    end if;
  end loop;
  insert into public.web_push_prefs (user_id, prefs, updated_at)
  values (p_user, v_clean, now())
  on conflict (user_id) do update set prefs = public.web_push_prefs.prefs || excluded.prefs, updated_at = now();
  return public.web_push_prefs_get(p_user);
end
$$;

create or replace function public.web_push_money(p numeric)
returns text language sql immutable set search_path to 'pg_catalog' as $$
  select to_char(round(coalesce(p, 0)), 'FM999,999,999,999,990') || ' د.ع'
$$;

-- ملخص فترة لمحل واحد
create or replace function public.web_push_report_body(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns text language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_sales numeric; v_count int; v_credit numeric; v_returns numeric; v_expenses numeric;
  v_prev numeric; v_change text := '';
begin
  select coalesce(sum(total_amount), 0), count(*), coalesce(sum(greatest(total_amount - paid_amount, 0)), 0)
    into v_sales, v_count, v_credit
    from public.invoices where tenant_id = p_tenant and created_at >= p_from and created_at < p_to;
  select coalesce(sum(total_amount), 0) into v_returns
    from public.returns where tenant_id = p_tenant and created_at >= p_from and created_at < p_to;
  select coalesce(sum(amount), 0) into v_expenses
    from public.expenses where tenant_id = p_tenant and created_at >= p_from and created_at < p_to
     and reversed_at is null and reversal_of is null;
  select coalesce(sum(total_amount), 0) into v_prev
    from public.invoices where tenant_id = p_tenant
     and created_at >= p_from - (p_to - p_from) and created_at < p_from;
  if v_prev > 0 then
    v_change := ' (' || case when v_sales >= v_prev then '▲' else '▼' end
                || abs(round((v_sales - v_prev) / v_prev * 100))::text || '%)';
  end if;
  return 'المبيعات ' || public.web_push_money(v_sales) || ' • ' || v_count || ' فاتورة' || v_change
      || E'\nالآجل ' || public.web_push_money(v_credit)
      || ' • المرتجعات ' || public.web_push_money(v_returns)
      || ' • المصروفات ' || public.web_push_money(v_expenses);
end
$$;

-- ------------------------------------------------------------------
-- يجمع الإشعارات المستحقة لكل المحلات التي لها أجهزة مسجلة، مع أجهزة المستلمين.
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
  r         record;
  v_from    timestamptz;
  v_to      timestamptz;
  v_key     text;
  v_rep     record;
  v_ids     uuid[];
begin
  if not pg_try_advisory_xact_lock(hashtext('web_push_collect')) then
    return v_out;
  end if;
  delete from public.web_push_seen where seen_at < now() - interval '4 days';

  for v_tenant in
    select distinct e.tenant_id
      from public.web_push_subscriptions s
      join public.employees e on s.user_id = 'emp:' || e.id::text and e.status = 'active'
      join public.tenants t on t.id = e.tenant_id and t.status = 'active'
  loop
    v_items := '[]'::jsonb;

    -- أول تشغيل لهذا المحل: سجّل الموجود كمُشاهَد بدون إرسال
    if not exists (select 1 from public.web_push_cursors where tenant_id = v_tenant and kind = 'init') then
      insert into public.web_push_cursors (tenant_id, kind) values (v_tenant, 'init');
      insert into public.web_push_seen (tenant_id, kind, ref_id)
        select v_tenant, 'invoice', id from public.invoices
         where tenant_id = v_tenant and created_at > now() - interval '3 days'
        on conflict do nothing;
      insert into public.web_push_seen (tenant_id, kind, ref_id)
        select v_tenant, 'repair_ready', id from public.repair_status_history
         where tenant_id = v_tenant and to_status = 'READY' and created_at > now() - interval '3 days'
        on conflict do nothing;
      insert into public.web_push_seen (tenant_id, kind, ref_id)
        select v_tenant, 'shortage', id from public.shortages
         where tenant_id = v_tenant and not coalesce(resolved, false)
        on conflict do nothing;
      insert into public.web_push_low_state (tenant_id, product_id)
        select v_tenant, id from public.products
         where tenant_id = v_tenant and not coalesce(is_service, false)
           and stock_quantity <= coalesce(min_stock_alert, 0)
        on conflict do nothing;
      continue;
    end if;

    -- 1) فواتير جديدة (آخر 3 أيام لالتقاط ما تمت مزامنته متأخراً)
    with fresh as (
      insert into public.web_push_seen (tenant_id, kind, ref_id)
      select v_tenant, 'invoice', i.id from public.invoices i
       where i.tenant_id = v_tenant and i.created_at > now() - interval '3 days'
         and not exists (select 1 from public.web_push_seen x
                          where x.tenant_id = v_tenant and x.kind = 'invoice' and x.ref_id = i.id)
      on conflict do nothing
      returning ref_id
    )
    select count(*) into v_n from fresh;
    if v_n between 1 and 3 then
      for r in
        select i.* from public.invoices i
         join public.web_push_seen x on x.ref_id = i.id and x.kind = 'invoice' and x.tenant_id = v_tenant
         where x.seen_at = now()
         order by i.created_at
      loop
        v_items := v_items || jsonb_build_object(
          'kind', 'invoice', 'tag', 'inv-' || r.id, 'url', '/#invoices',
          'title', 'فاتورة جديدة ' || coalesce(r.invoice_number, ''),
          'body', public.web_push_money(r.total_amount)
                  || ' • ' || case when upper(coalesce(r.payment_type, '')) = 'DEBT' then 'آجل' else 'نقدي' end
                  || ' • ' || coalesce(nullif(r.customer_name, ''), 'زبون نقدي')
                  || coalesce(' • بواسطة ' || nullif(r.actor, ''), ''));
      end loop;
    elsif v_n > 3 then
      select public.web_push_money(sum(i.total_amount)) into v_names
        from public.invoices i
        join public.web_push_seen x on x.ref_id = i.id and x.kind = 'invoice' and x.tenant_id = v_tenant
       where x.seen_at = now();
      v_items := v_items || jsonb_build_object(
        'kind', 'invoice', 'tag', 'inv-batch-' || extract(epoch from now())::bigint, 'url', '/#invoices',
        'title', v_n || ' فواتير جديدة', 'body', 'المجموع ' || v_names);
    end if;

    -- 2) صيانة صارت جاهزة
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
      select rp.* from public.repair_status_history h
        join public.repairs rp on rp.id = h.repair_id
       where h.id = any(coalesce(v_ids, '{}'::uuid[]))
       limit 10
    loop
      v_items := v_items || jsonb_build_object(
        'kind', 'repair_ready', 'tag', 'rep-' || r.id, 'url', '/#repairs',
        'title', 'صيانة جاهزة للتسليم ' || coalesce(r.ticket_no, ''),
        'body', coalesce(r.device, 'جهاز') || ' • ' || coalesce(r.customer_name, '')
                || coalesce(' • ' || nullif(r.customer_phone, ''), '')
                || ' • المبلغ ' || public.web_push_money(coalesce(r.cost, 0) + coalesce(r.labour, 0) - coalesce(r.prepaid, 0)));
    end loop;

    -- 3) نواقص: يدوية جديدة + منتجات نزلت تحت حد التنبيه
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
        'title', case when v_n = 1 then 'نقص جديد مسجّل' else v_n || ' نواقص جديدة' end,
        'body', left(v_names, 180));
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
        'title', case when v_n = 1 then 'منتج تحت حد التنبيه' else v_n || ' منتجات تحت حد التنبيه' end,
        'body', left(v_names, 180));
    end if;

    -- 4) التقارير الدورية (بتوقيت بغداد)
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
      values (v_tenant, v_rep.kind, v_rep.period_key)
      on conflict do nothing;
      continue when not found;
      v_from := v_rep.p_from at time zone 'Asia/Baghdad';
      v_to := least(v_rep.p_to at time zone 'Asia/Baghdad', now());
      v_items := v_items || jsonb_build_object(
        'kind', v_rep.kind, 'tag', v_rep.kind || '-' || v_rep.period_key, 'url', '/#dashboard',
        'title', v_rep.title, 'body', public.web_push_report_body(v_tenant, v_from, v_to));
    end loop;

    -- المستلمون: موظفو المحل النشطون، الذين فعّلوا النوع ولديهم صلاحيته
    select v_out || coalesce(jsonb_agg(n.item || jsonb_build_object('devices', n.devices)), '[]'::jsonb)
      into v_out
      from (
        select it.item, (
          select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
            from public.web_push_subscriptions s
            join public.employees e on s.user_id = 'emp:' || e.id::text
           where e.tenant_id = v_tenant and e.status = 'active'
             and coalesce((select (p.prefs ->> (it.item ->> 'kind'))::boolean
                             from public.web_push_prefs p where p.user_id = s.user_id), true)
             and public.employee_permissions(e) && public.web_push_kind_perms(it.item ->> 'kind')
        ) as devices
        from jsonb_array_elements(v_items) as it(item)
      ) n
     where jsonb_array_length(n.devices) > 0;
  end loop;

  return v_out;
end
$$;

revoke execute on function public.web_push_kind_perms(text) from public, anon, authenticated;
revoke execute on function public.web_push_kinds() from public, anon, authenticated;
revoke execute on function public.web_push_prefs_get(text) from public, anon, authenticated;
revoke execute on function public.web_push_prefs_set(text, jsonb) from public, anon, authenticated;
revoke execute on function public.web_push_money(numeric) from public, anon, authenticated;
revoke execute on function public.web_push_report_body(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.web_push_collect() from public, anon, authenticated;
grant execute on function public.web_push_kind_perms(text) to service_role;
grant execute on function public.web_push_kinds() to service_role;
grant execute on function public.web_push_prefs_get(text) to service_role;
grant execute on function public.web_push_prefs_set(text, jsonb) to service_role;
grant execute on function public.web_push_money(numeric) to service_role;
grant execute on function public.web_push_report_body(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.web_push_collect() to service_role;
