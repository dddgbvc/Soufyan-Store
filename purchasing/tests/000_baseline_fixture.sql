-- ============================================================================
--  تركيبة اختبار — نسخة مطابقة من الجداول والدوال القائمة بمشروع Supabase
--  التي يلمسها قسم الشراء. تُستعمل فقط في قاعدة اختبار محلية،
--  ولا تُشغَّل إطلاقًا على قاعدة الإنتاج.
-- ============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema public, extensions to anon, authenticated, service_role;

-- ── الجداول القائمة ─────────────────────────────────────────────────────────
create table public.categories (
  id   uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null
);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  barcode         text unique,
  name            text not null,
  category_id     uuid references public.categories(id),
  cost_price      numeric not null default 0 check (cost_price >= 0),
  selling_price   numeric not null default 0 check (selling_price >= 0),
  stock_quantity  integer not null default 0 check (stock_quantity >= 0),
  min_stock_alert integer not null default 3 check (min_stock_alert >= 0),
  has_imei        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  client_id       text
);
create unique index products_client_id_key on public.products (client_id) where client_id is not null;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text, address text,
  balance numeric default 0, credit_limit numeric default 500000,
  grace_period_days integer default 30,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  client_id text
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique, customer_id uuid references public.customers(id),
  customer_name text, customer_phone text,
  total_amount numeric default 0, paid_amount numeric default 0,
  delivery_price numeric default 0, province_name text,
  payment_type text default 'CASH' check (payment_type in ('CASH','DEBT')),
  notes text, actor text,
  created_at timestamptz default now(), client_id text
);
create unique index invoices_client_id_key on public.invoices (client_id) where client_id is not null;

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id),
  product_id uuid references public.products(id),
  product_name text not null,
  quantity integer default 1 check (quantity > 0),
  unit_price numeric default 0, discount numeric default 0, total numeric default 0,
  serials text[], client_id text
);
create unique index invoice_items_client_id_key on public.invoice_items (client_id) where client_id is not null;

create table public.shortages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  name text not null, category text,
  current_qty integer default 0, limit_qty integer default 0,
  status text default 'manual' check (status in ('urgent','warning','out-of-stock','manual')),
  is_manual boolean default false, resolved boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  client_id text
);
create unique index shortages_client_id_key on public.shortages (client_id) where client_id is not null;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null, category text,
  amount numeric not null check (amount > 0),
  actor text, created_at timestamptz default now(), client_id text
);
create unique index expenses_client_id_key on public.expenses (client_id) where client_id is not null;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, name text not null, display_name text,
  role text not null default 'CASHIER' check (role in ('ADMIN','MANAGER','CASHIER')),
  department text, avatar_url text, pin_hash text,
  status text not null default 'active' check (status in ('active','suspended')),
  pin_updated_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table public.pin_attempts (
  id bigint generated always as identity primary key,
  terminal_id text not null, ok boolean not null, at timestamptz not null default now()
);

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  return_number text unique not null, invoice_id uuid, invoice_number text,
  customer_id uuid, customer_name text, customer_phone text,
  total_amount numeric default 0,
  refund_method text default 'CASH' check (refund_method in ('CASH','DEBT','EXCHANGE')),
  reason text, notes text, actor text,
  created_at timestamptz default now(), updated_at timestamptz default now(), client_id text
);
create unique index returns_client_id_key on public.returns (client_id) where client_id is not null;

create table public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id),
  product_id uuid references public.products(id),
  product_name text not null, quantity integer default 1,
  unit_price numeric default 0, total numeric default 0,
  serials text[], condition text, reason text, client_id text
);
create unique index return_items_client_id_key on public.return_items (client_id) where client_id is not null;

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid, customer_name text,
  previous_debt numeric default 0, amount_paid numeric default 0,
  waived_amount numeric default 0, waiver_reason text,
  remaining_debt numeric default 0, is_zeroed boolean default false,
  notes text, actor text, created_at timestamptz default now(), client_id text
);
create unique index debt_payments_client_id_key on public.debt_payments (client_id) where client_id is not null;

create table public.repairs (
  id uuid primary key default gen_random_uuid(),
  ticket_no text unique, client_id text
);
create unique index repairs_client_id_key on public.repairs (client_id) where client_id is not null;

create table public.vault_entries (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  kind text not null, amount numeric not null check (amount > 0),
  note text not null, actor text not null, reverses uuid,
  prev_hash text not null, hash text not null,
  created_at timestamptz default now(), client_id text
);
create unique index vault_entries_client_id_key on public.vault_entries (client_id) where client_id is not null;

-- ── الدوال القائمة التي يعتمد عليها القسم ───────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path to 'public' as $$
begin new.updated_at = now(); return new; end; $$;

create trigger products_touch  before update on public.products  for each row execute function public.touch_updated_at();
create trigger shortages_touch before update on public.shortages for each row execute function public.touch_updated_at();

