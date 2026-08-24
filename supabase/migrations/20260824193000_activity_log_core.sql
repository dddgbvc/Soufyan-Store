-- ════════════════════════════════════════════════════════════════════════
--  تفعيل تسجيل الـ IP ونوع الجهاز على كل عملية بقاعدة البيانات
--  الجزء ١ — البنية الأساسية:
--    • قراءة معلومات الطلب (IP / User-Agent / الدولة / الطرفية)
--    • تحليل نوع الجهاز والنظام والتطبيق من الـ User-Agent
--    • سياق الفاعل (لِلعمليات الي تجي عبر بوت تلغرام أو قسم الشراء)
--    • جدول activity_log — سجل غير قابل للتعديل
-- ════════════════════════════════════════════════════════════════════════

-- ١) معلومات الطلب من ترويسات PostgREST (متوافقة مع النسخة القديمة + ترويسات إضافية)
create or replace function public.request_client_info()
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  h    jsonb;
  v_ip text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    h := null;
  end;

  if h is null then
    return '{}'::jsonb;
  end if;

  v_ip := coalesce(
    nullif(h->>'cf-connecting-ip', ''),
    nullif(h->>'x-real-ip', ''),
    nullif(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), '')
  );

  return jsonb_build_object(
    'ip',          v_ip,
    'user_agent',  left(nullif(h->>'user-agent', ''), 400),
    'country',     nullif(h->>'cf-ipcountry', ''),
    'terminal_id', left(nullif(h->>'x-terminal-id', ''), 80),
    'client_info', left(nullif(h->>'x-client-info', ''), 80)
  );
end;
$function$;

comment on function public.request_client_info() is
  'يقرأ IP والـ User-Agent والدولة من ترويسات الطلب — يرجّع {} إذا الاستدعاء مو من الـ API';

-- ٢) تحليل الـ User-Agent → نوع الجهاز / النظام / التطبيق
create or replace function public.audit_device(p_ua text)
returns jsonb
language sql
immutable
as $function$
  select case
    when coalesce(btrim(p_ua), '') = '' then
      jsonb_build_object('device_type', null, 'os', null, 'app', null)
    else jsonb_build_object(
      'device_type', case
        when p_ua ~* '(pg_net|postgrest|deno|^node|python|curl|wget|axios|okhttp|bot/)' then 'خادم/بوت'
        when p_ua ~* '(ipad|tablet)' or (p_ua ~* 'android' and p_ua !~* 'mobile')       then 'تابلت'
        when p_ua ~* '(iphone|ipod|android|mobile|windows phone)'                        then 'موبايل'
        else 'حاسبة'
      end,
      'os', case
        when p_ua ~* 'windows nt 10'  then 'Windows 10/11'
        when p_ua ~* 'windows nt 6.3' then 'Windows 8.1'
        when p_ua ~* 'windows nt 6.1' then 'Windows 7'
        when p_ua ~* 'windows'        then 'Windows'
        when p_ua ~* '(iphone|ipad|ipod)' then
          btrim('iOS ' || replace(coalesce(substring(p_ua from 'OS ([0-9_]+)'), ''), '_', '.'))
        when p_ua ~* 'android'   then btrim('Android ' || coalesce(substring(p_ua from 'Android ([0-9.]+)'), ''))
        when p_ua ~* 'mac os x'  then 'macOS'
        when p_ua ~* 'linux'     then 'Linux'
        else null
      end,
      'app', case
        when p_ua ~* 'as-erp'              then 'برنامج المكتب (as-erp)'
        when p_ua ~* 'claude/'             then 'Claude Desktop'
        when p_ua ~* 'supabaseedgeruntime' then 'Supabase Edge Function'
        when p_ua ~* '^deno'               then 'Deno'
        when p_ua ~* 'pg_net'              then 'النظام (pg_net)'
        when p_ua ~* '^node'               then 'سكربت Node'
        when p_ua ~* 'electron'            then 'تطبيق سطح مكتب (Electron)'
        when p_ua ~* 'edg/'                then 'Edge'
        when p_ua ~* 'opr/'                then 'Opera'
        when p_ua ~* 'firefox'             then 'Firefox'
        when p_ua ~* 'chrome'              then 'Chrome'
        when p_ua ~* 'safari'              then 'Safari'
        else null
      end)
  end;
$function$;

comment on function public.audit_device(text) is
  'يحوّل الـ User-Agent إلى: نوع الجهاز (موبايل/تابلت/حاسبة/خادم) + النظام + التطبيق';

-- ٣) سياق الفاعل — تنضبّط داخل الترانزاكشن الواحدة فقط (set_config ... true)
create or replace function public.audit_set_actor(p_ctx jsonb)
returns void
language plpgsql
volatile
set search_path to 'public'
as $function$
begin
  perform set_config('app.audit_actor', coalesce(p_ctx, '{}'::jsonb)::text, true);
exception when others then
  null;
