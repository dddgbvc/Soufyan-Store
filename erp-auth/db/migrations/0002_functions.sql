-- =============================================================================
-- 0002_functions.sql — helper functions, triggers and integrity guards
-- =============================================================================

-- ---------------------------------------------------------------------------
-- updated_at bookkeeping
-- ---------------------------------------------------------------------------
create or replace function erp_auth.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employees_touch_updated_at on erp_auth.employees;
create trigger employees_touch_updated_at
  before update on erp_auth.employees
  for each row execute function erp_auth.touch_updated_at();

-- ---------------------------------------------------------------------------
-- The audit trail is append only, at the database level.
-- ---------------------------------------------------------------------------
create or replace function erp_auth.deny_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'erp_auth.% is append-only (attempted %)', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists audit_logs_append_only on erp_auth.audit_logs;
create trigger audit_logs_append_only
  before update or delete on erp_auth.audit_logs
  for each row execute function erp_auth.deny_mutation();

-- ---------------------------------------------------------------------------
-- The system must always keep one reachable owner account.
-- ---------------------------------------------------------------------------
create or replace function erp_auth.guard_last_owner()
returns trigger
language plpgsql
as $$
declare
  v_remaining integer;
begin
  if tg_op = 'DELETE' then
    if not old.is_owner then return old; end if;
  else
    -- Still an active owner after the update: nothing to check.
    if new.is_owner and new.status = 'active' then return new; end if;
    if not old.is_owner then return new; end if;
  end if;

  select count(*) into v_remaining
  from erp_auth.employees e
  where e.is_owner
    and e.status = 'active'
    and e.id <> old.id;

  if v_remaining = 0 then
    raise exception 'cannot remove or disable the last active owner account'
      using errcode = 'restrict_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists employees_guard_last_owner on erp_auth.employees;
create trigger employees_guard_last_owner
  before update or delete on erp_auth.employees
  for each row execute function erp_auth.guard_last_owner();

-- ---------------------------------------------------------------------------
-- Atomic fixed-window rate limiter with exponential block escalation.
-- Returns (allowed, remaining, retry_after_seconds).
-- ---------------------------------------------------------------------------
create or replace function erp_auth.consume_rate_limit(
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer,
  p_block_seconds  integer default 0
)
returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
as $$
declare
  v_now     timestamptz := clock_timestamp();
  v_row     erp_auth.rate_limits%rowtype;
  v_block   integer;
begin
  if p_limit < 1 then
    raise exception 'p_limit must be >= 1';
  end if;

  insert into erp_auth.rate_limits (bucket, window_start, hits, updated_at)
  values (p_bucket, v_now, 0, v_now)
  on conflict (bucket) do nothing;

  select * into v_row from erp_auth.rate_limits where bucket = p_bucket for update;

  if not found then
    -- Row vanished (housekeeping ran between the two statements): recreate it.
    insert into erp_auth.rate_limits (bucket, window_start, hits, updated_at)
    values (p_bucket, v_now, 0, v_now)
    returning * into v_row;
  end if;

  -- Currently serving a penalty.
  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return query
      select false, 0, greatest(1, ceil(extract(epoch from v_row.blocked_until - v_now))::integer);
    return;
  end if;

  -- Window rollover clears the counter; the strike history decays with it.
  if v_row.window_start < v_now - make_interval(secs => p_window_seconds) then
    v_row.window_start  := v_now;
    v_row.hits          := 0;
    v_row.blocked_until := null;
    v_row.strikes       := greatest(0, v_row.strikes - 1);
  end if;

  v_row.hits := v_row.hits + 1;

  if v_row.hits > p_limit then
    v_row.strikes := v_row.strikes + 1;
    if p_block_seconds > 0 then
      -- 1x, 2x, 4x, 8x, 16x the base penalty, capped at one hour.
      v_block := least(p_block_seconds * (2 ^ least(v_row.strikes - 1, 4))::integer, 3600);
      v_row.blocked_until := v_now + make_interval(secs => v_block);
    end if;

    update erp_auth.rate_limits
       set hits = v_row.hits,
           window_start = v_row.window_start,
           strikes = v_row.strikes,
           blocked_until = v_row.blocked_until,
           updated_at = v_now
     where bucket = p_bucket;

    return query
      select false,
             0,
             case
               when v_row.blocked_until is null
                 then greatest(1, ceil(extract(epoch from (v_row.window_start + make_interval(secs => p_window_seconds)) - v_now))::integer)
               else greatest(1, ceil(extract(epoch from v_row.blocked_until - v_now))::integer)
             end;
    return;
  end if;

  update erp_auth.rate_limits
     set hits = v_row.hits,
         window_start = v_row.window_start,
         strikes = v_row.strikes,
         blocked_until = null,
         updated_at = v_now
   where bucket = p_bucket;

  return query select true, p_limit - v_row.hits, 0;
