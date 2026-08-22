-- ============================================================
-- ربط تسجيل الدخول بالـPIN بجدول app_sessions
--
-- الفائدة: تسجيل فتحات البرنامج يشتغل من هسه بدون أي تعديل بالبرنامج،
-- لأن verify_employee_pin أصلاً تُنادى عند كل فتح.
-- التوقيع ما تغير، وبس انضاف مفتاح 'session_id' للـJSON الراجع
-- (البرنامج القديم يتجاهله، والجديد يكدر يستعمله للنبضة والغلق).
--
-- إنشاء الجلسة ملفوف بـexception حتى أي خلل بيه ما يكسر تسجيل الدخول.
-- ============================================================

create or replace function public.verify_employee_pin(p_pin_hash text, p_terminal_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recent     int;
  v_emp        public.employees%rowtype;
  v_session_id uuid;
begin
  if p_pin_hash is null or length(p_pin_hash) < 32 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select count(*) into v_recent
  from public.pin_attempts
  where terminal_id = p_terminal_id
    and ok = false
    and at > now() - interval '2 minutes';

  if v_recent >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', 120);
  end if;

  select * into v_emp
  from public.employees
  where pin_hash = p_pin_hash and status = 'active'
  limit 1;

  if not found then
    insert into public.pin_attempts (terminal_id, ok) values (p_terminal_id, false);
    return jsonb_build_object(
      'ok', false, 'reason', 'wrong', 'remaining', greatest(0, 4 - v_recent));
  end if;

  insert into public.pin_attempts (terminal_id, ok) values (p_terminal_id, true);

  begin
    v_session_id := public.app_session_start(
      p_terminal_id  => p_terminal_id,
      p_employee_id  => v_emp.id,
      p_meta         => jsonb_build_object('source', 'pin')
    );
  exception when others then
    v_session_id := null;
  end;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'employee', jsonb_build_object(
      'id',         v_emp.id,
      'name',       coalesce(v_emp.display_name, v_emp.name),
      'role',       v_emp.role,
      'department', v_emp.department,
      'avatar_url', v_emp.avatar_url
    ),
    'permissions', to_jsonb(public.permissions_for(v_emp.role))
  );
end;
$function$;

revoke all on function public.verify_employee_pin(text,text) from public;
grant execute on function public.verify_employee_pin(text,text) to anon, authenticated;
