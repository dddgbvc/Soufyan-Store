-- ياقوت أندرويد: إشعارات التطبيق الأصلي بدون Firebase
-- الهاتف يسجّل رمزاً سرياً مرتبطاً بالموظف (بصمة sha256 فقط في web_push_subscriptions بنقطة 'native:')،
-- ثم يسأل كل بضع دقائق في الخلفية عن الجديد في صندوق الموظف (web_notifications).
-- نفس المحتوى ونفس التفضيلات والصلاحيات وساعات الهدوء التي يحددها مركز الإشعارات.

create or replace function public.web_native_register(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s    public.app_sessions;
  v_hash text := p_payload->>'token_hash';
  v_user text;
  v_now  bigint := public.web_push_now();
begin
  v_s := public.web_guard(p_session_id);
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then raise exception 'رمز الجهاز غير صالح' using errcode = '22023'; end if;
  v_user := 'emp:' || v_s.employee_id::text;
  if (select count(*) from public.web_push_subscriptions where user_id = v_user) >= 20
     and not exists (select 1 from public.web_push_subscriptions where id = v_hash) then
    raise exception 'وصلت إلى الحد الأقصى للأجهزة' using errcode = '23514';
  end if;
  insert into public.web_push_subscriptions (id, user_id, endpoint, p256dh, auth, device_name, created_at, updated_at)
  values (v_hash, v_user, 'native:android:' || left(v_hash, 12), '-', '-',
          left(coalesce(nullif(p_payload->>'device_name', ''), 'Android'), 80) || ' (تطبيق)', v_now, v_now)
  on conflict (id) do update set user_id = excluded.user_id, device_name = excluded.device_name, updated_at = excluded.updated_at;
  return jsonb_build_object('ok', true,
    'last_id', coalesce((select max(id) from public.web_notifications where employee_id = v_s.employee_id), 0));
end
$$;

create or replace function public.web_native_unregister(p_token_hash text)
returns jsonb language sql security definer set search_path to 'public', 'pg_temp' as $$
  with d as (delete from public.web_push_subscriptions where id = p_token_hash and endpoint like 'native:%' returning 1)
  select jsonb_build_object('ok', true, 'removed', (select count(*) from d))
$$;

-- استطلاع الخلفية: لا يحتاج جلسة PIN، الرمز السري للجهاز يكفي (مثل اشتراك Web Push).
create or replace function public.web_native_poll(p_token_hash text, p_since bigint)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_sub  public.web_push_subscriptions;
  v_emp  public.employees;
  v_last bigint;
begin
  select * into v_sub from public.web_push_subscriptions where id = p_token_hash and endpoint like 'native:%';
  if not found then return jsonb_build_object('ok', false, 'reason', 'unregistered'); end if;
  select * into v_emp from public.employees where id = substr(v_sub.user_id, 5)::uuid and status = 'active';
  if not found or not exists (select 1 from public.tenants t where t.id = v_emp.tenant_id and t.status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;
  update public.web_push_subscriptions set updated_at = public.web_push_now() where id = p_token_hash;
  v_last := coalesce((select max(id) from public.web_notifications where employee_id = v_emp.id), 0);
  if p_since is null or p_since <= 0 then
    return jsonb_build_object('ok', true, 'last_id', v_last, 'items', '[]'::jsonb, 'quiet', false);
  end if;
  return jsonb_build_object('ok', true, 'last_id', v_last,
    'quiet', public.web_push_in_quiet(public.web_push_prefs_get(v_sub.user_id)),
    'unread', (select count(*) from public.web_notifications where employee_id = v_emp.id and read_at is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'url', n.url) order by n.id)
        from (select * from public.web_notifications
               where employee_id = v_emp.id and id > p_since and read_at is null
               order by id limit 20) n), '[]'::jsonb));
end
$$;

revoke execute on function public.web_native_register(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_native_unregister(text) from public, anon, authenticated;
revoke execute on function public.web_native_poll(text, bigint) from public, anon, authenticated;
grant execute on function public.web_native_register(uuid, jsonb) to service_role;
grant execute on function public.web_native_unregister(text) to service_role;
grant execute on function public.web_native_poll(text, bigint) to service_role;
