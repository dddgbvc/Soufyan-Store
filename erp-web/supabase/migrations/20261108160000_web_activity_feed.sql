-- ياقوت ويب v8.1: كل حركات المحل تصل إلى المدير العام
-- المصدر: activity_log (سجل كل عملية: من، ماذا، من أي جهاز). نقرأ الجديد بمؤشر id لكل محل.
-- نوع الإشعار 'activity' يصل لموظفي الدور ADMIN فقط، ويمكنهم إيقافه أو ضبط ساعات الهدوء.
-- ما له إشعار مخصص (فاتورة جديدة، دين، نقص، صيانة جاهزة) لا يُكرر هنا.
-- يتطلب تطبيق 140000 و150000 قبله.

alter table public.web_push_cursors add column if not exists last_id bigint not null default 0;

create or replace function public.web_push_kinds()
returns text[] language sql immutable set search_path to 'pg_catalog' as $$
  select array['activity', 'invoice', 'debt_added', 'debt_paid', 'shortage', 'repair_ready',
               'report_daily', 'report_weekly', 'report_monthly', 'report_bimonthly', 'report_yearly']
$$;

-- يحوّل صف activity_log إلى (عنوان، نص) عربي، أو null إن كان ضجيجاً أو مكرراً.
create or replace function public.web_activity_text(a public.activity_log)
returns jsonb language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare
  af  jsonb := coalesce(a.detail -> 'after', '{}'::jsonb);
  bf  jsonb := coalesce(a.detail -> 'before', '{}'::jsonb);
  ch  jsonb := coalesce(a.detail -> 'changed', '[]'::jsonb);
  lbl text := coalesce(nullif(a.row_label, ''), '');
  t   text;
  b   text;
  m   text := '';
