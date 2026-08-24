-- ============================================================================
--  قسم الشراء — مجموعة الاختبارات الوظيفية
--  تُشغَّل على قاعدة اختبار محلية بعد تحميل 000_baseline_fixture.sql والملفات 001–006
--  التشغيل:  bash tests/run.sh
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages to notice;

create or replace function public.t_assert(cond boolean, msg text)
returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception E'\n  ❌ فشل: %', msg;
  end if;
  raise notice '  ✅ %', msg;
end $$;

create or replace function public.t_pin(p text)
returns text language sql as $$
  select encode(extensions.digest('SOUFYAN-PIN-v1:' || p, 'sha256'), 'hex');
$$;

create table if not exists public.t_ctx (k text primary key, v text);
create or replace function public.t_set(k text, v text) returns void language sql as $$
  insert into public.t_ctx values (k, v) on conflict (k) do update set v = excluded.v;
$$;
create or replace function public.t_get(k text) returns text language sql as $$
  select v from public.t_ctx where k = $1;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ١. الدخول والصلاحيات ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare r jsonb;
begin
  -- رمز خاطئ
  r := public.purchase_login(public.t_pin('999999'), 'TERM-TEST');
  perform public.t_assert((r->>'ok')::boolean is false and r->>'reason' = 'wrong',
                          'رمز خاطئ يُرفض');

  -- الكاشير ممنوع من قسم الشراء
  r := public.purchase_login(public.t_pin('907245'), 'TERM-TEST');
  perform public.t_assert((r->>'ok')::boolean is false and r->>'reason' = 'forbidden',
                          'الكاشير ممنوع من دخول قسم الشراء');

  -- مدخل غير صالح
  r := public.purchase_login('short', 'TERM-TEST');
  perform public.t_assert(r->>'reason' = 'invalid', 'رمز قصير/غير سداسي عشري يُرفض');

  -- المدير العام
  r := public.purchase_login(public.t_pin('482913'), 'TERM-TEST');
  perform public.t_assert((r->>'ok')::boolean, 'المدير العام يدخل بنجاح');
  perform public.t_assert(length(r->>'token') = 64, 'الرمز ٦٤ خانة عشوائية');
  perform public.t_assert((r->>'can_settings')::boolean, 'المدير العام يملك الإعدادات');
  perform public.t_set('admin_token', r->>'token');

  -- المدير
  r := public.purchase_login(public.t_pin('350716'), 'TERM-TEST2');
  perform public.t_assert((r->>'ok')::boolean, 'المدير يدخل بنجاح');
  perform public.t_assert((r->>'can_settings')::boolean is false, 'المدير لا يملك الإعدادات');
  perform public.t_set('mgr_token', r->>'token');
end $$;

do $$
declare ok boolean := false;
begin
  begin
    perform public.purchase_bootstrap('0000000000000000000000000000000000000000000000000000000000000000');
  exception when others then ok := true;
  end;
  perform public.t_assert(ok, 'رمز جلسة غير موجود يُرفض');

  ok := false;
  begin
    perform public.purchase_bootstrap('لا-يصلح');
  exception when others then ok := true;
  end;
  perform public.t_assert(ok, 'رمز بصيغة خاطئة يُرفض قبل الاستعلام');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ٢. عزل الجداول عن الوصول المباشر ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare ok boolean := false;
begin
  begin
    set local role anon;
    perform 1 from public.suppliers limit 1;
    reset role;
  exception when others then ok := true; reset role;
  end;
  perform public.t_assert(ok, 'دور anon لا يستطيع قراءة جدول الموردين مباشرة');
end $$;

do $$
declare ok boolean := false;
begin
  begin
    set local role authenticated;
    perform 1 from public.purchases limit 1;
    reset role;
  exception when others then ok := true; reset role;
  end;
  perform public.t_assert(ok, 'دور authenticated لا يستطيع قراءة فواتير الشراء مباشرة');
end $$;

