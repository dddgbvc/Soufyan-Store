-- ============================================================================
--  قسم الشراء — مركز سفيان للهواتف
--  الملف 001: الجداول والفهارس والمشغّلات
--  متوافق مع مخطط قاعدة البيانات الحالي (products / shortages / expenses / …)
--  آمن للتشغيل أكثر من مرة (idempotent)
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) الموردون
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null check (btrim(name) <> '' and length(name) <= 120),
  phone         text        check (phone is null or length(phone) <= 32),
  company       text        check (company is null or length(company) <= 120),
  address       text        check (address is null or length(address) <= 240),
  notes         text        check (notes is null or length(notes) <= 1000),
  -- الرصيد = المبلغ المستحق للمورّد علينا (موجب = مدينون له)
  balance       numeric     not null default 0,
  credit_limit  numeric     not null default 0 check (credit_limit >= 0),
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  client_id     text
);

create unique index if not exists suppliers_client_id_key
  on public.suppliers (client_id) where client_id is not null;
create index if not exists suppliers_name_idx   on public.suppliers (lower(name));
create index if not exists suppliers_active_idx on public.suppliers (is_active, name);
create index if not exists suppliers_phone_idx  on public.suppliers (phone) where phone is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) فواتير الشراء
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.purchases (
  id               uuid primary key default gen_random_uuid(),
  purchase_number  text        not null unique,
  supplier_id      uuid        references public.suppliers(id) on delete set null,
  supplier_name    text,
  supplier_phone   text,
  status           text        not null default 'posted'
                   check (status in ('posted','cancelled')),
  -- المبالغ
  items_total      numeric     not null default 0 check (items_total  >= 0),
  discount         numeric     not null default 0 check (discount     >= 0),
  extra_cost       numeric     not null default 0 check (extra_cost   >= 0),
  total_amount     numeric     not null default 0 check (total_amount >= 0),
  paid_amount      numeric     not null default 0 check (paid_amount  >= 0),
  payment_type     text        not null default 'CASH'
                   check (payment_type in ('CASH','DEBT','PARTIAL')),
  notes            text        check (notes is null or length(notes) <= 1000),
  actor            text,
  -- الإلغاء (لا يوجد حذف — الفاتورة تُلغى بقيد عكسي)
  cancelled_at     timestamptz,
  cancel_reason    text,
  cancelled_by     text,
  -- ربط المصروفات: صف المصروف الذي أنشأته هذه الفاتورة عند الدفع نقدًا
  expense_id       uuid        references public.expenses(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  client_id        text,
  constraint purchases_paid_le_total check (paid_amount <= total_amount + 0.0001)
);

create unique index if not exists purchases_client_id_key
  on public.purchases (client_id) where client_id is not null;
create index if not exists purchases_created_idx  on public.purchases (created_at desc);
create index if not exists purchases_supplier_idx on public.purchases (supplier_id, created_at desc);
create index if not exists purchases_status_idx   on public.purchases (status, created_at desc);
create index if not exists purchases_number_idx   on public.purchases (purchase_number);

-- تسلسل رقم فاتورة الشراء
create sequence if not exists public.purchases_number_seq;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) أصناف فاتورة الشراء
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.purchase_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_id       uuid not null references public.purchases(id) on delete cascade,
  product_id        uuid references public.products(id) on delete set null,
  product_name      text not null check (btrim(product_name) <> '' and length(product_name) <= 200),
  barcode           text,
  quantity          integer not null check (quantity > 0 and quantity <= 100000),
  unit_cost         numeric not null default 0 check (unit_cost >= 0),
  discount          numeric not null default 0 check (discount  >= 0),
  -- تكلفة الوحدة بعد توزيع مصاريف الشحن/النقل على الأصناف
  landed_unit_cost  numeric not null default 0 check (landed_unit_cost >= 0),
  total             numeric not null default 0 check (total >= 0),
  serials           text[],
  -- لقطة قبل/بعد — تسمح بالإلغاء الدقيق والتدقيق الكامل
  old_cost          numeric,
  new_cost          numeric,
  old_selling       numeric,
  new_selling       numeric,
  old_stock         integer,
  new_stock         integer,
  is_new_product    boolean not null default false,
  client_id         text
);

create unique index if not exists purchase_items_client_id_key
  on public.purchase_items (client_id) where client_id is not null;
