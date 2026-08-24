-- ============================================================
-- نظام الأقسام والهرم داخل Supabase
--
-- الفكرة: Postgres عنده «schemas» وهي بالضبط الأقسام، وSupabase
-- يعرضها بقائمة منسدلة بالـTable Editor. فبدل ما تدور بين ٢٠ جدول
-- بأسماء إنكليزية، تختار القسم وتشوف محتواه بالعربي.
--
-- والهرم: كل قسم بثلاث طبقات ثابتة الأسماء
--    الملخص   → أرقام القسم بسطر واحد (قمة الهرم)
--    القائمة  → الصفوف الرئيسية
--    التفاصيل → أدق مستوى
--
-- الجداول الأصلية ما تنلمس إطلاقاً — هذي views للقراءة فقط.
-- ============================================================

drop schema if exists اختبار cascade;

create schema if not exists مبيعات;
create schema if not exists زبائن;
create schema if not exists مخزن;
create schema if not exists صيانة;
create schema if not exists مالية;
create schema if not exists بحث;

comment on schema مبيعات is 'الفواتير والمواد المباعة والمرتجعات';
comment on schema زبائن  is 'الزبائن وديونهم وتسديداتهم';
comment on schema مخزن   is 'المنتجات والأقسام والنواقص';
comment on schema صيانة  is 'وصولات التصليح';
comment on schema مالية  is 'المصاريف وحركات الصندوق';
comment on schema بحث    is 'دوال البحث — تنندى من محرر SQL';