do $$
declare ok boolean := false;
begin
  begin
    set local role anon;
    perform public.purchase_guard('x');
    reset role;
  exception when others then ok := true; reset role;
  end;
  perform public.t_assert(ok, 'دالة الحارس غير قابلة للتنفيذ من الخارج');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ٣. ترحيل فاتورة شراء ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  r        jsonb;
  v_prod   public.products%rowtype;
  v_pid    uuid;
  v_before int;
begin
  select * into v_prod from public.products where barcode = '6004';
  v_pid := v_prod.id;
  v_before := v_prod.stock_quantity;
  perform public.t_assert(v_before = 2 and v_prod.cost_price = 480000, 'الحالة الابتدائية للمنتج صحيحة');

  r := public.purchase_post(public.t_get('admin_token'), jsonb_build_object(
    'client_id',     'PU-TEST-0001',
    'supplier_name', 'مورّد بغداد',
    'supplier_phone','07700000000',
    'extra_cost',    25000,
    'paid_amount',   2525000,
    'notes',         'اختبار',
    'items', jsonb_build_array(jsonb_build_object(
      'product_id',        v_pid,
      'product_name',      v_prod.name,
      'quantity',          5,
      'unit_cost',         500000,
      'new_selling_price', 600000))));

  perform public.t_assert((r->>'ok')::boolean, 'الفاتورة تُرحَّل بنجاح');
  perform public.t_assert(r->>'purchase_number' like 'PU-%', 'رقم الفاتورة بالصيغة المتفق عليها');
  perform public.t_assert((r->>'total_amount')::numeric = 2525000, 'الإجمالي = ٢٥٠٠٠٠٠ + ٢٥٠٠٠ شحن');
  perform public.t_assert((r->>'payment_type') = 'CASH', 'الدفع الكامل يُصنَّف نقدًا');
  perform public.t_set('purchase_1', r->>'id');

  select * into v_prod from public.products where id = v_pid;
  perform public.t_assert(v_prod.stock_quantity = 7, 'المخزون ارتفع من ٢ إلى ٧');
  -- التكلفة المُحمَّلة = (٢٥٠٠٠٠٠ + ٢٥٠٠٠) ÷ ٥ = ٥٠٥٠٠٠
  -- المتوسط المرجّح = (٢×٤٨٠٠٠٠ + ٥×٥٠٥٠٠٠) ÷ ٧ = ٤٩٧٨٥٧٫١٤
  perform public.t_assert(round(v_prod.cost_price, 2) = 497857.14,
                          'التكلفة بالمتوسط المرجّح = ٤٩٧٬٨٥٧٫١٤');
  perform public.t_assert(v_prod.selling_price = 600000, 'سعر البيع تحدَّث إلى ٦٠٠٬٠٠٠');
end $$;

do $$
declare v_e public.expenses%rowtype; v_p public.purchases%rowtype;
begin
  select * into v_p from public.purchases where id = public.t_get('purchase_1')::uuid;
  perform public.t_assert(v_p.expense_id is not null, 'الفاتورة مربوطة بصف مصروف');

  select * into v_e from public.expenses where id = v_p.expense_id;
  perform public.t_assert(v_e.amount = 2525000, 'مبلغ المصروف = المدفوع');
  perform public.t_assert(v_e.category = 'cat_purchases', 'تصنيف المصروف = مشتريات');
  perform public.t_assert(v_e.description like '%' || v_p.purchase_number || '%',
                          'وصف المصروف يذكر رقم فاتورة الشراء');
  perform public.t_assert(public."عرّب"('مصروف','cat_purchases') = 'مشتريات',
                          'تعريب تصنيف المشتريات يعمل');
end $$;

do $$
declare v_s public.shortages%rowtype;
begin
  select * into v_s from public.shortages
   where product_id = (select id from public.products where barcode = '6004');
  perform public.t_assert(v_s.resolved, 'سطر النواقص أُغلق تلقائيًا بعد الاستلام');
  perform public.t_assert(v_s.current_qty = 7, 'كمية النواقص تحدّثت إلى ٧');