end;
$function$;

comment on function public.audit_set_actor(jsonb) is
  'تحدّد منو الفاعل الحقيقي للعملية الحالية (بوت تلغرام / قسم الشراء) — صالحة داخل الترانزاكشن فقط';

-- ٤) السياق الكامل: ترويسات الطلب + سياق الفاعل + تحليل الجهاز
create or replace function public.audit_ctx()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  h     jsonb := '{}'::jsonb;
  a     jsonb := '{}'::jsonb;
  v_ip  text;
  v_ua  text;
  v_dev jsonb;
  v_src text;
  v_uid uuid;
begin
  begin h := coalesce(public.request_client_info(), '{}'::jsonb); exception when others then h := '{}'::jsonb; end;

  begin
    a := coalesce(nullif(current_setting('app.audit_actor', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    a := '{}'::jsonb;
  end;

  v_ip := coalesce(nullif(a->>'ip', ''), nullif(h->>'ip', ''));
  begin perform v_ip::inet; exception when others then v_ip := null; end;

  v_ua  := coalesce(nullif(a->>'user_agent', ''), nullif(h->>'user_agent', ''));
  v_dev := public.audit_device(v_ua);

  v_src := coalesce(nullif(a->>'source', ''), case
    when v_ua ~* 'pg_net'                     then 'النظام'
    when v_ua ~* 'as-erp'                     then 'برنامج المكتب'
    when v_ua ~* 'supabaseedgeruntime|^deno'  then 'وظيفة طرفية'
    when v_ua is null                         then 'غير معروف'
    else 'ويب'
  end);

  begin v_uid := auth.uid(); exception when others then v_uid := null; end;

  return jsonb_build_object(
    'source',      v_src,
    'actor',       nullif(a->>'actor', ''),
    'employee_id', nullif(a->>'employee_id', ''),
    'telegram_id', nullif(a->>'telegram_id', ''),
    'terminal_id', coalesce(nullif(a->>'terminal_id', ''), nullif(h->>'terminal_id', '')),
    'ip',          v_ip,
    'country',     nullif(h->>'country', ''),
    'user_agent',  v_ua,
    'device_type', coalesce(nullif(a->>'device_type', ''), v_dev->>'device_type'),
    'os',          coalesce(nullif(a->>'os', ''), v_dev->>'os'),
    'app',         coalesce(nullif(a->>'app', ''), v_dev->>'app'),
    'db_role',     current_user,
    'auth_uid',    v_uid
  );
end;
$function$;

-- ٥) إخفاء الحقول الحساسة قبل حفظها بالسجل
create or replace function public.audit_redact(p jsonb)
returns jsonb
language sql
immutable
as $function$
  select coalesce((
    select jsonb_object_agg(k, case
             when k ~* '(pin|hash|token|secret|password|api_?key)' then to_jsonb('•••'::text)
             else p -> k
           end)
    from jsonb_object_keys(coalesce(p, '{}'::jsonb)) as k
  ), '{}'::jsonb);
$function$;

-- ٦) جدول السجل
create table if not exists public.activity_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  source      text,
  action      text not null,
  table_name  text,
  row_id      text,
  row_label   text,
  actor       text,
  employee_id uuid,
  telegram_id bigint,
  terminal_id text,
  ip          inet,
  country     text,
  user_agent  text,
  device_type text,
  os          text,
  app         text,
  db_role     text,
  auth_uid    uuid,
  detail      jsonb not null default '{}'::jsonb
);

comment on table public.activity_log is
  'سجل كل عملية بقاعدة البيانات: منو، شنو، وين، ومن أي جهاز — إضافة فقط، ما ينعدّل';
comment on column public.activity_log.source      is 'المصدر: ويب / برنامج المكتب / تلغرام / قسم الشراء / وظيفة طرفية / النظام';
comment on column public.activity_log.ip          is 'IP الطالب كما وصل من ترويسات الطلب';
comment on column public.activity_log.device_type is 'نوع الجهاز: موبايل / تابلت / حاسبة / خادم-بوت';
comment on column public.activity_log.detail      is 'الحقول المتغيّرة قبل/بعد — الحقول الحساسة مخفية';

create index if not exists activity_log_at_idx     on public.activity_log (at desc);
create index if not exists activity_log_table_idx  on public.activity_log (table_name, at desc);
create index if not exists activity_log_actor_idx  on public.activity_log (actor, at desc);
create index if not exists activity_log_ip_idx     on public.activity_log (ip, at desc);
create index if not exists activity_log_source_idx on public.activity_log (source, at desc);

alter table public.activity_log enable row level security;

drop policy if exists activity_log_read on public.activity_log;
create policy activity_log_read on public.activity_log
  for select to authenticated using (true);

