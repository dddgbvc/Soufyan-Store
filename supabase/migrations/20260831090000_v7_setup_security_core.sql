-- ============================================================================
-- V7 · Setup & Auth security core
-- ----------------------------------------------------------------------------
-- كل ما في هذه المهاجرة **إضافي**: لا تُسقِط جدولًا، ولا تغيّر سياسة قائمة،
-- ولا تعدّل توقيع دالة يستعملها النظام الحيّ. الهدف أن تعمل على قاعدة إنتاج
-- فيها بيانات حقيقية بلا انقطاع.
--
-- ما تعالجه:
--   1) الجلسة: الخادم يصدر الهوية والصلاحيات، ولا يقرأهما العميل من متصفّحه.
--   2) تصعيد الصلاحية: منع المستخدم من ترقية دوره في profiles بنفسه.
--   3) حالة الإعداد: مصدرها الخادم، لا مفتاح في localStorage.
--   4) التهيئة: idempotent وقابلة لإعادة التشغيل بلا تكرار.
--   5) سجل أحداث أمنية للعمليات الحسّاسة.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) جداول جديدة
-- ----------------------------------------------------------------------------

-- حالة الإعداد — صف واحد. مصدر الحقيقة لـ setup_completed.
create table if not exists public.setup_state (
  id             smallint primary key default 1 check (id = 1),
  completed      boolean     not null default false,
  completed_at   timestamptz,
  completed_by   uuid references auth.users(id) on delete set null,
  store_name     text,
  payload        jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.setup_state is
  'حالة الإعداد الأولي — صف واحد. الخادم هو من يقرر أن الإعداد اكتمل، لا المتصفح.';

-- سجل تنفيذ مهام التهيئة — يضمن ألا تُنفَّذ المهمة مرتين.
create table if not exists public.setup_provision_runs (
  id            bigserial primary key,
  run_key       text        not null,
  task          text        not null,
  status        text        not null default 'done' check (status in ('done','failed')),
  result        jsonb       not null default '{}'::jsonb,
  actor         uuid references auth.users(id) on delete set null,
  terminal_id   text,
  at            timestamptz not null default now(),
  unique (run_key, task)
);
comment on table public.setup_provision_runs is
  'مفاتيح idempotency لمهام التهيئة: (run_key, task) فريد، فإعادة الإرسال لا تُنشئ تكرارًا.';

-- أحداث أمنية — إضافة فقط. لا يُكتب فيها أي سرّ.
create table if not exists public.security_events (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  event        text        not null,
  outcome      text        not null default 'ok' check (outcome in ('ok','fail','blocked')),
  auth_uid     uuid,
  employee_id  uuid,
  terminal_id  text,
  ip           inet,
  user_agent   text,
  detail       jsonb       not null default '{}'::jsonb
);
comment on table public.security_events is
  'سجل الأحداث الأمنية: دخول، فشل دخول، OTP، PIN، تسجيل جهاز، تغيير صلاحية، تهيئة. لا يحتوي كلمات مرور ولا رموز إطلاقًا.';

create index if not exists security_events_at_idx      on public.security_events (at desc);
create index if not exists security_events_event_idx   on public.security_events (event, at desc);
create index if not exists security_events_ip_idx      on public.security_events (ip, at desc);

-- RLS: كل الجداول الجديدة مغلقة افتراضيًا. الوصول عبر دوال SECURITY DEFINER فقط.
alter table public.setup_state           enable row level security;
alter table public.setup_provision_runs  enable row level security;
alter table public.security_events       enable row level security;

-- قراءة سجل الأحداث للإداريين فقط، وبدور مقروء من الخادم لا من العميل.
drop policy if exists security_events_admin_read on public.security_events;
create policy security_events_admin_read on public.security_events
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'ADMIN' and p.status = 'active'
  ));

-- حالة الإعداد تُقرأ من دالة عامة (أدناه)، فلا سياسة قراءة مباشرة.
-- setup_provision_runs لا تُقرأ من العميل إطلاقًا.