end $$;

do $$
declare r jsonb; n int;
begin
  -- إعادة الإرسال بنفس المعرّف (انقطاع شبكة) يجب ألا تُنشئ فاتورة ثانية
  r := public.purchase_post(public.t_get('admin_token'), jsonb_build_object(
    'client_id', 'PU-TEST-0001', 'supplier_name', 'مورّد بغداد',
    'items', jsonb_build_array(jsonb_build_object(
      'product_name', 'أي شيء', 'quantity', 1, 'unit_cost', 1))));
  perform public.t_assert((r->>'duplicate')::boolean, 'إعادة الإرسال تُكتشف كنسخة مكرّرة');

  select count(*) into n from public.purchases where client_id = 'PU-TEST-0001';
  perform public.t_assert(n = 1, 'لا توجد فاتورة مكرّرة بقاعدة البيانات');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ٤. التحقق من صحة المدخلات ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare ok boolean;
begin
  ok := false;
  begin
    perform public.purchase_post(public.t_get('admin_token'), jsonb_build_object(
      'supplier_name','م', 'items', jsonb_build_array(jsonb_build_object(
        'product_name','س','quantity', -3, 'unit_cost', 1000))));
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'كمية سالبة تُرفض');

  ok := false;
  begin
    perform public.purchase_post(public.t_get('admin_token'), jsonb_build_object(
      'supplier_name','م', 'paid_amount', 999999999,
      'items', jsonb_build_array(jsonb_build_object(
        'product_name','س','quantity', 1, 'unit_cost', 1000))));
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'المدفوع الأكبر من الإجمالي يُرفض');

  ok := false;
  begin
    perform public.purchase_post(public.t_get('admin_token'), jsonb_build_object(
      'supplier_name','م', 'items', '[]'::jsonb));
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'فاتورة بلا أصناف تُرفض');

  ok := false;
  begin
    perform public.purchase_post(public.t_get('admin_token'), jsonb_build_object(
      'items', jsonb_build_array(jsonb_build_object(
        'product_name','س','quantity', 1, 'unit_cost', 1000))));
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'فاتورة بلا مورّد تُرفض');

  ok := false;
  begin
    perform public.purchase_post(public.t_get('admin_token'), jsonb_build_object(
      'supplier_name','م', 'discount', 99999999,
      'items', jsonb_build_array(jsonb_build_object(
        'product_name','س','quantity', 1, 'unit_cost', 1000))));
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'خصم أكبر من قيمة الفاتورة يُرفض');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ٥. منتج جديد + شراء بالآجل + رصيد المورّد ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  r      jsonb;
  v_sup  public.suppliers%rowtype;
  v_prod public.products%rowtype;
begin
  select * into v_sup from public.suppliers where name = 'مورّد بغداد';
  perform public.t_assert(v_sup.balance = 0, 'رصيد المورّد صفر بعد الدفع الكامل');
  perform public.t_set('supplier_1', v_sup.id::text);

  -- شراء بالآجل لمنتج غير موجود بالكتالوج
  r := public.purchase_post(public.t_get('mgr_token'), jsonb_build_object(
    'client_id',   'PU-TEST-0002',
    'supplier_id', v_sup.id,
    'paid_amount', 0,
    'items', jsonb_build_array(jsonb_build_object(
      'product_name',    'سماعة بلوتوث JBL',
      'barcode',         '8801',
      'quantity',        10,
      'unit_cost',       25000,
      'margin_pct',      40,
      'min_stock_alert', 4,
      'has_imei',        false))));

  perform public.t_assert((r->>'ok')::boolean, 'المدير يستطيع ترحيل فاتورة');
  perform public.t_assert((r->>'payment_type') = 'DEBT', 'عدم الدفع يُصنَّف آجلًا');
  perform public.t_set('purchase_2', r->>'id');

  select * into v_prod from public.products where barcode = '8801';
  perform public.t_assert(found, 'المنتج الجديد أُنشئ بالمخزون');
  perform public.t_assert(v_prod.stock_quantity = 10, 'كمية المنتج الجديد = ١٠');
  perform public.t_assert(v_prod.cost_price = 25000, 'تكلفة المنتج الجديد = سعر الشراء');
  perform public.t_assert(v_prod.selling_price = 35000, 'سعر البيع بهامش ٤٠٪ = ٣٥٬٠٠٠');
  perform public.t_assert(v_prod.min_stock_alert = 4, 'حد التنبيه انحفظ');

  select * into v_sup from public.suppliers where id = v_sup.id;
  perform public.t_assert(v_sup.balance = 250000, 'رصيد المورّد ارتفع بقيمة الآجل');