-- منع التعديل، ومنع حذف أي حركة أحدث من ١٨٠ يوم
create or replace function public.activity_log_immutable()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'سجل النشاط ما ينعدّل' using errcode = '42501';
  end if;
  if old.at > now() - interval '180 days' then
    raise exception 'ما تنحذف حركة أحدث من ١٨٠ يوم' using errcode = '42501';
  end if;
  return old;
end;
$function$;

drop trigger if exists activity_log_no_update on public.activity_log;
create trigger activity_log_no_update before update on public.activity_log
  for each row execute function public.activity_log_immutable();

drop trigger if exists activity_log_no_delete on public.activity_log;
create trigger activity_log_no_delete before delete on public.activity_log
  for each row execute function public.activity_log_immutable();

-- ٧) كتابة حركة بالسجل — تُستدعى من التريكرات ومن الدوال مباشرة
create or replace function public.audit_write(
  p_action  text,
  p_table   text  default null,
  p_row_id  text  default null,
  p_label   text  default null,
  p_detail  jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c jsonb;
begin
  c := public.audit_ctx();

  insert into public.activity_log (
    source, action, table_name, row_id, row_label,
    actor, employee_id, telegram_id, terminal_id,
    ip, country, user_agent, device_type, os, app,
    db_role, auth_uid, detail)
  values (
    c->>'source', left(p_action, 40), left(p_table, 60), left(p_row_id, 80), left(p_label, 120),
    left(c->>'actor', 120), nullif(c->>'employee_id', '')::uuid, nullif(c->>'telegram_id', '')::bigint,
    left(c->>'terminal_id', 80),
    nullif(c->>'ip', '')::inet, left(c->>'country', 4), left(c->>'user_agent', 400),
    c->>'device_type', c->>'os', c->>'app',
    c->>'db_role', nullif(c->>'auth_uid', '')::uuid,
    coalesce(p_detail, '{}'::jsonb));
exception when others then
  null;  -- التدقيق ما يوقف أي عملية أبدًا
end;
$function$;

comment on function public.audit_write(text, text, text, text, jsonb) is
  'تكتب حركة بسجل النشاط مع IP والجهاز — ما ترمي خطأ حتى لا توقف العملية الأصلية';

-- ٨) تريكر عام: يسجّل أي إضافة/تعديل/حذف مع IP والجهاز
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new     jsonb;
  v_old     jsonb;
  v_row     jsonb;
  v_changed text[];
  v_before  jsonb;
  v_after   jsonb;
  v_detail  jsonb;
  v_id      text;
  v_label   text;
begin
  begin
    if tg_op = 'DELETE' then
      v_old    := to_jsonb(old);
      v_row    := v_old;
      v_detail := jsonb_build_object('before', public.audit_redact(v_old));

    elsif tg_op = 'INSERT' then
      v_new    := to_jsonb(new);
      v_row    := v_new;
      v_detail := jsonb_build_object('after', public.audit_redact(v_new));

    else
      v_new := to_jsonb(new);
      v_old := to_jsonb(old);
      v_row := v_new;

      select coalesce(array_agg(e.key order by e.key), '{}'::text[])
        into v_changed
        from jsonb_each(v_new) as e
       where v_old -> e.key is distinct from e.value;

      -- نبضات الجلسات وطوابع الوقت لحالها مو حركة تستاهل تسجيل
      if v_changed <@ array['updated_at', 'last_seen_at', 'last_seen', 'synced_at'] then
        return null;
      end if;

      select jsonb_object_agg(k, v_old -> k) into v_before from unnest(v_changed) as k where v_old ? k;
      select jsonb_object_agg(k, v_new -> k) into v_after  from unnest(v_changed) as k;

      v_detail := jsonb_build_object(
        'changed', to_jsonb(v_changed),
        'before',  public.audit_redact(coalesce(v_before, '{}'::jsonb)),
        'after',   public.audit_redact(coalesce(v_after,  '{}'::jsonb)));
    end if;

    v_id := coalesce(
      v_row->>'id',
      case when v_row ? 'token' then left(v_row->>'token', 8) || '…' end,
      v_row->>'key', v_row->>'kind', v_row->>'telegram_id');

    v_label := coalesce(
      v_row->>'invoice_number', v_row->>'number', v_row->>'ticket',
      v_row->>'customer_name', v_row->>'display_name', v_row->>'name',
      v_row->>'label', v_row->>'title');

    if pg_column_size(v_detail) > 8000 then
      v_detail := jsonb_build_object(
        'ملاحظة', 'السجل كبير — انحفظت أسماء الحقول فقط',
        'الحقول', (select to_jsonb(array_agg(k)) from jsonb_object_keys(v_row) as k));
    end if;

    perform public.audit_write(lower(tg_op), tg_table_name, v_id, v_label, v_detail);
  exception when others then
    null;  -- أي خلل بالتدقيق ما يوقف العملية
  end;

  return null;
end;
$function$;

comment on function public.log_activity() is
  'تريكر عام يسجّل كل insert/update/delete بجدول activity_log مع الـ IP ونوع الجهاز';
