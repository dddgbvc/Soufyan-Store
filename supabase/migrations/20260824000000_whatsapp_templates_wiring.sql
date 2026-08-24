-- ============================================================
-- ربط القوالب المعتمدة بالنظام التلقائي
--
-- برّا نافذة الـ٢٤ ساعة Meta ما تسمح إلا بقالب معتمد، وجوّاها النص الحر
-- مسموح وأرخص وأمرن. فكل رسالة بالطابور صارت تحمل الاثنين:
--   body            → النص الحر (يُستعمل جوّا النافذة)
--   template_name   → اسم القالب + معاملاته (يُستعمل برّاها)
-- و wa-send تختار المسار حسب حالة النافذة وقت الإرسال.
-- ============================================================

alter table public.wa_messages
  add column if not exists template_name   text,
  add column if not exists template_params jsonb,
  add column if not exists media_url       text;

comment on column public.wa_messages.template_params is
  'معاملات القالب بالترتيب {{1}},{{2}},{{3}} — مصفوفة نصوص';
comment on column public.wa_messages.media_url is
  'رابط الملف المرفق بترويسة القالب (الفاتورة PDF) — ينبني وقت الإرسال';

-- ------------------------------------------------------------
-- نافذة الـ٢٤ ساعة: مفتوحة إذا الزبون راسلنا خلال آخر ٢٤ ساعة
-- ------------------------------------------------------------
create or replace function public.wa_window_open(p_phone text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.wa_inbound
     where phone = p_phone
       and received_at > now() - interval '24 hours'
  );
$function$;

-- ------------------------------------------------------------
-- wa_queue بمعاملَي القالب
-- التوقيع القديم ينحذف حتى ما يصير تعارض بالتحميل الزائد
-- ------------------------------------------------------------
drop function if exists public.wa_queue(text, uuid, text, text, jsonb, text, uuid);

