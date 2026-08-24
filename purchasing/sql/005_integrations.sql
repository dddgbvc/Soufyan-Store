-- ============================================================================
--  قسم الشراء — الملف 005: الربط مع بقية أقسام النظام
--
--  هذا الملف يستبدل ثلاث دوال قائمة (permissions_for / sync_push / عرّب)
--  بنسخ مطابقة تمامًا لسلوكها الحالي + إضافات الشراء فقط.
--  ملف الاسترجاع 999_rollback.sql يعيدها إلى نصّها الأصلي حرفيًا.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) الصلاحيات: إضافة قسم 'purchases' للمدير العام والمدير
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.permissions_for(p_role text)
returns text[]
language sql
immutable
set search_path to 'public'
as $function$
  select case p_role
    when 'ADMIN' then array[
      'dashboard','pos','returns','inventory','shortages','vaults',
      'customers','analytics','settings','repairs','expenses','purchases']
    when 'MANAGER' then array[
      'dashboard','pos','returns','customers','inventory','shortages','analytics','purchases']
    else array['pos']            -- CASHIER: المبيعات فقط
  end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) المزامنة دون اتصال: إضافة جداول الشراء إلى القائمة المسموحة
--    (نفس منطق الدالة الأصلية حرفيًا + ربط الأبناء بآبائهم)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_push(p_table text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_allowed  text[] := array['products','customers','invoices','invoice_items',
                             'debt_payments','shortages','expenses','repairs',
                             'returns','return_items','vault_entries',
                             -- قسم الشراء
                             'suppliers','purchases','purchase_items',
                             'supplier_payments','purchase_returns','purchase_return_items'];
  v_cols     text[];
  v_row      jsonb;
  v_written  int := 0;
  v_skipped  int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_cols_sql text;
  v_set_sql  text;
  v_sql      text;
  v_parent   uuid;
  v_msg      text;
begin
  if not (p_table = any(v_allowed)) then
    return jsonb_build_object('ok', false, 'reason', 'table_not_allowed');
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'rows_must_be_array');
  end if;

  select array_agg(column_name::text) into v_cols
  from information_schema.columns
  where table_schema='public' and table_name=p_table
    and column_name not in ('id','created_at','updated_at','seq');

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    if (v_row->>'client_id') is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Resolve the parent invoice from its client id.
    if p_table = 'invoice_items' then
      select id into v_parent from public.invoices
      where client_id = (v_row->>'invoice_client_id');

      if v_parent is null then
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'client_id', v_row->>'client_id', 'error', 'parent invoice not found');
        continue;
      end if;
      v_row := (v_row - 'invoice_client_id') || jsonb_build_object('invoice_id', v_parent);
    end if;

    -- Same idea for return lines: resolve their parent return.
    if p_table = 'return_items' then
      select id into v_parent from public.returns
      where client_id = (v_row->>'return_client_id');

      if v_parent is null then
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'client_id', v_row->>'client_id', 'error', 'parent return not found');
        continue;
      end if;
      v_row := (v_row - 'return_client_id') || jsonb_build_object('return_id', v_parent);
    end if;

    -- سطور فاتورة الشراء: اربطها بفاتورتها.
    if p_table = 'purchase_items' then
      select id into v_parent from public.purchases
      where client_id = (v_row->>'purchase_client_id');

      if v_parent is null then
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'client_id', v_row->>'client_id', 'error', 'parent purchase not found');
        continue;
      end if;
      v_row := (v_row - 'purchase_client_id') || jsonb_build_object('purchase_id', v_parent);
    end if;

    -- سطور مرتجع الشراء: اربطها بمرتجعها.
    if p_table = 'purchase_return_items' then
      select id into v_parent from public.purchase_returns
      where client_id = (v_row->>'purchase_return_client_id');

      if v_parent is null then
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'client_id', v_row->>'client_id', 'error', 'parent purchase return not found');
        continue;
      end if;
      v_row := (v_row - 'purchase_return_client_id')
               || jsonb_build_object('return_id', v_parent);
    end if;

    -- اربط سطور الشراء بالمورّد عبر معرّفه المحلي.
    if p_table in ('purchases','supplier_payments','purchase_returns')
       and (v_row ? 'supplier_client_id') then
      v_row := (v_row - 'supplier_client_id') || jsonb_build_object(
        'supplier_id', (select id from public.suppliers
                        where client_id = (v_row->>'supplier_client_id')));
    end if;

    -- Match products to their catalogue row where the client knows it.
    if p_table in ('invoice_items','return_items','purchase_items','purchase_return_items')
       and (v_row ? 'product_client_id') then
      v_row := (v_row - 'product_client_id') || jsonb_build_object(
        'product_id', (select id from public.products
                       where client_id = (v_row->>'product_client_id')));
    end if;

    select string_agg(format('%I', key), ', '),
           string_agg(format('%I = excluded.%I', key, key), ', ')
      into v_cols_sql, v_set_sql
    from jsonb_object_keys(v_row) as key
    where key = any(v_cols);

    if v_cols_sql is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- السجلات المحمية (دفتر الخزنة وفواتير الشراء) لا تُحدَّث بالمزامنة، تُضاف مرة واحدة فقط.
    if p_table in ('vault_entries','purchases','purchase_items',
                   'supplier_payments','purchase_returns','purchase_return_items') then
      v_sql := format(
        'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)
           on conflict (client_id) where client_id is not null do nothing',
        p_table, v_cols_sql, v_cols_sql, p_table);
    else
      v_sql := format(
        'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)
           on conflict (client_id) where client_id is not null do update set %s',
        p_table, v_cols_sql, v_cols_sql, p_table, v_set_sql);
    end if;

    begin
      execute v_sql using v_row;
      v_written := v_written + 1;
    exception when others then
      get stacked diagnostics v_msg = MESSAGE_TEXT;
      v_skipped := v_skipped + 1;
      -- Keep the report small; a few examples are enough to diagnose.
      if jsonb_array_length(v_errors) < 5 then
        v_errors := v_errors || jsonb_build_object(
          'client_id', v_row->>'client_id', 'error', v_msg);
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true, 'written', v_written, 'skipped', v_skipped, 'errors', v_errors);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) التعريب: إضافة مصطلحات الشراء
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public."عرّب"("نوع" text, "قيمة" text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(
    case نوع
      when 'مصروف' then case قيمة
        when 'cat_delivery'    then 'توصيل'
        when 'cat_maintenance' then 'صيانة'
        when 'cat_misc'        then 'متفرقات'
        when 'cat_rent'        then 'إيجار'
        when 'cat_salary'      then 'رواتب'
        when 'cat_supplies'    then 'مستلزمات'
        when 'cat_utilities'   then 'خدمات (كهرباء وماء)'
        when 'cat_purchases'   then 'مشتريات'
      end
      when 'صندوق' then case قيمة
        when 'sale'     then 'بيع'
        when 'in'       then 'دخول'
        when 'out'      then 'خروج'
        when 'open'     then 'افتتاح'
        when 'close'    then 'إغلاق'
        when 'payment'  then 'تسديد دين'
        when 'expense'  then 'مصروف'
      end
      when 'صلاحية' then case قيمة
        when 'ADMIN'   then 'مدير عام'
        when 'MANAGER' then 'مدير'
        when 'CASHIER' then 'كاشير'
      end
      when 'حالة' then case قيمة
        when 'active'   then 'فعّال'
        when 'inactive' then 'موقوف'
        when 'pending'  then 'بالانتظار'
        when 'sent'     then 'انرسلت'
        when 'linked'   then 'انرسل رابطها'
        when 'skipped'  then 'انطنشت'
        when 'failed'   then 'فشلت'
        when 'done'     then 'تمت'
        when 'expired'  then 'منتهية'
        when 'cancelled' then 'ملغاة'
      end
      when 'رسالة' then case قيمة
        when 'welcome' then 'شكر بعد الشراء'
        when 'payment' then 'تأكيد تسديد'
        when 'debt'    then 'تذكير دين'
      end
      when 'إرجاع' then case قيمة
        when 'CASH'     then 'نقد'
        when 'cash'     then 'نقد'
        when 'debt'     then 'خصم من الدين'
        when 'exchange' then 'استبدال'
      end
      when 'غلق' then case قيمة
        when 'normal'  then 'غلق عادي'
        when 'logout'  then 'تسجيل خروج'
        when 'timeout' then 'انقطع الاتصال'
        when 'crash'   then 'انطفأ فجأة'
      end
      -- ▼ إضافات قسم الشراء
      when 'شراء' then case قيمة
        when 'posted'    then 'مُرحّلة'
        when 'cancelled' then 'ملغاة'
        when 'CASH'      then 'نقدًا'
        when 'DEBT'      then 'بالآجل'
        when 'PARTIAL'   then 'دفعة جزئية'
        when 'BALANCE'   then 'يُحسم من الرصيد'
      end
      when 'نواقص' then case قيمة
        when 'out-of-stock' then 'خلصت'
        when 'urgent'       then 'مستعجل'
        when 'warning'      then 'قاربت تخلص'
        when 'manual'       then 'مضافة يدويًا'
      end
      when 'تكلفة' then case قيمة
        when 'moving_average' then 'متوسط مرجّح'
        when 'last'           then 'آخر سعر شراء'
      end
      when 'تسعير' then case قيمة
        when 'keep'   then 'لا يتغيّر'
        when 'margin' then 'هامش ثابت'
        when 'manual' then 'يدوي بالفاتورة'
      end
    end, قيمة, '—');
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) إشعار تلغرام عند ترحيل فاتورة شراء (نفس أسلوب notify_new_invoice)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_new_purchase()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault', 'net'
as $$
begin
  perform public.tg_send(
    '🧾 <b>فاتورة شراء جديدة</b>'                                   || E'\n' ||
    'الرقم: '   || new.purchase_number                              || E'\n' ||
    'المورّد: ' || coalesce(new.supplier_name, '—')                 || E'\n' ||
    'الإجمالي: '|| to_char(new.total_amount, 'FM999,999,999') || ' IQD' || E'\n' ||
    'المدفوع: ' || to_char(new.paid_amount,  'FM999,999,999') || ' IQD' || E'\n' ||
    'المتبقي: ' || to_char(new.total_amount - new.paid_amount, 'FM999,999,999') || ' IQD' || E'\n' ||
    'بواسطة: '  || coalesce(new.actor, '—')
  );
  return new;
