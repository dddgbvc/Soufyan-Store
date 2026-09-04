-- ===========================================================================
-- ISP Engine — 001 — الهيكل الأساسي
-- ===========================================================================
-- وحدة مزودي الإنترنت داخل ياقوت / سفيان ERP.
--
-- ملاحظات معمارية مهمة:
--
-- 1) لا تُنشئ هذه الهجرة جداول فواتير أو ديون جديدة. النظام يملك أصلاً
--    public.invoices و public.invoice_items و public.customers و
--    public.debt_payments، وقاعدة §24 تمنع ازدواج الأنظمة. لذلك يربط
--    isp_transactions بين اشتراك المزود وبين فاتورة ياقوت الحقيقية.
--
-- 2) لا يظهر اسم أي مزود في الأعمدة. الهوية الخارجية دائماً
--    provider_id + external_*_id، وأي حقل خاص بمزود يسكن في metadata.
--
-- 3) كل الجداول عليها RLS مُفعّل بلا سياسات — تماماً كما في قسم الشراء —
--    فالوصول يمر حصراً عبر دوال SECURITY DEFINER في 003.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- المزودون والاتصالات
-- --------------------------------------------------------------------------

create table if not exists public.isp_providers (
  id              uuid primary key default gen_random_uuid(),
  adapter_key     text not null unique,
  name            text not null,
  display_name    text not null,
  logo_url        text,
  accent_color    text,
  country         text not null default 'IQ',
  currency        text not null default 'IQD',
  timezone        text not null default 'Asia/Baghdad',
  api_version     text,
  support_url     text,
  status          text not null default 'active'
                    check (status in ('active','inactive','suspended')),
  configuration   jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.isp_providers is
  'مزودو خدمة الإنترنت المسجّلون. adapter_key يربط الصف بالمحوّل البرمجي.';

create table if not exists public.isp_provider_connections (
  id                    uuid primary key default gen_random_uuid(),
  provider_id           uuid not null references public.isp_providers(id) on delete cascade,
  connection_name       text not null,
  environment           text not null default 'production'
                          check (environment in ('sandbox','production')),
  status                text not null default 'disconnected'
                          check (status in ('connected','disconnected','error')),
  health_status         text not null default 'unknown'
                          check (health_status in ('healthy','degraded','down','unknown')),
  -- مؤشر إلى بيانات الاعتماد المحفوظة خارج القاعدة (Vault / متغيرات البيئة).
  -- لا تُخزَّن كلمات المرور أو المفاتيح هنا إطلاقاً.
  credentials_reference text,
  last_sync_at          timestamptz,
  last_success_at       timestamptz,
  last_error_at         timestamptz,
  last_error_reason     text,
  latency_ms            integer,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (provider_id, connection_name)
);

comment on table public.isp_provider_connections is
  'اتصالات المزود وحالتها الصحية. credentials_reference مؤشر فقط — الأسرار لا تُخزَّن في القاعدة.';

create table if not exists public.isp_provider_capabilities (
  provider_id  uuid not null references public.isp_providers(id) on delete cascade,
  capability   text not null,
  state        text not null default 'unknown'
                 check (state in ('supported','unsupported','partial','configurable','unknown')),
  note         text,
  detail       jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  primary key (provider_id, capability)
);

comment on table public.isp_provider_capabilities is
  'بيان قدرات كل مزود كما اكتشفها المحوّل بعد تسجيل الدخول. مصدر واجهة المستخدم.';

create table if not exists public.isp_agents (
  id                uuid primary key default gen_random_uuid(),
  provider_id       uuid not null references public.isp_providers(id) on delete cascade,
  external_agent_id text,
  name              text not null,
  phone             text,
  email             text,
  status            text not null default 'active' check (status in ('active','inactive')),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider_id, external_agent_id)
);

comment on table public.isp_agents is 'وكلاء البيع لدى كل مزود.';

-- --------------------------------------------------------------------------
-- الباقات والتسعير
-- --------------------------------------------------------------------------

