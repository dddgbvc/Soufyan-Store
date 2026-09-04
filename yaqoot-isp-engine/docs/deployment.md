# Deployment

## Before you touch production

The migrations in `supabase/migrations/` have **not** been applied to the live
Soufyan ERP project. They were verified against a local PostgreSQL 16 instance.
Applying them to production is a deliberate, separate decision.

```bash
PGHOST=/path/to/socket ./supabase/tests/run-local.sh
```

This drops and recreates a scratch database, loads
`supabase/tests/erp_prerequisites.sql` (the ERP objects this module depends
on), applies all five migrations in order, and runs the integration test.
It must print `ALL INTEGRATION CHECKS PASSED`.

---

## What the migrations do

| File                          | Effect                                                        |
|-------------------------------|---------------------------------------------------------------|
| `isp_001_schema.sql`          | Creates 22 `isp_*` tables, indexes, `updated_at` triggers      |
| `isp_002_security.sql`        | RLS enabled + forced, **no policies**, grants revoked          |
| `isp_003_functions.sql`       | Session login/guard/logout, audit, capability sync, idempotency|
| `isp_004_erp_integration.sql` | Renewal posting, reconciliation, dashboard, WhatsApp templates |
| `isp_005_grants.sql`          | Grants 10 public RPCs; helpers stay `service_role`             |

**All additive.** No existing table, function, trigger or policy is altered or
dropped. The only writes to existing tables are two `INSERT … ON CONFLICT DO
NOTHING` rows into `wa_templates` (`isp_renewal`, `isp_expiry_reminder`).

### Existing behaviour this touches at runtime

`isp_renewal_post()` inserts into `public.invoices`, which fires the existing
`trg_wa_new_invoice` trigger. That trigger queues a handset-sale receipt, which
is the wrong copy for an internet renewal, so the function marks that queued row
`skipped` and queues the `isp_renewal` template instead — within the same
transaction. Handset sales are untouched.

It also updates `customers.balance` for `DEBT` invoices. No trigger does this in
the ERP; the client application does it, so the RPC must. The convention
(positive balance = the customer owes the shop) matches
`bot_record_debt_payment()`.

---

## Applying to production

1. **Back up.** Supabase → Database → Backups, or `pg_dump`.
2. Apply in order, one file at a time, checking each:

```bash
supabase db push        # if the project is linked to this repo
# or, per file:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260904120000_isp_001_schema.sql
```

3. Verify the security posture actually landed:

```sql
-- every isp_* table: rls on, zero policies
select c.relname, c.relrowsecurity,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename=c.relname) as policies
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname like 'isp\_%' and c.relkind='r'
 order by 1;
```

Expect `relrowsecurity = true` and `policies = 0` for every row. A non-zero
policy count means something re-opened direct table access.

4. Seed at least one provider:

```sql
insert into public.isp_providers (adapter_key, name, display_name)
values ('mock', 'mock', 'مزود تجريبي');
```

---

## Rollback

Because everything is additive, rollback is a drop of the module's own objects:

```sql
begin;
drop table if exists
  public.isp_audit, public.isp_module_sessions, public.isp_settings,
  public.isp_api_requests, public.isp_sync_logs, public.isp_sync_jobs,
  public.isp_support_tickets, public.isp_test_accounts,
  public.isp_session_events, public.isp_sessions,
  public.isp_idempotency, public.isp_transactions,
  public.isp_wallet_transactions, public.isp_wallets,
  public.isp_subscriptions, public.isp_subscribers,
  public.isp_package_prices, public.isp_packages,
  public.isp_agents, public.isp_provider_capabilities,
  public.isp_provider_connections, public.isp_providers
  cascade;

delete from public.wa_templates where kind in ('isp_renewal','isp_expiry_reminder');
commit;
```

Then drop the `isp_*` functions. **Invoices created by the module stay** —
they are real ERP invoices and deleting them would corrupt the ledger.

---

## Application environment

| Variable                      | Where    | Notes                                    |
|-------------------------------|----------|------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`    | client   | safe to expose                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| client  | safe: RLS denies all `isp_*` tables      |
| `SUPABASE_SERVICE_ROLE_KEY`   | server   | **never** expose or log                  |
| `ISP_SESSION_SECRET`          | server   | 32 random bytes, base64                  |
| `ISP_ENABLED_ADAPTERS`        | server   | e.g. `mock` or `mock,earthlink`          |
| `ISP_MOCK_PROFILE`            | server   | demo/testing only                        |

Set `ISP_ENABLED_ADAPTERS` to exclude `mock` in production once a real provider
is integrated.

---

## Scheduled jobs

`isp_queue_expiry_reminders(days)` queues WhatsApp reminders for subscriptions
about to expire. It is `service_role`-only. Schedule with `pg_cron`:

```sql
select cron.schedule('isp-expiry-reminders', '0 7 * * *',
  $$ select public.isp_queue_expiry_reminders(3) $$);
```

It will not re-notify the same subscriber within seven days.

`isp_sessions_gc()` clears expired module sessions; it also runs on each login.

---

## Multi-instance note

`lib/isp/providerSession.ts` keeps provider sessions in process memory. Behind
more than one server instance, operators would be bounced to the provider login
whenever a request hit a different instance. Back it with Redis or a
server-side table before scaling out. It fails closed — a missing session means
re-authenticate, never unauthenticated access.
