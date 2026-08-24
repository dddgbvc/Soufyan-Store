-- ============================================================================
--  قسم الشراء — ملف التراجع الكامل
--
--  يعيد قاعدة البيانات إلى ما كانت عليه قبل تركيب القسم:
--    • يحذف جداول ودوال ومشغّلات الشراء
--    • يعيد الدوال الثلاث المعدَّلة (permissions_for / sync_push / عرّب)
--      إلى نصّها الأصلي حرفيًا كما كان قبل التركيب
--
--  ⚠️ حذف الجداول يحذف كل بيانات الشراء. خذ نسخة احتياطية أولًا.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) المشغّلات
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_notify_new_purchase   on public.purchases;
drop trigger if exists purchases_no_delete       on public.purchases;
drop trigger if exists purchases_touch           on public.purchases;
drop trigger if exists supplier_payments_no_delete on public.supplier_payments;
drop trigger if exists purchase_returns_no_delete  on public.purchase_returns;
drop trigger if exists purchase_returns_touch      on public.purchase_returns;
drop trigger if exists suppliers_touch             on public.suppliers;
drop trigger if exists purchase_audit_no_update    on public.purchase_audit;
drop trigger if exists purchase_audit_no_delete    on public.purchase_audit;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) الدوال
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.purchase_login(text, text);
drop function if exists public.purchase_logout(text);
drop function if exists public.purchase_bootstrap(text);
drop function if exists public.purchase_products_search(text, text, int);
drop function if exists public.purchase_suppliers_list(text, text, boolean);
drop function if exists public.purchase_list(text, text, date, date, text, int, int);
drop function if exists public.purchase_get(text, uuid);
drop function if exists public.purchase_shortages(text, boolean);
drop function if exists public.purchase_dashboard(text, int);
drop function if exists public.purchase_supplier_statement(text, uuid);
drop function if exists public.purchase_returns_list(text, text, int);
drop function if exists public.purchase_payments_list(text, uuid, int);
drop function if exists public.purchase_audit_list(text, int);
drop function if exists public.purchase_post(text, jsonb);
drop function if exists public.purchase_cancel(text, uuid, text);
drop function if exists public.supplier_payment_post(text, jsonb);
drop function if exists public.purchase_return_post(text, jsonb);
drop function if exists public.purchase_supplier_save(text, jsonb);
drop function if exists public.purchase_settings_save(text, jsonb);
drop function if exists public.purchase_sync_shortage(uuid);
drop function if exists public.purchase_sessions_gc();
drop function if exists public.notify_new_purchase();
drop function if exists public.doc_purchases(bigint, text, date, date);
drop function if exists public.doc_suppliers(bigint, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) الجداول (بالترتيب العكسي للعلاقات)
-- ─────────────────────────────────────────────────────────────────────────────
drop table if exists public.purchase_return_items cascade;
drop table if exists public.purchase_returns      cascade;
drop table if exists public.purchase_items        cascade;
drop table if exists public.purchases             cascade;
drop table if exists public.supplier_payments     cascade;
drop table if exists public.suppliers             cascade;
drop table if exists public.purchase_sessions     cascade;
drop table if exists public.purchase_audit        cascade;
drop table if exists public.purchase_settings     cascade;

drop sequence if exists public.purchases_number_seq;
drop sequence if exists public.purchase_returns_number_seq;

-- دوال الحراسة تُحذف بعد الجداول لأن توقيعها يعتمد على نوع purchase_sessions
drop function if exists public.purchase_guard(text, text);
drop function if exists public.purchase_log(public.purchase_sessions, text, text, uuid, jsonb);
drop function if exists public.purchase_setting(text, jsonb);
drop function if exists public.purchase_role_rank(text);
drop function if exists public.purchases_append_only();
drop function if exists public.purchase_audit_immutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) إعادة الدوال الثلاث المعدَّلة إلى نصّها الأصلي
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
      'customers','analytics','settings','repairs','expenses']
    when 'MANAGER' then array[
      'dashboard','pos','returns','customers','inventory','shortages','analytics']
    else array['pos']            -- CASHIER: المبيعات فقط
  end;
$function$;

create or replace function public.sync_push(p_table text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_allowed  text[] := array['products','customers','invoices','invoice_items',
                             'debt_payments','shortages','expenses','repairs',
                             'returns','return_items','vault_entries'];
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

    -- Match products to their catalogue row where the client knows it.
    if p_table in ('invoice_items','return_items') and (v_row ? 'product_client_id') then
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

    if p_table = 'vault_entries' then
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
    end, قيمة, '—');
$function$;

commit;