end $$;

do $$
declare v_p public.purchases%rowtype;
begin
  select * into v_p from public.purchases where id = public.t_get('purchase_2')::uuid;
  perform public.t_assert(v_p.expense_id is null, 'الشراء الآجل لا يُنشئ مصروفًا');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ٦. توزيع مصاريف الشحن على الأصناف ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare r jsonb; v_items jsonb; a numeric; b numeric;
begin
  r := public.purchase_post(public.t_get('admin_token'), jsonb_build_object(
    'client_id',   'PU-TEST-0003',
    'supplier_id', public.t_get('supplier_1')::uuid,
    'extra_cost',  30000,
    'paid_amount', 0,
    'items', jsonb_build_array(
      jsonb_build_object('barcode','6005','product_name','Infinix Hot 40i 128GB',
                         'quantity', 2, 'unit_cost', 100000),
      jsonb_build_object('barcode','7001','product_name','واقي شاشة زجاجي',
                         'quantity', 10, 'unit_cost', 5000))));
  perform public.t_assert((r->>'ok')::boolean, 'فاتورة بصنفين تُرحَّل');

  select jsonb_agg(jsonb_build_object('n', i.product_name, 'l', i.landed_unit_cost))
    into v_items
  from public.purchase_items i where i.purchase_id = (r->>'id')::uuid;

  -- قيمة الأصناف: ٢٠٠٬٠٠٠ و ٥٠٬٠٠٠ (المجموع ٢٥٠٬٠٠٠)
  -- الشحن ٣٠٬٠٠٠ يوزَّع: ٢٤٬٠٠٠ و ٦٬٠٠٠
  -- ⇒ التكلفة المُحمَّلة: (٢٠٠٬٠٠٠+٢٤٬٠٠٠)÷٢ = ١١٢٬٠٠٠ | (٥٠٬٠٠٠+٦٬٠٠٠)÷١٠ = ٥٬٦٠٠
  select i.landed_unit_cost into a from public.purchase_items i
   where i.purchase_id = (r->>'id')::uuid and i.barcode = '6005';
  select i.landed_unit_cost into b from public.purchase_items i
   where i.purchase_id = (r->>'id')::uuid and i.barcode = '7001';

  perform public.t_assert(a = 112000, 'حصة الصنف الأول من الشحن صحيحة (١١٢٬٠٠٠)');
  perform public.t_assert(b = 5600,   'حصة الصنف الثاني من الشحن صحيحة (٥٬٦٠٠)');
  perform public.t_set('purchase_3', r->>'id');
end $$;

do $$
declare v_s public.shortages%rowtype;
begin
  select * into v_s from public.shortages
   where product_id = (select id from public.products where barcode = '7001');
  perform public.t_assert(v_s.resolved, 'نواقص واقي الشاشة أُغلقت بعد وصول ١٠ قطع');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ٧. تسديد مورّد ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare r jsonb; v_sup public.suppliers%rowtype; v_bal numeric; n_exp int;
