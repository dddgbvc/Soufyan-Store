-- ياقوت ويب v9: قسم الإنترنت (ISP) + إشعار الاشتراكات المنتهية/القريبة من الانتهاء
-- يقرأ من جداول ISP الموجودة (isp_subscribers, isp_renewals, sas_reseller_accounts)
-- بنفس قواعد الوصول: المدير العام يرى كل حسابات الموزع، وغيره حسب sas_employee_account_access.

create or replace function public.web_isp_overview(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s      public.app_sessions;
  v_admin  boolean;
  v_q      text := nullif(btrim(coalesce(p_params->>'q', '')), '');
  v_status text := coalesce(nullif(p_params->>'status', ''), 'all');
  v_limit  int := least(greatest(coalesce((p_params->>'limit')::int, 100), 1), 300);
  v_accounts uuid[];
begin
  v_s := public.web_guard(p_session_id, 'customers');
  select upper(coalesce(role, '')) = 'ADMIN' into v_admin from public.employees where id = v_s.employee_id;

  select coalesce(array_agg(a.id), '{}') into v_accounts
    from public.sas_reseller_accounts a
   where a.tenant_id = v_s.tenant_id and a.deleted_at is null
     and (v_admin or exists (select 1 from public.sas_employee_account_access x
                              where x.reseller_account_id = a.id and x.tenant_id = a.tenant_id
                                and x.employee_id = v_s.employee_id and x.is_active));

  return jsonb_build_object('ok', true,
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'provider', a.provider, 'active', a.is_active,
               'last_login_at', a.last_login_at, 'last_verified_at', a.last_verified_at, 'last_error', a.last_error,
               'subscribers', (select count(*) from public.isp_subscribers s where s.reseller_account_id = a.id))
               order by a.created_at)
        from public.sas_reseller_accounts a where a.id = any(v_accounts)), '[]'::jsonb),
    'summary', (
      select jsonb_build_object(
        'total', count(*),
        'expired', count(*) filter (where s.expires_at < now()),
        'soon', count(*) filter (where s.expires_at >= now() and s.expires_at < now() + interval '3 days'),
        'active', count(*) filter (where s.expires_at >= now() + interval '3 days'),
        'unlinked', count(*) filter (where s.customer_id is null))
        from public.isp_subscribers s where s.tenant_id = v_s.tenant_id and s.reseller_account_id = any(v_accounts)),
    'unresolved', (select count(*) from public.isp_renewals r
                    join public.isp_subscribers s on s.id = r.subscriber_id
                   where r.tenant_id = v_s.tenant_id and s.reseller_account_id = any(v_accounts)
                     and (r.state in ('PENDING', 'PROVIDER_UNKNOWN') or (r.state = 'CONFIRMED' and r.finance_state in ('UNPOSTED', 'REVIEW_REQUIRED')))),
    'last_sync', (select max(s.last_verified_at) from public.isp_subscribers s where s.tenant_id = v_s.tenant_id),
    'subscribers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'username', s.username, 'display_name', s.display_name, 'package_name', s.package_name,
        'provider_status', s.provider_status, 'expires_at', s.expires_at, 'price', s.last_public_price_iqd,
        'reseller_name', (select a.name from public.sas_reseller_accounts a where a.id = s.reseller_account_id),
        'customer_id', s.customer_id, 'customer_name', c.name, 'customer_phone', c.phone, 'customer_balance', c.balance,
        'last_verified_at', s.last_verified_at,
        'state', case when s.expires_at is null then 'unknown'
                      when s.expires_at < now() then 'expired'
                      when s.expires_at < now() + interval '3 days' then 'soon' else 'active' end,
        'days_left', case when s.expires_at is null then null
                          else floor(extract(epoch from (s.expires_at - now())) / 86400) end,
        'last_renewal', (select jsonb_build_object('state', r.state, 'price', r.sell_price_iqd, 'paid', r.paid_amount_iqd,
                                                   'until', r.service_until, 'at', r.created_at)
                           from public.isp_renewals r where r.subscriber_id = s.id order by r.created_at desc limit 1))
        order by s.expires_at nulls last)
        from (select * from public.isp_subscribers s
               where s.tenant_id = v_s.tenant_id and s.reseller_account_id = any(v_accounts)
                 and (v_q is null or s.username ilike '%' || v_q || '%' or s.display_name ilike '%' || v_q || '%'
                      or s.external_subscriber_id = v_q
                      or exists (select 1 from public.customers cc where cc.id = s.customer_id
                                  and (cc.name ilike '%' || v_q || '%' or cc.phone ilike '%' || v_q || '%')))
                 and case v_status
                       when 'expired' then s.expires_at < now()
                       when 'soon' then s.expires_at >= now() and s.expires_at < now() + interval '3 days'
                       when 'active' then s.expires_at >= now() + interval '3 days'
                       when 'unlinked' then s.customer_id is null
                       else true end
               order by s.expires_at nulls last limit v_limit) s
        left join public.customers c on c.id = s.customer_id), '[]'::jsonb));
end
$$;

-- ------------------------------------------------------------------ نوع إشعار جديد
create or replace function public.web_push_kinds()
returns text[] language sql immutable set search_path to 'pg_catalog' as $$
  select array['activity', 'invoice', 'debt_added', 'debt_paid', 'shortage', 'repair_ready', 'isp_expiring',
               'report_daily', 'report_weekly', 'report_monthly', 'report_bimonthly', 'report_yearly']
