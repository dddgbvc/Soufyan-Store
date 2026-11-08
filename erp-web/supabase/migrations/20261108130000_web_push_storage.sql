-- ياقوت ويب: تخزين إشعارات Web Push في Supabase بدل Cloudflare D1.
-- user_id = 'emp:<employee uuid>' — هوية الموظف من جلسة حساب المحل + PIN.
-- الوصول عبر دوال service_role فقط؛ لا صلاحيات مباشرة لـ anon/authenticated.

create table if not exists public.web_push_subscriptions (
  id          text primary key,
  user_id     text not null,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  device_name text not null,
  created_at  bigint not null,
  updated_at  bigint not null
);
create index if not exists web_push_subscriptions_user_idx on public.web_push_subscriptions (user_id);

create table if not exists public.web_push_sends (
  id         text primary key,
  scope      text not null,
  title      text not null,
  body       text not null,
  created_at bigint not null,
  status     text not null,
  accepted   int not null default 0,
  failed     int not null default 0,
  expired    int not null default 0
);
create index if not exists web_push_sends_scope_time_idx on public.web_push_sends (scope, created_at);

alter table public.web_push_subscriptions enable row level security;
alter table public.web_push_sends enable row level security;
revoke all on public.web_push_subscriptions, public.web_push_sends from public, anon, authenticated;
grant select, insert, update, delete on public.web_push_subscriptions, public.web_push_sends to service_role;

create or replace function public.web_push_now() returns bigint
language sql volatile set search_path to 'pg_catalog' as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

-- أجهزة الموظف (مع المفاتيح للإرسال؛ مسار الحالة يعرض الاسم والتواريخ فقط).
create or replace function public.web_push_devices(p_user text)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
    'device_name', s.device_name, 'created_at', s.created_at, 'updated_at', s.updated_at)
    order by s.created_at desc), '[]'::jsonb)
  from (select * from public.web_push_subscriptions where user_id = p_user order by created_at desc limit 20) s
$$;

create or replace function public.web_push_subscribe(
  p_id text, p_user text, p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_owner text;
  v_now bigint := public.web_push_now();
begin
  select user_id into v_owner from public.web_push_subscriptions where id = p_id for update;
  if found and v_owner <> p_user then
    return jsonb_build_object('ok', false, 'reason', 'subscription_owner_mismatch');
  end if;
  if not found and (select count(*) from public.web_push_subscriptions where user_id = p_user) >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_devices');
  end if;
  insert into public.web_push_subscriptions (id, user_id, endpoint, p256dh, auth, device_name, created_at, updated_at)
  values (p_id, p_user, p_endpoint, p_p256dh, p_auth, left(coalesce(nullif(p_device, ''), 'جهاز'), 80), v_now, v_now)
  on conflict (id) do update
    set p256dh = excluded.p256dh, auth = excluded.auth,
        device_name = excluded.device_name, updated_at = excluded.updated_at;
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.web_push_unsubscribe(p_id text, p_user text)
returns jsonb language sql security definer set search_path to 'public', 'pg_temp' as $$
  with d as (delete from public.web_push_subscriptions where id = p_id and user_id = p_user returning 1)
  select jsonb_build_object('ok', true, 'removed', (select count(*) from d))
$$;

create or replace function public.web_push_remove_expired(p_id text)
returns jsonb language sql security definer set search_path to 'public', 'pg_temp' as $$
  with d as (delete from public.web_push_subscriptions where id = p_id returning 1)
  select jsonb_build_object('ok', true, 'removed', (select count(*) from d))
$$;

create or replace function public.web_push_history(p_scope text)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'title', h.title, 'body', h.body, 'created_at', h.created_at, 'status', h.status,
    'accepted', h.accepted, 'failed', h.failed, 'expired', h.expired) order by h.created_at desc), '[]'::jsonb)
  from (select * from public.web_push_sends where scope = p_scope order by created_at desc limit 10) h
$$;

-- حجز إرسال: نفس الطلب يُعاد كما هو، وحد 30 ثانية بين الإرسالات، ودفعة جارية تمنع غيرها 120 ثانية.
create or replace function public.web_push_send_claim(p_id text, p_scope text, p_title text, p_body text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_prev public.web_push_sends;
  v_now bigint := public.web_push_now();
begin
  perform pg_advisory_xact_lock(hashtext('web_push_send:' || p_scope));
  select * into v_prev from public.web_push_sends where id = p_id and scope = p_scope;
  if found then
    return jsonb_build_object('ok', false, 'replayed', true, 'id', v_prev.id, 'status', v_prev.status,
      'accepted', v_prev.accepted, 'failed', v_prev.failed, 'expired', v_prev.expired);
  end if;
  if exists (select 1 from public.web_push_sends
              where scope = p_scope
                and (created_at > v_now - 30000 or (status = 'sending' and created_at > v_now - 120000))) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into public.web_push_sends (id, scope, title, body, created_at, status)
  values (p_id, p_scope, p_title, p_body, v_now, 'sending');
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.web_push_send_update(
  p_id text, p_status text, p_accepted int, p_failed int, p_expired int)
returns jsonb language sql security definer set search_path to 'public', 'pg_temp' as $$
  update public.web_push_sends
     set status = coalesce(p_status, status), accepted = p_accepted, failed = p_failed, expired = p_expired
   where id = p_id;
  select jsonb_build_object('ok', true)
$$;

revoke execute on function public.web_push_devices(text) from public, anon, authenticated;
revoke execute on function public.web_push_subscribe(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.web_push_unsubscribe(text, text) from public, anon, authenticated;
revoke execute on function public.web_push_remove_expired(text) from public, anon, authenticated;
revoke execute on function public.web_push_history(text) from public, anon, authenticated;
revoke execute on function public.web_push_send_claim(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.web_push_send_update(text, text, int, int, int) from public, anon, authenticated;
grant execute on function public.web_push_devices(text) to service_role;
grant execute on function public.web_push_subscribe(text, text, text, text, text, text) to service_role;
grant execute on function public.web_push_unsubscribe(text, text) to service_role;
grant execute on function public.web_push_remove_expired(text) to service_role;
grant execute on function public.web_push_history(text) to service_role;
grant execute on function public.web_push_send_claim(text, text, text, text) to service_role;
grant execute on function public.web_push_send_update(text, text, int, int, int) to service_role;