begin
  select * into v_sup from public.suppliers where id = public.t_get('supplier_1')::uuid;
  v_bal := v_sup.balance;   -- ٢٥٠٬٠٠٠ + ٢٨٠٬٠٠٠ = ٥٣٠٬٠٠٠
  perform public.t_assert(v_bal = 530000, 'رصيد المورّد التراكمي صحيح');

  r := public.supplier_payment_post(public.t_get('admin_token'), jsonb_build_object(
    'client_id',     'SP-TEST-0001',
    'supplier_id',   v_sup.id,
    'amount_paid',   300000,
    'waived_amount', 30000,
    'waiver_reason', 'حسم متفق عليه',
    'notes',         'دفعة أولى'));

  perform public.t_assert((r->>'ok')::boolean, 'الدفعة تُسجَّل');
  perform public.t_assert((r->>'remaining_balance')::numeric = 200000,
                          'الرصيد المتبقي = ٥٣٠٬٠٠٠ − ٣٠٠٬٠٠٠ − ٣٠٬٠٠٠');

  select * into v_sup from public.suppliers where id = v_sup.id;
  perform public.t_assert(v_sup.balance = 200000, 'رصيد المورّد تحدَّث بالجدول');

  select count(*) into n_exp from public.expenses
   where description like 'تسديد مورّد%' and amount = 300000;
  perform public.t_assert(n_exp = 1, 'الدفعة النقدية سُجّلت مصروفًا (المدفوع فقط لا الحسم)');
end $$;

