# Yaqoot ISP Engine — محرك إدارة مشتركي الإنترنت متعدد المزودين

A capability-driven ISP reseller & subscriber-management module for the
**Yaqoot / Soufyan ERP**. Arabic-first, RTL, multi-provider, and built so that
adding a second ISP requires **no change to any dashboard, widget, subscriber
or billing component**.

---

## What this is

The ERP owns the universal business model. Each provider adapter exposes only
what that provider can actually do. The UI is generated from the resulting
capability manifest — never from a provider name.

```
Yaqoot ERP (Supabase: customers, invoices, debts, WhatsApp, audit)
        │
        ├── Universal ISP domain      modules/isp/core
        ├── Capability engine         modules/isp/capabilities
        ├── Widget registry           modules/isp/widgets
        └── Provider adapters         modules/isp/providers
              ├── mock/       (6 simulation profiles, fully working)
              └── earthlink/  (declared boundary — see below)
```

There is no `if (provider === 'earthlink')` anywhere in this codebase, and an
ESLint rule fails the build if one is introduced.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # the mock provider needs no credentials
npm run dev                    # → http://localhost:3000/isp
```

Sign in to the mock provider with **`agent` / `demo1234`**.

Change `ISP_MOCK_PROFILE` in `.env.local` and reload to watch the dashboard
genuinely rebuild itself:

| profile    | what it simulates                                    |
|------------|------------------------------------------------------|
| `full`     | most capabilities — sessions, wallet, test accounts   |
| `basic`    | subscribers + packages + renewal only                 |
| `readonly` | no mutations at all                                   |
| `legacy`   | old API: no speeds, no contact details, `unknown` caps|
| `ftth`     | fibre nodes, no MAC reset                             |
| `wireless` | towers, sectors, signal data, no wallet               |

### Verify everything

```bash
npm run verify        # typecheck + lint (0 warnings) + 100 unit tests
npm run build         # production build
```

Database migrations are verified against a real PostgreSQL, not just eyeballed:

```bash
PGHOST=/path/to/pg/socket ./supabase/tests/run-local.sh
```

---

## How the capability system works

A provider declares a manifest. Five states, because two are not enough:

| state          | meaning                                                    |
|----------------|------------------------------------------------------------|
| `supported`    | the provider can do this                                   |
| `unsupported`  | the provider cannot                                        |
| `partial`      | works, with documented limits                              |
| `configurable` | the provider doesn't supply it; Yaqoot does (e.g. cost)    |
| `unknown`      | discovery hasn't told us — **not** the same as unsupported |

The UI asks the resolver, never the provider name:

```ts
canPerform(capabilities, 'renewal')   // may we show the Renew button?
hasData(capabilities, 'wholesaleCost')// is there a number to render?
gate(capabilities, ['wallet'])        // should this widget exist at all?
```

**The contract that keeps this honest:** a capability declared usable must have
a real adapter method behind it. `validateAdapter()` enforces that, and
`tests/adapter-contract.test.ts` runs it against every profile — so a "fake
button" is a failing test, not a production incident.

The mock adapter takes this literally: a `basic` provider has **no
`getCurrentSession` method at all**, not a method that returns "unsupported".

---

## Integration with the existing ERP

This module was built against the live Soufyan ERP schema and reuses it rather
than duplicating it.

**Reused, not rebuilt:**

| Concern        | Existing ERP object used                                |
|----------------|---------------------------------------------------------|
| Invoices       | `public.invoices` + `public.invoice_items`              |
| Customers/debt | `public.customers.balance`, `public.debt_payments`      |
| Employee auth  | `employee_by_pin()`, `pin_attempts_blocked()`           |
| Audit          | `audit_write()`, `audit_set_actor()`, `scrub_secrets()` |
| WhatsApp       | `wa_queue()`, `wa_templates`, `wa_render()`             |
| Rate limiting  | `rate_limit_hit()`, `log_security_event()`              |
| Timestamps     | `touch_updated_at()`, `بغداد()`, `بغداد_يوم()`          |

**Deliberate deviation from the original spec:** it listed `isp_invoices`,
`isp_payments` and `isp_customer_debts` as new tables. Creating them would have
forked the shop's ledger in two. Instead `isp_transactions` links each provider
operation to the real `public.invoices` row, the real customer balance and the
real wallet transaction. `docs/architecture.md` explains the trade-off.

The security model copies the purchasing module exactly: **RLS enabled with
zero policies**, so every `isp_*` table is deny-all to `anon` and
`authenticated`, and all access goes through `SECURITY DEFINER` RPCs guarded by
`isp_guard(token, min_role)`.

---

## Financial safety

The order of operations is fixed and cannot be reversed:

```
1. isp_idempotency_begin()      reserve the key
2. adapter.renewSubscription()  call the provider
3a. confirmed success  → isp_renewal_post()          invoice + debt + wallet
3b. ambiguous result   → isp_reconciliation_open()   NO invoice, NO debt
4. isp_idempotency_finish()
```

A `TIMEOUT` or `UNKNOWN_RESULT` never becomes a plain failure, because the
provider may already have charged the agent's wallet. It becomes
`REQUIRES_RECONCILIATION` and waits for a human. This is verified end-to-end in
`supabase/tests/isp_integration_test.sql`, which asserts that an ambiguous
operation moves **no money at all**.

Two further properties the SQL test pins down:

- Replaying the same idempotency key creates **no second invoice** and does
  **not** double the customer's debt.
- Dashboard revenue is derived only from transactions that actually have an
  ERP invoice, so the dashboard can never disagree with the ledger. (An earlier
  draft failed this test — a manually-confirmed reconciliation was inflating
  revenue with no invoice behind it.)

---

## Earthlink

**Not implemented, on purpose.** No official public Earthlink Iraq reseller API
documentation was available, so every capability is declared `unknown`, the
adapter grants nothing, and authentication fails closed with an Arabic message.

Inventing endpoints would have produced code that looks finished and fails in
production against a real agent account and real money. What ships instead is
the seam: profile, manifest and auth surface, plus a checklist in
`modules/isp/providers/earthlink/capabilities.ts` of exactly what is needed to
finish it.

The domain concepts modelled (activation, renewal, payment management,
technical support, reseller administration) come from Earthlink's *public*
reseller material and are recorded as observed concepts, not verified API
capabilities.

---

## Documentation

| Document                              | Contents                                    |
|---------------------------------------|---------------------------------------------|
| `docs/architecture.md`                | Layers, data ownership, ERP integration     |
| `docs/provider-adapter-guide.md`      | Add a provider in 7 steps                   |
| `docs/capability-system.md`           | States, gating, multi-provider aggregation  |
| `docs/deployment.md`                  | Migrations, env vars, rollback              |

---

## Environment variables

See `.env.example`. The mock provider needs none. `SUPABASE_SERVICE_ROLE_KEY`
is server-only and must never reach the browser.

---

## Known limitations

- Provider sessions live in-process (`lib/isp/providerSession.ts`). Correct for
  a single server; back it with Redis for multi-instance deployment. It fails
  closed, never open.
- The finance widgets render "unavailable" rather than `0` until a Supabase
  session is configured — a zero would read as "no sales today".
- Subscriber profile, bulk actions and the sync scheduler are scaffolded in the
  domain and SQL layers but have no UI yet.
- `npm audit` reports advisories in transitive dev dependencies of Next 15;
  none affect the shipped runtime.
