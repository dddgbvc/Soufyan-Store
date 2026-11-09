-- تطبيقات الهاتف (الدفعة 3):
-- 1) سجل تجديدات المشترك وأسعاره المقترحة (للتجديد من ملف الزبون عبر isp_renewal_begin/record_outcome/post الموجودة).
-- 2) تعديل هاتف الزبون (من جهات الاتصال أو يدوياً).
-- 3) التحليلات: سلسلة يومية للمبيعات والربح والتحصيل والمصروفات، وأعلى المنتجات، ونوع الدفع، وتجديدات الإنترنت.
-- 4) واتساب التلقائي: إيصال كل حركة دين، تذكير قبل انتهاء الاشتراك وعند الانتهاء، ورسالة بعد التجديد،
--    عبر نفس طابور البرنامج، للزبون الموافق فقط، ومرة واحدة لكل حدث.

-- ------------------------------------------------------------------ 1) تجديدات المشترك والأسعار
create or replace function public.web_isp_subscriber(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_sub public.isp_subscribers;
  v_last public.isp_renewals;
  v_c public.customers;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  select * into v_sub from public.isp_subscribers
   where tenant_id = v_s.tenant_id and id = nullif(p_params->>'id', '')::uuid;
  if not found then raise exception 'المشترك غير موجود' using errcode = '22023'; end if;
  perform public.isp__reseller_guard(v_s, v_sub.reseller_account_id, 'subscribers.read');
  select * into v_last from public.isp_renewals
   where tenant_id = v_s.tenant_id and subscriber_id = v_sub.id and state = 'CONFIRMED'
   order by created_at desc limit 1;
  select * into v_c from public.customers where id = v_sub.customer_id;
  return jsonb_build_object('ok', true,
    'subscriber', public.isp__subscriber_json(v_sub) || jsonb_build_object('id', v_sub.id, 'reseller_account_id', v_sub.reseller_account_id),
    'customer', case when v_c.id is null then null else jsonb_build_object(
      'id', v_c.id, 'name', v_c.name, 'phone', v_c.phone, 'balance', v_c.balance, 'credit_limit', v_c.credit_limit,
      'whatsapp_consent', v_c.whatsapp_consent) end,
    -- الأسعار المقترحة: آخر تجديد مؤكد، وإلا السعر العام للباقة. لا يُغيَّر أي سعر تلقائياً.
    'suggested', jsonb_build_object(
      'sell_price', coalesce(v_last.sell_price_iqd, v_sub.last_public_price_iqd),
      'provider_cost', v_last.provider_cost_iqd,
      'source', case when v_last.id is not null then 'last_renewal' else 'public_price' end),
    'renewals', coalesce((
      select jsonb_agg(public.isp__renewal_json(r) || jsonb_build_object('id', r.id) order by r.created_at desc)
      from (select * from public.isp_renewals where tenant_id = v_s.tenant_id and subscriber_id = v_sub.id
            order by created_at desc limit 30) r), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('code', e.event_code, 'note', e.note, 'at', e.created_at,
                                          'actor', (select coalesce(display_name, name) from public.employees where id = e.actor_employee_id))
                       order by e.created_at desc)
      from (select * from public.isp_audit_events where tenant_id = v_s.tenant_id and subscriber_id = v_sub.id
            order by created_at desc limit 40) e), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------------ 2) هاتف الزبون