create table if not exists public.isp_packages (
  id                  uuid primary key default gen_random_uuid(),
  provider_id         uuid not null references public.isp_providers(id) on delete cascade,
  external_package_id text not null,
  name                text not null,
  display_name        text not null,
  description         text,
  technology          text check (technology in ('pppoe','ftth','wireless','hotspot','other')),
  download_speed      numeric,
  upload_speed        numeric,
  duration_value      integer,
  duration_unit       text check (duration_unit in ('hour','day','week','month','year')),
  renewal_semantics   text not null default 'provider_defined'
                        check (renewal_semantics in
                          ('extend_from_expiry','start_from_now','fixed_cycle',
                           'calendar_month','provider_defined')),
  retail_price        numeric not null default 0,
  currency            text not null default 'IQD',
  billing_model       text not null default 'prepaid'
                        check (billing_model in
                          ('prepaid','postpaid','quota','unlimited','provider_defined')),
  active              boolean not null default true,
  metadata            jsonb not null default '{}'::jsonb,
  fetched_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider_id, external_package_id)
);

comment on table public.isp_packages is
  'باقات المزودين. لا يُفترض وجود سرعة أو مدة أو سعر جملة — كلها اختيارية.';

-- سعر الجملة منفصل عمداً: كثير من المزودين لا يرسلونه عبر الواجهة البرمجية،
-- فيُضبط في ياقوت. العمود origin يوضّح مصدر القيمة للمستخدم (§5).
create table if not exists public.isp_package_prices (
  id          uuid primary key default gen_random_uuid(),
  package_id  uuid not null references public.isp_packages(id) on delete cascade,
  kind        text not null default 'wholesale' check (kind in ('wholesale','retail_override')),
  amount      numeric not null,
  currency    text not null default 'IQD',
  origin      text not null default 'erp' check (origin in ('provider','erp')),
  effective_from timestamptz not null default now(),
  effective_to   timestamptz,
  note        text,
  created_at  timestamptz not null default now(),
  unique (package_id, kind, effective_from)
);

comment on table public.isp_package_prices is
  'تسعير الباقات بمدى زمني. origin يميّز ما جاء من المزود عمّا ضُبط في ياقوت.';

-- --------------------------------------------------------------------------
-- المشتركون والاشتراكات
-- --------------------------------------------------------------------------

create table if not exists public.isp_subscribers (
  id                     uuid primary key default gen_random_uuid(),
  provider_id            uuid not null references public.isp_providers(id) on delete cascade,
  external_subscriber_id text not null,
  -- الجسر إلى دفاتر ياقوت. يبقى فارغاً حتى يُربط المشترك بزبون فعلي.
  erp_customer_id        uuid references public.customers(id) on delete set null,
  full_name              text not null,
  phone_number           text,
  alternate_phone        text,
  address                text,
  area                   text,
  governorate            text,
  zone                   text,
  tower_id               text,
  network_node_id        text,
  technology             text check (technology in ('pppoe','ftth','wireless','hotspot','other')),
  username               text,
  status                 text not null default 'unknown'
                           check (status in
                             ('active','expiring','expired','suspended','disabled','pending','unknown')),
  metadata               jsonb not null default '{}'::jsonb,
  fetched_at             timestamptz,
  sync_status            text not null default 'never'
                           check (sync_status in ('ok','stale','error','never')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (provider_id, external_subscriber_id)
);

comment on table public.isp_subscribers is
  'سجل المشتركين لكل مزود. erp_customer_id يربطه بزبون ياقوت عند المطابقة.';

create index if not exists isp_subscribers_provider_status_idx
  on public.isp_subscribers (provider_id, status);
create index if not exists isp_subscribers_customer_idx
  on public.isp_subscribers (erp_customer_id) where erp_customer_id is not null;
create index if not exists isp_subscribers_username_idx
  on public.isp_subscribers (provider_id, username) where username is not null;
create index if not exists isp_subscribers_phone_idx
  on public.isp_subscribers (phone_number) where phone_number is not null;

create table if not exists public.isp_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  subscriber_id            uuid not null references public.isp_subscribers(id) on delete cascade,
  provider_id              uuid not null references public.isp_providers(id) on delete cascade,
  external_subscription_id text,
  package_id               uuid references public.isp_packages(id) on delete set null,
  status                   text not null default 'pending'
                             check (status in ('active','expired','suspended','cancelled','pending')),
  started_at               timestamptz,
  expires_at               timestamptz,
  suspended_at             timestamptz,
  metadata                 jsonb not null default '{}'::jsonb,
  fetched_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (provider_id, external_subscription_id)
);

