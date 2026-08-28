-- =============================================================================
-- 0001_schema.sql — ERP Authentication & Permissions core schema
-- -----------------------------------------------------------------------------
-- Everything lives in a dedicated `erp_auth` schema so that this system can be
-- dropped into an existing ERP database without colliding with business tables.
-- The schema is intentionally NOT exposed through the Supabase Data API: the
-- only component allowed to touch it is the server-side auth layer.
-- =============================================================================

create schema if not exists erp_auth;

comment on schema erp_auth is
  'Authentication, authorization, sessions and audit trail for the ERP. Never expose through the public Data API.';

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
do $$ begin
  create type erp_auth.employee_status as enum ('active', 'disabled', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type erp_auth.auth_method as enum ('pin', 'password', 'qr');
exception when duplicate_object then null; end $$;

do $$ begin
  create type erp_auth.otp_purpose as enum ('pin_reset');
exception when duplicate_object then null; end $$;

do $$ begin
  create type erp_auth.qr_status as enum ('pending', 'approved', 'consumed', 'expired', 'revoked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type erp_auth.audit_severity as enum ('info', 'warning', 'critical');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- modules — one row per ERP area, drives the dynamic navigation
-- ---------------------------------------------------------------------------
create table if not exists erp_auth.modules (
  key         text primary key,
  name        text        not null,
  description text,
  icon        text,
  route       text,
  sort_order  integer     not null default 100,
  is_admin    boolean     not null default false,
  created_at  timestamptz not null default now(),
  constraint modules_key_format check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  constraint modules_name_len   check (char_length(btrim(name)) between 2 and 80)
);

-- ---------------------------------------------------------------------------
-- permissions — the atomic capability catalogue (module.action)
-- ---------------------------------------------------------------------------
create table if not exists erp_auth.permissions (
  id           uuid primary key default gen_random_uuid(),
  key          text        not null,
  module       text        not null references erp_auth.modules (key) on update cascade on delete cascade,
  action       text        not null,
  name         text        not null,
  description  text,
  is_dangerous boolean     not null default false,
  sort_order   integer     not null default 100,
  created_at   timestamptz not null default now(),
  constraint permissions_key_unique  unique (key),
  constraint permissions_key_format  check (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  constraint permissions_key_matches check (key = module || '.' || action)
);

create index if not exists permissions_module_idx on erp_auth.permissions (module, sort_order);

-- ---------------------------------------------------------------------------
-- employees — identity. PIN material is write-only from the application's POV.
-- ---------------------------------------------------------------------------
create table if not exists erp_auth.employees (
  id                uuid primary key default gen_random_uuid(),
  employee_code     text        not null,
  full_name         text        not null,
  email             text,
  phone             text,
  job_title         text,
  status            erp_auth.employee_status not null default 'active',
  avatar_url        text,

  -- Credential material. `pin_hash` is a slow salted KDF digest; `pin_lookup`
  -- is a keyed blind index (HMAC with a server-side pepper that never touches
  -- the database) which makes employee-less PIN login possible in O(1).
  pin_hash          text,
  pin_lookup        text,
  pin_set_at        timestamptz,
  must_change_pin   boolean     not null default false,

  -- Link to Supabase Auth for the email + password login path.
  auth_user_id      uuid,

  failed_attempts   integer     not null default 0,
  locked_until      timestamptz,
  last_login_at     timestamptz,
  last_login_method erp_auth.auth_method,

  is_owner          boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references erp_auth.employees (id) on delete set null,

  constraint employees_code_format  check (employee_code ~ '^[A-Za-z0-9._-]{2,32}$'),
  constraint employees_name_len     check (char_length(btrim(full_name)) between 2 and 120),
  constraint employees_email_format check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
  constraint employees_phone_format check (phone is null or phone ~ '^[0-9+][0-9 +()-]{4,24}$'),
  constraint employees_attempts_nonneg check (failed_attempts >= 0),
  -- A PIN is either fully configured or fully absent; never half-written.
  constraint employees_pin_pair     check (num_nonnulls(pin_hash, pin_lookup, pin_set_at) in (0, 3))
);

create unique index if not exists employees_code_key      on erp_auth.employees (lower(employee_code));
create unique index if not exists employees_email_key     on erp_auth.employees (lower(email))   where email is not null;
create unique index if not exists employees_pin_lookup_key on erp_auth.employees (pin_lookup)    where pin_lookup is not null;
create unique index if not exists employees_auth_user_key on erp_auth.employees (auth_user_id)   where auth_user_id is not null;
create index        if not exists employees_status_idx    on erp_auth.employees (status);

comment on column erp_auth.employees.pin_lookup is
  'HMAC-SHA256(server pepper, pin) blind index. Unique, so two employees can never share a PIN.';
comment on column erp_auth.employees.pin_hash is
  'scrypt digest of the peppered PIN. Never leaves the server, never logged.';

-- ---------------------------------------------------------------------------
-- employee_permissions — per-employee capability grants (no fixed roles)
-- ---------------------------------------------------------------------------
create table if not exists erp_auth.employee_permissions (
  employee_id   uuid        not null references erp_auth.employees (id)   on delete cascade,
  permission_id uuid        not null references erp_auth.permissions (id) on delete cascade,
  granted_at    timestamptz not null default now(),
  granted_by    uuid references erp_auth.employees (id) on delete set null,
  primary key (employee_id, permission_id)
);

create index if not exists employee_permissions_permission_idx on erp_auth.employee_permissions (permission_id);

-- ---------------------------------------------------------------------------
-- sessions — opaque, server-side, revocable
-- ---------------------------------------------------------------------------
create table if not exists erp_auth.sessions (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid        not null references erp_auth.employees (id) on delete cascade,
  token_hash          text        not null,
  method              erp_auth.auth_method not null,
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  expires_at          timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at          timestamptz,
  revoked_reason      text,
  ip                  inet,
  user_agent          text,
  device_label        text,
  rotated_from        uuid references erp_auth.sessions (id) on delete set null,
  constraint sessions_token_unique  unique (token_hash),
  constraint sessions_expiry_order  check (expires_at <= absolute_expires_at),
  constraint sessions_revoke_pair   check (num_nonnulls(revoked_at, revoked_reason) <> 1)
);

create index if not exists sessions_employee_idx on erp_auth.sessions (employee_id, created_at desc);
create index if not exists sessions_live_idx     on erp_auth.sessions (expires_at) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- otp_requests — short lived, hashed, single use, attempt limited
-- ---------------------------------------------------------------------------
create table if not exists erp_auth.otp_requests (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid        not null references erp_auth.employees (id) on delete cascade,
  purpose            erp_auth.otp_purpose not null default 'pin_reset',
  code_hash          text        not null,
  expires_at         timestamptz not null,
  attempts           integer     not null default 0,
  max_attempts       integer     not null default 5,
  verified_at        timestamptz,
  consumed_at        timestamptz,
  reset_token_hash   text,
  reset_expires_at   timestamptz,
  created_at         timestamptz not null default now(),
  request_ip         inet,
  request_user_agent text,
  constraint otp_attempts_range check (attempts >= 0 and attempts <= max_attempts),
  constraint otp_max_attempts   check (max_attempts between 1 and 10),
  constraint otp_reset_pair     check (num_nonnulls(reset_token_hash, reset_expires_at) <> 1)
);

create index        if not exists otp_requests_employee_idx on erp_auth.otp_requests (employee_id, created_at desc);
create index        if not exists otp_requests_live_idx     on erp_auth.otp_requests (expires_at) where consumed_at is null;
create unique index if not exists otp_reset_token_key       on erp_auth.otp_requests (reset_token_hash) where reset_token_hash is not null;

-- ---------------------------------------------------------------------------
-- qr_login_challenges — cross-device approval handshake
-- ---------------------------------------------------------------------------
create table if not exists erp_auth.qr_login_challenges (
  id                  uuid primary key default gen_random_uuid(),
  token_hash          text        not null,
  poll_secret_hash    text        not null,
  device_binding_hash text        not null,
  status              erp_auth.qr_status not null default 'pending',
  employee_id         uuid references erp_auth.employees (id) on delete cascade,
  approved_via        erp_auth.auth_method,
  scan_count          integer     not null default 0,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  approved_at         timestamptz,
  consumed_at         timestamptz,
  revoked_at          timestamptz,
  revoked_reason      text,
  created_ip          inet,
  created_user_agent  text,
  approved_ip         inet,
  approved_user_agent text,
  session_id          uuid references erp_auth.sessions (id) on delete set null,
  constraint qr_token_unique     unique (token_hash),
  constraint qr_scan_nonneg      check (scan_count >= 0),
  constraint qr_approved_state   check (status <> 'approved' or (employee_id is not null and approved_at is not null)),
  constraint qr_consumed_state   check (status <> 'consumed' or (employee_id is not null and consumed_at is not null)),
  constraint qr_revoked_state    check (status <> 'revoked'  or revoked_at is not null)
);

create index if not exists qr_challenges_status_idx   on erp_auth.qr_login_challenges (status, expires_at);
create index if not exists qr_challenges_employee_idx on erp_auth.qr_login_challenges (employee_id, created_at desc);

-- ---------------------------------------------------------------------------
-- audit_logs — append only security trail
-- ---------------------------------------------------------------------------
create table if not exists erp_auth.audit_logs (
  id                bigint generated always as identity primary key,
  event             text        not null,
  severity          erp_auth.audit_severity not null default 'info',
  success           boolean     not null default true,
  -- Deliberately NOT foreign keys. The trail is append-only, so a cascading
  -- "on delete set null" would have to UPDATE these rows — which the
  -- immutability trigger forbids, making employees undeletable. Keeping the
  -- raw identifiers means the history of a removed employee survives intact.
  employee_id       uuid,
  actor_employee_id uuid,
  session_id        uuid,
  target_type       text,
  target_id         text,
  ip                inet,
  user_agent        text,
  metadata          jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint audit_event_format check (event ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$'),
  constraint audit_metadata_obj check (jsonb_typeof(metadata) = 'object')
);

create index if not exists audit_logs_created_idx  on erp_auth.audit_logs (created_at desc);
create index if not exists audit_logs_event_idx    on erp_auth.audit_logs (event, created_at desc);
create index if not exists audit_logs_employee_idx on erp_auth.audit_logs (employee_id, created_at desc);
create index if not exists audit_logs_failure_idx  on erp_auth.audit_logs (created_at desc) where success = false;

-- ---------------------------------------------------------------------------
-- rate_limits — atomic fixed-window counters with escalating block
-- ---------------------------------------------------------------------------
create table if not exists erp_auth.rate_limits (
  bucket        text primary key,
  window_start  timestamptz not null default now(),
  hits          integer     not null default 0,
  strikes       integer     not null default 0,
  blocked_until timestamptz,
  updated_at    timestamptz not null default now(),
  constraint rate_limits_hits_nonneg check (hits >= 0 and strikes >= 0)
);

create index if not exists rate_limits_gc_idx on erp_auth.rate_limits (updated_at);
