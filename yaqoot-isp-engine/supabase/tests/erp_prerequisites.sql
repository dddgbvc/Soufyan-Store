-- ===========================================================================
-- عقد الاعتماد على ياقوت ERP — فيكستشر للاختبار فقط
-- ===========================================================================
-- هذا الملف ليس هجرة ولا يُطبَّق على قاعدة الإنتاج. وظيفته مزدوجة:
--
--   1) يُنشئ في قاعدة محلية فارغة كل ما تعتمد عليه وحدة الإنترنت من نظام
--      ياقوت القائم، حتى نتحقق من هجرات الوحدة قبل لمس الإنتاج.
--   2) يوثّق بدقة السطح الذي تعتمد عليه الوحدة. أي تغيير في النظام الأم
--      على هذه الجداول/الدوال يكسر الوحدة، وهذا الملف هو قائمة الفحص.
--
-- التعاريف منسوخة كما هي من قاعدة الإنتاج وقت كتابة الوحدة.
-- ===========================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- بديل مبسّط لـ auth.uid() الذي توفره Supabase.
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;

-- --------------------------------------------------------------------------
-- الجداول
-- --------------------------------------------------------------------------

create table if not exists public.employees (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid,
  name           text not null,
  display_name   text,
  role           text not null default 'CASHIER',
  department     text,
  avatar_url     text,
  pin_hash       text,
  status         text not null default 'active',
  pin_updated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.customers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  phone             text,
  address           text,
  balance           numeric not null default 0,
  credit_limit      numeric not null default 500000,
  grace_period_days integer not null default 30,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  client_id         text
);

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text,
  customer_id    uuid references public.customers(id),
  customer_name  text,
  customer_phone text,
  total_amount   numeric not null default 0,
  paid_amount    numeric not null default 0,
  delivery_price numeric not null default 0,
  province_name  text,
  payment_type   text not null default 'CASH',
  notes          text,
  actor          text,
  created_at     timestamptz not null default now(),
  client_id      text
);

create table if not exists public.invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  product_id   uuid,
  product_name text not null,
  quantity     integer not null default 1,
  unit_price   numeric not null default 0,
  discount     numeric not null default 0,
  total        numeric not null default 0,
  serials      text[],
  client_id    text
);

create table if not exists public.pin_attempts (
  id          bigint generated always as identity primary key,
  terminal_id text not null,
  ok          boolean not null,
  at          timestamptz not null default now(),
  ip          inet,
  user_agent  text,
  device      text,
  os          text
);

create table if not exists public.security_events (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  event       text not null,
  outcome     text not null default 'ok',
  auth_uid    uuid,
  employee_id uuid,
  terminal_id text,
  ip          inet,
  user_agent  text,
  detail      jsonb not null default '{}'::jsonb
);

create table if not exists public.rate_limits (
  bucket  text not null,
  subject text not null,
  at      timestamptz not null default now()
);

create table if not exists public.wa_templates (
  kind       text primary key,
  enabled    boolean not null default true,
  body       text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.wa_messages (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,
  customer_id     uuid,
  customer_name   text,
  phone_raw       text,
  phone           text,
  body            text not null,
  status          text not null default 'pending',
  reason          text,
  provider        text,
  ref_table       text,
  ref_id          uuid,
  attempts        integer not null default 0,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  provider_msg_id text,
  delivered_at    timestamptz,
  read_at         timestamptz,
  template_name   text,
  template_params jsonb,
  media_url       text
);

-- --------------------------------------------------------------------------
-- الدوال (منسوخة من الإنتاج)
-- --------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.scrub_secrets(p jsonb)
returns jsonb language plpgsql immutable set search_path to 'public' as $function$
declare v_out jsonb;
begin
  if p is null then return null; end if;

  if jsonb_typeof(p) = 'array' then
    select coalesce(jsonb_agg(public.scrub_secrets(e)), '[]'::jsonb) into v_out
    from jsonb_array_elements(p) e;
    return v_out;
  end if;

  if jsonb_typeof(p) = 'object' then
    select coalesce(jsonb_object_agg(k, public.scrub_secrets(v)), '{}'::jsonb) into v_out
    from jsonb_each(p) as t(k, v)
    where lower(k) not in (
      'pin_hash', 'token', 'secret', 'secrets', 'decrypted_secret',
      'bot_token', 'ai_key', 'webhook_secret', 'password', 'api_key',
      'service_key', 'access_token', 'refresh_token')
      and k not in ('رمز_الدخول', 'كلمة_السر', 'السر', 'التوكن', 'المفتاح_السري');
    return v_out;
  end if;

  return p;
end;
$function$;

create or replace function public.request_client_info()
returns jsonb language plpgsql stable set search_path to 'public' as $function$
declare h jsonb; v_ip text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then h := null;
  end;
  if h is null then return '{}'::jsonb; end if;
  v_ip := coalesce(
    nullif(h->>'cf-connecting-ip', ''),
    nullif(h->>'x-real-ip', ''),
    nullif(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), ''));
  return jsonb_build_object(
    'ip', v_ip,
    'user_agent', left(nullif(h->>'user-agent', ''), 400),
    'country', nullif(h->>'cf-ipcountry', ''),
    'terminal_id', left(nullif(h->>'x-terminal-id', ''), 80),
    'client_info', left(nullif(h->>'x-client-info', ''), 80));