-- ----------------------------------------------------------------------------
-- 1) مُسجّل الأحداث الأمنية
-- ----------------------------------------------------------------------------
create or replace function public.log_security_event(
  p_event       text,
  p_outcome     text default 'ok',
  p_employee_id uuid default null,
  p_terminal_id text default null,
  p_detail      jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_info jsonb;
  v_ip   inet;
begin
  v_info := public.request_client_info();
  begin v_ip := nullif(v_info->>'ip','')::inet; exception when others then v_ip := null; end;

  insert into public.security_events (event, outcome, auth_uid, employee_id, terminal_id, ip, user_agent, detail)
  values (
    left(p_event, 80),
    case when p_outcome in ('ok','fail','blocked') then p_outcome else 'ok' end,
    auth.uid(),
    p_employee_id,
    left(coalesce(p_terminal_id, v_info->>'terminal_id'), 80),
    v_ip,
    left(v_info->>'user_agent', 400),
    -- حارس: لا يُسجَّل أي مفتاح يشبه السرّ مهما أرسل النداء
    coalesce(p_detail, '{}'::jsonb)
      - 'password' - 'pin' - 'pin_hash' - 'otp' - 'code' - 'token'
      - 'access_token' - 'refresh_token' - 'secret'
  );
end;
$$;

revoke all on function public.log_security_event(text,text,uuid,text,jsonb) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) الجلسة: الخادم يصدر الهوية — لا يقرؤها العميل من متصفّحه
-- ----------------------------------------------------------------------------
-- V6 كان يقرأ employee/permissions من localStorage ويكتفي بـ app_session_ping
-- الذي يردّ {ok:true} بلا هوية. فمن يكتب مؤشّر جلسة صالحًا في متصفّحه ويضيف
-- role:"ADMIN" يحصل على واجهة إدارية كاملة. هذه الدالة تُنهي ذلك:
-- الهوية والصلاحيات تُشتقّان هنا من قاعدة البيانات، ومربوطتان بالجهاز.
create or replace function public.app_session_whoami(
  p_session_id   uuid,
  p_terminal_id  text,
  p_max_age_hours integer default 12
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s      public.app_sessions%rowtype;
  v_emp    public.employees%rowtype;
  v_prof   public.profiles%rowtype;
  v_role   text;
  v_term   text;
  v_max    integer;
begin
  v_max  := least(greatest(coalesce(p_max_age_hours, 12), 1), 24);
  v_term := left(coalesce(nullif(btrim(p_terminal_id), ''), ''), 100);

  if p_session_id is null or v_term = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into v_s from public.app_sessions where id = p_session_id;

  -- الجلسة مجهولة أو مغلقة
  if v_s.id is null or v_s.closed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  -- الربط بالجهاز يُفرض هنا على الخادم، لا في المتصفح
  if v_s.terminal_id is distinct from v_term then
    perform public.log_security_event(
      'session.terminal_mismatch', 'blocked', v_s.employee_id, v_term,
      jsonb_build_object('session_id', p_session_id));
    return jsonb_build_object('ok', false, 'reason', 'terminal');
  end if;

  -- العمر الأقصى يُفرض على الخادم
  if v_s.opened_at < now() - make_interval(hours => v_max) then
    update public.app_sessions
       set closed_at = now(), close_reason = 'expired'
     where id = v_s.id and closed_at is null;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- جلسة بلا موظف = جلسة تشغيل مجهولة فتحها anon. لا تمنح هوية أبدًا.
  if v_s.employee_id is null then
    return jsonb_build_object('ok', false, 'reason', 'anonymous');
  end if;

  select * into v_emp from public.employees where id = v_s.employee_id;
  if v_emp.id is null or v_emp.status <> 'active' then
    update public.app_sessions
       set closed_at = now(), close_reason = 'employee_inactive'
     where id = v_s.id and closed_at is null;
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;

  -- الدور: من profiles حين يكون الموظف مربوطًا بحساب، وإلا من employees.
  if v_emp.user_id is not null then
    select * into v_prof from public.profiles where id = v_emp.user_id;
    if v_prof.id is not null and v_prof.status <> 'active' then
      return jsonb_build_object('ok', false, 'reason', 'disabled');
    end if;
  end if;
  v_role := coalesce(v_prof.role, v_emp.role);

  update public.app_sessions set last_seen_at = now() where id = v_s.id;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_s.id,
    'method', coalesce(v_s.meta->>'source', 'unknown'),
    'opened_at', v_s.opened_at,
    'employee', jsonb_build_object(
      'id',   v_emp.id,
      'name', coalesce(v_emp.display_name, v_emp.name),
      'role', v_role
    ),
    -- الصلاحيات تُشتقّ من الدور على الخادم. ما يرسله العميل لا يُقرأ إطلاقًا.
    'permissions', to_jsonb(public.permissions_for(v_role))
  );
