-- ============================================================
-- نظام رسائل واتساب التلقائية
--
-- ثلاث أنواع رسائل تنبني تلقائياً:
--   welcome  — شكر بعد كل فاتورة بيع
--   payment  — تأكيد بعد كل تسديد دين
--   debt     — تذكير للزبائن المتأخرين عن مهلة السداد
--
-- ⚠ مهم: واتساب ما يسمح بالإرسال الآلي إلا عبر WhatsApp Cloud API
-- الرسمي (حساب Meta Business + قوالب موافق عليها). أي مكتبة غير
-- رسمية تعرّض رقم المحل للحظر الدائم. فالنظام يشتغل بوضعين:
--
--   وضع 'link'  (شغال من هسه، بلا أي إعداد):
--       الرسالة تنبني وتنخزن، والبوت يدزلك رابط جاهز بتلغرام —
--       ضغطة وحدة ويفتح واتساب والرسالة مكتوبة، تدزها بنفسك.
--
--   وضع 'cloud' (تلقائي كامل):
--       يشتغل لحاله أول ما تنحط أسرار whatsapp_token و
--       whatsapp_phone_id بالخزنة (vault).
--
-- الطابور والقوالب والمشغّلات نفسها ما تتغير بين الوضعين.
-- ============================================================

-- ------------------------------------------------------------
-- تنسيق أرقام الهواتف العراقية
-- 07701234567 / 7701234567 / +9647701234567 / ٠٧٧٠… → 9647701234567
-- أي رقم مو صالح يرجّع NULL
-- ------------------------------------------------------------
create or replace function public.normalize_iraqi_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v text;
begin
  if p_phone is null then return null; end if;

  -- أرقام عربية/فارسية → لاتينية، وبعدين نشيل أي شي مو رقم
  v := translate(p_phone,
                 '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
                 '01234567890123456789');
  v := regexp_replace(v, '[^0-9]', '', 'g');

  if v like '00964%' then v := substring(v from 3); end if;
  if v like '0964%'  then v := substring(v from 2); end if;

  if v like '964%' then
    -- خلاص بالصيغة الدولية
    null;
  elsif v like '07%' and length(v) = 11 then
    v := '964' || substring(v from 2);
  elsif v like '7%' and length(v) = 10 then
    v := '964' || v;
  else
    return null;
  end if;

  if v ~ '^9647[0-9]{9}$' then
    return v;
  end if;
  return null;
end;
$function$;

-- ------------------------------------------------------------
-- قوالب الرسائل — تكدر تعدّل النص بأي وكت بلا ما تلمس الكود
-- ------------------------------------------------------------
create table if not exists public.wa_templates (
  kind       text primary key check (kind in ('welcome','payment','debt')),
  enabled    boolean not null default true,
  body       text not null,
  updated_at timestamptz not null default now()
);

alter table public.wa_templates enable row level security;

comment on table public.wa_templates is
  'قوالب رسائل واتساب. المتغيرات بين قوسين {} تنبدل بالقيم الحقيقية وقت الإرسال';

