-- سجل العمليات للتطبيقات (ويب/أندرويد/iOS): قراءة activity_log بصياغة عربية مفهومة.
-- للمدير العام ومن لديه employees.permissions فقط. قراءة فقط.

create or replace function public.web_activity_feed(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s      public.app_sessions;
  v_emp    public.employees;
  v_limit  int := least(greatest(coalesce((p_params->>'limit')::int, 60), 1), 200);
  v_before bigint := nullif(p_params->>'before', '')::bigint;
  v_actor  text := nullif(btrim(coalesce(p_params->>'actor', '')), '');
  v_out    jsonb := '[]'::jsonb;
  a        public.activity_log;
  x        jsonb;
  v_last   bigint;
  v_scanned int := 0;
begin
  v_s := public.web_guard(p_session_id);
  select * into v_emp from public.employees where id = v_s.employee_id;
  if upper(coalesce(v_emp.role, '')) <> 'ADMIN' and not ('employees.permissions' = any(public.employee_permissions(v_emp))) then
    raise exception 'صلاحية غير كافية لهذا الإجراء (سجل العمليات).' using errcode = '42501';
  end if;

  for a in
    select * from public.activity_log
     where tenant_id = v_s.tenant_id
       and (v_before is null or id < v_before)
       and (v_actor is null or actor ilike '%' || v_actor || '%')
     order by id desc
     limit 2000
  loop
    v_scanned := v_scanned + 1;
    v_last := a.id;
    begin
      x := public.web_activity_text(a);
    exception when others then
      x := null;
    end;
    if x is not null then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'id', a.id, 'at', a.at, 'title', x->>'title', 'body', x->>'body', 'section', x->>'section',
        'table', a.table_name, 'action', a.action, 'actor', a.actor, 'source', a.source,
        'device', a.device_type, 'ip', host(a.ip)));
      exit when jsonb_array_length(v_out) >= v_limit;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'items', v_out, 'next_before', v_last, 'scanned', v_scanned);
end
$$;

revoke execute on function public.web_activity_feed(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.web_activity_feed(uuid, jsonb) to service_role;