end;
$$;

comment on function public.app_session_whoami(uuid,text,integer) is
  'يستأنف جلسة تشغيل: يتحقق من الجهاز والعمر والحالة ثم يعيد الهوية والصلاحيات من قاعدة البيانات. لا يثق بأي شيء يرسله المتصفح عدا مؤشّر الجلسة ومعرّف الجهاز.';

revoke all on function public.app_session_whoami(uuid,text,integer) from public;
grant execute on function public.app_session_whoami(uuid,text,integer) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) ربط جلسة التشغيل بحساب Supabase Auth بعد دخول ناجح
-- ----------------------------------------------------------------------------
-- V6 كان يفتح app_session_start بلا employee_id بعد دخول كلمة المرور، فتبقى
-- الجلسة مجهولة على الخادم بينما تدّعي الواجهة أنها لصاحبها. هذه الدالة تفتح
-- الجلسة بهوية المستخدم الموثَّق نفسه (auth.uid()) ولا تقبل معرّفًا من العميل.
create or replace function public.app_session_start_authenticated(
  p_terminal_id text,
  p_app_version text default null,
  p_device_name text default null,
  p_os          text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_emp  public.employees%rowtype;
  v_prof public.profiles%rowtype;
  v_role text;
  v_term text;
  v_id   uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  v_term := left(coalesce(nullif(btrim(p_terminal_id), ''), ''), 100);
  if length(v_term) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_terminal');
  end if;

  select * into v_prof from public.profiles where id = v_uid;
  if v_prof.id is null or v_prof.status <> 'active' then
    perform public.log_security_event('login.disabled', 'blocked', null, v_term, '{}'::jsonb);
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;

  -- صف الموظف المقابل لهذا الحساب — يُنشأ عند الحاجة ويُربط بـ user_id.
  -- on conflict يعتمد على الفهرس الفريد أدناه، فالدخول المتزامن من جهازين
  -- لا يُنشئ صفّي موظف لنفس الحساب.
  select * into v_emp from public.employees where user_id = v_uid limit 1;
  if v_emp.id is null then
    insert into public.employees (user_id, name, display_name, role, status)
    values (v_uid,
            coalesce(v_prof.full_name, v_prof.display_name, 'مستخدم'),
            coalesce(v_prof.display_name, v_prof.full_name),
            v_prof.role, 'active')
    on conflict (user_id) where user_id is not null do nothing
    returning * into v_emp;
    if v_emp.id is null then
      select * into v_emp from public.employees where user_id = v_uid limit 1;
    end if;
  elsif v_emp.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;

  v_role := coalesce(v_prof.role, v_emp.role);

  -- أغلق أي جلسة سابقة مفتوحة على هذا الجهاز، ثم افتح واحدة موسومة بالهوية.
  update public.app_sessions
     set closed_at = coalesce(closed_at, now()), close_reason = coalesce(close_reason, 'replaced')
   where terminal_id = v_term and closed_at is null;

  insert into public.app_sessions (terminal_id, employee_id, employee_name, app_version, platform, meta, device_name, os)
  values (v_term, v_emp.id, coalesce(v_emp.display_name, v_emp.name),
          left(p_app_version, 40), 'web',
          jsonb_build_object('source', 'password', 'auth_uid', v_uid),
          left(p_device_name, 80), left(p_os, 60))
  returning id into v_id;

  perform public.log_security_event('login.success', 'ok', v_emp.id, v_term,
    jsonb_build_object('role', v_role));

  return jsonb_build_object(
    'ok', true,
    'session_id', v_id,
    'employee', jsonb_build_object('id', v_emp.id, 'name', coalesce(v_emp.display_name, v_emp.name), 'role', v_role),
    'permissions', to_jsonb(public.permissions_for(v_role))
  );
end;
$$;

revoke all on function public.app_session_start_authenticated(text,text,text,text) from public, anon;
grant execute on function public.app_session_start_authenticated(text,text,text,text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) قفل تصعيد الصلاحية على profiles
-- ----------------------------------------------------------------------------
-- سياسة profiles_self_write تسمح للمستخدم بتعديل صفّه بشرط auth.uid() = id،
-- وهي لا تفرّق بين الأعمدة. فالنتيجة أن أي حساب يستطيع أن يكتب
-- role = 'ADMIN' على نفسه. المحفّز التالي يمنع ذلك على مستوى الجدول،
-- فيغطي كل مسارات الكتابة لا سياسة واحدة.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid        uuid := auth.uid();
  v_actor_role text;
begin
  -- لا تغيير في الأعمدة الحسّاسة ⇒ لا شيء يُفحص.
  if new.role is not distinct from old.role
     and new.status is not distinct from old.status then
    return new;
  end if;

  -- خارج سياق طلب موثَّق (service_role، مهاجرات، دوال SECURITY DEFINER
  -- تعمل بلا مستخدم) لا يُطبَّق القيد: تلك مسارات الخادم نفسه.
  if v_uid is null then
    return new;
  end if;

  select role into v_actor_role
  from public.profiles where id = v_uid;

  -- الإداري وحده يغيّر الأدوار والحالات — ولا يغيّر دوره هو.
  if v_actor_role = 'ADMIN' and v_uid <> new.id then
    perform public.log_security_event('profile.role_change', 'ok', null, null,
      jsonb_build_object('target', new.id, 'from', old.role, 'to', new.role));
    return new;
  end if;

  perform public.log_security_event('profile.role_change', 'blocked', null, null,
    jsonb_build_object('target', new.id, 'from', old.role, 'to', new.role));
  raise exception 'not authorised to change role or status'
    using errcode = '42501';
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- ملاحظة: `profiles.pin_hash` فارغ تمامًا على هذا المشروع (٠ صفوف غير فارغة)
-- والتحقق الفعلي يستعمل `employees.pin_hash`. سحب صلاحية العمود
-- (`revoke select (pin_hash) …`) صحيح دفاعيًا، لكنه يكسر أي نداء
-- `profiles?select=*` في التطبيق الحيّ. لذلك نُقل إلى المهاجرة المشروطة
-- 20260831093000 التي تنتظر موافقة صاحب المشروع، ولم يُطبَّق هنا.

-- ----------------------------------------------------------------------------
-- 5) حالة الإعداد — يقرؤها العميل من الخادم لا من متصفّحه
-- ----------------------------------------------------------------------------
create or replace function public.setup_status()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'completed',    coalesce((select completed from public.setup_state where id = 1), false),
    'completed_at', (select completed_at from public.setup_state where id = 1),
    'store_name',   (select store_name  from public.setup_state where id = 1),
    -- وجود مستخدمين أصلًا يعني أن النظام ليس جديدًا حتى لو لم يُسجَّل الإعداد.
    'has_accounts', (select exists (select 1 from public.profiles))
  );
