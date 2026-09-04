# Architecture

## Layers

```
app/                      routes, dashboard, registry, capability matrix
components/               Yaqoot design primitives (glass, badges, forms)
lib/isp/                  server-only: provider session store, provider service
modules/isp/
  core/                   canonical models, money, result states, freshness
  capabilities/           keys, manifest, resolver, aggregation
  subscriptions/          renewal semantics
  widgets/                widget registry
  providers/
    core/                 adapter contract, auth contract, registry, validator
    mock/                 6 simulation profiles
    earthlink/            declared boundary
supabase/
  migrations/             isp_* schema, security, functions, ERP integration
  tests/                  ERP dependency contract + integration test
```

**Dependency direction is one-way.** `modules/isp/core` knows nothing about
providers. `capabilities` knows nothing about widgets. `widgets` knows nothing
about any specific provider. Adapters depend on core; nothing depends on an
adapter except the registry.

---

## The central rule

> The ERP owns the universal business model. Each adapter exposes only what its
> provider actually supports.

Three mechanisms enforce it rather than merely encouraging it:

1. **The capability resolver** is the only thing the UI may ask. Components
   call `canPerform()` / `hasData()` / `gate()`, never a provider name.
2. **The adapter contract validator** (`providers/core/contract.ts`) maps each
   capability to the methods that must exist behind it. Declaring a capability
   without implementing it is a test failure.
3. **An ESLint rule** fails the build on `provider === 'earthlink'`-style
   comparisons in universal code.

---

## Data ownership

Three categories, and the boundary between them is load-bearing.

| Owner     | Examples                                         | Rule                                    |
|-----------|--------------------------------------------------|-----------------------------------------|
| Yaqoot    | invoices, customer debt, ledger, internal notes  | Never overwritten by provider data      |
| Provider  | external ids, packages, wallet, network sessions | Read-only locally; refreshed by sync    |
| Synced    | subscriber snapshots                             | Carries `fetchedAt` + `syncStatus`      |

Every provider-sourced record carries `SyncMeta`, and every provider-sourced
surface renders a freshness badge. `classifyFreshness()` produces
live / fresh / stale / offline / error — so stale data can never be presented
as real-time.

---

## ERP integration: the deviation worth knowing about

The original specification listed `isp_invoices`, `isp_payments` and
`isp_customer_debts` as new tables. The Soufyan ERP already has `invoices`,
`invoice_items`, `customers.balance` and `debt_payments`, all carrying live
business data.

Creating parallel tables would have split the shop's books in two: the POS
would show one set of debts and the ISP module another, and reconciling them
would become a permanent manual chore. The spec's own §40 says to reuse
existing patterns and avoid duplicate systems, so that instruction won over the
literal table list.

**What was built instead:** `isp_transactions` is the spine, holding foreign
keys to the real ERP rows.

```
customers ─┐
           ├─ isp_transactions ─┬─ isp_subscribers / isp_subscriptions
invoices ──┘                    ├─ isp_packages
                                └─ isp_wallet_transactions
```

This yields the traceability the spec asked for —
customer → subscription → invoice → payment → provider cost → wallet → profit —
using the ledger the business actually runs on.

### One integration hazard found and handled

`public.invoices` has an `AFTER INSERT` trigger (`trg_wa_new_invoice`) that
queues a phone-shop receipt: *"شكراً لثقتك بمركز سفيان للهواتف… أي استفسار أو
مشكلة بالجهاز"*. Correct for a handset sale, wrong for an internet renewal.

`isp_renewal_post()` therefore retires that auto-queued row — still `pending`
inside the same transaction, so the swap is deterministic — and queues the
`isp_renewal` template instead. No existing ERP function was modified, so
handset sales are unaffected.

---

## Security model

Copied from the purchasing module, which is the hardened pattern in this ERP:

- **RLS enabled, zero policies** on every `isp_*` table ⇒ deny-all to `anon`
  and `authenticated`. A leaked anon key reads nothing.
- All access via `SECURITY DEFINER` RPCs with `SET search_path`.
- `isp_guard(token, min_role)` validates a 64-hex session token, checks the
  employee is still active, refreshes `last_seen_at`, and stamps the actor into
  the ERP-wide `activity_log`.
- Only ten RPCs are granted to `anon, authenticated`; helpers stay
  `service_role`-only.
- `isp_audit` and `isp_wallet_transactions` are append-only, enforced by a
  trigger. Corrections are reversing entries, never edits.
- Secrets are scrubbed twice: `scrub_secrets()` in SQL, `redact()` in
  TypeScript, both keyed on the same patterns.
- `isp_provider_connections.credentials_reference` is a pointer. Credentials
  are never stored in the database.

### The browser boundary

```
Browser ──httpOnly cookie──▶ Yaqoot server ──▶ Adapter ──▶ ISP API
```

The browser holds one opaque cookie value. Provider tokens, passwords and
session refs stay in `lib/isp/providerSession.ts`, which is `server-only`.

---

## Financial integrity

The failure this design exists to prevent: *the provider renewed the customer
and charged the agent's wallet, but the local write failed — and a retry
charges again.*

```
isp_idempotency_begin()          ← reserve; a replay returns the first result
adapter.renewSubscription()      ← the only external call
  ├─ SUCCESS   → isp_renewal_post()          invoice + debt + wallet + notify
  └─ AMBIGUOUS → isp_reconciliation_open()   nothing financial at all
isp_idempotency_finish()
```

`isAmbiguousOutcome()` classifies `TIMEOUT`, `UNKNOWN_RESULT`,
`MALFORMED_RESPONSE` and `PARTIAL_SUCCESS` as ambiguous. `isRetryable()`
refuses to retry from `REQUIRES_RECONCILIATION`. Resolution is a human decision
via `isp_reconciliation_resolve()`, restricted to `MANAGER`+.

Defence in depth: idempotency is enforced twice — in the RPC ledger *and* by a
`unique (provider_id, idempotency_key)` constraint on `isp_transactions`.

**Dashboard/ledger agreement.** `isp_dashboard()` counts only transactions that
have an `erp_invoice_id`. A transaction confirmed manually but never invoiced
appears in `confirmed_unposted` instead of silently inflating revenue. The
integration test asserts dashboard revenue equals `sum(invoices.total_amount)`.

---

## Multi-provider aggregation

Aggregate metrics report coverage, never a bare total:

```ts
aggregateMetric(providers, 'sessionMonitoring', valueOf)
// → { total, breakdown[], coverage: { reporting[], notReporting[] }, complete }
```

If one provider reports live sessions and another cannot, `complete` is `false`
and the card must render the qualifier and name the non-reporting provider.
Summing them into one confident number would be a lie about coverage.

---

## RTL and internationalisation

Arabic is the primary language; `dir="rtl"` is set at the root. Technical
identifiers — usernames, MAC addresses, IPs, transaction ids, money — render
inside an LTR isolate (`.ltr`, `unicode-bidi: isolate`) with a monospace face
and tabular figures, so they stay readable and columns stay aligned.

Money is integer minor units with a per-currency exponent. IQD has exponent 0,
but nothing assumes that: `add()` throws on a currency mismatch rather than
silently coercing.