comment on table public.isp_subscriptions is 'اشتراكات المشتركين وتواريخ انتهائها.';

create index if not exists isp_subscriptions_expiry_idx
  on public.isp_subscriptions (expires_at) where status = 'active';
create index if not exists isp_subscriptions_subscriber_idx
  on public.isp_subscriptions (subscriber_id);

-- --------------------------------------------------------------------------
-- المحفظة
-- --------------------------------------------------------------------------

create table if not exists public.isp_wallets (
  id                    uuid primary key default gen_random_uuid(),
  provider_id           uuid not null references public.isp_providers(id) on delete cascade,
  agent_id              uuid references public.isp_agents(id) on delete set null,
  currency              text not null default 'IQD',
  current_balance       numeric not null default 0,
  available_balance     numeric not null default 0,
  credit_limit          numeric,
  reserved_amount       numeric,
  low_balance_threshold numeric,
  last_synced_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (provider_id, agent_id)
);

comment on table public.isp_wallets is
  'لقطة رصيد محفظة الوكيل. الرصيد هنا نتيجة مزامنة — مصدر الحقيقة هو سجل الحركات.';

create table if not exists public.isp_wallet_transactions (
  id                      uuid primary key default gen_random_uuid(),
  wallet_id               uuid not null references public.isp_wallets(id) on delete cascade,
  provider_transaction_id text,
  type                    text not null default 'unknown'
                            check (type in ('recharge','activation','renewal','package_change',
                                            'refund','adjustment','commission','fee','unknown')),
  direction               text not null check (direction in ('credit','debit')),
  amount                  numeric not null,
  currency                text not null default 'IQD',
  balance_before          numeric,
  balance_after           numeric,
  reference_type          text,
  reference_id            text,
  status                  text not null default 'posted'
                            check (status in ('posted','pending','reversed')),
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  -- المفتاح الحقيقي لمنع الازدواج عند إعادة المزامنة.
  unique (wallet_id, provider_transaction_id)
);

comment on table public.isp_wallet_transactions is
  'حركات محفظة المزود — سجل إضافة فقط، وهو مصدر الحقيقة المالي لا رصيد المحفظة.';

create index if not exists isp_wallet_tx_wallet_created_idx
  on public.isp_wallet_transactions (wallet_id, created_at desc);

-- --------------------------------------------------------------------------
-- العمود الفقري المالي — يربط عملية المزود بفاتورة ياقوت
-- --------------------------------------------------------------------------

create table if not exists public.isp_transactions (
  id                    uuid primary key default gen_random_uuid(),
  provider_id           uuid not null references public.isp_providers(id) on delete restrict,
  subscriber_id         uuid references public.isp_subscribers(id) on delete set null,
  subscription_id       uuid references public.isp_subscriptions(id) on delete set null,
  package_id            uuid references public.isp_packages(id) on delete set null,
  kind                  text not null
                          check (kind in ('activation','renewal','package_change','test_account','refund','adjustment')),
  -- الحالة كما في §25. REQUIRES_RECONCILIATION تعني: نجحت العملية لدى المزود
  -- (أو لا نعرف) وفشل التسجيل المحلي — ممنوع إعادة المحاولة الآلية.
  state                 text not null default 'PENDING'
                          check (state in ('PENDING','PROCESSING','SUCCESS','FAILED',
                                           'REQUIRES_RECONCILIATION','CANCELLED')),
  failure_reason        text,
  -- الجسور إلى دفاتر ياقوت القائمة (لا جداول فواتير/ديون جديدة).
  erp_customer_id       uuid references public.customers(id) on delete set null,
  erp_invoice_id        uuid references public.invoices(id) on delete set null,
  wallet_transaction_id uuid references public.isp_wallet_transactions(id) on delete set null,
  external_reference    text,
  retail_amount         numeric not null default 0,
  -- قد يكون فارغاً: ليس كل مزود يكشف سعر الجملة. لا يُحسب الربح حينها.
  cost_amount           numeric,
  cost_origin           text not null default 'unavailable'
                          check (cost_origin in ('provider','erp','unavailable')),
  currency              text not null default 'IQD',
  idempotency_key       text not null,
  request_id            text,
  actor                 text,
  employee_id           uuid references public.employees(id) on delete set null,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (provider_id, idempotency_key)
);