end;
$$;

-- Clear a bucket after a legitimate success (e.g. correct PIN from that IP).
create or replace function erp_auth.reset_rate_limit(p_bucket text)
returns void
language sql
as $$
  delete from erp_auth.rate_limits where bucket = p_bucket;
$$;

-- ---------------------------------------------------------------------------
-- Authorization primitives — reused by the app layer AND by RLS policies.
-- ---------------------------------------------------------------------------
create or replace function erp_auth.employee_permission_keys(p_employee uuid)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(p.key order by p.key), array[]::text[])
  from erp_auth.employee_permissions ep
  join erp_auth.permissions p on p.id = ep.permission_id
  where ep.employee_id = p_employee;
$$;

-- Owner accounts implicitly hold every capability so the system can never be
-- locked out of its own permission editor.
create or replace function erp_auth.has_permission(p_employee uuid, p_key text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from erp_auth.employees e
    where e.id = p_employee
      and e.status = 'active'
      and e.is_owner
  )
  or exists (
    select 1
    from erp_auth.employee_permissions ep
    join erp_auth.permissions p on p.id = ep.permission_id
    join erp_auth.employees   e on e.id = ep.employee_id
    where ep.employee_id = p_employee
      and e.status = 'active'
      and p.key = p_key
  );
$$;

-- Resolves the acting employee for the current database connection, from the
-- Supabase Auth JWT and nothing else.
--
-- There is deliberately no session-variable override. A custom GUC can be SET
-- by any role, and `erp_auth_can` below is SECURITY DEFINER — so inside it the
-- current role is the owner, and no in-function role check could tell a browser
-- client apart from trusted server code. Rather than ship a guard that cannot
-- actually guard, the escape hatch is gone: server code that legitimately needs
-- to act for an employee connects as the schema owner and bypasses RLS outright,
-- which is exactly what the application layer does.
create or replace function erp_auth.current_employee_id()
returns uuid
language plpgsql
stable
as $$
declare
  v_claims text;
  v_uid     uuid;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true), '');
  if v_claims is null then
    return null;
  end if;

  begin
    v_uid := (v_claims::jsonb ->> 'sub')::uuid;
  exception when others then
    return null;
  end;

  if v_uid is null then
    return null;
  end if;

  return (
    select e.id
    from erp_auth.employees e
    where e.auth_user_id = v_uid
      and e.status = 'active'
  );
end;
$$;

create or replace function erp_auth.current_has_permission(p_key text)
returns boolean
language sql
stable
as $$
  select erp_auth.has_permission(erp_auth.current_employee_id(), p_key);
$$;

-- Integration hook: ERP tables living in `public` can write RLS policies as
--   using (public.erp_auth_can('inventory.view'))
-- Every reference inside is schema-qualified, so the search path is emptied
-- rather than merely ordered: a SECURITY DEFINER function should not resolve
-- anything through a path its caller can influence.
create or replace function public.erp_auth_can(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select erp_auth.current_has_permission(p_key);
$$;

comment on function public.erp_auth_can(text) is
  'Authorization hook for ERP modules: true when the current requester holds the given permission key.';

-- ---------------------------------------------------------------------------
-- Housekeeping: flip stale challenges to `expired` and drop dead rows.
-- ---------------------------------------------------------------------------
create or replace function erp_auth.purge_expired(p_retain_days integer default 30)
returns table (expired_challenges integer, deleted_sessions integer, deleted_otps integer, deleted_buckets integer)
language plpgsql
as $$
declare
  v_challenges integer;
  v_sessions   integer;
  v_otps       integer;
  v_buckets    integer;
begin
  update erp_auth.qr_login_challenges
     set status = 'expired'
   where status = 'pending'
     and expires_at <= now();
  get diagnostics v_challenges = row_count;

  delete from erp_auth.sessions
   where absolute_expires_at < now() - make_interval(days => p_retain_days);
  get diagnostics v_sessions = row_count;

  delete from erp_auth.otp_requests
   where expires_at < now() - make_interval(days => 1)
     and (reset_expires_at is null or reset_expires_at < now());
  get diagnostics v_otps = row_count;

  delete from erp_auth.rate_limits
   where updated_at < now() - interval '1 day'
     and (blocked_until is null or blocked_until < now());
  get diagnostics v_buckets = row_count;

  return query select v_challenges, v_sessions, v_otps, v_buckets;
end;
$$;
