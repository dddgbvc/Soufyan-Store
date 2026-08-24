-- ════════════════════════════════════════════════════════════════════════
--  الجزء ٣ — تعريف الفاعل الحقيقي للعمليات الي تجي عبر وسيط
--  (بوت تلغرام يشتغل من وظيفة طرفية، وقسم الشراء يشتغل برمز جلسة)
--  بدون هذا الجزء، الحركة تنكتب بـ IP الخادم بدون اسم منو سوّاها.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.audit_set_telegram_actor(p_telegram_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_name text;
  v_emp  uuid;
begin
  select coalesce(e.display_name, t.label), t.employee_id
    into v_name, v_emp
  from public.telegram_users t
  left join public.employees e on e.id = t.employee_id
  where t.telegram_id = p_telegram_id;

  perform public.audit_set_actor(jsonb_build_object(
    'source',      'تلغرام',
    'actor',       coalesce(v_name, 'مستخدم تلغرام ' || p_telegram_id),
    'employee_id', v_emp,
    'telegram_id', p_telegram_id,
    'device_type', 'تلغرام',
    'app',         'بوت تلغرام'));
exception when others then
  null;
end;
$function$;

comment on function public.audit_set_telegram_actor(bigint) is
  'تربط الحركة الحالية بمستخدم تلغرام الحقيقي بدل خادم الوظيفة الطرفية';

-- ١) قسم الشراء — كل دواله تمرّ من purchase_guard
create or replace function public.purchase_guard(p_token text, p_min_role text default 'MANAGER'::text)
returns purchase_sessions
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if not exists (select 1 from public.employees
                 where id = v_s.employee_id and status = 'active') then
    update public.purchase_sessions set revoked = true where token = p_token;
    raise exception 'الحساب موقوف' using errcode = '28000';
  end if;

  update public.purchase_sessions set last_seen_at = now() where token = p_token;

  -- سياق التدقيق: منو الموظف وأي طرفية (الـ IP يجي من ترويسات الطلب الحالي)
  perform public.audit_set_actor(jsonb_build_object(
    'source',      'قسم الشراء',
    'actor',       v_s.employee_name,
    'employee_id', v_s.employee_id,
    'terminal_id', v_s.terminal_id));

  return v_s;
end;
$function$;

-- ٢) تسديد دين من البوت
create or replace function public.bot_record_debt_payment(
  p_telegram_id bigint, p_customer_id uuid, p_amount numeric, p_source text default 'تلغرام'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id       jsonb;
  v_cust     customers%rowtype;
  v_hard_max numeric;
  v_remain   numeric;
  v_actor    text;
  v_client   text;
  v_now      timestamptz := now();
begin
  -- 1. authorisation
  v_id := bot_identify(p_telegram_id);
  if not (v_id->>'can_write')::boolean then
    return jsonb_build_object('ok', false, 'error', 'غير مخوّل بالتسديد');
  end if;
  v_actor := coalesce(v_id->>'employee_name', v_id->>'label');

  perform public.audit_set_telegram_actor(p_telegram_id);

  -- 2. amount sanity
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'المبلغ غير صالح');
  end if;

  select (value#>>'{}')::numeric into v_hard_max
  from bot_settings where key = 'hard_max';

  if p_amount > coalesce(v_hard_max, 2000000) then
    return jsonb_build_object('ok', false,
      'error', 'المبلغ يتجاوز الحد الأقصى المسموح عبر البوت');
  end if;

  -- 3. lock the customer row so two payments can't race
  select * into v_cust from customers where id = p_customer_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'الزبون غير موجود');
  end if;

  if p_amount > v_cust.balance then
    return jsonb_build_object('ok', false,
      'error', format('المبلغ أكبر من الدين. الدين الحالي %s د.ع',
                      to_char(v_cust.balance, 'FM999,999,999')));
  end if;

  v_remain := v_cust.balance - p_amount;
  v_client := 'TG-' || extract(epoch from v_now)::bigint || '-' ||
              substr(md5(random()::text), 1, 6);

  -- 4. write
  insert into debt_payments (
    customer_id, customer_name, previous_debt, amount_paid, waived_amount,
    remaining_debt, is_zeroed, notes, actor, client_id, created_at
  ) values (
    v_cust.id, v_cust.name, v_cust.balance, p_amount, 0,
    v_remain, v_remain = 0,
    format('سُجّل من %s بواسطة %s', p_source, v_actor),
    v_actor, v_client, v_now
  );

  update customers set balance = v_remain where id = v_cust.id;

  return jsonb_build_object(
    'ok', true,
    'customer', v_cust.name,
    'previous', v_cust.balance,
    'amount', p_amount,
    'remaining', v_remain,
    'zeroed', v_remain = 0,
    'actor', v_actor,
    'at', to_char(v_now at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI')
  );
end;
$function$;

-- ٣) استلام طلب مؤكَّد من البوت
create or replace function public.bot_take_pending(p_token text, p_telegram_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row bot_pending_actions%rowtype;
begin
  perform public.audit_set_telegram_actor(p_telegram_id);

  select * into v_row from bot_pending_actions
   where token = p_token and status = 'pending' for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'الطلب غير موجود أو منتهي');
  end if;
  if v_row.telegram_id <> p_telegram_id then
    return jsonb_build_object('ok', false, 'error', 'هذا الطلب مو مالك');
  end if;
  if v_row.expires_at < now() then
    update bot_pending_actions set status = 'expired' where token = p_token;
    return jsonb_build_object('ok', false, 'error', 'انتهت مهلة الطلب (10 دقائق)');
  end if;

  update bot_pending_actions set status = 'consumed' where token = p_token;
  return jsonb_build_object('ok', true, 'action', v_row.action,
                            'payload', v_row.payload, 'chat_id', v_row.chat_id);