-- اختصار: تاريخ ووقت بغداد كنص
create or replace function public.بغداد(t timestamptz)
returns text language sql immutable as $$
  select to_char(t at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI');
$$;

create or replace function public.بغداد_يوم(t timestamptz)
returns date language sql immutable as $$
  select (t at time zone 'Asia/Baghdad')::date;
$$;

-- ============================================================
-- قسم المبيعات
-- ============================================================

create or replace view مبيعات.الملخص as
with س as (select * from public.invoices)
select
  count(*)                                                        as عدد_الفواتير,
  sum(total_amount)::bigint                                       as إجمالي_المبيعات,
  sum(paid_amount)::bigint                                        as المستلم_نقداً,
  (sum(total_amount) - sum(paid_amount))::bigint                  as الديون_الناتجة,
  count(*) filter (where payment_type = 'CASH')                   as فواتير_نقدية,
  count(*) filter (where payment_type = 'DEBT')                   as فواتير_دين,
  count(*) filter (where public.بغداد_يوم(created_at) = (now() at time zone 'Asia/Baghdad')::date)
                                                                  as فواتير_اليوم,
  coalesce(sum(total_amount) filter (where public.بغداد_يوم(created_at) = (now() at time zone 'Asia/Baghdad')::date), 0)::bigint
                                                                  as مبيعات_اليوم,
  public.بغداد(max(created_at))                                   as آخر_فاتورة
from س;

create or replace view مبيعات.القائمة as
select
  i.invoice_number                                   as رقم_الفاتورة,
  public.بغداد(i.created_at)                         as التاريخ,
  public.بغداد_يوم(i.created_at)                     as اليوم,
  coalesce(nullif(btrim(i.customer_name), ''), 'زبون سريع') as الزبون,
  i.customer_phone                                   as الهاتف,
  i.total_amount::bigint                             as المبلغ,
  i.paid_amount::bigint                              as المدفوع,
  (i.total_amount - i.paid_amount)::bigint           as المتبقي,
  case i.payment_type when 'CASH' then 'نقد'
                      when 'DEBT' then 'دين'
                      else coalesce(i.payment_type, '—') end as نوع_الدفع,
  i.province_name                                    as المحافظة,
  i.actor                                            as البائع,
  (select count(*) from public.invoice_items x where x.invoice_id = i.id) as عدد_المواد,
  i.notes                                            as ملاحظات,
  i.id                                               as المعرّف
from public.invoices i
order by i.created_at desc;

create or replace view مبيعات.التفاصيل as
select
  i.invoice_number                     as رقم_الفاتورة,
  public.بغداد(i.created_at)           as التاريخ,
  coalesce(nullif(btrim(i.customer_name), ''), 'زبون سريع') as الزبون,
  t.product_name                       as المادة,
  t.quantity                           as الكمية,
  t.unit_price::bigint                 as سعر_القطعة,
  t.discount::bigint                   as الخصم,
  t.total::bigint                      as صافي_السطر,
  array_to_string(t.serials, ' / ')    as الأرقام_التسلسلية
from public.invoice_items t
join public.invoices i on i.id = t.invoice_id
order by i.created_at desc, t.product_name;

create or replace view مبيعات.ملخص_يومي as
select
  public.بغداد_يوم(created_at)                    as اليوم,
  count(*)                                        as الفواتير,
  sum(total_amount)::bigint                       as المبيعات,
  sum(paid_amount)::bigint                        as النقد,
  (sum(total_amount) - sum(paid_amount))::bigint  as دين_جديد
from public.invoices
group by 1
order by 1 desc;

create or replace view مبيعات.المرتجعات as
select
  r.return_number                as رقم_المرتجع,
  public.بغداد(r.created_at)     as التاريخ,
  r.invoice_number               as الفاتورة_الأصلية,
  r.customer_name                as الزبون,
  r.total_amount::bigint         as المبلغ,
  r.refund_method                as طريقة_الإرجاع,
  r.reason                       as السبب,
  r.actor                        as سجّله
from public.returns r
order by r.created_at desc;

-- ============================================================
-- قسم الزبائن
-- ============================================================

create or replace view زبائن.الملخص as
select
  count(*)                                                as عدد_الزبائن,
  count(*) filter (where balance > 0)                     as المدينون,
  coalesce(sum(balance) filter (where balance > 0), 0)::bigint as إجمالي_الديون,
  coalesce(max(balance), 0)::bigint                       as أكبر_دين,
  count(*) filter (where balance > credit_limit and credit_limit > 0) as فوق_السقف,
  (select count(*) from public.debt_payments)             as عدد_التسديدات,
  (select coalesce(sum(amount_paid),0)::bigint from public.debt_payments) as إجمالي_المسدّد
from public.customers;

create or replace view زبائن.القائمة as
select
  c.name                                    as الاسم,
  c.phone                                   as الهاتف,
  c.balance::bigint                         as الدين_الحالي,
  c.credit_limit::bigint                    as سقف_الدين,
  c.grace_period_days                       as مهلة_السماح,
  c.address                                 as العنوان,
  (select count(*) from public.invoices i where i.customer_id = c.id)      as عدد_الفواتير,
  public.بغداد((select max(i.created_at) from public.invoices i where i.customer_id = c.id)) as آخر_شراء,
  public.بغداد(c.created_at)                as تاريخ_التسجيل,
  c.id                                      as المعرّف
from public.customers c
order by c.balance desc nulls last;

create or replace view زبائن.المدينون as
select * from زبائن.القائمة where الدين_الحالي > 0;

create or replace view زبائن.التفاصيل as
select
  d.customer_name              as الزبون,
  public.بغداد(d.created_at)   as التاريخ,
  d.previous_debt::bigint      as الدين_السابق,
  d.amount_paid::bigint        as المسدّد,
  d.waived_amount::bigint      as السماح,
  d.remaining_debt::bigint     as المتبقي,
  case when d.is_zeroed then 'نعم' else 'لا' end as انصفّر,
  d.waiver_reason              as سبب_السماح,
  d.actor                      as سجّله,
  d.notes                      as ملاحظات
from public.debt_payments d
order by d.created_at desc;

-- ============================================================
-- قسم المخزن
-- ============================================================

create or replace view مخزن.الملخص as
select
  count(*)                                                   as عدد_المنتجات,
  sum(stock_quantity)                                        as إجمالي_القطع,
  sum(stock_quantity * cost_price)::bigint                   as قيمة_المخزن_بالكلفة,
  sum(stock_quantity * selling_price)::bigint                as قيمة_المخزن_بالبيع,
  sum(stock_quantity * (selling_price - cost_price))::bigint as الربح_المتوقع,
  count(*) filter (where stock_quantity <= coalesce(min_stock_alert, 0)) as ناقصة,
  count(*) filter (where stock_quantity = 0)                 as خلصانة,
  (select count(*) from public.categories)                   as عدد_الأقسام
from public.products;

create or replace view مخزن.القائمة as
select
  p.name                                  as المنتج,
  coalesce(c.name, 'بدون قسم')            as القسم,
  p.barcode                               as الباركود,
  p.cost_price::bigint                    as سعر_الشراء,
  p.selling_price::bigint                 as سعر_البيع,
  (p.selling_price - p.cost_price)::bigint as الربح,
  p.stock_quantity                        as الكمية,
  p.min_stock_alert                       as حد_التنبيه,
  case when p.stock_quantity <= coalesce(p.min_stock_alert, 0) then 'ناقص' else 'متوفر' end as الحالة,
  (p.stock_quantity * p.selling_price)::bigint as قيمة_الرصيد,
  case when p.has_imei then 'نعم' else 'لا' end as له_IMEI,
  p.id                                    as المعرّف
from public.products p
left join public.categories c on c.id = p.category_id
order by p.selling_price desc;

create or replace view مخزن.النواقص as
select * from مخزن.القائمة where الحالة = 'ناقص' order by الكمية;

create or replace view مخزن.التفاصيل as
select
  t.product_name                 as المنتج,
  count(*)                       as مرات_البيع,
  sum(t.quantity)                as القطع_المباعة,
  sum(t.total)::bigint           as إجمالي_المبيعات,
  round(avg(t.unit_price))::bigint as متوسط_السعر,
  public.بغداد(max(i.created_at)) as آخر_بيعة
from public.invoice_items t
join public.invoices i on i.id = t.invoice_id
group by t.product_name
order by sum(t.total) desc;

-- ============================================================
-- قسم الصيانة
-- ============================================================

create or replace view صيانة.الملخص as
select
  count(*)                                                    as عدد_الوصولات,
  count(*) filter (where status not in ('delivered','unrepairable')) as مفتوحة,
  count(*) filter (where status = 'delivered')                as مسلّمة,
  count(*) filter (where status = 'awaiting_parts')           as بانتظار_قطع,
  coalesce(sum(cost + labour), 0)::bigint                     as إجمالي_الكلفة,
  public.بغداد(max(created_at))                               as آخر_وصل
from public.repairs;

create or replace view صيانة.القائمة as
select
  ticket_no                    as رقم_الوصل,
  public.بغداد(created_at)     as التاريخ,
  customer_name                as الزبون,
  customer_phone               as الهاتف,
  device                       as الجهاز,
  fault                        as العطل,
  case status when 'intake' then 'استلام'
              when 'diagnosing' then 'تشخيص'
              when 'awaiting_parts' then 'بانتظار قطع'
              when 'ready' then 'جاهز'
              when 'delivered' then 'تسلّمه الزبون'
              when 'unrepairable' then 'ما ينصلح'
              else coalesce(status, '—') end as الحالة,
  cost::bigint                 as كلفة_القطع,
  labour::bigint               as الأجور,
  (cost + labour)::bigint      as المجموع,
  imei                         as IMEI,
  notes                        as ملاحظات
from public.repairs
order by created_at desc;

-- ============================================================
-- قسم المالية
-- ============================================================

create or replace view مالية.الملخص as
select
  (select coalesce(sum(amount),0)::bigint from public.expenses)      as إجمالي_المصاريف,
  (select count(*) from public.expenses)                             as عدد_المصاريف,
  (select coalesce(sum(paid_amount),0)::bigint from public.invoices) as المستلم_من_المبيعات,
  (select coalesce(sum(amount_paid),0)::bigint from public.debt_payments) as المستلم_من_الديون,
  ((select coalesce(sum(paid_amount),0) from public.invoices)
   + (select coalesce(sum(amount_paid),0) from public.debt_payments)
   - (select coalesce(sum(amount),0) from public.expenses))::bigint  as الصافي,
  (select count(*) from public.vault_entries)                        as حركات_الصندوق;

create or replace view مالية.القائمة as
select
  public.بغداد(created_at)   as التاريخ,
  description                as الوصف,
  category                   as النوع,
  amount::bigint             as المبلغ,
  actor                      as سجّله
from public.expenses
order by created_at desc;

create or replace view مالية.التفاصيل as
select
  seq                        as التسلسل,
  public.بغداد(created_at)   as التاريخ,
  kind                       as نوع_الحركة,
  amount::bigint             as المبلغ,
  note                       as ملاحظة,
  actor                      as سجّله
from public.vault_entries
order by seq desc;

-- ============================================================
-- قسم البحث
-- ============================================================

/**
 * بحث شامل بكل شي: رقم فاتورة، تاريخ، اسم زبون، هاتف، منتج،
 * باركود، رقم وصل تصليح، أو IMEI.
 *
 *   select * from بحث.شامل('علي');
 *   select * from بحث.شامل('INV-1042');
 *   select * from بحث.شامل('2026-08-21');
 *   select * from بحث.شامل('ايفون');
 */
create or replace function بحث.شامل(كلمة text)
returns table(
  القسم    text,
  النوع    text,
  المرجع   text,
  التفاصيل text,
  المبلغ   bigint,
  التاريخ  text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with س as (
    select btrim(translate(كلمة, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')) as ن
  ),
  ت as (
    select case when (select ن from س) ~ '^\d{4}-\d{2}-\d{2}$'
                then (select ن from س)::date end as يوم
  )
  -- الفواتير: بالرقم أو الزبون أو الهاتف أو التاريخ
  select 'مبيعات', 'فاتورة',
         i.invoice_number,
         coalesce(nullif(btrim(i.customer_name),''),'زبون سريع')
           || ' · ' || (select count(*) from public.invoice_items x where x.invoice_id = i.id) || ' مواد',
         i.total_amount::bigint,
         public.بغداد(i.created_at)
  from public.invoices i, س, ت
  where i.invoice_number ilike '%' || س.ن || '%'
     or i.customer_name  ilike '%' || س.ن || '%'
     or i.customer_phone ilike '%' || س.ن || '%'
     or (ت.يوم is not null and public.بغداد_يوم(i.created_at) = ت.يوم)

  union all
  -- المواد المباعة: يرجّع الفاتورة اللي بيها المنتج
  select 'مبيعات', 'مادة مباعة',
         i.invoice_number,
         t.product_name || ' × ' || t.quantity,
         t.total::bigint,
         public.بغداد(i.created_at)
  from public.invoice_items t
  join public.invoices i on i.id = t.invoice_id, س
  where t.product_name ilike '%' || س.ن || '%'
     or array_to_string(t.serials, ' ') ilike '%' || س.ن || '%'

  union all
  select 'زبائن', 'زبون',
         c.name,
         coalesce(c.phone,'بلا هاتف')
           || case when c.balance > 0 then ' · عليه دين' else ' · مسدّد' end,
         c.balance::bigint,
         public.بغداد(c.created_at)
  from public.customers c, س
  where c.name ilike '%' || س.ن || '%' or c.phone ilike '%' || س.ن || '%'

  union all
  select 'زبائن', 'تسديد',
         d.customer_name,
         'سدّد ' || to_char(d.amount_paid,'FM999,999,999') || ' · متبقي '
           || to_char(d.remaining_debt,'FM999,999,999'),
         d.amount_paid::bigint,
         public.بغداد(d.created_at)
  from public.debt_payments d, س, ت
  where d.customer_name ilike '%' || س.ن || '%'
     or (ت.يوم is not null and public.بغداد_يوم(d.created_at) = ت.يوم)

  union all
  select 'مخزن', 'منتج',
         p.name,
         'الكمية ' || p.stock_quantity || ' · ' || coalesce(c.name,'بدون قسم'),
         p.selling_price::bigint,
         public.بغداد(p.created_at)
  from public.products p
  left join public.categories c on c.id = p.category_id, س
  where p.name ilike '%' || س.ن || '%' or p.barcode ilike '%' || س.ن || '%'

  union all
  select 'صيانة', 'وصل تصليح',
         r.ticket_no,
         r.customer_name || ' · ' || r.device || ' · ' || r.fault,
         (r.cost + r.labour)::bigint,
         public.بغداد(r.created_at)
  from public.repairs r, س
  where r.ticket_no ilike '%' || س.ن || '%'
     or r.customer_name ilike '%' || س.ن || '%'
     or r.device ilike '%' || س.ن || '%'
     or r.imei ilike '%' || س.ن || '%'

  order by 6 desc
  limit 100;
$function$;

/**
 * بحث بالفواتير مع فلاتر — الأعم استعمالاً بقسم المبيعات.
 *
 *   select * from بحث.فواتير('علي');
 *   select * from بحث.فواتير(null, '2026-08-01', '2026-08-24');
 *   select * from بحث.فواتير('ايفون');            -- يلكاها بالمواد هم
 */
create or replace function بحث.فواتير(
  كلمة text default null,
  من   date default null,
  الى  date default null
)
returns table(
  رقم_الفاتورة text,
  التاريخ      text,
  الزبون       text,
  الهاتف       text,
  المبلغ       bigint,
  المدفوع      bigint,
  المتبقي      bigint,
  نوع_الدفع    text,
  المواد       text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with س as (
    select nullif(btrim(coalesce(translate(كلمة, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '')), '') as ن
  )
  select
    i.invoice_number,
    public.بغداد(i.created_at),
    coalesce(nullif(btrim(i.customer_name),''),'زبون سريع'),
    i.customer_phone,
    i.total_amount::bigint,
    i.paid_amount::bigint,
    (i.total_amount - i.paid_amount)::bigint,
    case i.payment_type when 'CASH' then 'نقد' when 'DEBT' then 'دين'
                        else coalesce(i.payment_type,'—') end,
    (select string_agg(t.product_name || ' ×' || t.quantity, ' · ' order by t.product_name)
       from public.invoice_items t where t.invoice_id = i.id)
  from public.invoices i, س
  where (س.ن is null
         or i.invoice_number ilike '%' || س.ن || '%'
         or i.customer_name  ilike '%' || س.ن || '%'
         or i.customer_phone ilike '%' || س.ن || '%'
         or exists (select 1 from public.invoice_items t
                     where t.invoice_id = i.id
                       and t.product_name ilike '%' || س.ن || '%'))
    and (من  is null or public.بغداد_يوم(i.created_at) >= من)
    and (الى is null or public.بغداد_يوم(i.created_at) <= الى)
  order by i.created_at desc
  limit 200;
$function$;

-- ============================================================
-- الصلاحيات — قراءة فقط، والجداول الأصلية تبقى محمية مثل ما هي
-- ============================================================
grant usage on schema مبيعات, زبائن, مخزن, صيانة, مالية, بحث to service_role;
grant select on all tables in schema مبيعات, زبائن, مخزن, صيانة, مالية to service_role;
grant execute on function بحث.شامل(text)              to service_role;
grant execute on function بحث.فواتير(text,date,date)  to service_role;