end;
$function$;

create or replace function public.pin_attempts_blocked(p_terminal_id text, p_ip inet)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select
    (select count(*) from public.pin_attempts
      where terminal_id = p_terminal_id and ok = false and at > now() - interval '2 minutes') >= 5
    or (p_ip is not null and
     (select count(*) from public.pin_attempts
       where ip = p_ip and ok = false and at > now() - interval '10 minutes') >= 10);
$function$;

create or replace function public.employee_by_pin(p_pin_hash text)
returns public.employees language plpgsql stable security definer
set search_path to 'public', 'extensions' as $function$
declare v_emp public.employees%rowtype;
begin
  if p_pin_hash is null or length(p_pin_hash) < 32 or length(p_pin_hash) > 128
     or p_pin_hash !~ '^[0-9a-fA-F]+$' then
    return null;
  end if;
  select * into v_emp from public.employees
   where status = 'active' and pin_hash is not null and pin_hash like '$2%'
     and pin_hash = extensions.crypt(p_pin_hash, pin_hash)
   limit 1;
  return v_emp;
end;
$function$;

create or replace function public.log_security_event(
  p_event text, p_outcome text default 'ok', p_employee_id uuid default null,
  p_terminal_id text default null, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_info jsonb; v_ip inet;
begin
  v_info := public.request_client_info();
  begin v_ip := nullif(v_info->>'ip','')::inet; exception when others then v_ip := null; end;
  insert into public.security_events
    (event, outcome, auth_uid, employee_id, terminal_id, ip, user_agent, detail)
  values (
    left(p_event, 80),
    case when p_outcome in ('ok','fail','blocked') then p_outcome else 'ok' end,
    auth.uid(), p_employee_id,
    left(coalesce(p_terminal_id, v_info->>'terminal_id'), 80),
    v_ip, left(v_info->>'user_agent', 400),
    coalesce(p_detail, '{}'::jsonb)
      - 'password' - 'pin' - 'pin_hash' - 'otp' - 'code' - 'token'
      - 'access_token' - 'refresh_token' - 'secret');
end;
$function$;

create or replace function public.audit_set_actor(p_ctx jsonb)
returns void language plpgsql set search_path to 'public' as $function$
begin
  perform set_config('app.audit_actor', coalesce(p_ctx, '{}'::jsonb)::text, true);
exception when others then null;
end;
$function$;

create or replace function public.normalize_iraqi_phone(p_phone text)
returns text language plpgsql immutable set search_path to 'public' as $function$
declare v text;
begin
  if p_phone is null then return null; end if;
  v := translate(p_phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  v := regexp_replace(v, '[^0-9]', '', 'g');
  if v like '00964%' then v := substring(v from 3); end if;
  if v like '0964%'  then v := substring(v from 2); end if;
  if v like '964%' then null;
  elsif v like '07%' and length(v) = 11 then v := '964' || substring(v from 2);
  elsif v like '7%' and length(v) = 10 then v := '964' || v;
  else return null;
  end if;
  if v ~ '^9647[0-9]{9}$' then return v; end if;
  return null;
end;
$function$;

create or replace function public.wa_render(p_body text, p_vars jsonb)
returns text language plpgsql immutable set search_path to 'public' as $function$
declare v_out text := p_body; k text;
begin
  for k in select jsonb_object_keys(coalesce(p_vars, '{}'::jsonb)) loop
    v_out := replace(v_out, '{' || k || '}', coalesce(p_vars->>k, ''));
  end loop;
  v_out := regexp_replace(v_out, '\{[^}]*\}', '', 'g');
  v_out := regexp_replace(v_out, '\n{3,}', E'\n\n', 'g');
  return btrim(v_out);
end;
$function$;

create or replace function public.wa_queue(
  p_kind text, p_customer_id uuid, p_name text, p_phone text, p_vars jsonb,
  p_ref_table text default null, p_ref_id uuid default null,
  p_template text default null, p_params jsonb default null)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_tpl public.wa_templates%rowtype; v_phone text; v_body text; v_id uuid;
begin
  select * into v_tpl from public.wa_templates where kind = p_kind;
  if not found or not v_tpl.enabled then return null; end if;
  if coalesce(btrim(p_phone), '') = '' then return null; end if;

  v_phone := public.normalize_iraqi_phone(p_phone);
  v_body := public.wa_render(v_tpl.body,
              coalesce(p_vars, '{}'::jsonb) ||
              jsonb_build_object('اسم', coalesce(p_name, 'عزيزنا')));

  insert into public.wa_messages
    (kind, customer_id, customer_name, phone_raw, phone, body,
     template_name, template_params, ref_table, ref_id, status, reason)
  values
    (p_kind, p_customer_id, p_name, p_phone, v_phone, v_body,
     p_template, p_params, p_ref_table, p_ref_id,
     case when v_phone is null then 'skipped' else 'pending' end,
     case when v_phone is null then 'رقم الهاتف مو صالح' else null end)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public."بغداد"(t timestamptz)
returns text language sql immutable set search_path to 'public' as $function$
  select to_char(t at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI');
$function$;

create or replace function public."بغداد_يوم"(t timestamptz)
returns date language sql immutable set search_path to 'public' as $function$
  select (t at time zone 'Asia/Baghdad')::date;
$function$;

-- المشغّل الذي يصفّ إيصال بيع الهواتف على كل فاتورة — سبب وجود
-- استبدال الرسالة داخل isp_renewal_post().
create or replace function public.wa_on_new_invoice()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_phone text; v_remaining numeric;
begin
  begin
    v_phone := coalesce(nullif(btrim(new.customer_phone), ''),
                 (select c.phone from public.customers c where c.id = new.customer_id));
    v_remaining := coalesce(new.total_amount, 0) - coalesce(new.paid_amount, 0);
    perform public.wa_queue(
      p_kind => 'welcome', p_customer_id => new.customer_id,
      p_name => coalesce(nullif(btrim(new.customer_name), ''), 'عزيزنا'),
      p_phone => v_phone,
      p_vars => jsonb_build_object(
        'رقم_الفاتورة', coalesce(new.invoice_number, '—'),
        'المبلغ', to_char(coalesce(new.total_amount, 0), 'FM999,999,999'),
        'المدفوع', to_char(coalesce(new.paid_amount, 0), 'FM999,999,999'),
        'سطر_الدين', case when v_remaining > 0 then 'المتبقي' else '' end),
      p_ref_table => 'invoices', p_ref_id => new.id);
  exception when others then
    raise warning 'wa_on_new_invoice failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

drop trigger if exists trg_wa_new_invoice on public.invoices;
create trigger trg_wa_new_invoice after insert on public.invoices
  for each row execute function public.wa_on_new_invoice();

insert into public.wa_templates (kind, enabled, body) values
  ('welcome', true, 'أهلاً {اسم} — فاتورة {رقم_الفاتورة} بمبلغ {المبلغ} د.ع. {سطر_الدين}')
on conflict (kind) do nothing;

-- الأدوار التي تفترضها Supabase.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;
