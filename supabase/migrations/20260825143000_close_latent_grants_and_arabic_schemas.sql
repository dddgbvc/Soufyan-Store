-- ============================================================================
-- إغلاق صلاحيات كامنة كشفها سكان القاعدة
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ١) صلاحية عمود على categories
-- ---------------------------------------------------------------------------
-- `grant select (id) on categories to anon` — صلاحية على مستوى العمود، وهذي
-- ما تظهر بـ has_table_privilege فمرّت من الفحص الأول. الـ RLS يوقفها اليوم
-- (ماكو سياسة لـ anon بعد شطب categories_probe_read) بس تنفتح بالكامل أول ما
-- تنضاف أي سياسة. هذا اللي كان الأدفايزر ينبّه عليه — التنبيه كان صحيحاً.
revoke all on public.categories from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ٢) طبقة الـ schemas العربية
-- ---------------------------------------------------------------------------
-- سبعة schemas (بحث، زبائن، صيانة، مالية، مبيعات، مخزن، نظام) فيها ٢٨ عرضاً
-- و٢ دالة SECURITY DEFINER بلا أي فحص مصادقة. الأعراض كلها security_invoker
-- مطفي، يعني تشتغل بصلاحيات مالكها وتتجاوز الـRLS بالكامل.
--
-- `anon` ماعنده USAGE على هذي الـschemas فمو مكشوفة الآن، بس EXECUTE ممنوح
-- لـ PUBLIC بالافتراض — لغم ينفجر أول ما ينضاف USAGE. نسحبه صراحة.
do $$
declare o record;
begin
  for o in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('بحث','زبائن','صيانة','مالية','مبيعات','مخزن','نظام')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', o.sig);
    execute format('grant execute on function %s to service_role', o.sig);
  end loop;

  for o in
    select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('بحث','زبائن','صيانة','مالية','مبيعات','مخزن','نظام')
      and c.relkind in ('r','p','v','m')
  loop
    execute format('revoke all on %I.%I from public, anon, authenticated',
                   o.nspname, o.relname);
  end loop;
end $$;

revoke usage on schema "بحث", "زبائن", "صيانة", "مالية", "مبيعات", "مخزن", "نظام"
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ٣) حارس ai_query كان أعمى عن العربي
-- ---------------------------------------------------------------------------
-- القائمة السوداء تفحص أسماء لاتينية فقط (vault|auth|storage|…)، فالـschemas
-- العربية كانت تمر بالكامل. العرض الوحيد اللي يلمس بيانات حسّاسة
-- (نظام.الموظفين) يعرض 'مضبوط/ماكو' مو البصمة نفسها، فماكو تسريب فعلي —
-- بس الحارس لازم يغطيهن قبل ما ينضاف عرض يكشف شي.
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
  if v_sql !~* '^\s*(select|with)\s' then
    raise exception 'only SELECT is allowed';
  end if;

  if v_sql ~ ';\s*\S' then
    raise exception 'multiple statements are not allowed';
  end if;

  v_sql := rtrim(v_sql, '; ');

  if v_sql ~* '\y(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|analyze|call|do|merge|execute|refresh|reindex|comment|security|lo_import|lo_export|pg_read_file|pg_ls_dir|dblink|set\s+role)\y' then
    raise exception 'forbidden keyword detected';
  end if;

  if v_sql ~* '\y(vault|auth|storage|extensions|cron|net|information_schema|pg_catalog|pg_shadow|pg_authid|pg_user|pg_proc|pg_class)\y' then
    raise exception 'access to that schema is not allowed';
  end if;

  if v_sql ~ '(بحث|زبائن|صيانة|مالية|مبيعات|مخزن|نظام)\s*\.' or
     v_sql ~ '"(بحث|زبائن|صيانة|مالية|مبيعات|مخزن|نظام)"' then
    raise exception 'access to that schema is not allowed';
  end if;

  if v_sql ~* '\y(pin_hash|decrypted_secret|secrets)\y' then
    raise exception 'access to that column is not allowed';
  end if;

  if v_sql ~ '(رمز_الدخول|كلمة_السر|السر|التوكن)' then
    raise exception 'access to that column is not allowed';
  end if;

  set local statement_timeout = '8s';

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from ( %s ) t limit 200',
    v_sql
  ) into v_result;

  return public.scrub_secrets(v_result);
end;
$function$;

-- ---------------------------------------------------------------------------
-- ٤) scrub_secrets يغطي المفاتيح العربية كذلك
-- ---------------------------------------------------------------------------
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
    )
      and k not in ('رمز_الدخول', 'كلمة_السر', 'السر', 'التوكن', 'المفتاح_السري');
    return v_out;
  end if;

  return p;
end;
$function$;