create index if not exists purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index if not exists purchase_items_product_idx  on public.purchase_items (product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) دفعات الموردين  (نظير debt_payments في جانب الزبائن)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.supplier_payments (
  id               uuid primary key default gen_random_uuid(),
  supplier_id      uuid references public.suppliers(id) on delete set null,
  supplier_name    text,
  previous_balance numeric not null default 0,
  amount_paid      numeric not null default 0 check (amount_paid   >= 0),
  waived_amount    numeric not null default 0 check (waived_amount >= 0),
  waiver_reason    text check (waiver_reason is null or length(waiver_reason) <= 500),
  remaining_balance numeric not null default 0,
  is_zeroed        boolean not null default false,
  notes            text check (notes is null or length(notes) <= 1000),
  actor            text,
  expense_id       uuid references public.expenses(id) on delete set null,
  created_at       timestamptz not null default now(),
  client_id        text,
  constraint supplier_payments_nonzero check (amount_paid + waived_amount > 0)
);

create unique index if not exists supplier_payments_client_id_key
  on public.supplier_payments (client_id) where client_id is not null;
create index if not exists supplier_payments_supplier_idx
  on public.supplier_payments (supplier_id, created_at desc);
create index if not exists supplier_payments_created_idx
  on public.supplier_payments (created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) مرتجعات الشراء (رجوع بضاعة إلى المورّد)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.purchase_returns (
  id               uuid primary key default gen_random_uuid(),
  return_number    text not null unique,
  purchase_id      uuid references public.purchases(id) on delete set null,
  purchase_number  text,
  supplier_id      uuid references public.suppliers(id) on delete set null,
  supplier_name    text,
  total_amount     numeric not null default 0 check (total_amount >= 0),
  -- BALANCE: يُخصم من رصيد المورّد | CASH: استرجعنا نقدًا
  refund_method    text not null default 'BALANCE'
                   check (refund_method in ('BALANCE','CASH')),
  reason           text check (reason is null or length(reason) <= 500),
  notes            text check (notes  is null or length(notes)  <= 1000),
  actor            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  client_id        text
);

create unique index if not exists purchase_returns_client_id_key
  on public.purchase_returns (client_id) where client_id is not null;
create index if not exists purchase_returns_supplier_idx
  on public.purchase_returns (supplier_id, created_at desc);
create index if not exists purchase_returns_created_idx
  on public.purchase_returns (created_at desc);

create sequence if not exists public.purchase_returns_number_seq;

create table if not exists public.purchase_return_items (
  id            uuid primary key default gen_random_uuid(),
  return_id     uuid not null references public.purchase_returns(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  product_name  text not null,
  quantity      integer not null check (quantity > 0 and quantity <= 100000),
  unit_cost     numeric not null default 0 check (unit_cost >= 0),
  total         numeric not null default 0 check (total >= 0),
  serials       text[],
  reason        text,
  client_id     text
);

create unique index if not exists purchase_return_items_client_id_key
  on public.purchase_return_items (client_id) where client_id is not null;
create index if not exists purchase_return_items_return_idx
  on public.purchase_return_items (return_id);
create index if not exists purchase_return_items_product_idx
  on public.purchase_return_items (product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) جلسات قسم الشراء — رمز عشوائي قصير العمر مربوط بالجهاز والموظف
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.purchase_sessions (
  token         text        primary key,
  employee_id   uuid        references public.employees(id) on delete cascade,
  employee_name text,
  role          text        not null check (role in ('ADMIN','MANAGER','CASHIER')),
  terminal_id   text        not null,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked       boolean     not null default false
);

create index if not exists purchase_sessions_employee_idx on public.purchase_sessions (employee_id);
create index if not exists purchase_sessions_expiry_idx   on public.purchase_sessions (expires_at)
  where revoked = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) سجل التدقيق — إضافة فقط، لا تعديل ولا حذف
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.purchase_audit (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       text,
  employee_id uuid,
  role        text,
  terminal_id text,
  ip          inet,
  action      text not null,
  ref_table   text,
  ref_id      uuid,
  detail      jsonb not null default '{}'::jsonb
);