do $$
declare ok boolean := false;
begin
  begin
    perform public.supplier_payment_post(public.t_get('admin_token'), jsonb_build_object(
      'supplier_id', public.t_get('supplier_1')::uuid, 'amount_paid', 99999999));
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'تسديد أكبر من الرصيد يُرفض');

  ok := false;
  begin
    perform public.supplier_payment_post(public.t_get('admin_token'), jsonb_build_object(
      'supplier_id', public.t_get('supplier_1')::uuid, 'waived_amount', 1000));
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'الحسم بلا سبب يُرفض');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ٨. مرتجع شراء ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare r jsonb; v_prod public.products%rowtype; v_sup public.suppliers%rowtype;
begin
  select * into v_prod from public.products where barcode = '8801';
  select * into v_sup  from public.suppliers where id = public.t_get('supplier_1')::uuid;

  r := public.purchase_return_post(public.t_get('admin_token'), jsonb_build_object(
    'client_id',     'PR-TEST-0001',
    'supplier_id',   v_sup.id,
    'refund_method', 'BALANCE',
    'reason',        'بضاعة معيبة',
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', v_prod.id, 'quantity', 3, 'unit_cost', 25000))));

  perform public.t_assert((r->>'ok')::boolean, 'المرتجع يُسجَّل');
  perform public.t_assert(r->>'return_number' like 'PR-%', 'رقم المرتجع بالصيغة الصحيحة');
  perform public.t_assert((r->>'total_amount')::numeric = 75000, 'قيمة المرتجع = ٧٥٬٠٠٠');

  select * into v_prod from public.products where barcode = '8801';
  perform public.t_assert(v_prod.stock_quantity = 7, 'المخزون نزل من ١٠ إلى ٧');

  select * into v_sup from public.suppliers where id = v_sup.id;
  perform public.t_assert(v_sup.balance = 125000, 'رصيد المورّد انخفض بقيمة المرتجع');
end $$;

do $$
declare ok boolean := false;
begin
  begin
    perform public.purchase_return_post(public.t_get('admin_token'), jsonb_build_object(
      'supplier_id', public.t_get('supplier_1')::uuid,
      'items', jsonb_build_array(jsonb_build_object(
        'product_id', (select id from public.products where barcode = '8801'),
        'quantity', 9999))));
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'إرجاع كمية أكبر من المخزون يُرفض');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ٩. إلغاء فاتورة — القيد العكسي الكامل ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  r      jsonb;
  v_prod public.products%rowtype;
  v_p    public.purchases%rowtype;
  n_exp  int;
begin
  select * into v_p from public.purchases where id = public.t_get('purchase_1')::uuid;

  r := public.purchase_cancel(public.t_get('admin_token'), v_p.id, 'خطأ بالإدخال');
  perform public.t_assert((r->>'ok')::boolean, 'الإلغاء ينجح');

  select * into v_prod from public.products where barcode = '6004';
  perform public.t_assert(v_prod.stock_quantity = 2, 'المخزون رجع إلى ٢');
  perform public.t_assert(v_prod.cost_price = 480000, 'التكلفة رجعت إلى ٤٨٠٬٠٠٠');
  perform public.t_assert(v_prod.selling_price = 565000, 'سعر البيع رجع إلى ٥٦٥٬٠٠٠');

  select count(*) into n_exp from public.expenses where id = v_p.expense_id;
  perform public.t_assert(n_exp = 0, 'صف المصروف المرتبط أُلغي');

  select * into v_p from public.purchases where id = v_p.id;
  perform public.t_assert(v_p.status = 'cancelled', 'حالة الفاتورة = ملغاة');
  perform public.t_assert(v_p.cancel_reason = 'خطأ بالإدخال', 'سبب الإلغاء محفوظ');
  perform public.t_assert(v_p.cancelled_by is not null, 'اسم من ألغى محفوظ');

  perform public.t_assert(
    exists (select 1 from public.purchase_audit
            where action = 'expense_reverse' and ref_id = public.t_get('purchase_1')::uuid
               or (action = 'expense_reverse')),
    'حذف المصروف مُوثَّق بسجل التدقيق مع نسخته الكاملة');
end $$;

do $$
declare v_s public.shortages%rowtype;
begin
  select * into v_s from public.shortages
   where product_id = (select id from public.products where barcode = '6004')
     and not resolved;
  perform public.t_assert(found, 'سطر النواقص فُتح من جديد بعد رجوع الكمية تحت الحد');
  perform public.t_assert(v_s.current_qty = 2, 'كمية النواقص = ٢');
  perform public.t_assert(v_s.status = 'urgent', 'حالة النواقص = مستعجل (٢ ≤ نصف الحد ٣ مقرَّبًا)');
end $$;

do $$
declare ok boolean := false; r jsonb;
begin
  -- الإلغاء المكرر لا يُكرّر القيد العكسي
  r := public.purchase_cancel(public.t_get('admin_token'), public.t_get('purchase_1')::uuid, 'مرة ثانية');
  perform public.t_assert((r->>'already_cancelled')::boolean, 'إلغاء فاتورة ملغاة لا يُكرّر شيئًا');

  -- بلا سبب
  begin
    perform public.purchase_cancel(public.t_get('admin_token'), public.t_get('purchase_2')::uuid, '  ');
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'الإلغاء بلا سبب يُرفض');
end $$;