$$;

create or replace function public.web_push_kind_perms(p_kind text)
returns text[] language sql immutable set search_path to 'pg_catalog' as $$
  select case
    when p_kind = 'invoice' then array['pos']
    when p_kind in ('debt_added', 'debt_paid', 'isp_expiring') then array['customers']
    when p_kind = 'shortage' then array['shortages', 'inventory']
    when p_kind = 'repair_ready' then array['repairs']
    when p_kind like 'report\_%' then array['dashboard']
    else array[]::text[] end
$$;

-- اشتراكات تنتهي خلال 3 أيام أو انتهت للتو: إشعار واحد لكل (مشترك، تاريخ انتهاء، مرحلة)
create table if not exists public.web_isp_alerts (
  subscriber_id uuid not null,
  expires_at    timestamptz not null,
  stage         text not null,
  created_at    timestamptz not null default now(),
  primary key (subscriber_id, expires_at, stage)
);
alter table public.web_isp_alerts enable row level security;
revoke all on public.web_isp_alerts from public, anon, authenticated;
grant select, insert, delete on public.web_isp_alerts to service_role;

create or replace function public.web_isp_items(p_tenant uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_soon  text; v_nsoon int;
  v_exp   text; v_nexp  int;
begin
  delete from public.web_isp_alerts where created_at < now() - interval '120 days';
  with fresh as (
    insert into public.web_isp_alerts (subscriber_id, expires_at, stage)
    select s.id, s.expires_at, 'soon' from public.isp_subscribers s
     where s.tenant_id = p_tenant and s.expires_at >= now() and s.expires_at < now() + interval '3 days'
    on conflict do nothing returning subscriber_id
  )
  select string_agg(coalesce(s.display_name, s.username) || ' (' || to_char(s.expires_at at time zone 'Asia/Baghdad', 'MM-DD') || ')', '، '), count(*)
    into v_soon, v_nsoon
    from fresh f join public.isp_subscribers s on s.id = f.subscriber_id;

  with fresh as (
    insert into public.web_isp_alerts (subscriber_id, expires_at, stage)
    select s.id, s.expires_at, 'expired' from public.isp_subscribers s
     where s.tenant_id = p_tenant and s.expires_at < now() and s.expires_at > now() - interval '2 days'
    on conflict do nothing returning subscriber_id
  )
  select string_agg(coalesce(s.display_name, s.username), '، '), count(*)
    into v_exp, v_nexp
    from fresh f join public.isp_subscribers s on s.id = f.subscriber_id;

  if v_nsoon > 0 then
    v_items := v_items || jsonb_build_object('kind', 'isp_expiring', 'tag', 'isp-soon-' || extract(epoch from now())::bigint,
      'url', '/#isp', 'title', case when v_nsoon = 1 then 'اشتراك إنترنت ينتهي قريباً' else v_nsoon || ' اشتراكات إنترنت تنتهي خلال 3 أيام' end,
      'body', left(v_soon, 300));
  end if;
  if v_nexp > 0 then
    v_items := v_items || jsonb_build_object('kind', 'isp_expiring', 'tag', 'isp-exp-' || extract(epoch from now())::bigint,
      'url', '/#isp', 'title', case when v_nexp = 1 then 'انتهى اشتراك إنترنت' else 'انتهت ' || v_nexp || ' اشتراكات إنترنت' end,
      'body', left(v_exp, 300));
  end if;
  return v_items;
end
$$;

-- الجامع الشامل: الأحداث + الحركات + اشتراكات الإنترنت
create or replace function public.web_push_collect_all()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_out    jsonb;
  v_tenant uuid;
  v_items  jsonb;
begin
  v_out := public.web_push_collect();
  for v_tenant in
    select t.id from public.tenants t
     where t.status = 'active'
       and (exists (select 1 from public.web_store_devices d where d.tenant_id = t.id and d.revoked_at is null)
            or exists (select 1 from public.web_push_subscriptions s join public.employees e on s.user_id = 'emp:' || e.id::text where e.tenant_id = t.id))
  loop
    v_items := '[]'::jsonb;
    if exists (select 1 from public.employees e where e.tenant_id = v_tenant and e.status = 'active' and upper(coalesce(e.role, '')) = 'ADMIN') then
      v_items := v_items || public.web_activity_items(v_tenant);
    end if;
    begin
      v_items := v_items || public.web_isp_items(v_tenant);
    exception when others then null;
    end;
    if jsonb_array_length(v_items) > 0 then
      v_out := v_out || public.web_push_dispatch(v_tenant, v_items);
    end if;
  end loop;
  return v_out;
end
$$;

revoke execute on function public.web_isp_overview(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_isp_items(uuid) from public, anon, authenticated;
revoke execute on function public.web_push_kinds() from public, anon, authenticated;
revoke execute on function public.web_push_kind_perms(text) from public, anon, authenticated;
revoke execute on function public.web_push_collect_all() from public, anon, authenticated;
grant execute on function public.web_isp_overview(uuid, jsonb) to service_role;
grant execute on function public.web_isp_items(uuid) to service_role;
grant execute on function public.web_push_kinds() to service_role;
grant execute on function public.web_push_kind_perms(text) to service_role;
grant execute on function public.web_push_collect_all() to service_role;