create or replace function public.web_customer_set_phone(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_raw text := btrim(coalesce(p_payload->>'phone', ''));
  v_norm text;
  v_local text;
begin
  v_s := public.web_guard(p_session_id, 'customers', 'customers.edit');
  v_norm := public.normalize_iraqi_phone(v_raw);
  if v_norm is null then raise exception 'رقم الهاتف غير صحيح (رقم عراقي يبدأ بـ 07)' using errcode = '22023'; end if;
  v_local := '0' || substring(v_norm from 4);
  update public.customers set phone = v_local
   where id = nullif(p_payload->>'customer_id', '')::uuid and tenant_id = v_s.tenant_id and deleted_at is null;
  if not found then raise exception 'الزبون غير موجود' using errcode = '22023'; end if;
  return jsonb_build_object('ok', true, 'phone', v_local);
end $$;

-- ------------------------------------------------------------------ 3) التحليلات
create or replace function public.web_analytics(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_emp public.employees;
  v_perms text[];
  v_t uuid;
  v_days int := least(greatest(coalesce((p_params->>'days')::int, 30), 7), 365);
  v_today date := (now() at time zone 'Asia/Baghdad')::date;
  v_from date;
  v_from_ts timestamptz;
  v_profit boolean;
begin
  v_s := public.web_guard(p_session_id, 'dashboard');
  select * into v_emp from public.employees where id = v_s.employee_id;
  v_perms := public.employee_permissions(v_emp);
  v_profit := 'dashboard.profit' = any(v_perms);
  v_t := v_s.tenant_id;
  -- فترة حالية + فترة سابقة مساوية لها للمقارنة.
  v_from := v_today - (v_days * 2 - 1);
  v_from_ts := (v_from::timestamp at time zone 'Asia/Baghdad');

  return jsonb_build_object('ok', true, 'days', v_days, 'today', v_today, 'profit_visible', v_profit,
    'series', (
      select jsonb_agg(jsonb_build_object(
        'day', g.d,
        'sales', coalesce(s.total, 0), 'invoices', coalesce(s.n, 0), 'paid', coalesce(s.paid, 0),
        'revenue', case when v_profit then coalesce(ri.rev, 0) end,
        'cost', case when v_profit then coalesce(c.cost, 0) end,
        'collected', coalesce(dp.collected, 0), 'debt_added', coalesce(dp.added, 0),
        'expenses', coalesce(e.amount, 0), 'returns', coalesce(r.total, 0)) order by g.d)
      from (select gs::date d from generate_series(v_from::timestamp, v_today::timestamp, interval '1 day') gs) g
      left join (select (created_at at time zone 'Asia/Baghdad')::date d, sum(total_amount) total, sum(paid_amount) paid, count(*) n
                   from public.invoices where tenant_id = v_t and created_at >= v_from_ts group by 1) s on s.d = g.d
      left join (select (i.created_at at time zone 'Asia/Baghdad')::date d, sum(ii.total) rev
                   from public.invoice_items ii join public.invoices i on i.id = ii.invoice_id
                  where i.tenant_id = v_t and i.created_at >= v_from_ts group by 1) ri on ri.d = g.d
      left join (select (created_at at time zone 'Asia/Baghdad')::date d, sum(abs(quantity) * coalesce(unit_cost, 0)) cost
                   from public.stock_movements where tenant_id = v_t and movement_type = 'SALE_OUT' and created_at >= v_from_ts group by 1) c on c.d = g.d
      left join (select (created_at at time zone 'Asia/Baghdad')::date d,
                        sum(amount_paid) filter (where movement_type is distinct from 'DEBT_ADDITION') collected,
                        sum(amount_paid) filter (where movement_type = 'DEBT_ADDITION') added
                   from public.debt_payments where tenant_id = v_t and created_at >= v_from_ts group by 1) dp on dp.d = g.d
      left join (select (created_at at time zone 'Asia/Baghdad')::date d, sum(amount) amount
                   from public.expenses where tenant_id = v_t and created_at >= v_from_ts and reversal_of is null and reversed_at is null group by 1) e on e.d = g.d
      left join (select (created_at at time zone 'Asia/Baghdad')::date d, sum(total_amount) total
                   from public.returns where tenant_id = v_t and created_at >= v_from_ts group by 1) r on r.d = g.d),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'total', total) order by total desc)
      from (select ii.product_name name, sum(ii.quantity) qty, sum(ii.total) total
              from public.invoice_items ii join public.invoices i on i.id = ii.invoice_id
             where i.tenant_id = v_t and i.created_at >= ((v_today - (v_days - 1))::timestamp at time zone 'Asia/Baghdad')
             group by 1 order by 3 desc limit 8) x), '[]'::jsonb),
    'payment_mix', coalesce((
      select jsonb_agg(jsonb_build_object('type', payment_type, 'total', total, 'n', n))
      from (select coalesce(upper(payment_type), 'CASH') payment_type, sum(total_amount) total, count(*) n
              from public.invoices where tenant_id = v_t and created_at >= ((v_today - (v_days - 1))::timestamp at time zone 'Asia/Baghdad')
             group by 1) x), '[]'::jsonb),
    'isp', case when 'customers' = any(v_perms) then (
      select jsonb_build_object('renewals', count(*), 'sell', coalesce(sum(sell_price_iqd), 0),
                                'cost', case when v_profit then coalesce(sum(provider_cost_iqd), 0) end)
        from public.isp_renewals where tenant_id = v_t and state = 'CONFIRMED'
         and created_at >= ((v_today - (v_days - 1))::timestamp at time zone 'Asia/Baghdad')) end,
    'top_debtors', case when 'customers' = any(v_perms) then coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'balance', balance) order by balance desc)
      from (select id, name, balance from public.customers where tenant_id = v_t and deleted_at is null and balance > 0
             order by balance desc limit 6) x), '[]'::jsonb) end);