create or replace function public.wa_queue(
  p_kind        text,
  p_customer_id uuid,
  p_name        text,
  p_phone       text,
  p_vars        jsonb,
  p_ref_table   text  default null,
  p_ref_id      uuid  default null,
  p_template    text  default null,
  p_params      jsonb default null
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

  if coalesce(btrim(p_phone), '') = '' then
    return null;
  end if;

  v_phone := public.normalize_iraqi_phone(p_phone);

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

-- ------------------------------------------------------------
-- المشغّلات: تمرّر اسم القالب ومعاملاته
-- معاملات القوالب ما تقبل أسطر جديدة ولا قيم فارغة عند Meta
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
  v_total     text;
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
    v_total := to_char(coalesce(new.total_amount, 0), 'FM999,999,999');

    perform public.wa_queue(
      p_kind        => 'welcome',
      p_customer_id => new.customer_id,
      p_name        => coalesce(nullif(btrim(new.customer_name), ''), 'عزيزنا'),
      p_phone       => v_phone,
      p_vars        => jsonb_build_object(
                         'رقم_الفاتورة', coalesce(new.invoice_number, '—'),
                         'المبلغ',       v_total,
                         'المدفوع',      to_char(coalesce(new.paid_amount, 0), 'FM999,999,999'),
                         'سطر_الدين',    v_debt_line),
      p_ref_table   => 'invoices',
      p_ref_id      => new.id,
      p_template    => 'invoice_thanks',
      p_params      => jsonb_build_array(
                         coalesce(nullif(btrim(new.customer_name), ''), 'عزيزنا'),
                         coalesce(nullif(new.invoice_number, ''), '—'),
                         v_total));
  exception when others then
    raise warning 'wa_on_new_invoice failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

create or replace function public.wa_on_debt_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_phone     text;
  v_line      text;
  v_paid      text;
  v_remaining text;
  v_name      text;
begin
  begin
    select c.phone into v_phone from public.customers c where c.id = new.customer_id;

    v_name      := coalesce(nullif(btrim(new.customer_name), ''), 'عزيزنا');
    v_paid      := to_char(coalesce(new.amount_paid, 0), 'FM999,999,999');
    v_remaining := to_char(coalesce(new.remaining_debt, 0), 'FM999,999,999');

    v_line := case
                when coalesce(new.remaining_debt, 0) <= 0
                  then '✅ حسابك مصفّر، ما عليك ولا دينار.'
                else 'الدين المتبقي: ' || v_remaining || ' د.ع'
              end;

    perform public.wa_queue(
      p_kind        => 'payment',
      p_customer_id => new.customer_id,
      p_name        => v_name,
      p_phone       => v_phone,
      p_vars        => jsonb_build_object(
                         'المسدد',       v_paid,
                         'الدين_السابق', to_char(coalesce(new.previous_debt, 0), 'FM999,999,999'),
                         'المتبقي',      v_remaining,
                         'سطر_المتبقي',  v_line),
      p_ref_table   => 'debt_payments',
      p_ref_id      => new.id,
      p_template    => 'payment_received',
      p_params      => jsonb_build_array(v_name, v_paid, v_remaining));
  exception when others then
    raise warning 'wa_on_debt_payment failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

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
  v_amt text;
begin
  for v_row in
    select r from jsonb_array_elements((public.overdue_debts())->'rows') as t(r)
  loop
    v_amt := to_char((v_row->>'balance')::numeric, 'FM999,999,999');

    v_id := public.wa_queue(
      p_kind        => 'debt',
      p_customer_id => (select c.id from public.customers c
                         where c.name = v_row->>'name' and c.balance > 0 limit 1),
      p_name        => v_row->>'name',
      p_phone       => v_row->>'phone',
      p_vars        => jsonb_build_object(
                         'الدين',        v_amt,
                         'آخر_حركة',     v_row->>'last_move',
                         'أيام_التأخير', v_row->>'days_late'),
      p_ref_table   => 'customers',
      p_ref_id      => null,
      p_template    => 'debt_reminder',
      p_params      => jsonb_build_array(
                         coalesce(nullif(v_row->>'name', ''), 'عزيزنا'),
                         v_amt,
                         coalesce(v_row->>'last_move', '—')));
    if v_id is not null then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$function$;

-- ------------------------------------------------------------
-- الدفعة: تحمل معلومات القالب وحالة النافذة ورقم الفاتورة
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
    returning m.id, m.kind, m.phone, m.customer_name, m.body,
              m.template_name, m.template_params, m.ref_table, m.ref_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',              b.id,
           'kind',            b.kind,
           'phone',           b.phone,
           'name',            b.customer_name,
           'body',            b.body,
           'template_name',   b.template_name,
           'template_params', coalesce(b.template_params, '[]'::jsonb),
           'window_open',     public.wa_window_open(b.phone),
           'invoice_number',  case when b.ref_table = 'invoices'
                                   then (select i.invoice_number from public.invoices i
                                          where i.id = b.ref_id)
                              end)), '[]'::jsonb)
    into v_rows
    from bumped b;

  return jsonb_build_object('paused', false, 'mode', v_cfg.mode, 'rows', v_rows);
end;
$function$;

-- ------------------------------------------------------------
-- تخزين رابط الملف المرفق بعد بنائه وقت الإرسال
-- ------------------------------------------------------------
create or replace function public.wa_set_media_url(p_id uuid, p_url text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.wa_messages set media_url = p_url where id = p_id;
  return found;
end;
$function$;

-- ------------------------------------------------------------
-- الصلاحيات
-- ------------------------------------------------------------
revoke all on function public.wa_queue(text,uuid,text,text,jsonb,text,uuid,text,jsonb) from public;
revoke all on function public.wa_window_open(text)                                     from public;
revoke all on function public.wa_set_media_url(uuid,text)                              from public;

grant execute on function public.wa_window_open(text)        to service_role;
grant execute on function public.wa_set_media_url(uuid,text) to service_role;