create index if not exists purchase_audit_at_idx     on public.purchase_audit (at desc);
create index if not exists purchase_audit_action_idx on public.purchase_audit (action, at desc);
create index if not exists purchase_audit_ref_idx    on public.purchase_audit (ref_table, ref_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) إعدادات قسم الشراء
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.purchase_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.purchase_settings (key, value) values
  -- طريقة احتساب التكلفة: moving_average = متوسط مرجّح | last = آخر سعر شراء
  ('cost_method',            '"moving_average"'::jsonb),
  -- سياسة سعر البيع: keep = لا يتغير | margin = هامش ثابت | manual = يُحدَّد بالفاتورة
  ('price_policy',           '"manual"'::jsonb),
  ('default_margin_pct',     '20'::jsonb),
  -- تسجيل مصروف تلقائي عند الدفع نقدًا
  ('auto_expense',           'true'::jsonb),
  ('expense_category',       '"cat_purchases"'::jsonb),
  -- تحديث النواقص تلقائيًا بعد الاستلام
  ('auto_resolve_shortages', 'true'::jsonb),
  -- السماح بإنشاء منتج جديد من داخل فاتورة الشراء
  ('allow_new_products',     'true'::jsonb),
  -- عمر جلسة القسم بالساعات
  ('session_ttl_hours',      '8'::jsonb),
  -- أقصى عدد أصناف بالفاتورة الواحدة
  ('max_items_per_invoice',  '200'::jsonb),
  -- مهلة السماح بإلغاء فاتورة لغير المدير العام (بالساعات)
  ('cancel_window_hours',    '24'::jsonb)
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) المشغّلات
-- ─────────────────────────────────────────────────────────────────────────────

-- تحديث updated_at — نستخدم دالة النظام الموجودة أصلًا
drop trigger if exists suppliers_touch on public.suppliers;
create trigger suppliers_touch before update on public.suppliers
  for each row execute function public.touch_updated_at();

drop trigger if exists purchases_touch on public.purchases;
create trigger purchases_touch before update on public.purchases
  for each row execute function public.touch_updated_at();

drop trigger if exists purchase_returns_touch on public.purchase_returns;
create trigger purchase_returns_touch before update on public.purchase_returns
  for each row execute function public.touch_updated_at();

-- منع حذف الفواتير والدفعات — الإلغاء بقيد عكسي فقط
create or replace function public.purchases_append_only()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  raise exception 'سجلات الشراء لا تُحذف: استخدم الإلغاء (purchase_cancel) بدلًا من ذلك';
end;
$$;

drop trigger if exists purchases_no_delete on public.purchases;
create trigger purchases_no_delete before delete on public.purchases
  for each row execute function public.purchases_append_only();

drop trigger if exists supplier_payments_no_delete on public.supplier_payments;
create trigger supplier_payments_no_delete before delete on public.supplier_payments
  for each row execute function public.purchases_append_only();

drop trigger if exists purchase_returns_no_delete on public.purchase_returns;
create trigger purchase_returns_no_delete before delete on public.purchase_returns
  for each row execute function public.purchases_append_only();

-- سجل التدقيق: إضافة فقط
create or replace function public.purchase_audit_immutable()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  raise exception 'purchase_audit سجل تدقيق للإضافة فقط';
end;
$$;

drop trigger if exists purchase_audit_no_update on public.purchase_audit;
create trigger purchase_audit_no_update before update on public.purchase_audit
  for each row execute function public.purchase_audit_immutable();

drop trigger if exists purchase_audit_no_delete on public.purchase_audit;
create trigger purchase_audit_no_delete before delete on public.purchase_audit
  for each row execute function public.purchase_audit_immutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) تعليقات توضيحية
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.suppliers         is 'الموردون — الرصيد الموجب يعني مبلغ مستحق للمورّد علينا';
comment on table public.purchases         is 'فواتير الشراء — لا تُحذف، تُلغى بقيد عكسي يعيد المخزون والأسعار';
comment on table public.purchase_items    is 'أصناف فاتورة الشراء مع لقطة قبل/بعد للتكلفة والسعر والمخزون';
comment on table public.supplier_payments is 'دفعات وتسديدات الموردين';
comment on table public.purchase_returns  is 'مرتجعات الشراء — بضاعة راجعة للمورّد';
comment on table public.purchase_sessions is 'جلسات قسم الشراء — رمز عشوائي مربوط بالموظف والجهاز وله عمر محدد';
comment on table public.purchase_audit    is 'سجل تدقيق قسم الشراء — إضافة فقط، لا يُعدَّل ولا يُحذف';
comment on table public.purchase_settings is 'إعدادات قسم الشراء';

commit;