exception when others then
  raise warning 'tg notify_new_purchase failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_purchase on public.purchases;
create trigger trg_notify_new_purchase
  after insert on public.purchases
  for each row execute function public.notify_new_purchase();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) تقارير بوت تلغرام — بنفس أسلوب دوال doc_* القائمة
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.doc_purchases(
  p_telegram_id bigint, p_query text default ''::text,
  p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id jsonb; v_out jsonb;
begin
  v_id := bot_identify(p_telegram_id);
  if not coalesce((v_id->>'can_read')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select jsonb_build_object(
    'ok', true,
    'meta', jsonb_build_object(
      'generated_at',   to_char(now() at time zone 'Asia/Baghdad', 'YYYY/MM/DD'),
      'generated_time', to_char(now() at time zone 'Asia/Baghdad', 'HH12:MI AM'),
      'actor', coalesce(v_id->>'employee_name', v_id->>'label')),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_array(
               to_char(p.created_at at time zone 'Asia/Baghdad', 'YYYY/MM/DD'),
               p.purchase_number,
               coalesce(p.supplier_name, '—'),
               p.total_amount,
               p.paid_amount,
               p.total_amount - p.paid_amount,
               public."عرّب"('شراء', p.status))
             order by p.created_at desc)
      from purchases p
      where (coalesce(btrim(p_query), '') = ''
             or p.purchase_number ilike '%' || btrim(p_query) || '%'
             or coalesce(p.supplier_name, '') ilike '%' || btrim(p_query) || '%')
        and (p_from is null or (p.created_at at time zone 'Asia/Baghdad')::date >= p_from)
        and (p_to   is null or (p.created_at at time zone 'Asia/Baghdad')::date <= p_to)
    ), '[]'::jsonb)) into v_out;

  return v_out;
end $function$;

create or replace function public.doc_suppliers(
  p_telegram_id bigint, p_query text default ''::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id jsonb; v_out jsonb;
begin
  v_id := bot_identify(p_telegram_id);
  if not coalesce((v_id->>'can_read')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select jsonb_build_object(
    'ok', true,
    'meta', jsonb_build_object(
      'generated_at',   to_char(now() at time zone 'Asia/Baghdad', 'YYYY/MM/DD'),
      'generated_time', to_char(now() at time zone 'Asia/Baghdad', 'HH12:MI AM'),
      'actor', coalesce(v_id->>'employee_name', v_id->>'label')),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_array(
               s.name, coalesce(s.company, '—'), coalesce(s.phone, '—'), s.balance)
             order by s.balance desc, s.name)
      from suppliers s
      where s.is_active
        and (coalesce(btrim(p_query), '') = ''
             or s.name ilike '%' || btrim(p_query) || '%'
             or coalesce(s.company, '') ilike '%' || btrim(p_query) || '%')
    ), '[]'::jsonb)) into v_out;

  return v_out;
end $function$;

commit;