comment on table public.isp_transactions is
  'كل عملية مالية/تزويدية: زبون ← اشتراك ← فاتورة ياقوت ← كلفة المزود ← حركة المحفظة.';

create index if not exists isp_transactions_state_idx
  on public.isp_transactions (state) where state <> 'SUCCESS';
create index if not exists isp_transactions_subscriber_idx
  on public.isp_transactions (subscriber_id, created_at desc);
create index if not exists isp_transactions_invoice_idx
  on public.isp_transactions (erp_invoice_id) where erp_invoice_id is not null;

-- سجل مفاتيح التكرار للعمليات المالية وأوامر الشبكة (§21).
create table if not exists public.isp_idempotency (
  key           text primary key,
  provider_id   uuid not null references public.isp_providers(id) on delete cascade,
  operation     text not null,
  state         text not null default 'PROCESSING'
                  check (state in ('PROCESSING','SUCCESS','FAILED','REQUIRES_RECONCILIATION')),
  result        jsonb,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

comment on table public.isp_idempotency is
  'حجز مفاتيح التكرار: أول من يحجز المفتاح ينفّذ، ومن يعيد الطلب يستلم النتيجة نفسها.';

-- --------------------------------------------------------------------------
-- الشبكة
-- --------------------------------------------------------------------------

create table if not exists public.isp_sessions (
  id             uuid primary key default gen_random_uuid(),
  subscriber_id  uuid not null references public.isp_subscribers(id) on delete cascade,
  online         boolean not null default false,
  username       text,
  mac_address    text,
  ip_address     text,
  ip_class       text check (ip_class in ('public','private')),
  started_at     timestamptz,
  uptime_seconds bigint,
  nas_identifier text,
  vlan           text,
  bytes_in       bigint,
  bytes_out      bigint,
  signal         jsonb,
  terminate_cause text,
  fetched_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (subscriber_id)
);

comment on table public.isp_sessions is 'آخر حالة جلسة معروفة لكل مشترك — بيانات مزامنة لا لحظية.';

create table if not exists public.isp_session_events (
  id            uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.isp_subscribers(id) on delete cascade,
  event         text not null,
  detail        jsonb not null default '{}'::jsonb,
  at            timestamptz not null default now()
);

comment on table public.isp_session_events is 'أحداث الجلسات: اتصال، قطع، تصفير MAC.';

create index if not exists isp_session_events_subscriber_idx
  on public.isp_session_events (subscriber_id, at desc);

create table if not exists public.isp_test_accounts (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid not null references public.isp_providers(id) on delete cascade,
  username     text not null,
  status       text not null default 'active' check (status in ('active','expired','revoked')),
  cost_amount  numeric,
  cost_origin  text not null default 'unavailable'
                 check (cost_origin in ('provider','erp','unavailable')),
  currency     text not null default 'IQD',
  created_by   uuid references public.employees(id) on delete set null,
  expires_at   timestamptz not null,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

comment on table public.isp_test_accounts is
  'الحسابات التجريبية. المدة والكلفة تأتيان من المزود — لا قيم افتراضية في النظام.';

create table if not exists public.isp_support_tickets (
  id                 uuid primary key default gen_random_uuid(),
  provider_id        uuid not null references public.isp_providers(id) on delete cascade,
  external_ticket_id text,
  subscriber_id      uuid references public.isp_subscribers(id) on delete set null,
  subject            text not null,
  status             text not null default 'open'
                       check (status in ('open','pending','resolved','closed')),
  priority           text check (priority in ('low','normal','high','urgent')),
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (provider_id, external_ticket_id)
);

comment on table public.isp_support_tickets is 'تذاكر الدعم المستوردة من المزود.';

-- --------------------------------------------------------------------------
-- المزامنة والمراقبة
-- --------------------------------------------------------------------------

create table if not exists public.isp_sync_jobs (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.isp_providers(id) on delete cascade,
  job_type      text not null
                  check (job_type in ('packages','subscribers','wallet','sessions','reconcile','capabilities')),
  status        text not null default 'pending'
                  check (status in ('pending','running','success','failed','partial')),
  started_at    timestamptz,
  finished_at   timestamptz,
  items_total   integer,
  items_ok      integer,
  items_failed  integer,
  attempt       integer not null default 1,
  next_retry_at timestamptz,
  error_reason  text,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

comment on table public.isp_sync_jobs is
  'مهام المزامنة مع المزود مع عدّاد المحاولات وموعد إعادة المحاولة (تراجع أسّي).';

create index if not exists isp_sync_jobs_pending_idx
  on public.isp_sync_jobs (provider_id, job_type, status);

create table if not exists public.isp_sync_logs (
  id         bigint generated always as identity primary key,
  job_id     uuid references public.isp_sync_jobs(id) on delete cascade,
  level      text not null default 'info' check (level in ('info','warn','error')),
  message    text not null,
  detail     jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);

comment on table public.isp_sync_logs is 'سجل تفصيلي لمهام المزامنة.';

create table if not exists public.isp_api_requests (
  id           bigint generated always as identity primary key,
  provider_id  uuid references public.isp_providers(id) on delete set null,
  operation    text not null,
  request_id   text,
  http_status  integer,
  duration_ms  integer,
  ok           boolean not null default false,
  error_reason text,
  attempt      integer not null default 1,
  at           timestamptz not null default now()
);

comment on table public.isp_api_requests is
  'قياسات نداءات المزود للوحة الصحة. لا تُسجَّل أي أسرار أو رؤوس مصادقة هنا.';

create index if not exists isp_api_requests_provider_at_idx
  on public.isp_api_requests (provider_id, at desc);

-- --------------------------------------------------------------------------
-- جلسات الوحدة والتدقيق والإعدادات — على نمط قسم الشراء
-- --------------------------------------------------------------------------

create table if not exists public.isp_module_sessions (
  token         text primary key,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  employee_name text not null,
  role          text not null,
  terminal_id   text,
  ip            inet,
  user_agent    text,
  revoked       boolean not null default false,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null
);

comment on table public.isp_module_sessions is
  'جلسات وحدة الإنترنت — رمز عشوائي مربوط بالموظف والجهاز وله عمر محدد.';

create index if not exists isp_module_sessions_employee_idx
  on public.isp_module_sessions (employee_id) where not revoked;

create table if not exists public.isp_audit (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       text,
  employee_id uuid references public.employees(id) on delete set null,
  role        text,
  terminal_id text,
  ip          inet,
  action      text not null,
  provider_id uuid references public.isp_providers(id) on delete set null,
  ref_table   text,
  ref_id      uuid,
  previous_state jsonb,
  new_state      jsonb,
  result      text,
  detail      jsonb not null default '{}'::jsonb
);

comment on table public.isp_audit is
  'سجل تدقيق وحدة الإنترنت — إضافة فقط، لا يُعدَّل ولا يُحذف.';

create index if not exists isp_audit_at_idx on public.isp_audit (at desc);
create index if not exists isp_audit_provider_idx on public.isp_audit (provider_id, at desc);

create table if not exists public.isp_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.isp_settings is 'إعدادات وحدة الإنترنت.';

-- --------------------------------------------------------------------------
-- المشغّلات (triggers) — نفس دالة touch_updated_at() المستخدمة في بقية النظام
-- --------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'isp_providers','isp_provider_connections','isp_agents','isp_packages',
    'isp_subscribers','isp_subscriptions','isp_wallets','isp_transactions',
    'isp_sessions','isp_support_tickets'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- نفس فكرة purchase_audit_immutable()، لكن برسالة تخص هذه الوحدة: رسالة
-- الدالة الأصلية تذكر purchase_audit صراحةً وستربك المشغّل هنا.
create or replace function public.isp_append_only()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  raise exception '% سجل للإضافة فقط — لا يُعدَّل ولا يُحذف', tg_table_name
    using errcode = '42501';
end;
$function$;

comment on function public.isp_append_only() is
  'يمنع التعديل والحذف على سجلات وحدة الإنترنت ذات طبيعة الإضافة فقط.';

drop trigger if exists isp_audit_immutable on public.isp_audit;
create trigger isp_audit_immutable
  before update or delete on public.isp_audit
  for each row execute function public.isp_append_only();

-- حركات المحفظة سجل إضافة فقط: التصحيح يكون بقيد عكسي لا بتعديل.
drop trigger if exists isp_wallet_tx_immutable on public.isp_wallet_transactions;
create trigger isp_wallet_tx_immutable
  before update or delete on public.isp_wallet_transactions
  for each row execute function public.isp_append_only();