$$;

revoke all on function public.setup_status() from public;
grant execute on function public.setup_status() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6) تحديد المحاولات على الخادم — لعمليات لا يغطّيها Supabase Auth
-- ----------------------------------------------------------------------------
create table if not exists public.rate_limits (
  bucket     text        not null,
  subject    text        not null,
  at         timestamptz not null default now(),
  primary key (bucket, subject, at)
);
alter table public.rate_limits enable row level security;
create index if not exists rate_limits_lookup_idx on public.rate_limits (bucket, subject, at desc);

comment on table public.rate_limits is
  'نوافذ منزلقة لتحديد المحاولات على الخادم. subject = IP أو معرّف جهاز أو بريد مُجزّأ — لا بريد صريح.';

-- يسجّل محاولة ويعيد ما إذا كانت مسموحة. النافذة منزلقة.
create or replace function public.rate_limit_hit(
  p_bucket    text,
  p_subject   text,
  p_limit     integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
  v_win   interval;
begin
  v_win := make_interval(secs => least(greatest(coalesce(p_window_seconds, 60), 1), 86400));

  delete from public.rate_limits
   where bucket = p_bucket and at < now() - v_win - interval '1 hour';

  select count(*) into v_count
    from public.rate_limits
   where bucket = p_bucket and subject = p_subject and at > now() - v_win;

  if v_count >= greatest(coalesce(p_limit, 5), 1) then
    return false;
  end if;

  insert into public.rate_limits (bucket, subject) values (p_bucket, p_subject);
  return true;
end;
$$;

revoke all on function public.rate_limit_hit(text,text,integer,integer) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7) تشديد حدّ محاولات PIN
-- ----------------------------------------------------------------------------
-- الخلل: pin_attempts_blocked تعتمد على p_terminal_id وهو **وسيط يرسله العميل**،
-- فيكفي تدويره في كل طلب لتعطيل فرع الجهاز تمامًا ويبقى فرع الـIP وحده.
-- الإصلاح: إبقاء الفرعين، وإضافة سقف ساعيّ لكل IP، وسقف لعدد الأجهزة
-- المختلفة القادمة من IP واحد — وهو بالضبط أثر تدوير المعرّف.
create or replace function public.pin_attempts_blocked(p_terminal_id text, p_ip inet)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    -- (أ) نفس الجهاز: ٥ محاولات فاشلة خلال دقيقتين
    (select count(*) from public.pin_attempts
      where terminal_id = p_terminal_id and ok = false
        and at > now() - interval '2 minutes') >= 5
    or
    -- (ب) نفس الـIP: ١٠ خلال عشر دقائق
    (p_ip is not null and
     (select count(*) from public.pin_attempts
       where ip = p_ip and ok = false and at > now() - interval '10 minutes') >= 10)
    or
    -- (ج) نفس الـIP: ٣٠ خلال ساعة — يوقف المحاولات البطيئة الطويلة
    (p_ip is not null and
     (select count(*) from public.pin_attempts
       where ip = p_ip and ok = false and at > now() - interval '1 hour') >= 30)
    or
    -- (د) تدوير معرّف الجهاز: أكثر من ٨ معرّفات مختلفة من IP واحد خلال ساعة
    (p_ip is not null and
     (select count(distinct terminal_id) from public.pin_attempts
       where ip = p_ip and ok = false and at > now() - interval '1 hour') >= 8);
$$;

comment on function public.pin_attempts_blocked(text,inet) is
  'حدّ محاولات PIN. الفرع (د) يغلق تدوير معرّف الجهاز، وهو الالتفاف الذي كان يعطّل الفرع (أ) لأن المعرّف يرسله العميل.';

-- ----------------------------------------------------------------------------
-- 8) فهارس تدعم الحدود أعلاه
-- ----------------------------------------------------------------------------
-- حساب واحد = صف موظف واحد. بدونه يستطيع دخولان متزامنان إنشاء صفّين.
create unique index if not exists employees_user_id_key
  on public.employees (user_id) where user_id is not null;

create index if not exists pin_attempts_ip_at_idx       on public.pin_attempts (ip, at desc) where ok = false;
create index if not exists pin_attempts_terminal_at_idx on public.pin_attempts (terminal_id, at desc) where ok = false;
create index if not exists app_sessions_terminal_open_idx on public.app_sessions (terminal_id) where closed_at is null;
