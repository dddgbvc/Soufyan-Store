-- عمليات SAS4 المباشرة من التطبيق (تجديد، تمديد، تغيير باقة، تعديل، إعادة تسمية، إنشاء مشترك).
-- الخادم (Cloudflare Worker) هو الذي يتصل بـ SAS4. هنا فقط: فحص الصلاحية، منع التكرار، وسجل تدقيق لكل عملية.
-- • لا تُحفظ أي كلمة مرور (لا لحساب الموزع ولا للمشترك) في هذا الجدول.
-- • كل عملية لها client_ref ثابت من التطبيق: إعادة الإرسال لا تكرر التجديد لدى المزوّد.
-- • عملية بنتيجة غير مؤكدة (unknown) تمنع إعادة المحاولة بنفس المرجع حتى يُتحقق من المشترك.
-- • لا تمس جداول المال أو الديون: ترحيل الدين يبقى عبر isp_renewal_* المعتمدة.

create table if not exists public.sas_direct_ops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  reseller_account_id uuid not null references public.sas_reseller_accounts(id),
  employee_id uuid not null,
  op text not null check (op in ('renew', 'extend', 'change_profile', 'edit', 'rename', 'create')),
  sas_user_id bigint,
  client_ref text not null check (client_ref ~ '^[A-Za-z0-9_-]{8,80}$'),
  transaction_id uuid not null default gen_random_uuid(),
  summary jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'unknown')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (tenant_id, client_ref)
);
create index if not exists sas_direct_ops_user_idx on public.sas_direct_ops (reseller_account_id, sas_user_id, created_at desc);
alter table public.sas_direct_ops enable row level security;
revoke all on public.sas_direct_ops from public, anon, authenticated;

-- حساب الموزع الذي تخصّه بيانات الدخول المحفوظة في الخادم: SAS4_ACCOUNT_ID إن حُدد،
-- وإلا الحساب الوحيد الفعّال في المحل (إن وُجد أكثر من حساب يجب تحديده، حتى لا يعمل موظف على حساب غير حسابه).
create or replace function public.web_sas_direct_account(p_s public.app_sessions, p_account uuid, p_perm text)
returns public.sas_reseller_accounts language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_id uuid := p_account;
begin
  if v_id is null then
    if (select count(*) from public.sas_reseller_accounts where tenant_id = p_s.tenant_id and deleted_at is null and is_active) <> 1 then
      raise exception 'يوجد أكثر من حساب موزع: حدّد SAS4_ACCOUNT_ID في إعدادات الخادم.' using errcode = '22023';
    end if;
    select id into v_id from public.sas_reseller_accounts where tenant_id = p_s.tenant_id and deleted_at is null and is_active;
  end if;
  return public.isp__reseller_guard(p_s, v_id, p_perm);
end $$;
revoke execute on function public.web_sas_direct_account(public.app_sessions, uuid, text) from public, anon, authenticated;