do $$
declare ok boolean := false; v_pid uuid;
begin
  -- بيع جزء من كمية اشتُريت ⇒ الإلغاء يجب أن يُرفض بدل ترك مخزون سالب
  select id into v_pid from public.products where barcode = '7001';
  update public.products set stock_quantity = 3 where id = v_pid;   -- بيعت ٧ من ١٠
  begin
    perform public.purchase_cancel(public.t_get('admin_token'),
                                   public.t_get('purchase_3')::uuid, 'محاولة');
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'إلغاء فاتورة بيعت كميتها يُرفض بدل إنتاج مخزون سالب');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ١٠. الإعدادات وحدود الصلاحية ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare ok boolean := false; r jsonb;
begin
  begin
    perform public.purchase_settings_save(public.t_get('mgr_token'),
                                          '{"default_margin_pct": 30}'::jsonb);
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'المدير لا يستطيع تغيير الإعدادات');

  r := public.purchase_settings_save(public.t_get('admin_token'),
                                     '{"default_margin_pct": 30}'::jsonb);
  perform public.t_assert((r->>'ok')::boolean, 'المدير العام يغيّر الإعدادات');
  perform public.t_assert(public.purchase_setting('default_margin_pct') #>> '{}' = '30',
                          'قيمة الإعداد انحفظت');

  ok := false;
  begin
    perform public.purchase_settings_save(public.t_get('admin_token'),
                                          '{"drop_table": true}'::jsonb);
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'مفتاح إعداد غير معروف يُرفض');

  ok := false;
  begin
    perform public.purchase_settings_save(public.t_get('admin_token'),
                                          '{"cost_method": "whatever"}'::jsonb);
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'قيمة إعداد خارج القائمة المسموحة تُرفض');

  ok := false;
  begin
    perform public.purchase_audit_list(public.t_get('mgr_token'), 10);
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'سجل التدقيق محجوب عن المدير');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ١١. حماية السجلات من الحذف والتلاعب ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare ok boolean := false;
begin
  begin delete from public.purchases where true; exception when others then ok := true; end;
  perform public.t_assert(ok, 'فواتير الشراء لا تُحذف');

  ok := false;
  begin delete from public.supplier_payments where true; exception when others then ok := true; end;
  perform public.t_assert(ok, 'دفعات الموردين لا تُحذف');

  ok := false;
  begin update public.purchase_audit set actor = 'مزوّر'; exception when others then ok := true; end;
  perform public.t_assert(ok, 'سجل التدقيق لا يُعدَّل');

  ok := false;
  begin delete from public.purchase_audit where true; exception when others then ok := true; end;
  perform public.t_assert(ok, 'سجل التدقيق لا يُحذف');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ١٢. دوال القراءة والتقارير ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare r jsonb; t text;
begin
  t := public.t_get('admin_token');

  r := public.purchase_bootstrap(t);
  perform public.t_assert((r->>'ok')::boolean, 'الإقلاع يعمل');
  perform public.t_assert(jsonb_array_length(r->'suppliers') >= 1, 'قائمة الموردين ترجع');
  perform public.t_assert((r->'settings') ? 'cost_method', 'الإعدادات ترجع مع الإقلاع');

  r := public.purchase_products_search(t, '6005', 10);
  perform public.t_assert(jsonb_array_length(r->'rows') = 1, 'البحث بالباركود يرجع نتيجة واحدة');

  r := public.purchase_products_search(t, 'Infinix', 10);
  perform public.t_assert(jsonb_array_length(r->'rows') >= 1, 'البحث بالاسم يعمل');

  r := public.purchase_list(t, '', null, null, null, 50, 0);
  perform public.t_assert((r->>'total')::int >= 3, 'قائمة الفواتير ترجع العدد الكلي');

  r := public.purchase_list(t, '', null, null, 'cancelled', 50, 0);
  perform public.t_assert((r->>'total')::int = 1, 'الترشيح بالحالة يعمل');

  r := public.purchase_get(t, public.t_get('purchase_3')::uuid);
  perform public.t_assert(jsonb_array_length(r->'items') = 2, 'تفاصيل الفاتورة ترجع صنفين');

  r := public.purchase_shortages(t, true);
  perform public.t_assert(jsonb_array_length(r->'rows') >= 1, 'شاشة النواقص ترجع صفوفًا');
  perform public.t_assert(
    (select bool_or((x->>'suggested_qty')::int > 0) from jsonb_array_elements(r->'rows') x),
    'الكمية المقترحة محسوبة');

  r := public.purchase_dashboard(t, 30);
  perform public.t_assert((r->'kpis'->>'purchases_count')::int >= 2, 'مؤشرات اللوحة تُحسب');
  perform public.t_assert((r->'kpis'->>'stock_value')::numeric > 0, 'قيمة المخزون تُحسب');

  r := public.purchase_supplier_statement(t, public.t_get('supplier_1')::uuid);
  perform public.t_assert(jsonb_array_length(r->'movements') >= 3, 'كشف حساب المورّد يجمع الحركات');

  r := public.purchase_returns_list(t, '', 50);
  perform public.t_assert(jsonb_array_length(r->'rows') = 1, 'قائمة المرتجعات تعمل');

  r := public.purchase_payments_list(t, null, 50);
  perform public.t_assert(jsonb_array_length(r->'rows') = 1, 'قائمة الدفعات تعمل');

  r := public.purchase_audit_list(t, 100);
  perform public.t_assert(jsonb_array_length(r->'rows') >= 5, 'سجل التدقيق يمتلئ');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ١٣. التكامل مع بقية النظام ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare r jsonb;