end;
$function$;

-- ٤) إنشاء طلب تأكيد
create or replace function public.bot_create_pending(
  p_token text, p_telegram_id bigint, p_chat_id text, p_action text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.audit_set_telegram_actor(p_telegram_id);

  delete from bot_pending_actions
   where telegram_id = p_telegram_id and status = 'pending';

  insert into bot_pending_actions (token, telegram_id, chat_id, action, payload)
  values (p_token, p_telegram_id, p_chat_id, p_action, p_payload);
end;
$function$;

-- ٥) الموافقة على مستخدم تلغرام جديد
create or replace function public.bot_approve_user(
  p_admin_id bigint, p_telegram_id bigint, p_employee text, p_can_write boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin jsonb;
  v_emp   employees%rowtype;
begin
  v_admin := bot_identify(p_admin_id);
  if coalesce(v_admin->>'employee_role','') not in ('ADMIN','MANAGER') then
    return jsonb_build_object('ok', false, 'error', 'صلاحية الموافقة للإدارة فقط');
  end if;

  perform public.audit_set_telegram_actor(p_admin_id);

  select * into v_emp from employees
  where name ilike '%' || btrim(p_employee) || '%' and status = 'active'
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'ما لكيت موظف بهذا الاسم');
  end if;

  insert into telegram_users (telegram_id, employee_id, label, can_read, can_write)
  values (p_telegram_id, v_emp.id, v_emp.display_name, true, p_can_write)
  on conflict (telegram_id) do update
    set employee_id = excluded.employee_id,
        label       = excluded.label,
        can_write   = excluded.can_write,
        is_active   = true;

  delete from telegram_unknown_attempts where telegram_id = p_telegram_id;

  return jsonb_build_object('ok', true, 'employee', v_emp.display_name,
                            'can_write', p_can_write);
end;
$function$;

-- ٦) محاولة دخول من مستخدم تلغرام غير معروف
create or replace function public.bot_log_unknown(
  p_telegram_id bigint, p_username text, p_first text, p_last text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.audit_set_actor(jsonb_build_object(
    'source',      'تلغرام',
    'actor',       coalesce(
                     nullif(btrim(coalesce(p_first, '') || ' ' || coalesce(p_last, '')), ''),
                     p_username, 'مجهول'),
    'telegram_id', p_telegram_id,
    'device_type', 'تلغرام',
    'app',         'بوت تلغرام'));

  insert into telegram_unknown_attempts (telegram_id, username, first_name, last_name)
  values (p_telegram_id, p_username, p_first, p_last)
  on conflict (telegram_id) do update
    set attempts   = telegram_unknown_attempts.attempts + 1,
        last_seen  = now(),
        username   = coalesce(excluded.username, telegram_unknown_attempts.username),
        first_name = coalesce(excluded.first_name, telegram_unknown_attempts.first_name);
end;
$function$;