-- فحص قراءة مباشرة: جلسة + صلاحية قراءة المشتركين على حساب الموزع.
create or replace function public.web_sas_direct_read(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_acc public.sas_reseller_accounts;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  v_acc := public.web_sas_direct_account(v_s, nullif(p_params->>'account_id', '')::uuid, 'subscribers.read');
  return jsonb_build_object('ok', true, 'account_id', v_acc.id, 'account_name', v_acc.name);
end $$;

-- بدء عملية: يفحص الجلسة وصلاحية الموظف على حساب الموزع، ويمنع التكرار، ويرجع transaction_id للمزوّد.
create or replace function public.web_sas_op_begin(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_acc public.sas_reseller_accounts;
  v_op text := coalesce(p_payload->>'op', '');
  v_ref text := coalesce(p_payload->>'client_ref', '');
  v_perm text;
  v_row public.sas_direct_ops;
  v_summary jsonb := coalesce(p_payload->'summary', '{}'::jsonb);
begin
  v_s := public.web_guard(p_session_id, 'customers');
  v_perm := case v_op
    when 'renew' then 'subscribers.renew' when 'extend' then 'subscribers.renew'
    when 'change_profile' then 'subscribers.update' when 'edit' then 'subscribers.update' when 'rename' then 'subscribers.update'
    when 'create' then 'subscribers.create' end;
  if v_perm is null then raise exception 'عملية غير مسموحة' using errcode = '22023'; end if;
  if v_ref !~ '^[A-Za-z0-9_-]{8,80}$' then raise exception 'مرجع العملية غير صالح' using errcode = '22023'; end if;
  if jsonb_typeof(v_summary) <> 'object' or length(v_summary::text) > 4000 or v_summary ?| array['password', 'new_password', 'pin'] then
    raise exception 'ملخص العملية غير صالح' using errcode = '22023';
  end if;
  v_acc := public.web_sas_direct_account(v_s, nullif(p_payload->>'account_id', '')::uuid, v_perm);

  select * into v_row from public.sas_direct_ops where tenant_id = v_s.tenant_id and client_ref = v_ref;
  if found then
    if v_row.op <> v_op or v_row.employee_id <> v_s.employee_id then
      raise exception 'مرجع العملية مستعمل لعملية أخرى' using errcode = '22023';
    end if;
    if v_row.status = 'success' then
      return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_row.id, 'status', v_row.status,
                                'transaction_id', v_row.transaction_id, 'result', v_row.result);
    end if;
    if v_row.status = 'failed' then
      raise exception 'رُفضت هذه العملية سابقاً: %', coalesce(v_row.error, '') using errcode = 'P0001';
    end if;
    raise exception 'هذه العملية أُرسلت سابقاً ولم تتأكد نتيجتها. افتح المشترك في SAS4 وتحقق قبل إعادة المحاولة.' using errcode = 'P0001';
  end if;

  if (select count(*) from public.sas_direct_ops where reseller_account_id = v_acc.id and created_at > now() - interval '1 minute') >= 15 then
    raise exception 'عمليات كثيرة على حساب الموزع. انتظر دقيقة.' using errcode = 'P0001';
  end if;
  -- تجديد آخر لنفس المشترك خلال دقيقتين يحتاج تأكيداً صريحاً من التطبيق (تفادي الضغط المزدوج).
  if v_op in ('renew', 'extend') and coalesce((p_payload->>'confirm_repeat')::boolean, false) = false and exists (
       select 1 from public.sas_direct_ops where reseller_account_id = v_acc.id and sas_user_id = nullif(p_payload->>'sas_user_id', '')::bigint
         and op in ('renew', 'extend') and status in ('success', 'pending', 'unknown') and created_at > now() - interval '2 minutes') then
    raise exception 'هذا المشترك جُدّد قبل لحظات. تحقق قبل تجديده مرة ثانية.' using errcode = 'P0001';
  end if;

  insert into public.sas_direct_ops (tenant_id, reseller_account_id, employee_id, op, sas_user_id, client_ref, summary)
  values (v_s.tenant_id, v_acc.id, v_s.employee_id, v_op, nullif(p_payload->>'sas_user_id', '')::bigint, v_ref, v_summary)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'duplicate', false, 'id', v_row.id, 'status', v_row.status, 'transaction_id', v_row.transaction_id);
end $$;

-- إنهاء عملية: يستدعيه الخادم فقط بعد رد SAS4.
create or replace function public.web_sas_op_finish(p_id uuid, p_status text, p_result jsonb default null, p_error text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
begin
  if p_status not in ('success', 'failed', 'unknown') then raise exception 'حالة غير صالحة' using errcode = '22023'; end if;
  update public.sas_direct_ops
     set status = p_status, result = p_result, error = left(p_error, 500), finished_at = now()
   where id = p_id and status = 'pending';
  return jsonb_build_object('ok', found);
end $$;

-- سجل عمليات التطبيق على مشترك (أو آخر العمليات على الحساب).
create or replace function public.web_sas_ops_list(p_session_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp' as $$
declare
  v_s public.app_sessions;
  v_acc public.sas_reseller_accounts;
begin
  v_s := public.web_guard(p_session_id, 'customers');
  v_acc := public.web_sas_direct_account(v_s, nullif(p_params->>'account_id', '')::uuid, 'subscribers.read');
  return jsonb_build_object('ok', true, 'ops', coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'op', o.op, 'sas_user_id', o.sas_user_id, 'status', o.status,
             'summary', o.summary, 'error', o.error, 'created_at', o.created_at, 'finished_at', o.finished_at,
             'employee', e.name) order by o.created_at desc)
      from (select * from public.sas_direct_ops
             where reseller_account_id = v_acc.id
               and (nullif(p_params->>'sas_user_id', '') is null or sas_user_id = (p_params->>'sas_user_id')::bigint)
             order by created_at desc limit 50) o
      left join public.employees e on e.id = o.employee_id), '[]'::jsonb));
end $$;

revoke execute on function public.web_sas_direct_read(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_sas_op_begin(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.web_sas_op_finish(uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.web_sas_ops_list(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.web_sas_direct_read(uuid, jsonb) to service_role;
grant execute on function public.web_sas_op_begin(uuid, jsonb) to service_role;
grant execute on function public.web_sas_op_finish(uuid, text, jsonb, text) to service_role;
grant execute on function public.web_sas_ops_list(uuid, jsonb) to service_role;