insert into public.wa_templates (kind, body) values
('welcome',
'أهلاً {اسم} 🌟
شكراً لثقتك بمركز سفيان للهواتف.

🧾 فاتورة رقم {رقم_الفاتورة}
المبلغ: {المبلغ} د.ع
{سطر_الدين}
أي استفسار أو مشكلة بالجهاز إحنا بالخدمة.
📍 سامراء — الحويش — الشارع الرئيسي'),

('payment',
'شكراً {اسم} 🙏
استلمنا منك {المسدد} د.ع.

{سطر_المتبقي}
مركز سفيان للهواتف'),

('debt',
'السلام عليكم {اسم} 🌸
تذكير ودّي: عليك مبلغ {الدين} د.ع، وآخر حركة على حسابك بتاريخ {آخر_حركة}.

إذا تحب تسدد أو تقسّط راجعنا بالمحل أو رد على هذي الرسالة.
مركز سفيان للهواتف — سامراء، الحويش')
on conflict (kind) do nothing;

-- ------------------------------------------------------------
-- طابور الرسائل
-- ------------------------------------------------------------
create table if not exists public.wa_messages (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('welcome','payment','debt')),
  customer_id   uuid references public.customers(id) on delete set null,
  customer_name text,
  phone_raw     text,
  phone         text,          -- بالصيغة الدولية 9647…
  body          text not null,
  status        text not null default 'pending'
                check (status in ('pending','sent','linked','skipped','failed')),
  reason        text,
  provider      text,          -- 'cloud' أو 'link'
  ref_table     text,
  ref_id        uuid,
  attempts      int not null default 0,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

alter table public.wa_messages enable row level security;

create index if not exists wa_messages_pending_idx
  on public.wa_messages (created_at) where status = 'pending';
create index if not exists wa_messages_customer_idx
  on public.wa_messages (customer_id, kind, created_at desc);
create index if not exists wa_messages_created_idx
  on public.wa_messages (created_at desc);

comment on table public.wa_messages is
  'طابور رسائل واتساب: pending تنتظر، sent انرسلت آلياً، linked انرسل رابطها للمالك، skipped انطنشت (رقم غلط مثلاً)';

-- ------------------------------------------------------------
-- تعبئة القالب
-- ------------------------------------------------------------
create or replace function public.wa_render(p_body text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_out text := p_body;
  k     text;
begin
  for k in select jsonb_object_keys(coalesce(p_vars, '{}'::jsonb)) loop
    v_out := replace(v_out, '{' || k || '}', coalesce(p_vars->>k, ''));
  end loop;
  -- أي متغير ما انبدل ينشال، وأي سطر فاضي زائد ينضغط
  v_out := regexp_replace(v_out, '\{[^}]*\}', '', 'g');
  v_out := regexp_replace(v_out, '\n{3,}', E'\n\n', 'g');
  return btrim(v_out);
end;
$function$;

-- ------------------------------------------------------------
-- إضافة رسالة للطابور
-- ترجّع id الرسالة، أو NULL إذا القالب مطفي أو ماكو رقم أصلاً
-- ------------------------------------------------------------
create or replace function public.wa_queue(
  p_kind        text,
  p_customer_id uuid,
  p_name        text,
  p_phone       text,
  p_vars        jsonb,
  p_ref_table   text default null,
  p_ref_id      uuid default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tpl   public.wa_templates%rowtype;
  v_phone text;
  v_body  text;
  v_id    uuid;
begin
  select * into v_tpl from public.wa_templates where kind = p_kind;
  if not found or not v_tpl.enabled then
    return null;
  end if;

  -- ماكو رقم إطلاقاً (زبون سريع) — ما نسجل شي حتى ما يمتلي الطابور
  if coalesce(btrim(p_phone), '') = '' then
    return null;
  end if;

  v_phone := public.normalize_iraqi_phone(p_phone);

  -- تذكير الدين: مرة وحدة كل ٧ أيام للزبون نفسه
  if p_kind = 'debt' and p_customer_id is not null then
    if exists (
      select 1 from public.wa_messages
      where kind = 'debt'
        and customer_id = p_customer_id
        and status <> 'failed'
        and created_at > now() - interval '7 days'
    ) then
      return null;
    end if;
  end if;

  v_body := public.wa_render(
              v_tpl.body,
              coalesce(p_vars, '{}'::jsonb) || jsonb_build_object('اسم', coalesce(p_name, 'عزيزنا'))
            );

  insert into public.wa_messages
    (kind, customer_id, customer_name, phone_raw, phone, body, ref_table, ref_id, status, reason)
  values
    (p_kind, p_customer_id, p_name, p_phone, v_phone, v_body, p_ref_table, p_ref_id,
     case when v_phone is null then 'skipped' else 'pending' end,
     case when v_phone is null then 'رقم الهاتف مو صالح' else null end)
  returning id into v_id;

  return v_id;
end;
$function$;

-- ------------------------------------------------------------
-- مشغّل: فاتورة جديدة ← رسالة شكر
-- ملفوف بـexception حتى أي خلل بالواتساب ما يمنع تسجيل الفاتورة
-- ------------------------------------------------------------
create or replace function public.wa_on_new_invoice()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_phone     text;
  v_remaining numeric;
  v_debt_line text;
begin
  begin
    v_phone := coalesce(
                 nullif(btrim(new.customer_phone), ''),
                 (select c.phone from public.customers c where c.id = new.customer_id));

    v_remaining := coalesce(new.total_amount, 0) - coalesce(new.paid_amount, 0);
    v_debt_line := case when v_remaining > 0
                        then '⚠️ المتبقي عليك: ' ||
                             to_char(v_remaining, 'FM999,999,999') || ' د.ع' || E'\n'
                        else '' end;

    perform public.wa_queue(
      'welcome',
      new.customer_id,
      coalesce(nullif(btrim(new.customer_name), ''), 'عزيزنا'),
      v_phone,
      jsonb_build_object(
        'رقم_الفاتورة', coalesce(new.invoice_number, '—'),
        'المبلغ',       to_char(coalesce(new.total_amount, 0), 'FM999,999,999'),
        'المدفوع',      to_char(coalesce(new.paid_amount, 0), 'FM999,999,999'),
        'سطر_الدين',    v_debt_line
      ),
      'invoices', new.id);
  exception when others then
    raise warning 'wa_on_new_invoice failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

drop trigger if exists trg_wa_new_invoice on public.invoices;
create trigger trg_wa_new_invoice
  after insert on public.invoices
  for each row execute function public.wa_on_new_invoice();

-- ------------------------------------------------------------
-- مشغّل: تسديد دين ← رسالة تأكيد
-- ------------------------------------------------------------
create or replace function public.wa_on_debt_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_phone text;
  v_line  text;
begin
  begin
    select c.phone into v_phone from public.customers c where c.id = new.customer_id;

    v_line := case
                when coalesce(new.remaining_debt, 0) <= 0
                  then '✅ حسابك مصفّر، ما عليك ولا دينار.'
                else 'الدين المتبقي: ' ||
                     to_char(new.remaining_debt, 'FM999,999,999') || ' د.ع'
              end;

    perform public.wa_queue(
      'payment',
      new.customer_id,
      coalesce(nullif(btrim(new.customer_name), ''), 'عزيزنا'),
      v_phone,
      jsonb_build_object(
        'المسدد',        to_char(coalesce(new.amount_paid, 0), 'FM999,999,999'),
        'الدين_السابق',  to_char(coalesce(new.previous_debt, 0), 'FM999,999,999'),
        'المتبقي',       to_char(coalesce(new.remaining_debt, 0), 'FM999,999,999'),
        'سطر_المتبقي',   v_line
      ),
      'debt_payments', new.id);
  exception when others then
    raise warning 'wa_on_debt_payment failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

drop trigger if exists trg_wa_debt_payment on public.debt_payments;
create trigger trg_wa_debt_payment
  after insert on public.debt_payments
  for each row execute function public.wa_on_debt_payment();

-- ------------------------------------------------------------
-- تذكيرات الديون — تنبني من نفس منطق overdue_debts()
-- ------------------------------------------------------------
create or replace function public.wa_queue_overdue()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row jsonb;
  v_n   int := 0;
  v_id  uuid;
begin
  for v_row in
    select r from jsonb_array_elements((public.overdue_debts())->'rows') as t(r)
  loop
    v_id := public.wa_queue(
      'debt',
      (select c.id from public.customers c
        where c.name = v_row->>'name' and c.balance > 0 limit 1),
      v_row->>'name',
      v_row->>'phone',
      jsonb_build_object(
        'الدين',      to_char((v_row->>'balance')::numeric, 'FM999,999,999'),
        'آخر_حركة',   v_row->>'last_move',
        'أيام_التأخير', v_row->>'days_late'
      ),
      'customers', null);
    if v_id is not null then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$function$;

-- ------------------------------------------------------------
-- الإعدادات: الوضع، الأسرار، ساعات الهدوء
-- ------------------------------------------------------------
create or replace function public.wa_config()
returns table(mode text, token text, phone_id text, api_version text,
              quiet_from int, quiet_to int, batch_size int)
language sql
security definer
set search_path to 'public', 'vault'
as $function$
  with s as (
    select coalesce((select value from public.bot_settings where key = 'whatsapp'), '{}'::jsonb) as v
  ),
  k as (
    select (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_token')    as t,
           (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_phone_id') as p
  )
  select
    case when k.t is not null and k.p is not null
              and coalesce(s.v->>'mode', 'auto') <> 'link'
         then 'cloud' else 'link' end,
    k.t, k.p,
    coalesce(s.v->>'api_version', 'v21.0'),
    coalesce((s.v->>'quiet_from')::int, 9),
    coalesce((s.v->>'quiet_to')::int, 21),
    coalesce((s.v->>'batch_size')::int, 10)
  from s, k;
$function$;

-- ------------------------------------------------------------
-- سحب دفعة للإرسال — يحترم ساعات الهدوء ويزيد عداد المحاولات
-- ------------------------------------------------------------
create or replace function public.wa_next_batch(p_limit int default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hour  int := extract(hour from now() at time zone 'Asia/Baghdad');
  v_cfg   record;
  v_rows  jsonb;
  v_limit int;
begin
  select * into v_cfg from public.wa_config();

  if v_hour < v_cfg.quiet_from or v_hour >= v_cfg.quiet_to then
    return jsonb_build_object(
      'paused', true,
      'reason', format('ساعات هدوء (الإرسال من %s صباحاً لـ%s مساءً بغداد)',
                       v_cfg.quiet_from, v_cfg.quiet_to - 12),
      'mode', v_cfg.mode,
      'rows', '[]'::jsonb);
  end if;

  v_limit := greatest(coalesce(p_limit, v_cfg.batch_size), 1);

  with picked as (
    select id from public.wa_messages
     where status = 'pending' and attempts < 3
     order by created_at
     limit v_limit
     for update skip locked
  ),
  bumped as (
    update public.wa_messages m
       set attempts = m.attempts + 1
      from picked p
     where m.id = p.id
    returning m.id, m.kind, m.phone, m.customer_name, m.body
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',    id,
           'kind',  kind,
           'phone', phone,
           'name',  customer_name,
           'body',  body)), '[]'::jsonb)
    into v_rows
    from bumped;

  return jsonb_build_object('paused', false, 'mode', v_cfg.mode, 'rows', v_rows);
end;
$function$;

-- ------------------------------------------------------------
-- تعليم نتيجة الإرسال
-- ------------------------------------------------------------
create or replace function public.wa_mark(
  p_id       uuid,
  p_status   text,
  p_provider text default null,
  p_reason   text default null
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_status not in ('sent','linked','failed','skipped','pending') then
    raise exception 'invalid status %', p_status using errcode = '22023';
  end if;

  update public.wa_messages
     set status   = p_status,
         provider = coalesce(p_provider, provider),
         reason   = p_reason,
         sent_at  = case when p_status in ('sent','linked') then now() else sent_at end
   where id = p_id;

  return found;
end;
$function$;

-- ------------------------------------------------------------
-- ملخص للبوت (أمر /واتساب)
-- ------------------------------------------------------------
create or replace function public.wa_stats(p_days int default 7)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'mode',    (select mode from public.wa_config()),
    'pending', (select count(*) from public.wa_messages where status = 'pending'),
    'by_status', coalesce((
      select jsonb_object_agg(status, n) from (
        select status, count(*) n
        from public.wa_messages
        where created_at >= now() - make_interval(days => greatest(coalesce(p_days,7),1))
        group by status
      ) s), '{}'::jsonb),
    'bad_numbers', coalesce((
      select jsonb_agg(jsonb_build_object('name', customer_name, 'phone', phone_raw))
      from (
        select distinct customer_name, phone_raw
        from public.wa_messages
        where status = 'skipped' and reason = 'رقم الهاتف مو صالح'
        limit 10
      ) b), '[]'::jsonb)
  );
$function$;

-- ------------------------------------------------------------
-- إطلاق المرسل (نفس أسلوب tg_trigger_backup)
-- ------------------------------------------------------------
create or replace function public.wa_trigger_send()
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault', 'net'
as $function$
declare
  v_secret text;
  v_req    bigint;
begin
  if not exists (select 1 from public.wa_messages where status = 'pending') then
    return null;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'telegram_webhook_secret';

  if v_secret is null then
    raise warning 'telegram_webhook_secret missing';
    return null;
  end if;

  select net.http_post(
    url     := 'https://tyfidwamnlraysqrfdgb.supabase.co/functions/v1/wa-send',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', v_secret),
    body    := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 60000
  ) into v_req;

  return v_req;
end;
$function$;

-- ------------------------------------------------------------
-- الصلاحيات — كلها للسيرفر فقط، ماكو وصول من anon
-- ------------------------------------------------------------
revoke all on function public.wa_queue(text,uuid,text,text,jsonb,text,uuid) from public;
revoke all on function public.wa_queue_overdue()                            from public;
revoke all on function public.wa_config()                                   from public;
revoke all on function public.wa_next_batch(int)                            from public;
revoke all on function public.wa_mark(uuid,text,text,text)                  from public;
revoke all on function public.wa_stats(int)                                 from public;
revoke all on function public.wa_trigger_send()                             from public;
revoke all on function public.normalize_iraqi_phone(text)                   from public;
revoke all on function public.wa_render(text,jsonb)                         from public;

grant execute on function public.wa_config()                to service_role;
grant execute on function public.wa_next_batch(int)         to service_role;
grant execute on function public.wa_mark(uuid,text,text,text) to service_role;
grant execute on function public.wa_stats(int)              to service_role;
grant execute on function public.wa_queue_overdue()         to service_role;

-- كل ١٠ دقائق: يدز اللي بالطابور (وما يسوي شي إذا الطابور فارغ)
select cron.unschedule(jobid) from cron.job where jobname = 'wa-send';
select cron.schedule('wa-send', '*/10 * * * *', $$select public.wa_trigger_send();$$);