end $$;

-- ------------------------------------------------------------------ 4) واتساب التلقائي
create table if not exists public.web_whatsapp_auto (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  receipts boolean not null default true,
  isp_soon boolean not null default true,
  isp_expired boolean not null default true,
  isp_renewed boolean not null default true,
  soon_days int not null default 3 check (soon_days between 1 and 10),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.web_whatsapp_auto enable row level security;
revoke all on public.web_whatsapp_auto from public, anon, authenticated;

create or replace function public.web_whatsapp_auto_get(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare v_s public.app_sessions; v_row public.web_whatsapp_auto;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  select * into v_row from public.web_whatsapp_auto where tenant_id = v_s.tenant_id;
  return jsonb_build_object('ok', true, 'enabled', v_row.tenant_id is not null,
    'settings', coalesce(to_jsonb(v_row) - 'tenant_id' - 'updated_by',
      jsonb_build_object('receipts', true, 'isp_soon', true, 'isp_expired', true, 'isp_renewed', true, 'soon_days', 3)));
end $$;

create or replace function public.web_whatsapp_auto_set(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare v_s public.app_sessions; v_on boolean := coalesce((p_payload->>'enabled')::boolean, true);
begin
  v_s := public.web_guard(p_session_id, 'customers', 'customers.edit');
  if not v_on then
    delete from public.web_whatsapp_auto where tenant_id = v_s.tenant_id;
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;
  insert into public.web_whatsapp_auto (tenant_id, receipts, isp_soon, isp_expired, isp_renewed, soon_days, updated_by)
  values (v_s.tenant_id,
          coalesce((p_payload->>'receipts')::boolean, true), coalesce((p_payload->>'isp_soon')::boolean, true),
          coalesce((p_payload->>'isp_expired')::boolean, true), coalesce((p_payload->>'isp_renewed')::boolean, true),
          least(greatest(coalesce((p_payload->>'soon_days')::int, 3), 1), 10), v_s.employee_id)
  on conflict (tenant_id) do update set
    receipts = excluded.receipts, isp_soon = excluded.isp_soon, isp_expired = excluded.isp_expired,
    isp_renewed = excluded.isp_renewed, soon_days = excluded.soon_days, updated_at = now(), updated_by = excluded.updated_by;
  return public.web_whatsapp_auto_get(p_session_id);
end $$;

create or replace function public.web_whatsapp_fmt(p numeric)
returns text language sql immutable set search_path to 'pg_catalog' as $$
  select to_char(coalesce(p, 0), 'FM999,999,999,999,990') || ' د.ع'
$$;

-- يجمع الأحداث الجديدة ويضعها في طابور واتساب البرنامج. يُشغَّل كل 5 دقائق.
create or replace function public.web_whatsapp_auto_collect()
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  cfg public.web_whatsapp_auto;
  v_hour int := extract(hour from now() at time zone 'Asia/Baghdad');
  v_today date := (now() at time zone 'Asia/Baghdad')::date;
  v_store text;
  v_n int := 0;
  v_k int;
begin
  for cfg in select * from public.web_whatsapp_auto loop
    select name into v_store from public.tenants where id = cfg.tenant_id;

    -- إيصال لكل حركة دين جديدة (إضافة/تسديد) منذ التفعيل. payment_id فريد فلا يتكرر.
    if cfg.receipts then
      insert into public.telegram_whatsapp_outbox (tenant_id, payment_id, customer_id, phone, body, status, kind)
      select p.tenant_id, p.id, c.id, public.normalize_iraqi_phone(c.phone),
        'مرحباً ' || c.name || E'\n'
        || case when p.movement_type = 'DEBT_ADDITION'
                then '➕ أُضيف إلى حسابك ' || public.web_whatsapp_fmt(p.amount_paid)
                else '✅ تم تسديد ' || public.web_whatsapp_fmt(p.amount_paid)
                     || coalesce(' من قبل ' || nullif(btrim(p.paid_by), ''), '') end
        || case when coalesce(p.waived_amount, 0) > 0 then E'\nمسامحة: ' || public.web_whatsapp_fmt(p.waived_amount) else '' end
        || coalesce(E'\nالبيان: ' || left(nullif(btrim(p.notes), ''), 120), '')
        || E'\nالرصيد السابق: ' || public.web_whatsapp_fmt(p.previous_debt)
        || E'\nالديون المتراكمة عليك الآن: ' || public.web_whatsapp_fmt(p.remaining_debt)
        || E'\nسجّلها: ' || coalesce(p.actor, '—') || ' • ' || to_char(p.created_at at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI')
        || E'\n' || coalesce(v_store, ''),
        'pending', 'receipt'
      from public.debt_payments p
      join public.customers c on c.id = p.customer_id and c.tenant_id = p.tenant_id
      where p.tenant_id = cfg.tenant_id and p.created_at >= greatest(cfg.started_at, now() - interval '2 hours')
        and c.deleted_at is null and coalesce(c.whatsapp_consent, false) and public.normalize_iraqi_phone(c.phone) is not null
      on conflict (payment_id) do nothing;
      get diagnostics v_k = row_count; v_n := v_n + v_k;
    end if;

    -- تذكيرات الاشتراك: نهاراً فقط، ولبيانات محدّثة من المزوّد خلال يومين حتى لا نبلغ عن انتهاء غير صحيح.
    if v_hour between 10 and 20 then
      if cfg.isp_soon then
        insert into public.telegram_whatsapp_outbox (tenant_id, customer_id, phone, body, status, kind, client_ref)
        select s.tenant_id, c.id, public.normalize_iraqi_phone(c.phone),
          'مرحباً ' || c.name || E'\nبقي من اشتراك الإنترنت (' || s.username || ') '
          || greatest(ceil(extract(epoch from (s.expires_at - now())) / 86400)::int, 1) || ' يوم، ينتهي بتاريخ '
          || to_char(s.expires_at at time zone 'Asia/Baghdad', 'YYYY-MM-DD') || '.'
          || case when c.balance > 0 then E'\nالديون المتراكمة عليك: ' || public.web_whatsapp_fmt(c.balance) else '' end
          || E'\nجدّد مبكراً حتى لا ينقطع الخط — ' || coalesce(v_store, ''),
          'pending', 'isp_soon', 'auto-soon-' || s.id || '-' || to_char(s.expires_at, 'YYYYMMDD')
        from public.isp_subscribers s
        join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
        where s.tenant_id = cfg.tenant_id and s.expires_at > now() and s.expires_at <= now() + make_interval(days => cfg.soon_days)
          and s.last_verified_at > now() - interval '2 days'
          and c.deleted_at is null and coalesce(c.whatsapp_consent, false) and public.normalize_iraqi_phone(c.phone) is not null
        on conflict (tenant_id, client_ref) where client_ref is not null do nothing;
        get diagnostics v_k = row_count; v_n := v_n + v_k;
      end if;
      if cfg.isp_expired then
        insert into public.telegram_whatsapp_outbox (tenant_id, customer_id, phone, body, status, kind, client_ref)
        select s.tenant_id, c.id, public.normalize_iraqi_phone(c.phone),
          'مرحباً ' || c.name || E'\nانتهى اشتراك الإنترنت (' || s.username || ') بتاريخ '
          || to_char(s.expires_at at time zone 'Asia/Baghdad', 'YYYY-MM-DD') || '.'
          || case when c.balance > 0 then E'\nالديون المتراكمة عليك: ' || public.web_whatsapp_fmt(c.balance) else '' end
          || E'\nللتجديد تواصل معنا — ' || coalesce(v_store, ''),
          'pending', 'isp_expired', 'auto-expired-' || s.id || '-' || to_char(s.expires_at, 'YYYYMMDD')
        from public.isp_subscribers s
        join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
        where s.tenant_id = cfg.tenant_id and s.expires_at <= now() and s.expires_at > now() - interval '2 days'
          and s.last_verified_at > now() - interval '2 days'
          and c.deleted_at is null and coalesce(c.whatsapp_consent, false) and public.normalize_iraqi_phone(c.phone) is not null
        on conflict (tenant_id, client_ref) where client_ref is not null do nothing;
        get diagnostics v_k = row_count; v_n := v_n + v_k;
      end if;
    end if;

    -- رسالة بعد كل تجديد مؤكد.
    if cfg.isp_renewed then
      insert into public.telegram_whatsapp_outbox (tenant_id, customer_id, phone, body, status, kind, client_ref)
      select r.tenant_id, c.id, public.normalize_iraqi_phone(c.phone),
        'مرحباً ' || c.name || E'\n✅ تم تجديد اشتراك الإنترنت (' || s.username || ')'
        || coalesce(' — ' || nullif(s.package_name, ''), '')
        || coalesce(E'\nينتهي بتاريخ ' || to_char(coalesce(r.service_until, s.expires_at) at time zone 'Asia/Baghdad', 'YYYY-MM-DD'), '')
        || E'\nسعر التجديد: ' || public.web_whatsapp_fmt(r.sell_price_iqd)
        || case when coalesce(r.paid_amount_iqd, 0) > 0 then E'\nالمدفوع: ' || public.web_whatsapp_fmt(r.paid_amount_iqd) else '' end
        || E'\nالديون المتراكمة عليك: ' || public.web_whatsapp_fmt(c.balance)
        || E'\n' || coalesce(v_store, ''),
        'pending', 'isp_renewed', 'auto-renewed-' || r.id
      from public.isp_renewals r
      join public.isp_subscribers s on s.id = r.subscriber_id and s.tenant_id = r.tenant_id
      join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
      where r.tenant_id = cfg.tenant_id and r.state = 'CONFIRMED' and r.finance_state = 'POSTED'
        and r.provider_confirmed_at >= greatest(cfg.started_at, now() - interval '2 days')
        and c.deleted_at is null and coalesce(c.whatsapp_consent, false) and public.normalize_iraqi_phone(c.phone) is not null
      on conflict (tenant_id, client_ref) where client_ref is not null do nothing;
      get diagnostics v_k = row_count; v_n := v_n + v_k;
    end if;
  end loop;
  return jsonb_build_object('queued', v_n);
end $$;

revoke execute on function public.web_isp_subscriber(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_customer_set_phone(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_analytics(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_whatsapp_auto_get(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_whatsapp_auto_set(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_whatsapp_auto_collect() from public, anon, authenticated;
grant execute on function public.web_isp_subscriber(uuid, jsonb) to service_role;
grant execute on function public.web_customer_set_phone(uuid, jsonb) to service_role;
grant execute on function public.web_analytics(uuid, jsonb) to service_role;
grant execute on function public.web_whatsapp_auto_get(uuid, jsonb) to service_role;
grant execute on function public.web_whatsapp_auto_set(uuid, jsonb) to service_role;
grant execute on function public.web_whatsapp_auto_collect() to service_role;

select cron.schedule('web-whatsapp-auto', '*/5 * * * *', $$select public.web_whatsapp_auto_collect()$$);
