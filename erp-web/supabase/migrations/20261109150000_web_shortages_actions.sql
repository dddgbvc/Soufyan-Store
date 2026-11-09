-- النواقص من تطبيقات الهاتف:
-- 1) web_shortage_add: تسجيل نقص يدوي في نفس جدول البرنامج (shortages) فيظهر في برنامج المكتب والويب فوراً،
--    ويصل إشعار «نقص جديد» تلقائياً عبر web_push_collect كما في البرنامج. منع التكرار بـ client_id.
-- 2) web_shortages_report: يرسل قائمة النواقص الحالية (اليدوية + تحت حد التنبيه) إلى صندوق المدير العام.

create or replace function public.web_shortage_add(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_client text;
  v_name text := left(btrim(coalesce(p_payload->>'name', '')), 120);
  v_cat text := nullif(left(btrim(coalesce(p_payload->>'category', '')), 60), '');
  v_qty int := greatest(coalesce((p_payload->>'current_qty')::int, 0), 0);
  v_product uuid := nullif(p_payload->>'product_id', '')::uuid;
  v_row public.shortages;
begin
  v_s := public.web_guard(p_session_id, 'shortages');
  v_client := public.web_client_id(p_payload);
  select * into v_row from public.shortages where tenant_id = v_s.tenant_id and client_id = v_client;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'shortage', jsonb_build_object('id', v_row.id, 'name', v_row.name));
  end if;
  if char_length(v_name) < 2 then raise exception 'اكتب اسم المادة الناقصة' using errcode = '22023'; end if;
  if v_product is not null and not exists (select 1 from public.products where id = v_product and tenant_id = v_s.tenant_id) then
    raise exception 'المنتج غير موجود' using errcode = '22023';
  end if;
  if exists (select 1 from public.shortages where tenant_id = v_s.tenant_id and not coalesce(resolved, false)
              and lower(btrim(name)) = lower(v_name)) then
    raise exception 'هذا النقص مسجّل مسبقاً ولم يُحل بعد' using errcode = '23505';
  end if;
  insert into public.shortages (tenant_id, product_id, name, category, current_qty, limit_qty, status, is_manual, resolved, client_id)
  values (v_s.tenant_id, v_product, v_name, v_cat, v_qty, 0, 'manual', true, false, v_client)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'shortage', jsonb_build_object('id', v_row.id, 'name', v_row.name,
                            'operation_number', v_row.operation_number));
end $$;

create or replace function public.web_shortages_report(p_session_id uuid, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_from text;
  v_manual text;
  v_low text;
  v_nm int;
  v_nl int;
  v_admins jsonb;
  v_body text;
  v_items jsonb;
begin
  v_s := public.web_guard(p_session_id, 'shortages');
  select coalesce(display_name, name) into v_from from public.employees where id = v_s.employee_id;
  select string_agg(name, '، ' order by created_at desc), count(*) into v_manual, v_nm
    from public.shortages where tenant_id = v_s.tenant_id and not coalesce(resolved, false);
  select string_agg(name || ' (' || stock_quantity || ')', '، ' order by stock_quantity, name), count(*) into v_low, v_nl
    from (select name, stock_quantity from public.products
           where tenant_id = v_s.tenant_id and coalesce(is_service, false) = false
             and stock_quantity <= coalesce(min_stock_alert, 0) order by stock_quantity, name limit 40) p;
  if coalesce(v_nm, 0) + coalesce(v_nl, 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty', 'message', 'لا توجد نواقص حالياً.');
  end if;
  select coalesce(jsonb_agg(id::text), '[]'::jsonb) into v_admins
    from public.employees where tenant_id = v_s.tenant_id and status = 'active' and upper(coalesce(role, '')) = 'ADMIN';
  if jsonb_array_length(v_admins) = 0 then raise exception 'لا يوجد مدير عام فعّال' using errcode = 'P0001'; end if;

  v_body := concat_ws(E'\n',
    case when v_nm > 0 then 'مسجلة (' || v_nm || '): ' || left(v_manual, 200) end,
    case when v_nl > 0 then 'تحت الحد (' || v_nl || '): ' || left(v_low, 200) end,
    nullif(left(btrim(coalesce(p_payload->>'note', '')), 120), ''),
    '— ' || v_from);
  v_items := public.web_push_dispatch(v_s.tenant_id, jsonb_build_array(jsonb_build_object(
    'kind', 'custom', 'tag', 'shortages-' || extract(epoch from now())::bigint, 'url', '/#shortages',
    'title', 'قائمة النواقص (' || (coalesce(v_nm, 0) + coalesce(v_nl, 0)) || ')', 'body', left(v_body, 500),
    'targets', v_admins, 'urgent', false)));
  return jsonb_build_object('ok', true, 'recipients', v_items->0->'recipients', 'item', v_items->0);
end $$;

revoke execute on function public.web_shortage_add(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_shortages_report(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.web_shortage_add(uuid, jsonb) to service_role;
grant execute on function public.web_shortages_report(uuid, jsonb) to service_role;