create or replace function public.request_client_info()
returns jsonb language plpgsql stable set search_path to 'public' as $$
declare h jsonb; v_ip text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then h := null; end;
  if h is null then return '{}'::jsonb; end if;
  v_ip := coalesce(nullif(h->>'cf-connecting-ip',''), nullif(h->>'x-real-ip',''),
                   nullif(split_part(coalesce(h->>'x-forwarded-for',''), ',', 1), ''));
  return jsonb_build_object('ip', v_ip, 'user_agent', left(nullif(h->>'user-agent',''),400),
                            'country', nullif(h->>'cf-ipcountry',''));
end; $$;

-- بديل صامت لإشعارات تلغرام أثناء الاختبار
create or replace function public.tg_send(p_text text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform 1;
end; $$;

create or replace function public.bot_identify(p_telegram_id bigint)
returns jsonb language sql security definer set search_path to 'public' as $$
  select jsonb_build_object('can_read', p_telegram_id = 1, 'can_write', false,
                            'label', 'اختبار', 'employee_name', 'اختبار');
$$;

create or replace function public.permissions_for(p_role text)
returns text[] language sql immutable set search_path to 'public' as $function$
  select case p_role
    when 'ADMIN' then array[
      'dashboard','pos','returns','inventory','shortages','vaults',
      'customers','analytics','settings','repairs','expenses']
    when 'MANAGER' then array[
      'dashboard','pos','returns','customers','inventory','shortages','analytics']
    else array['pos']
  end;
$function$;

create or replace function public."عرّب"("نوع" text, "قيمة" text)
returns text language sql immutable set search_path to 'public' as $function$
  select coalesce(
    case نوع
      when 'مصروف' then case قيمة
        when 'cat_delivery' then 'توصيل' when 'cat_maintenance' then 'صيانة'
        when 'cat_misc' then 'متفرقات' when 'cat_rent' then 'إيجار'
        when 'cat_salary' then 'رواتب' when 'cat_supplies' then 'مستلزمات'
        when 'cat_utilities' then 'خدمات (كهرباء وماء)' end
    end, قيمة, '—');
$function$;

create or replace function public.sync_push(p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_allowed text[] := array['products','customers','invoices','invoice_items',
                            'debt_payments','shortages','expenses','repairs',
                            'returns','return_items','vault_entries'];
begin
  if not (p_table = any(v_allowed)) then
    return jsonb_build_object('ok', false, 'reason', 'table_not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'written', 0, 'skipped', 0, 'errors', '[]'::jsonb);
end;
$function$;

-- ── بيانات تجريبية ──────────────────────────────────────────────────────────
insert into public.categories (name, slug) values ('هواتف','phones'), ('إكسسوارات','accessories');

insert into public.products (name, barcode, category_id, cost_price, selling_price,
                             stock_quantity, min_stock_alert, has_imei, client_id)
values
  ('Samsung Galaxy A55 256GB', '6004', (select id from public.categories where slug='phones'),
   480000, 565000, 2, 3, true, 'DEMO_p04'),
  ('Infinix Hot 40i 128GB', '6005', (select id from public.categories where slug='phones'),
   145000, 190000, 11, 4, true, 'DEMO_p05'),
  ('واقي شاشة زجاجي', '7001', (select id from public.categories where slug='accessories'),
   3000, 7000, 0, 5, false, 'DEMO_p06');

insert into public.shortages (product_id, name, category, current_qty, limit_qty, status, is_manual, resolved)
values
  ((select id from public.products where barcode='6004'), 'Samsung Galaxy A55 256GB', 'هواتف', 2, 3, 'warning', false, false),
  ((select id from public.products where barcode='7001'), 'واقي شاشة زجاجي', 'إكسسوارات', 0, 5, 'out-of-stock', false, false);

insert into public.employees (name, display_name, role, pin_hash, status) values
  ('سفيان يوسف',  'سفيان',  'ADMIN',
   encode(extensions.digest('SOUFYAN-PIN-v1:482913', 'sha256'), 'hex'), 'active'),
  ('أنس سفيان',   'أنس',    'MANAGER',
   encode(extensions.digest('SOUFYAN-PIN-v1:350716', 'sha256'), 'hex'), 'active'),
  ('محمد إبراهيم','محمد',   'CASHIER',
   encode(extensions.digest('SOUFYAN-PIN-v1:907245', 'sha256'), 'hex'), 'active');

-- مبيعات آخر ٣٠ يومًا (لحساب سرعة البيع بشاشة النواقص)
insert into public.invoices (invoice_number, total_amount, paid_amount, client_id)
values ('900001', 565000, 565000, 'inv_test_1');
insert into public.invoice_items (invoice_id, product_id, product_name, quantity, unit_price, total, client_id)
values ((select id from public.invoices where invoice_number='900001'),
        (select id from public.products where barcode='6004'),
        'Samsung Galaxy A55 256GB', 4, 565000, 2260000, 'ii_test_1');