begin
  case a.table_name
    when 'app_sessions' then
      if a.action <> 'insert' or a.employee_id is null then return null; end if;
      t := 'تسجيل دخول • ' || coalesce(a.actor, af ->> 'employee_name', '');
      b := coalesce(af ->> 'device_name', af ->> 'platform', '');
    when 'returns' then
      if a.action <> 'insert' then return null; end if;
      t := 'مرتجع ' || lbl; m := af ->> 'total_amount';
      b := coalesce(af ->> 'customer_name', '') || coalesce(' • فاتورة ' || (af ->> 'invoice_number'), '') || coalesce(' • ' || nullif(af ->> 'reason', ''), '');
    when 'expenses' then
      if a.action = 'insert' then
        t := case when af ->> 'reversal_of' is not null then 'عكس مصروف' else 'مصروف جديد' end;
        m := af ->> 'amount'; b := coalesce(af ->> 'description', lbl) || coalesce(' • ' || (af ->> 'category'), '');
      elsif a.action = 'update' and ch ? 'reversed_at' then
        t := 'إلغاء مصروف'; m := af ->> 'amount'; b := coalesce(af ->> 'description', lbl);
      else return null; end if;
    when 'vault_entries' then
      if a.action <> 'insert' or coalesce(af ->> 'kind', '') in ('sale', 'debt_payment', 'expense', 'return') then return null; end if;
      t := 'حركة خزنة • ' || case af ->> 'kind' when 'deposit' then 'إيداع' when 'withdraw' then 'سحب' when 'reversal' then 'عكس قيد'
                                 when 'opening' then 'رصيد افتتاحي' else coalesce(af ->> 'kind', '') end;
      m := af ->> 'amount'; b := coalesce(af ->> 'note', '');
    when 'repairs' then
      if a.action = 'insert' then
        t := 'تذكرة صيانة جديدة ' || coalesce(af ->> 'ticket_no', lbl);
        b := coalesce(af ->> 'device', '') || ' • ' || coalesce(af ->> 'customer_name', '') || coalesce(' • ' || nullif(af ->> 'fault', ''), '');
      elsif a.action = 'update' and ch ? 'technician_id' then
        t := 'إسناد صيانة ' || coalesce(af ->> 'ticket_no', lbl); b := 'الفني: ' || coalesce(af ->> 'technician_name', '—');
      else return null; end if;
    when 'repair_status_history' then
      if a.action <> 'insert' or af ->> 'to_status' = 'READY' then return null; end if;
      t := 'تغيير حالة صيانة';
      b := coalesce((select label_ar from public.repair_statuses where code = af ->> 'from_status'), af ->> 'from_status', '')
           || ' ← ' || coalesce((select label_ar from public.repair_statuses where code = af ->> 'to_status'), af ->> 'to_status', '')
           || coalesce(' • ' || nullif(af ->> 'reason', ''), '');
    when 'products' then
      if a.action = 'insert' then
        t := 'منتج جديد • ' || coalesce(af ->> 'name', lbl); m := af ->> 'selling_price';
        b := 'الكمية ' || coalesce(af ->> 'stock_quantity', '0');
      elsif a.action = 'update' and (ch ? 'selling_price' or ch ? 'cost_price' or ch ? 'name') then
        t := 'تعديل منتج • ' || coalesce(af ->> 'name', lbl);
        b := concat_ws(' • ',
          case when ch ? 'selling_price' then 'سعر البيع ' || public.web_push_money((bf ->> 'selling_price')::numeric) || ' ← ' || public.web_push_money((af ->> 'selling_price')::numeric) end,
          case when ch ? 'cost_price' then 'التكلفة ' || public.web_push_money((bf ->> 'cost_price')::numeric) || ' ← ' || public.web_push_money((af ->> 'cost_price')::numeric) end,
          case when ch ? 'name' then 'الاسم: ' || coalesce(bf ->> 'name', '') || ' ← ' || coalesce(af ->> 'name', '') end);
      elsif a.action = 'delete' then
        t := 'حذف منتج • ' || coalesce(bf ->> 'name', lbl); b := '';
      else return null; end if;
    when 'stock_movements' then
      if a.action <> 'insert' or coalesce(af ->> 'movement_type', '') in ('SALE_OUT', 'RETURN_IN', 'PURCHASE_IN') then return null; end if;
      t := 'تعديل مخزون • ' || coalesce((select name from public.products where id = (af ->> 'product_id')::uuid), lbl);
      b := 'الكمية ' || coalesce(af ->> 'quantity', '') || coalesce(' • ' || nullif(af ->> 'reason', ''), '') || coalesce(' • ' || nullif(af ->> 'notes', ''), '');
    when 'purchases' then
      if a.action = 'insert' then
        t := 'فاتورة شراء ' || lbl; m := coalesce(af ->> 'total_amount', af ->> 'total');
        b := coalesce((select name from public.suppliers where id = (af ->> 'supplier_id')::uuid), af ->> 'supplier_name', '');
      elsif a.action = 'update' and (ch ? 'cancelled_at' or ch ? 'status') then
        t := 'تعديل فاتورة شراء ' || lbl; b := coalesce(af ->> 'status', '');
      else return null; end if;
    when 'supplier_payments' then
      if a.action <> 'insert' then return null; end if;
      t := 'دفعة لمورد'; m := coalesce(af ->> 'amount', af ->> 'amount_paid');
      b := coalesce((select name from public.suppliers where id = (af ->> 'supplier_id')::uuid), lbl);
    when 'suppliers' then
      if a.action = 'insert' then t := 'مورد جديد • ' || coalesce(af ->> 'name', lbl); b := coalesce(af ->> 'phone', '');
      elsif a.action = 'delete' then t := 'حذف مورد • ' || coalesce(bf ->> 'name', lbl); b := '';
      else return null; end if;
    when 'customers' then
      if a.action = 'insert' then
        t := 'زبون جديد • ' || coalesce(af ->> 'name', lbl); b := coalesce(af ->> 'phone', '');
      elsif a.action = 'update' and ch ? 'deleted_at' then
        t := case when af ->> 'deleted_at' is null then 'استرجاع زبون • ' else 'أرشفة زبون • ' end || coalesce(af ->> 'name', lbl); b := coalesce(af ->> 'delete_reason', '');
      elsif a.action = 'update' and (ch ? 'credit_limit' or ch ? 'name' or ch ? 'phone') then
        t := 'تعديل زبون • ' || coalesce(af ->> 'name', lbl);
        b := concat_ws(' • ',
          case when ch ? 'credit_limit' then 'سقف الدين ' || public.web_push_money((bf ->> 'credit_limit')::numeric) || ' ← ' || public.web_push_money((af ->> 'credit_limit')::numeric) end,
          case when ch ? 'phone' then 'الهاتف ' || coalesce(bf ->> 'phone', '—') || ' ← ' || coalesce(af ->> 'phone', '—') end,
          case when ch ? 'name' then 'الاسم ' || coalesce(bf ->> 'name', '') || ' ← ' || coalesce(af ->> 'name', '') end);
      else return null; end if;
    when 'employees' then
      if a.action = 'insert' then
        t := 'موظف جديد • ' || coalesce(af ->> 'display_name', af ->> 'name', lbl); b := coalesce(af ->> 'role', '');
      elsif a.action = 'update' and (ch ?| array['permissions', 'custom_permissions', 'role', 'status', 'pin_hash', 'name', 'display_name']) then
        t := 'تعديل موظف • ' || coalesce(af ->> 'display_name', af ->> 'name', lbl);
        b := concat_ws(' • ',
          case when ch ? 'pin_hash' then 'تغيير رمز PIN' end,
          case when ch ?| array['permissions', 'custom_permissions'] then 'تعديل الصلاحيات' end,
          case when ch ? 'role' then 'الدور ' || coalesce(bf ->> 'role', '') || ' ← ' || coalesce(af ->> 'role', '') end,
          case when ch ? 'status' then case when af ->> 'status' = 'active' then 'تفعيل الحساب' else 'إيقاف الحساب' end end,
          case when ch ?| array['name', 'display_name'] then 'تغيير الاسم' end);
      elsif a.action = 'delete' then
        t := 'حذف موظف • ' || coalesce(bf ->> 'name', lbl); b := '';
      else return null; end if;
    when 'cash_shifts' then
      t := case when a.action = 'insert' then 'فتح وردية' when ch ? 'closed_at' then 'إغلاق وردية' else null end;
      if t is null then return null; end if;
      m := coalesce(af ->> 'closing_amount', af ->> 'opening_amount'); b := coalesce(a.actor, '');
    when 'shipping_orders' then
      if a.action <> 'insert' then return null; end if;
      t := 'شحنة جديدة'; m := af ->> 'cod_amount';
      b := coalesce(af ->> 'recipient', '') || ' • ' || concat_ws(' ', af ->> 'governorate', af ->> 'city');
    when 'isp_renewals' then
      if a.action <> 'insert' then return null; end if;
      t := 'تجديد اشتراك ISP'; m := coalesce(af ->> 'price', af ->> 'amount'); b := lbl;
    when 'invoices' then
      if a.action = 'delete' then t := 'حذف فاتورة ' || coalesce(bf ->> 'invoice_number', lbl); m := bf ->> 'total_amount'; b := coalesce(bf ->> 'customer_name', '');
      elsif a.action = 'update' and (ch ? 'total_amount' or ch ? 'paid_amount') then
        t := 'تعديل فاتورة ' || coalesce(af ->> 'invoice_number', lbl);
        b := concat_ws(' • ',
          case when ch ? 'total_amount' then 'الإجمالي ' || public.web_push_money((bf ->> 'total_amount')::numeric) || ' ← ' || public.web_push_money((af ->> 'total_amount')::numeric) end,
          case when ch ? 'paid_amount' then 'المدفوع ' || public.web_push_money((bf ->> 'paid_amount')::numeric) || ' ← ' || public.web_push_money((af ->> 'paid_amount')::numeric) end);
      else return null; end if;
    when 'shortages' then
      if a.action = 'update' and ch ? 'resolved' and coalesce((af ->> 'resolved')::boolean, false) then
        t := 'حُلّ نقص • ' || coalesce(af ->> 'name', lbl); b := '';
      else return null; end if;
    when 'trusts' then
      t := case a.action when 'insert' then 'أمانة جديدة' when 'update' then 'تحديث أمانة' else 'حذف أمانة' end || coalesce(' • ' || nullif(lbl, ''), '');
      b := '';
    else
      return null;
  end case;

  return jsonb_build_object(
    'title', left(t, 120),
    'body', left(concat_ws(' • ',
              case when m ~ '^-?\d+(\.\d+)?$' then public.web_push_money(m::numeric) end,
              nullif(btrim(b), ''),
              case when a.actor is not null then 'بواسطة ' || a.actor end,
              nullif(a.source, '')), 400),
    'section', case a.table_name
      when 'returns' then 'returns' when 'expenses' then 'expenses' when 'vault_entries' then 'vault'
      when 'repairs' then 'repairs' when 'repair_status_history' then 'repairs'
      when 'products' then 'products' when 'stock_movements' then 'products'
      when 'customers' then 'customers' when 'employees' then 'employees' when 'app_sessions' then 'sessions'
      when 'shipping_orders' then 'shipping' when 'invoices' then 'invoices' when 'shortages' then 'shortages'
      else 'dashboard' end);
