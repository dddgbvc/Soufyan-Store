-- ============================================================================
-- إصلاحات أمنية — سدّ ثغرات المصادقة داخل دوال RPC
-- ----------------------------------------------------------------------------
-- كل الوصول للبيانات بهذا المشروع يمر عبر دوال SECURITY DEFINER، وهذي تتجاوز
-- الـ RLS بالكامل. فالحماية الحقيقية هي الفحص اللي داخل كل دالة، مو السياسات.
-- هذا الملف يصلّح الدوال اللي كان فحصها ناقصاً أو مفقوداً.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) شطب مفاتيح حسّاسة من أي ناتج JSON
-- ---------------------------------------------------------------------------
-- تُستعمل مع ai_query: الحارس هناك يفحص *نص* الاستعلام، فـ `select * from
-- employees` كان يمرّ ويرجّع pin_hash لأن الكلمة ما تظهر بالنص. الفحص على
-- النتيجة يسدّ هذا الباب مهما كانت صياغة الاستعلام.
create or replace function public.scrub_secrets(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $function$
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
      'service_key', 'access_token', 'refresh_token'
    );
    return v_out;
  end if;

  return p;
end;
$function$;


create or replace function public.ai_query(p_sql text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sql    text := btrim(p_sql);
  v_result jsonb;
begin
  -- must be a single read statement
  if v_sql !~* '^\s*(select|with)\s' then
    raise exception 'only SELECT is allowed';
  end if;

  if v_sql ~ ';\s*\S' then
    raise exception 'multiple statements are not allowed';
  end if;

  v_sql := rtrim(v_sql, '; ');

  -- block anything that writes or escalates
  if v_sql ~* '\y(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|analyze|call|do|merge|execute|refresh|reindex|comment|security|lo_import|lo_export|pg_read_file|pg_ls_dir|dblink|set\s+role)\y' then
    raise exception 'forbidden keyword detected';
  end if;

  -- block sensitive schemas / columns
  if v_sql ~* '\y(vault|auth|storage|extensions|cron|net|information_schema|pg_catalog|pg_shadow|pg_authid|pg_user|pg_proc|pg_class)\y' then
    raise exception 'access to that schema is not allowed';
  end if;

  if v_sql ~* '\y(pin_hash|decrypted_secret|secrets)\y' then
    raise exception 'access to that column is not allowed';
  end if;

  set local statement_timeout = '8s';

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from ( %s ) t limit 200',
    v_sql
  ) into v_result;

  -- حزام أمان ثانٍ: حتى لو مرّ الاستعلام من الحارس النصّي (مثل `select *`)
  -- ما تخرج أي قيمة سرّية من هنا.
  return public.scrub_secrets(v_result);
end;
$function$;


-- ---------------------------------------------------------------------------
-- 2) حارس جلسة نقطة البيع
-- ---------------------------------------------------------------------------
-- جلسة صالحة = مفتوحة، حيّة، مربوطة بموظف نشط جرى التحقق من رمزه.
-- معرّف الجلسة UUID عشوائي يلعب دور التوكن الحامل (bearer token).
create or replace function public.app_session_guard(p_session_id uuid)
returns public.app_sessions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_s   public.app_sessions;
  v_emp public.employees%rowtype;
begin
  if p_session_id is null then
    raise exception 'انتهت الجلسة — سجّل الدخول من جديد' using errcode = '28000';
  end if;

  select * into v_s from public.app_sessions where id = p_session_id;

  if not found
     or v_s.closed_at is not null
     or v_s.employee_id is null
     or v_s.last_seen_at <= now() - interval '12 hours' then
    raise exception 'انتهت الجلسة — سجّل الدخول من جديد' using errcode = '28000';
  end if;

  select * into v_emp from public.employees
   where id = v_s.employee_id and status = 'active';

  if not found then
    update public.app_sessions
       set closed_at = now(), close_reason = 'logout'
     where id = p_session_id and closed_at is null;
    raise exception 'الحساب موقوف' using errcode = '28000';
  end if;

  update public.app_sessions set last_seen_at = now() where id = p_session_id;

  perform public.audit_set_actor(jsonb_build_object(
    'source',      'برنامج المكتب',
    'actor',       coalesce(v_emp.display_name, v_emp.name),
    'employee_id', v_emp.id,
    'terminal_id', v_s.terminal_id));

  return v_s;
end;
$function$;


-- ---------------------------------------------------------------------------
-- 3) sync_push — نسخة تتطلّب جلسة موثّقة
-- ---------------------------------------------------------------------------
-- النسخة القديمة sync_push(text, jsonb) بلا أي مصادقة وتكتب بـ ١٧ جدول.
-- تبقى موجودة للاستعمال من الخادم بمفتاح service_role، وتُسحب صلاحيتها عن
-- anon و authenticated بالهجرة التالية. هذي هي الواجهة الوحيدة للعميل.
create or replace function public.sync_push(p_session_id uuid, p_table text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_s public.app_sessions;
begin
  v_s := public.app_session_guard(p_session_id);
  return public.sync_push(p_table, p_rows);
end;
$function$;
