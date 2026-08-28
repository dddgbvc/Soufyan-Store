-- =============================================================================
-- 0003_rls.sql — grants, row level security and non-secret projections
-- -----------------------------------------------------------------------------
-- Defence in depth. The trusted server layer connects as the schema owner and
-- therefore bypasses RLS by design; every OTHER database role is denied at two
-- independent levels: no privileges at all, and restrictive policies on top.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Projections that are safe to expose: no hashes, no blind index, no tokens.
-- ---------------------------------------------------------------------------
create or replace view erp_auth.employee_directory
with (security_invoker = true)
as
  select e.id,
         e.employee_code,
         e.full_name,
         e.email,
         e.phone,
         e.job_title,
         e.status,
         e.avatar_url,
         e.is_owner,
         e.must_change_pin,
         (e.pin_hash is not null)                              as has_pin,
         (e.auth_user_id is not null)                          as has_password_login,
         (e.locked_until is not null and e.locked_until > now()) as is_locked,
         e.locked_until,
         e.last_login_at,
         e.last_login_method,
         e.created_at,
         e.updated_at
  from erp_auth.employees e;

comment on view erp_auth.employee_directory is
  'Employee record without any credential material. Safe for API responses.';

-- ---------------------------------------------------------------------------
-- Privileges: nothing is reachable from the browser-facing roles.
-- ---------------------------------------------------------------------------
revoke all on schema erp_auth from public;
revoke all on all tables    in schema erp_auth from public;
revoke all on all functions in schema erp_auth from public;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema erp_auth from %I', r);
      execute format('revoke all on all tables in schema erp_auth from %I', r);
      execute format('revoke all on all sequences in schema erp_auth from %I', r);
      execute format('revoke all on all functions in schema erp_auth from %I', r);
    end if;
  end loop;

  -- The Supabase service role is the trusted server identity.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema erp_auth to service_role';
    execute 'grant select, insert, update, delete on all tables in schema erp_auth to service_role';
    execute 'grant usage, select on all sequences in schema erp_auth to service_role';
    execute 'grant execute on all functions in schema erp_auth to service_role';
    execute 'alter default privileges in schema erp_auth grant select, insert, update, delete on tables to service_role';
    execute 'alter default privileges in schema erp_auth grant execute on functions to service_role';
  end if;

  -- The authorization hook is deliberately callable by end-user roles: it only
  -- ever answers yes/no about the caller's own capabilities.
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.erp_auth_can(text) to %I', r);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table erp_auth.employees             enable row level security;
alter table erp_auth.permissions           enable row level security;
alter table erp_auth.modules               enable row level security;
alter table erp_auth.employee_permissions  enable row level security;
alter table erp_auth.sessions              enable row level security;
alter table erp_auth.otp_requests          enable row level security;
alter table erp_auth.qr_login_challenges   enable row level security;
alter table erp_auth.audit_logs            enable row level security;
alter table erp_auth.rate_limits           enable row level security;

-- Credential stores: no policy is ever created for these tables, so every
-- non-owner role is denied unconditionally. This is intentional.
--   erp_auth.otp_requests
--   erp_auth.qr_login_challenges
--   erp_auth.rate_limits

-- employees ------------------------------------------------------------------
drop policy if exists employees_read_self on erp_auth.employees;
create policy employees_read_self
  on erp_auth.employees for select
  using (id = erp_auth.current_employee_id());

drop policy if exists employees_read_with_permission on erp_auth.employees;
create policy employees_read_with_permission
  on erp_auth.employees for select
  using (erp_auth.current_has_permission('employees.view'));

drop policy if exists employees_write_with_permission on erp_auth.employees;
create policy employees_write_with_permission
  on erp_auth.employees for update
  using (erp_auth.current_has_permission('employees.update'))
  with check (erp_auth.current_has_permission('employees.update'));

-- modules / permissions catalogue -------------------------------------------
drop policy if exists modules_read_authenticated on erp_auth.modules;
create policy modules_read_authenticated
  on erp_auth.modules for select
  using (erp_auth.current_employee_id() is not null);

drop policy if exists permissions_read_authenticated on erp_auth.permissions;
create policy permissions_read_authenticated
  on erp_auth.permissions for select
  using (erp_auth.current_employee_id() is not null);

-- employee_permissions -------------------------------------------------------
drop policy if exists employee_permissions_read_self on erp_auth.employee_permissions;
create policy employee_permissions_read_self
  on erp_auth.employee_permissions for select
  using (employee_id = erp_auth.current_employee_id());

drop policy if exists employee_permissions_read_admin on erp_auth.employee_permissions;
create policy employee_permissions_read_admin
  on erp_auth.employee_permissions for select
  using (erp_auth.current_has_permission('employees.permissions'));

drop policy if exists employee_permissions_write_admin on erp_auth.employee_permissions;
create policy employee_permissions_write_admin
  on erp_auth.employee_permissions for all
  using (erp_auth.current_has_permission('employees.permissions'))
  with check (erp_auth.current_has_permission('employees.permissions'));

-- sessions -------------------------------------------------------------------
-- Readable metadata only for the owning employee; token hashes are never
-- selected by anything but the server layer.
drop policy if exists sessions_read_self on erp_auth.sessions;
create policy sessions_read_self
  on erp_auth.sessions for select
  using (employee_id = erp_auth.current_employee_id());

drop policy if exists sessions_revoke_self on erp_auth.sessions;
create policy sessions_revoke_self
  on erp_auth.sessions for update
  using (employee_id = erp_auth.current_employee_id())
  with check (employee_id = erp_auth.current_employee_id());

-- audit_logs -----------------------------------------------------------------
drop policy if exists audit_logs_read_admin on erp_auth.audit_logs;
create policy audit_logs_read_admin
  on erp_auth.audit_logs for select
  using (erp_auth.current_has_permission('settings.view'));

drop policy if exists audit_logs_read_self on erp_auth.audit_logs;
create policy audit_logs_read_self
  on erp_auth.audit_logs for select
  using (employee_id = erp_auth.current_employee_id());