end
$$;

-- يجمع حركات المحل الجديدة منذ آخر مؤشر
create or replace function public.web_activity_items(p_tenant uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_last  bigint;
  v_max   bigint;
  v_items jsonb := '[]'::jsonb;
  v_n     int;
  a       public.activity_log;
  x       jsonb;
  v_lines text[] := '{}';
begin
  select last_id into v_last from public.web_push_cursors where tenant_id = p_tenant and kind = 'activity' for update;
  if not found then
    insert into public.web_push_cursors (tenant_id, kind, last_id)
    values (p_tenant, 'activity', coalesce((select max(id) from public.activity_log where tenant_id = p_tenant), 0));
    return v_items;
  end if;

  select max(id) into v_max from (select id from public.activity_log where tenant_id = p_tenant and id > v_last order by id limit 300) q;
  if v_max is null then return v_items; end if;

  for a in select * from public.activity_log where tenant_id = p_tenant and id > v_last and id <= v_max order by id loop
    begin
      x := public.web_activity_text(a);
    exception when others then
      x := null;  -- صف غير متوقع لا يوقف بقية الحركات
    end;
    if x is not null then
      v_items := v_items || jsonb_build_object('kind', 'activity', 'tag', 'act-' || a.id, 'url', '/#' || (x ->> 'section'),
                                               'title', x ->> 'title', 'body', x ->> 'body');
      v_lines := v_lines || (x ->> 'title');
    end if;
  end loop;
  update public.web_push_cursors set last_id = v_max where tenant_id = p_tenant and kind = 'activity';

  v_n := jsonb_array_length(v_items);
  if v_n > 6 then
    -- كثير دفعة واحدة: إشعار ملخّص للهاتف، والتفاصيل كاملة في الصندوق.
    return jsonb_build_array(jsonb_build_object(
      'kind', 'activity', 'tag', 'act-batch-' || v_max, 'url', '/#notifications',
      'title', v_n || ' حركات جديدة في المحل',
      'body', left(array_to_string(v_lines[1:8], '، ') || case when v_n > 8 then '…' else '' end, 300),
      'inbox_items', v_items));
  end if;
  return v_items;
end
$$;

-- ------------------------------------------------------------------ التوزيع: دعم 'activity' للمدير العام + تفاصيل الملخص في الصندوق
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
       and case
             when v_kind = 'custom' then jsonb_typeof(it -> 'targets') is distinct from 'array'
                                         or jsonb_array_length(it -> 'targets') = 0 or (it -> 'targets') ? e.id::text
             when v_kind = 'activity' then upper(coalesce(e.role, '')) = 'ADMIN'
             else public.employee_permissions(e) && public.web_push_kind_perms(v_kind) end;
    delete from _web_rcp r
     where v_kind <> 'custom'
       and (not coalesce((r.prefs ->> v_kind)::boolean, true)
            or (v_kind = 'invoice' and coalesce((it ->> 'amount')::numeric, 0) < coalesce((r.prefs ->> 'invoice_min')::numeric, 0)));

    if jsonb_typeof(it -> 'inbox_items') = 'array' then
      insert into public.web_notifications (tenant_id, employee_id, kind, title, body, url)
      select p_tenant, r.employee_id, v_kind, left(i ->> 'title', 120), left(i ->> 'body', 500), i ->> 'url'
        from _web_rcp r cross join jsonb_array_elements(it -> 'inbox_items') i;
    else
      insert into public.web_notifications (tenant_id, employee_id, kind, title, body, url)
      select p_tenant, r.employee_id, v_kind, left(it ->> 'title', 120), left(it ->> 'body', 500), it ->> 'url' from _web_rcp r;
    end if;
    select count(*) into v_count from _web_rcp;

    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into v_devices
      from _web_rcp r join public.web_push_subscriptions s on s.user_id = r.user_id
     where coalesce((it ->> 'urgent')::boolean, false) or not public.web_push_in_quiet(r.prefs);

    v_out := v_out || jsonb_build_array(
      (it - 'amount' - 'targets' - 'urgent' - 'inbox_items') || jsonb_build_object('devices', v_devices, 'recipients', v_count));
  end loop;
  return v_out;
end
$$;

-- ------------------------------------------------------------------ ربط الحركات بالجامع الدوري
-- غلاف حول web_push_collect (نسخة 150000): نضيف حركات كل محل بعد عناصره.
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
       and exists (select 1 from public.employees e where e.tenant_id = t.id and e.status = 'active' and upper(coalesce(e.role, '')) = 'ADMIN')
       and (exists (select 1 from public.web_store_devices d where d.tenant_id = t.id and d.revoked_at is null)
            or exists (select 1 from public.web_push_subscriptions s join public.employees e on s.user_id = 'emp:' || e.id::text where e.tenant_id = t.id))
  loop
    v_items := public.web_activity_items(v_tenant);
    if jsonb_array_length(v_items) > 0 then
      v_out := v_out || public.web_push_dispatch(v_tenant, v_items);
    end if;
  end loop;
  return v_out;
end
$$;

-- فلتر الصندوق: إضافة «كل الحركات»
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

revoke execute on function public.web_activity_text(public.activity_log) from public, anon, authenticated;
revoke execute on function public.web_activity_items(uuid) from public, anon, authenticated;
revoke execute on function public.web_push_collect_all() from public, anon, authenticated;
revoke execute on function public.web_push_dispatch(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_push_kinds() from public, anon, authenticated;
revoke execute on function public.web_notify_inbox(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.web_activity_text(public.activity_log) to service_role;
grant execute on function public.web_activity_items(uuid) to service_role;
grant execute on function public.web_push_collect_all() to service_role;
grant execute on function public.web_push_dispatch(uuid, jsonb) to service_role;
grant execute on function public.web_push_kinds() to service_role;
grant execute on function public.web_notify_inbox(uuid, jsonb) to service_role;
