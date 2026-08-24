-- ============================================================================
--  قسم الشراء — الملف 003: الدوال (واجهة القسم الوحيدة مع قاعدة البيانات)
--
--  كل دالة هنا SECURITY DEFINER + search_path مثبّت + تتحقق من رمز الجلسة.
--  الواجهة لا تلمس أي جدول مباشرة — فقط هذه الدوال.
-- ============================================================================

begin;

-- ═════════════════════════════════════════════════════════════════════════════
--  أدوات داخلية
-- ═════════════════════════════════════════════════════════════════════════════

-- قراءة إعداد مع قيمة افتراضية
create or replace function public.purchase_setting(p_key text, p_default jsonb default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select value from public.purchase_settings where key = p_key), p_default);
$$;

-- ترتيب الصلاحيات: ADMIN(3) > MANAGER(2) > CASHIER(1)
create or replace function public.purchase_role_rank(p_role text)
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select case p_role when 'ADMIN' then 3 when 'MANAGER' then 2 when 'CASHIER' then 1 else 0 end;
$$;

-- كتابة سطر في سجل التدقيق
create or replace function public.purchase_log(
  p_session public.purchase_sessions,
  p_action  text,
  p_table   text default null,
  p_ref     uuid default null,
  p_detail  jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.purchase_audit (actor, employee_id, role, terminal_id, ip, action, ref_table, ref_id, detail)
  values (p_session.employee_name, p_session.employee_id, p_session.role,
          p_session.terminal_id, p_session.ip, p_action, p_table, p_ref, coalesce(p_detail,'{}'::jsonb));
$$;

-- ── الحارس: يتحقق من الرمز ويعيد الجلسة، أو يرفع خطأً ────────────────────────
create or replace function public.purchase_guard(p_token text, p_min_role text default 'MANAGER')
returns public.purchase_sessions
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_s public.purchase_sessions;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]+$' then
    raise exception 'انتهت الجلسة — سجّل الدخول من جديد' using errcode = '28000';
  end if;

  select * into v_s from public.purchase_sessions where token = p_token;

  if not found or v_s.revoked or v_s.expires_at <= now() then
    raise exception 'انتهت الجلسة — سجّل الدخول من جديد' using errcode = '28000';
  end if;

  if public.purchase_role_rank(v_s.role) < public.purchase_role_rank(p_min_role) then
    raise exception 'ليس لديك صلاحية لهذا الإجراء' using errcode = '42501';
  end if;

  -- الموظف ما زال فعّالًا؟
  if not exists (select 1 from public.employees
                 where id = v_s.employee_id and status = 'active') then
    update public.purchase_sessions set revoked = true where token = p_token;
    raise exception 'الحساب موقوف' using errcode = '28000';
  end if;

  update public.purchase_sessions set last_seen_at = now() where token = p_token;
  return v_s;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  الدخول والخروج
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.purchase_login(p_pin_hash text, p_terminal_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_recent int;
  v_emp    public.employees%rowtype;
  v_token  text;
  v_ttl    int;
  v_info   jsonb;
  v_term   text;
begin
  v_term := left(coalesce(nullif(btrim(p_terminal_id), ''), 'unknown'), 80);

  if p_pin_hash is null or length(p_pin_hash) < 32 or length(p_pin_hash) > 128
     or p_pin_hash !~ '^[0-9a-fA-F]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'message', 'رمز غير صالح');
  end if;

  -- نفس سياسة الحظر المعتمدة بالنظام: 5 محاولات خاطئة خلال دقيقتين
  select count(*) into v_recent
  from public.pin_attempts
  where terminal_id = v_term and ok = false and at > now() - interval '2 minutes';

  if v_recent >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', 120,
                              'message', 'محاولات كثيرة — انتظر دقيقتين');
  end if;

  select * into v_emp
  from public.employees
  where pin_hash = p_pin_hash and status = 'active'
  limit 1;

  if not found then
    insert into public.pin_attempts (terminal_id, ok) values (v_term, false);
    return jsonb_build_object('ok', false, 'reason', 'wrong',
                              'remaining', greatest(0, 4 - v_recent),
                              'message', 'الرمز غير صحيح');
  end if;

  -- قسم الشراء متاح للمدير العام والمدير فقط
  if public.purchase_role_rank(v_emp.role) < 2 then
    insert into public.pin_attempts (terminal_id, ok) values (v_term, true);
    insert into public.purchase_audit
      (actor, employee_id, role, terminal_id, action, ref_table, ref_id, detail)
    values (coalesce(v_emp.display_name, v_emp.name), v_emp.id, v_emp.role, v_term,
            'login_denied', 'employees', v_emp.id, jsonb_build_object('role', v_emp.role));
    return jsonb_build_object('ok', false, 'reason', 'forbidden',
                              'message', 'قسم الشراء متاح للمدير فقط');
  end if;

  insert into public.pin_attempts (terminal_id, ok) values (v_term, true);
  perform public.purchase_sessions_gc();

  v_ttl   := greatest(1, least(24, coalesce((public.purchase_setting('session_ttl_hours','8'::jsonb) #>> '{}')::int, 8)));
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_info  := public.request_client_info();

  insert into public.purchase_sessions
    (token, employee_id, employee_name, role, terminal_id, ip, user_agent, expires_at)
  values
    (v_token, v_emp.id, coalesce(v_emp.display_name, v_emp.name), v_emp.role, v_term,
     nullif(v_info->>'ip','')::inet, left(v_info->>'user_agent', 400),
     now() + make_interval(hours => v_ttl));

  perform public.purchase_log(
    (select s from public.purchase_sessions s where s.token = v_token),
    'login', 'employees', v_emp.id, jsonb_build_object('terminal', v_term));

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', now() + make_interval(hours => v_ttl),
    'employee', jsonb_build_object(
      'id', v_emp.id,
      'name', coalesce(v_emp.display_name, v_emp.name),
      'role', v_emp.role,
      'department', v_emp.department,
      'avatar_url', v_emp.avatar_url),
    'can_cancel',   public.purchase_role_rank(v_emp.role) >= 2,
    'can_settings', v_emp.role = 'ADMIN'
  );
end;
$$;

create or replace function public.purchase_logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.purchase_sessions set revoked = true where token = p_token;
  return jsonb_build_object('ok', true);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  تكامل النواقص — يعمل بالاتجاهين (استلام يرفع الكمية، مرتجع ينزلها)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_sync_shortage(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_p      public.products%rowtype;
  v_status text;
  v_limit  int;
  v_cat    text;
begin
  if p_product_id is null then return; end if;
  if not coalesce((public.purchase_setting('auto_resolve_shortages','true'::jsonb) #>> '{}')::boolean, true)
  then return; end if;

  select * into v_p from public.products where id = p_product_id;
  if not found then return; end if;

  v_limit := greatest(coalesce(v_p.min_stock_alert, 0), 0);

  v_status := case
    when v_p.stock_quantity <= 0                       then 'out-of-stock'
    when v_p.stock_quantity <= ceil(v_limit / 2.0)      then 'urgent'
    when v_p.stock_quantity <= v_limit                  then 'warning'
    else null                                           -- فوق الحد = مُعالج
  end;

  select c.name into v_cat from public.categories c where c.id = v_p.category_id;

  -- تحديث كل سطور النواقص المفتوحة لهذا المنتج
  update public.shortages s
     set current_qty = v_p.stock_quantity,
         limit_qty   = case when s.is_manual then s.limit_qty else v_limit end,
         status      = coalesce(v_status, case when s.is_manual then 'manual' else s.status end),
         resolved    = (v_status is null)
   where s.product_id = p_product_id
     and s.resolved = false;

  -- المنتج نزل تحت الحد ولا يوجد سطر نواقص مفتوح ⇒ نفتح واحدًا
  if v_status is not null
     and not exists (select 1 from public.shortages s
                     where s.product_id = p_product_id and s.resolved = false)
  then
    insert into public.shortages
      (product_id, name, category, current_qty, limit_qty, status, is_manual, resolved)
    values
      (v_p.id, v_p.name, v_cat, v_p.stock_quantity, v_limit, v_status, false, false);
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  ترحيل فاتورة شراء  —  العملية المركزية للقسم
--  يحدّث بذرة واحدة: المخزون + التكلفة + سعر البيع + النواقص + المصروفات + رصيد المورّد
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_post(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s          public.purchase_sessions;
  v_client_id  text;
  v_existing   public.purchases%rowtype;
  v_items      jsonb;
  v_n          int;
  v_max_items  int;
  v_it         jsonb;
  v_supplier   public.suppliers%rowtype;
  v_sup_id     uuid;
  v_number     text;
  v_pid        uuid;
  v_prod       public.products%rowtype;
  v_qty        int;
  v_cost       numeric;
  v_disc       numeric;
  v_line_net   numeric;
  v_items_total numeric := 0;
  v_head_disc  numeric;
  v_extra      numeric;
  v_total      numeric;
  v_paid       numeric;
  v_pay_type   text;
  v_share      numeric;
  v_landed     numeric;
  v_new_cost   numeric;
  v_new_sell   numeric;
  v_cost_method text;
  v_policy     text;
  v_margin     numeric;
  v_warnings   jsonb := '[]'::jsonb;
  v_purchase   public.purchases%rowtype;
  v_expense_id uuid;
  v_touched    uuid[] := '{}';
  v_name       text;
  v_barcode    text;
  v_serials    text[];
  v_is_new     boolean;
  v_stock_before int;
begin
  v_s := public.purchase_guard(p_token, 'MANAGER');

  -- ── الحماية من الترحيل المزدوج (إعادة إرسال بعد انقطاع الشبكة) ────────────
  v_client_id := nullif(btrim(coalesce(p_payload->>'client_id','')), '');
  if v_client_id is not null then
    if length(v_client_id) > 64 then
      raise exception 'معرّف العملية طويل جدًا' using errcode = '22001';
    end if;
    select * into v_existing from public.purchases where client_id = v_client_id;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true,
                                'id', v_existing.id, 'purchase_number', v_existing.purchase_number);
    end if;
  end if;

  -- ── فحص الأصناف ───────────────────────────────────────────────────────────
  v_items := p_payload->'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    raise exception 'قائمة الأصناف مفقودة' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(v_items);
  v_max_items := coalesce((public.purchase_setting('max_items_per_invoice','200'::jsonb) #>> '{}')::int, 200);
  if v_n = 0 then
    raise exception 'أضف صنفًا واحدًا على الأقل' using errcode = '22023';
  end if;
  if v_n > v_max_items then
    raise exception 'عدد الأصناف يتجاوز الحد المسموح (%)', v_max_items using errcode = '22023';
  end if;

  -- ── المبالغ العامة ────────────────────────────────────────────────────────
  v_head_disc := round(greatest(coalesce((p_payload->>'discount')::numeric, 0), 0), 2);
  v_extra     := round(greatest(coalesce((p_payload->>'extra_cost')::numeric, 0), 0), 2);
  v_paid      := round(greatest(coalesce((p_payload->>'paid_amount')::numeric, 0), 0), 2);

  if v_head_disc > 1e12 or v_extra > 1e12 or v_paid > 1e12 then
    raise exception 'مبلغ غير منطقي' using errcode = '22003';
  end if;

  -- ── المورّد ───────────────────────────────────────────────────────────────
  v_sup_id := nullif(p_payload->>'supplier_id','')::uuid;
  if v_sup_id is not null then
    select * into v_supplier from public.suppliers where id = v_sup_id;
    if not found then
      raise exception 'المورّد غير موجود' using errcode = '23503';
    end if;
  elsif nullif(btrim(coalesce(p_payload->>'supplier_name','')), '') is not null then
    -- مورّد جديد يُنشأ من داخل الفاتورة
    insert into public.suppliers (name, phone, client_id)
    values (left(btrim(p_payload->>'supplier_name'), 120),
            left(nullif(btrim(coalesce(p_payload->>'supplier_phone','')), ''), 32),
            case when v_client_id is not null then 'SUP-' || v_client_id else null end)
    returning * into v_supplier;
    v_sup_id := v_supplier.id;
    perform public.purchase_log(v_s, 'supplier_create', 'suppliers', v_sup_id,
                                jsonb_build_object('name', v_supplier.name));
  else
    raise exception 'حدّد المورّد' using errcode = '22023';
  end if;

  -- ── حساب مجموع الأصناف أولًا (لازم لتوزيع مصاريف الشحن) ───────────────────
  for v_it in select * from jsonb_array_elements(v_items) loop
    v_qty  := coalesce((v_it->>'quantity')::int, 0);
    v_cost := round(coalesce((v_it->>'unit_cost')::numeric, 0), 2);
    v_disc := round(greatest(coalesce((v_it->>'discount')::numeric, 0), 0), 2);

    if v_qty <= 0 or v_qty > 100000 then
      raise exception 'كمية غير صالحة للصنف: %', coalesce(v_it->>'product_name','—') using errcode = '22023';
    end if;
    if v_cost < 0 or v_cost > 1e12 then
      raise exception 'تكلفة غير صالحة للصنف: %', coalesce(v_it->>'product_name','—') using errcode = '22023';
    end if;
    if v_disc > v_qty * v_cost then
      raise exception 'خصم الصنف أكبر من قيمته: %', coalesce(v_it->>'product_name','—') using errcode = '22023';
    end if;

    v_items_total := v_items_total + (v_qty * v_cost - v_disc);
  end loop;

  if v_head_disc > v_items_total then
    raise exception 'الخصم أكبر من مجموع الفاتورة' using errcode = '22023';
  end if;

  v_total := round(v_items_total - v_head_disc + v_extra, 2);

  if v_paid > v_total then
    raise exception 'المدفوع أكبر من إجمالي الفاتورة' using errcode = '22023';
  end if;

  v_pay_type := case
    when v_paid <= 0        then 'DEBT'
    when v_paid >= v_total  then 'CASH'
    else 'PARTIAL'
  end;

  -- ── رأس الفاتورة ──────────────────────────────────────────────────────────
  v_number := 'PU-' || to_char(now() at time zone 'Asia/Baghdad', 'YYMMDD')
              || '-' || lpad(nextval('public.purchases_number_seq')::text, 4, '0');

  insert into public.purchases
    (purchase_number, supplier_id, supplier_name, supplier_phone, status,
     items_total, discount, extra_cost, total_amount, paid_amount, payment_type,
     notes, actor, client_id)
  values
    (v_number, v_sup_id, v_supplier.name, v_supplier.phone, 'posted',
     v_items_total, v_head_disc, v_extra, v_total, v_paid, v_pay_type,
     left(nullif(btrim(coalesce(p_payload->>'notes','')), ''), 1000),
     v_s.employee_name, v_client_id)
  returning * into v_purchase;

  -- ── إعدادات التسعير ───────────────────────────────────────────────────────
  v_cost_method := coalesce(public.purchase_setting('cost_method','"moving_average"'::jsonb) #>> '{}', 'moving_average');
  v_policy      := coalesce(public.purchase_setting('price_policy','"manual"'::jsonb) #>> '{}', 'manual');
  v_margin      := coalesce((public.purchase_setting('default_margin_pct','20'::jsonb) #>> '{}')::numeric, 20);

  -- ── معالجة كل صنف ─────────────────────────────────────────────────────────
  for v_it in select * from jsonb_array_elements(v_items) loop
    v_qty     := (v_it->>'quantity')::int;
    v_cost    := round(coalesce((v_it->>'unit_cost')::numeric, 0), 2);
    v_disc    := round(greatest(coalesce((v_it->>'discount')::numeric, 0), 0), 2);
    v_line_net := v_qty * v_cost - v_disc;
    v_name    := left(btrim(coalesce(nullif(btrim(coalesce(v_it->>'product_name','')),''), 'صنف')), 200);
    v_barcode := left(nullif(btrim(coalesce(v_it->>'barcode','')), ''), 64);
    v_is_new  := false;

    -- توزيع (مصاريف الشحن − خصم الفاتورة) على الأصناف بالتناسب مع قيمتها
    v_share  := case when v_items_total > 0
                     then (v_extra - v_head_disc) * (v_line_net / v_items_total)
                     else 0 end;
    v_landed := round(greatest((v_line_net + v_share) / v_qty, 0), 2);

    -- ① إيجاد المنتج: بالمعرّف، ثم بالباركود، ثم بالاسم المطابق
    v_pid := nullif(v_it->>'product_id','')::uuid;
    v_prod := null;

    if v_pid is not null then
      select * into v_prod from public.products where id = v_pid;
    end if;
    if v_prod.id is null and v_barcode is not null then
      select * into v_prod from public.products where barcode = v_barcode;
    end if;
    if v_prod.id is null then
      select * into v_prod from public.products where lower(name) = lower(v_name) limit 1;
    end if;

    -- ② منتج جديد؟
    if v_prod.id is null then
      if not coalesce((public.purchase_setting('allow_new_products','true'::jsonb) #>> '{}')::boolean, true) then
        raise exception 'المنتج غير موجود بالمخزون: %', v_name using errcode = '23503';
      end if;

      insert into public.products
        (name, barcode, category_id, cost_price, selling_price,
         stock_quantity, min_stock_alert, has_imei, client_id)
      values
        (v_name, v_barcode,
         nullif(v_it->>'category_id','')::uuid,
         v_landed,
         round(coalesce(nullif((v_it->>'new_selling_price'),'')::numeric,
                        v_landed * (1 + v_margin / 100.0)), 2),
         0,
         greatest(coalesce((v_it->>'min_stock_alert')::int, 3), 0),
         coalesce((v_it->>'has_imei')::boolean, false),
         case when v_client_id is not null
              then 'P-' || left(md5(v_client_id || '|' || v_name), 24) else null end)
      returning * into v_prod;

      v_is_new := true;
      perform public.purchase_log(v_s, 'product_create', 'products', v_prod.id,
                                  jsonb_build_object('name', v_name, 'purchase', v_number));
    end if;

    v_stock_before := v_prod.stock_quantity;

    -- ③ التكلفة الجديدة
    if v_cost_method = 'last' then
      v_new_cost := v_landed;
    else
      -- متوسط مرجّح متحرك
      v_new_cost := case
        when greatest(v_stock_before, 0) + v_qty > 0
          then round(((greatest(v_stock_before, 0) * coalesce(v_prod.cost_price, 0))
                      + (v_qty * v_landed))
                     / (greatest(v_stock_before, 0) + v_qty), 2)
        else v_landed
      end;
    end if;

    -- ④ سعر البيع الجديد
    v_new_sell := case
      when nullif(v_it->>'new_selling_price','') is not null
        then round((v_it->>'new_selling_price')::numeric, 2)
      when nullif(v_it->>'margin_pct','') is not null
        then round(v_new_cost * (1 + (v_it->>'margin_pct')::numeric / 100.0), 2)
      when v_policy = 'margin'
        then round(v_new_cost * (1 + v_margin / 100.0), 2)
      else coalesce(v_prod.selling_price, 0)
    end;

    if v_new_sell < 0 or v_new_sell > 1e12 then
      raise exception 'سعر بيع غير صالح للصنف: %', v_name using errcode = '22023';
    end if;

    if v_new_sell > 0 and v_new_sell < v_new_cost then
      v_warnings := v_warnings || jsonb_build_object(
        'type', 'price_below_cost', 'product', v_name,
        'cost', v_new_cost, 'selling', v_new_sell,
        'message', 'سعر البيع أقل من التكلفة الجديدة: ' || v_name);
    end if;

    -- ⑤ أرقام IMEI
    v_serials := null;
    if v_it ? 'serials' and jsonb_typeof(v_it->'serials') = 'array' then
      select array_agg(left(btrim(x), 32)) into v_serials
      from jsonb_array_elements_text(v_it->'serials') x
      where btrim(x) <> '';

      if v_serials is not null and array_length(v_serials, 1) <> v_qty then
        v_warnings := v_warnings || jsonb_build_object(
          'type', 'serial_count', 'product', v_name,
          'message', 'عدد أرقام IMEI لا يطابق الكمية: ' || v_name);
      end if;
    end if;

    -- ⑥ تحديث المخزون والأسعار (نقطة التقاء الشراء بالمخزون والتسعير)
    update public.products
       set stock_quantity = stock_quantity + v_qty,
           cost_price     = v_new_cost,
           selling_price  = v_new_sell,
           barcode        = coalesce(barcode, v_barcode),
           updated_at     = now()
     where id = v_prod.id;

    -- ⑦ سطر الفاتورة مع لقطة قبل/بعد
    insert into public.purchase_items
      (purchase_id, product_id, product_name, barcode, quantity, unit_cost, discount,
       landed_unit_cost, total, serials,
       old_cost, new_cost, old_selling, new_selling, old_stock, new_stock,
       is_new_product, client_id)
    values
      (v_purchase.id, v_prod.id, v_prod.name, coalesce(v_prod.barcode, v_barcode),
       v_qty, v_cost, v_disc, v_landed, round(v_line_net, 2), v_serials,
       v_prod.cost_price, v_new_cost, v_prod.selling_price, v_new_sell,
       v_stock_before, v_stock_before + v_qty, v_is_new,
       case when v_client_id is not null
            then left(v_client_id || '-' || md5(v_prod.id::text), 64) else null end);

    if not (v_prod.id = any(v_touched)) then
      v_touched := v_touched || v_prod.id;
    end if;
  end loop;

  -- ── تحديث النواقص لكل منتج تأثر ───────────────────────────────────────────
  for v_pid in select unnest(v_touched) loop
    perform public.purchase_sync_shortage(v_pid);
  end loop;

  -- ── المصروفات: الدفع النقدي يُسجَّل مصروفًا ────────────────────────────────
  if v_paid > 0
     and coalesce((public.purchase_setting('auto_expense','true'::jsonb) #>> '{}')::boolean, true) then
    insert into public.expenses (description, category, amount, actor, client_id)
    values ('شراء بضاعة — فاتورة ' || v_number || ' — المورّد: ' || coalesce(v_supplier.name,'—'),
            coalesce(public.purchase_setting('expense_category','"cat_purchases"'::jsonb) #>> '{}', 'cat_purchases'),
            v_paid, v_s.employee_name,
            case when v_client_id is not null then 'PUEXP-' || v_client_id else null end)
    returning id into v_expense_id;

    update public.purchases set expense_id = v_expense_id where id = v_purchase.id;
  end if;

  -- ── رصيد المورّد يرتفع بالمتبقي ───────────────────────────────────────────
  if v_total - v_paid <> 0 then
    update public.suppliers
       set balance = balance + (v_total - v_paid)
     where id = v_sup_id;
  end if;

  perform public.purchase_log(v_s, 'purchase_post', 'purchases', v_purchase.id,
    jsonb_build_object('number', v_number, 'total', v_total, 'paid', v_paid,
                       'items', v_n, 'supplier', v_supplier.name,
                       'warnings', jsonb_array_length(v_warnings)));

  return jsonb_build_object(
    'ok', true,
    'id', v_purchase.id,
    'purchase_number', v_number,
    'total_amount', v_total,
    'paid_amount', v_paid,
    'remaining', v_total - v_paid,
    'payment_type', v_pay_type,
    'expense_id', v_expense_id,
    'warnings', v_warnings);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  إلغاء فاتورة شراء — قيد عكسي كامل (مخزون + تكلفة + سعر + نواقص + رصيد + مصروف)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_cancel(p_token text, p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s        public.purchase_sessions;
  v_p        public.purchases%rowtype;
  v_it       public.purchase_items%rowtype;
  v_prod     public.products%rowtype;
  v_window   int;
  v_warnings jsonb := '[]'::jsonb;
  v_exp      jsonb;
  v_touched  uuid[] := '{}';
  v_pid      uuid;
begin
  v_s := public.purchase_guard(p_token, 'MANAGER');

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'اكتب سبب الإلغاء' using errcode = '22023';
  end if;

  select * into v_p from public.purchases where id = p_id for update;
  if not found then
    raise exception 'الفاتورة غير موجودة' using errcode = '23503';
  end if;
  if v_p.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'already_cancelled', true);
  end if;

  -- المدير يلغي داخل مهلة محددة فقط؛ المدير العام بلا قيد زمني
  v_window := coalesce((public.purchase_setting('cancel_window_hours','24'::jsonb) #>> '{}')::int, 24);
  if v_s.role <> 'ADMIN' and v_p.created_at < now() - make_interval(hours => v_window) then
    raise exception 'انتهت مهلة الإلغاء (% ساعة) — راجع المدير العام', v_window using errcode = '42501';
  end if;

  -- ① إرجاع المخزون والأسعار
  for v_it in select * from public.purchase_items where purchase_id = v_p.id loop
    if v_it.product_id is null then
      v_warnings := v_warnings || jsonb_build_object(
        'type','product_missing','message','منتج محذوف: ' || v_it.product_name);
      continue;
    end if;

    select * into v_prod from public.products where id = v_it.product_id for update;
    if not found then continue; end if;

    if v_prod.stock_quantity < v_it.quantity then
      raise exception 'لا يمكن الإلغاء: بيع جزء من كمية "%" (المتبقي % من %)',
        v_it.product_name, v_prod.stock_quantity, v_it.quantity using errcode = '23514';
    end if;

    update public.products
       set stock_quantity = stock_quantity - v_it.quantity,
           -- نرجّع التكلفة والسعر فقط إن لم يغيّرهما أحد بعد هذه الفاتورة
           cost_price     = case when cost_price    = v_it.new_cost
                                 then coalesce(v_it.old_cost, cost_price) else cost_price end,
           selling_price  = case when selling_price = v_it.new_selling
                                 then coalesce(v_it.old_selling, selling_price) else selling_price end,
           updated_at     = now()
     where id = v_prod.id;

    if v_prod.cost_price <> v_it.new_cost then
      v_warnings := v_warnings || jsonb_build_object(
        'type','cost_changed','product', v_it.product_name,
        'message','تكلفة "' || v_it.product_name || '" تغيّرت بعد الفاتورة — لم تُرجَع');
    end if;

    if not (v_prod.id = any(v_touched)) then
      v_touched := v_touched || v_prod.id;
    end if;
  end loop;

  -- ② النواقص
  for v_pid in select unnest(v_touched) loop
    perform public.purchase_sync_shortage(v_pid);
  end loop;

  -- ③ رصيد المورّد
  if v_p.supplier_id is not null and (v_p.total_amount - v_p.paid_amount) <> 0 then
    update public.suppliers
       set balance = balance - (v_p.total_amount - v_p.paid_amount)
     where id = v_p.supplier_id;
  end if;

  -- ④ المصروف المرتبط يُحذف مع حفظ نسخته الكاملة بسجل التدقيق
  if v_p.expense_id is not null then
    select to_jsonb(e) into v_exp from public.expenses e where e.id = v_p.expense_id;
    if v_exp is not null then
      delete from public.expenses where id = v_p.expense_id;
      perform public.purchase_log(v_s, 'expense_reverse', 'expenses', v_p.expense_id, v_exp);
    end if;
  end if;

  -- ⑤ ختم الإلغاء
  update public.purchases
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancel_reason = left(btrim(p_reason), 500),
         cancelled_by  = v_s.employee_name,
         expense_id    = null
   where id = v_p.id;

  perform public.purchase_log(v_s, 'purchase_cancel', 'purchases', v_p.id,
    jsonb_build_object('number', v_p.purchase_number, 'reason', left(btrim(p_reason),500),
                       'total', v_p.total_amount));

  return jsonb_build_object('ok', true, 'id', v_p.id, 'warnings', v_warnings);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  دفعة لمورّد
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.supplier_payment_post(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s        public.purchase_sessions;
  v_sup      public.suppliers%rowtype;
  v_paid     numeric;
  v_waived   numeric;
  v_prev     numeric;
  v_rem      numeric;
  v_client   text;
  v_exp_id   uuid;
  v_row      public.supplier_payments%rowtype;
begin
  v_s := public.purchase_guard(p_token, 'MANAGER');

  v_client := nullif(btrim(coalesce(p_payload->>'client_id','')), '');
  if v_client is not null then
    select * into v_row from public.supplier_payments where client_id = v_client;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_row.id);
    end if;
  end if;

  select * into v_sup from public.suppliers
   where id = nullif(p_payload->>'supplier_id','')::uuid for update;
  if not found then
    raise exception 'المورّد غير موجود' using errcode = '23503';
  end if;

  v_paid   := round(greatest(coalesce((p_payload->>'amount_paid')::numeric, 0), 0), 2);
  v_waived := round(greatest(coalesce((p_payload->>'waived_amount')::numeric, 0), 0), 2);

  if v_paid + v_waived <= 0 then
    raise exception 'أدخل مبلغًا' using errcode = '22023';
  end if;
  if v_paid + v_waived > 1e12 then
    raise exception 'مبلغ غير منطقي' using errcode = '22003';
  end if;

  v_prev := coalesce(v_sup.balance, 0);
  if v_paid + v_waived > v_prev + 0.0001 then
    raise exception 'المبلغ أكبر من رصيد المورّد (%)', v_prev using errcode = '22023';
  end if;
  if v_waived > 0 and nullif(btrim(coalesce(p_payload->>'waiver_reason','')), '') is null then
    raise exception 'اكتب سبب الحسم' using errcode = '22023';
  end if;

  v_rem := round(v_prev - v_paid - v_waived, 2);

  -- مصروف مقابل المبلغ المدفوع نقدًا
  if v_paid > 0
     and coalesce((public.purchase_setting('auto_expense','true'::jsonb) #>> '{}')::boolean, true) then
    insert into public.expenses (description, category, amount, actor, client_id)
    values ('تسديد مورّد — ' || v_sup.name,
            coalesce(public.purchase_setting('expense_category','"cat_purchases"'::jsonb) #>> '{}', 'cat_purchases'),
            v_paid, v_s.employee_name,
            case when v_client is not null then 'SPEXP-' || v_client else null end)
    returning id into v_exp_id;
  end if;

  insert into public.supplier_payments
    (supplier_id, supplier_name, previous_balance, amount_paid, waived_amount,
     waiver_reason, remaining_balance, is_zeroed, notes, actor, expense_id, client_id)
  values
    (v_sup.id, v_sup.name, v_prev, v_paid, v_waived,
     left(nullif(btrim(coalesce(p_payload->>'waiver_reason','')), ''), 500),
     v_rem, (v_rem <= 0),
     left(nullif(btrim(coalesce(p_payload->>'notes','')), ''), 1000),
     v_s.employee_name, v_exp_id, v_client)
  returning * into v_row;

  update public.suppliers set balance = v_rem where id = v_sup.id;

  perform public.purchase_log(v_s, 'supplier_payment', 'supplier_payments', v_row.id,
    jsonb_build_object('supplier', v_sup.name, 'paid', v_paid, 'waived', v_waived,
                       'previous', v_prev, 'remaining', v_rem));

  return jsonb_build_object('ok', true, 'id', v_row.id,
                            'previous_balance', v_prev, 'remaining_balance', v_rem);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  مرتجع شراء — بضاعة راجعة للمورّد
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_return_post(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s       public.purchase_sessions;
  v_sup     public.suppliers%rowtype;
  v_items   jsonb;
  v_it      jsonb;
  v_n       int;
  v_prod    public.products%rowtype;
  v_qty     int;
  v_cost    numeric;
  v_total   numeric := 0;
  v_number  text;
  v_ret     public.purchase_returns%rowtype;
  v_client  text;
  v_method  text;
  v_touched uuid[] := '{}';
  v_pid     uuid;
  v_pur     public.purchases%rowtype;
begin
  v_s := public.purchase_guard(p_token, 'MANAGER');

  v_client := nullif(btrim(coalesce(p_payload->>'client_id','')), '');
  if v_client is not null then
    select * into v_ret from public.purchase_returns where client_id = v_client;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true,
                                'id', v_ret.id, 'return_number', v_ret.return_number);
    end if;
  end if;

  select * into v_sup from public.suppliers
   where id = nullif(p_payload->>'supplier_id','')::uuid for update;
  if not found then
    raise exception 'المورّد غير موجود' using errcode = '23503';
  end if;

  v_items := p_payload->'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array'
     or jsonb_array_length(v_items) = 0 then
    raise exception 'أضف صنفًا واحدًا على الأقل' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(v_items);
  if v_n > 200 then
    raise exception 'عدد الأصناف يتجاوز الحد المسموح' using errcode = '22023';
  end if;

  v_method := upper(coalesce(nullif(btrim(coalesce(p_payload->>'refund_method','')), ''), 'BALANCE'));
  if v_method not in ('BALANCE','CASH') then
    raise exception 'طريقة الاسترجاع غير صحيحة' using errcode = '22023';
  end if;

  if nullif(p_payload->>'purchase_id','') is not null then
    select * into v_pur from public.purchases where id = (p_payload->>'purchase_id')::uuid;
  end if;

  v_number := 'PR-' || to_char(now() at time zone 'Asia/Baghdad', 'YYMMDD')
              || '-' || lpad(nextval('public.purchase_returns_number_seq')::text, 4, '0');

  insert into public.purchase_returns
    (return_number, purchase_id, purchase_number, supplier_id, supplier_name,
     total_amount, refund_method, reason, notes, actor, client_id)
  values
    (v_number, v_pur.id, v_pur.purchase_number, v_sup.id, v_sup.name,
     0, v_method,
     left(nullif(btrim(coalesce(p_payload->>'reason','')), ''), 500),
     left(nullif(btrim(coalesce(p_payload->>'notes','')), ''), 1000),
     v_s.employee_name, v_client)
  returning * into v_ret;

  for v_it in select * from jsonb_array_elements(v_items) loop
    v_qty  := coalesce((v_it->>'quantity')::int, 0);
    v_cost := round(greatest(coalesce((v_it->>'unit_cost')::numeric, 0), 0), 2);

    if v_qty <= 0 or v_qty > 100000 then
      raise exception 'كمية غير صالحة' using errcode = '22023';
    end if;

    select * into v_prod from public.products
     where id = nullif(v_it->>'product_id','')::uuid for update;
    if not found then
      raise exception 'منتج غير موجود بالمرتجع' using errcode = '23503';
    end if;

    if v_prod.stock_quantity < v_qty then
      raise exception 'كمية "%" بالمخزون % وأنت ترجّع %',
        v_prod.name, v_prod.stock_quantity, v_qty using errcode = '23514';
    end if;

    if v_cost = 0 then v_cost := coalesce(v_prod.cost_price, 0); end if;

    update public.products
       set stock_quantity = stock_quantity - v_qty,
           updated_at     = now()
     where id = v_prod.id;

    insert into public.purchase_return_items
      (return_id, product_id, product_name, quantity, unit_cost, total, reason, client_id)
    values
      (v_ret.id, v_prod.id, v_prod.name, v_qty, v_cost, round(v_qty * v_cost, 2),
       left(nullif(btrim(coalesce(v_it->>'reason','')), ''), 200),
       case when v_client is not null
            then left(v_client || '-' || md5(v_prod.id::text), 64) else null end);

    v_total := v_total + v_qty * v_cost;

    if not (v_prod.id = any(v_touched)) then
      v_touched := v_touched || v_prod.id;
    end if;
  end loop;

  update public.purchase_returns set total_amount = round(v_total, 2) where id = v_ret.id;

  for v_pid in select unnest(v_touched) loop
    perform public.purchase_sync_shortage(v_pid);
  end loop;

  -- خصم من رصيد المورّد عند اختيار "يُحسم من الرصيد"
  if v_method = 'BALANCE' then
    update public.suppliers set balance = balance - round(v_total, 2) where id = v_sup.id;
  end if;

  perform public.purchase_log(v_s, 'purchase_return', 'purchase_returns', v_ret.id,
    jsonb_build_object('number', v_number, 'supplier', v_sup.name,
                       'total', round(v_total,2), 'method', v_method, 'items', v_n));

  return jsonb_build_object('ok', true, 'id', v_ret.id, 'return_number', v_number,
                            'total_amount', round(v_total, 2));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  حفظ / تعديل مورّد
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_supplier_save(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s   public.purchase_sessions;
  v_id  uuid;
  v_row public.suppliers%rowtype;
  v_name text;
begin
  v_s := public.purchase_guard(p_token, 'MANAGER');

  v_name := left(btrim(coalesce(p_payload->>'name','')), 120);
  if v_name = '' then
    raise exception 'اسم المورّد مطلوب' using errcode = '22023';
  end if;

  v_id := nullif(p_payload->>'id','')::uuid;

  if v_id is null then
    insert into public.suppliers (name, phone, company, address, notes, credit_limit, client_id)
    values (v_name,
            left(nullif(btrim(coalesce(p_payload->>'phone','')), ''), 32),
            left(nullif(btrim(coalesce(p_payload->>'company','')), ''), 120),
            left(nullif(btrim(coalesce(p_payload->>'address','')), ''), 240),
            left(nullif(btrim(coalesce(p_payload->>'notes','')), ''), 1000),
            greatest(coalesce((p_payload->>'credit_limit')::numeric, 0), 0),
            nullif(btrim(coalesce(p_payload->>'client_id','')), ''))
    returning * into v_row;
    perform public.purchase_log(v_s, 'supplier_create', 'suppliers', v_row.id,
                                jsonb_build_object('name', v_name));
  else
    update public.suppliers
       set name         = v_name,
           phone        = left(nullif(btrim(coalesce(p_payload->>'phone','')), ''), 32),
           company      = left(nullif(btrim(coalesce(p_payload->>'company','')), ''), 120),
           address      = left(nullif(btrim(coalesce(p_payload->>'address','')), ''), 240),
           notes        = left(nullif(btrim(coalesce(p_payload->>'notes','')), ''), 1000),
           credit_limit = greatest(coalesce((p_payload->>'credit_limit')::numeric, credit_limit), 0),
           is_active    = coalesce((p_payload->>'is_active')::boolean, is_active)
     where id = v_id
    returning * into v_row;

    if not found then
      raise exception 'المورّد غير موجود' using errcode = '23503';
    end if;
    perform public.purchase_log(v_s, 'supplier_update', 'suppliers', v_row.id,
                                jsonb_build_object('name', v_name));
  end if;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'supplier', to_jsonb(v_row));
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
--  حفظ الإعدادات — للمدير العام فقط
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.purchase_settings_save(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s   public.purchase_sessions;
  v_key text;
  v_allowed text[] := array['cost_method','price_policy','default_margin_pct','auto_expense',
                            'expense_category','auto_resolve_shortages','allow_new_products',
                            'session_ttl_hours','max_items_per_invoice','cancel_window_hours'];
  v_n int := 0;
begin
  v_s := public.purchase_guard(p_token, 'ADMIN');

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'صيغة الإعدادات غير صحيحة' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_payload) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'إعداد غير معروف: %', v_key using errcode = '22023';
    end if;

    -- تحقق من قيم الحقول المحصورة
    if v_key = 'cost_method'
       and (p_payload->>v_key) not in ('moving_average','last') then
      raise exception 'طريقة تكلفة غير صحيحة' using errcode = '22023';
    end if;
    if v_key = 'price_policy'
       and (p_payload->>v_key) not in ('keep','margin','manual') then
      raise exception 'سياسة تسعير غير صحيحة' using errcode = '22023';
    end if;
    if v_key = 'default_margin_pct'
       and ((p_payload->>v_key)::numeric < 0 or (p_payload->>v_key)::numeric > 500) then
      raise exception 'هامش الربح خارج النطاق (0–500)' using errcode = '22023';
    end if;

    insert into public.purchase_settings (key, value, updated_at)
    values (v_key, p_payload->v_key, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
    v_n := v_n + 1;
  end loop;

  perform public.purchase_log(v_s, 'settings_save', 'purchase_settings', null, p_payload);
  return jsonb_build_object('ok', true, 'updated', v_n);
end;
$$;

commit;