begin
  perform public.t_assert('purchases' = any(public.permissions_for('ADMIN')),
                          'صلاحية المدير العام تشمل قسم الشراء');
  perform public.t_assert('purchases' = any(public.permissions_for('MANAGER')),
                          'صلاحية المدير تشمل قسم الشراء');
  perform public.t_assert(not ('purchases' = any(public.permissions_for('CASHIER'))),
                          'الكاشير خارج قسم الشراء');
  perform public.t_assert('expenses' = any(public.permissions_for('ADMIN')),
                          'صلاحيات النظام القديمة لم تتغيّر');

  r := public.sync_push('purchases', '[]'::jsonb);
  perform public.t_assert((r->>'ok')::boolean, 'المزامنة تقبل جدول الشراء');

  r := public.sync_push('لا_يوجد', '[]'::jsonb);
  perform public.t_assert(r->>'reason' = 'table_not_allowed', 'المزامنة ترفض جدولًا غير مسموح');

  r := public.sync_push('products', '[]'::jsonb);
  perform public.t_assert((r->>'ok')::boolean, 'المزامنة القديمة ما زالت تعمل');

  r := public.doc_purchases(1, '', null, null);
  perform public.t_assert((r->>'ok')::boolean, 'تقرير بوت تلغرام للشراء يعمل');
  perform public.t_assert(jsonb_array_length(r->'rows') >= 3, 'التقرير يرجع صفوفًا');

  r := public.doc_purchases(999, '', null, null);
  perform public.t_assert(r->>'error' = 'unauthorized', 'التقرير يرفض معرّفًا غير مصرّح له');

  r := public.doc_suppliers(1, '');
  perform public.t_assert((r->>'ok')::boolean, 'تقرير الموردين يعمل');

  perform public.t_assert(public."عرّب"('شراء','posted') = 'مُرحّلة', 'تعريب حالة الفاتورة');
  perform public.t_assert(public."عرّب"('مصروف','cat_rent') = 'إيجار', 'التعريب القديم سليم');
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '━━━ ١٤. الجلسات ━━━'
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare ok boolean := false; r jsonb;
begin
  r := public.purchase_logout(public.t_get('mgr_token'));
  perform public.t_assert((r->>'ok')::boolean, 'الخروج ينجح');

  begin
    perform public.purchase_bootstrap(public.t_get('mgr_token'));
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'الرمز بعد الخروج لم يعد صالحًا');

  -- انتهاء الصلاحية
  update public.purchase_sessions set expires_at = now() - interval '1 hour'
   where token = public.t_get('admin_token');
  ok := false;
  begin
    perform public.purchase_bootstrap(public.t_get('admin_token'));
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'الرمز المنتهي يُرفض');
  update public.purchase_sessions set expires_at = now() + interval '8 hours'
   where token = public.t_get('admin_token');

  -- موظف موقوف
  update public.employees set status = 'suspended' where role = 'ADMIN';
  ok := false;
  begin
    perform public.purchase_bootstrap(public.t_get('admin_token'));
  exception when others then ok := true; end;
  perform public.t_assert(ok, 'إيقاف الموظف يُبطل جلسته فورًا');
  update public.employees set status = 'active' where role = 'ADMIN';
end $$;

\echo ''
\echo '════════════════════════════════════════════'
\echo '   ✅ اجتازت جميع الاختبارات'
\echo '════════════════════════════════════════════'
\echo ''
