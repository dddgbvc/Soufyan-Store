-- ============================================================================
-- app_session_whoami — من صاحب هذه الجلسة؟ يجيب الخادم، لا المتصفح.
-- ----------------------------------------------------------------------------
-- هذه المهاجرة **اختيارية وغير مطبَّقة**. يعمل بدونها كل شيء، لكن استئناف
-- الجلسة بعد تحديث الصفحة يعتمد حينها على الهوية المحفوظة في المتصفح، بعد أن
-- يكون الخادم قد أكّد أن الجلسة ما تزال مفتوحة (`app_session_ping`).
--
-- بتطبيقها يصبح الاستئناف مثل الدخول تمامًا: الاسم والدور والصلاحيات تُقرأ من
-- قاعدة البيانات في كل إقلاع، فلا يبقى لتحرير `localStorage` أثر على ما يُعرض،
-- ويكفي إيقاف الموظف أو إغلاق جلسته ليخرج من النظام عند أول تحديث للصفحة.
--
-- الدالة للقراءة فقط: لا تكتب صفًّا ولا تفتح جلسة ولا تمدّد عمر جلسة.
-- شرط الصلاحية هنا هو شرط `app_session_ping` نفسه (`closed_at is null`) حتى لا
-- تتناقض الدالتان؛ وعمر الجلسة الأقصى يفرضه العميل عبر `sessionMaxHours`.
--
-- التطبيق:  supabase db push      أو نسخ ما يلي إلى محرّر SQL في لوحة المشروع.
-- التراجع:  drop function public.app_session_whoami(uuid);
-- ============================================================================

create or replace function public.app_session_whoami(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_employee_id uuid;
  v_emp         public.employees%rowtype;
begin
  select employee_id into v_employee_id
  from public.app_sessions
  where id = p_session_id
    and closed_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  -- جلسة جهاز بلا موظف: مفتوحة، لكنها لا تعرّف أحدًا.
  if v_employee_id is null then
    return jsonb_build_object('ok', false, 'reason', 'anonymous');
  end if;

  select * into v_emp
  from public.employees
  where id = v_employee_id and status = 'active';

  if v_emp.id is null then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;

  return jsonb_build_object(
    'ok', true,
    'employee', jsonb_build_object(
      'id',         v_emp.id,
      'name',       coalesce(v_emp.display_name, v_emp.name),
      'role',       v_emp.role,
      'department', v_emp.department,
      'avatar_url', v_emp.avatar_url),
    'permissions', to_jsonb(public.permissions_for(v_emp.role)));
end;
$function$;

-- نفس نمط الصلاحيات المتّبع في هذا المشروع: لا وصول مباشر إلى الجداول،
-- والدوال وحدها هي الواجهة. الدالة تُستدعى قبل وجود جلسة توثيق، فتحتاج anon.
revoke all on function public.app_session_whoami(uuid) from public;
grant execute on function public.app_session_whoami(uuid) to anon, authenticated, service_role;

comment on function public.app_session_whoami(uuid) is
  'هوية صاحب جلسة تشغيل مفتوحة وصلاحياته — قراءة فقط، يستدعيها العميل عند الإقلاع.';
