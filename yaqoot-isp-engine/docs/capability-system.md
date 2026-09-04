# The capability system

The mechanism that lets one dashboard serve providers that differ in what they
can do.

---

## Five states, not two

A boolean cannot express the two situations that occur most often in practice.

| State          | Arabic          | Meaning                                              | Grants an action? |
|----------------|-----------------|------------------------------------------------------|-------------------|
| `supported`    | مدعوم           | the provider can do this                             | yes               |
| `partial`      | مدعوم جزئياً    | works, with documented limits                        | yes               |
| `configurable` | قابل للضبط      | provider doesn't supply it; **Yaqoot** does          | no                |
| `unsupported`  | غير مدعوم       | the provider cannot                                  | no                |
| `unknown`      | غير معروف       | discovery hasn't told us yet                         | no                |

`configurable` exists for wholesale cost: many providers never expose it, but
the shop knows it. The value is real and must be shown — labelled "مضبوط في
ياقوت" so nobody mistakes it for a figure the provider confirmed.

`unknown` exists because silence is not denial. An undocumented API should
report `unknown`, and the matrix should say so, rather than claiming the
provider cannot do something nobody has checked.

---

## Asking the right question

```ts
canPerform(m, 'renewal')        // supported | partial  → show the button
hasData(m, 'wholesaleCost')     // + configurable       → show the value
stateOf(m, 'wallet')            // the raw state, for the matrix
gate(m, ['wallet', 'walletTransactions'])
isReadOnly(m)                   // no mutating capability at all
```

The split between `canPerform` and `hasData` is the whole point:

- A **Renew** button needs `canPerform`. An ERP-configured cost cannot renew.
- A **cost figure** needs `hasData`. It is real whether it came from the
  provider or from Yaqoot.

---

## The contract

A capability is a promise that the UI will render a control. The validator
checks there is something behind the promise.

```ts
const violations = validateAdapter(adapter, manifest);
// capability_without_method → declared usable, no implementation  ← the bug
// missing_required_method   → adapter is not a valid adapter
// method_without_capability → implemented but hidden (strict mode)
```

`tests/adapter-contract.test.ts` runs this over all six mock profiles on every
`npm test`. The mock adapter is built by *composition* — it attaches only the
methods its profile supports — so a `basic` provider genuinely has no
`getCurrentSession` to call, and the test is meaningful rather than decorative.

---

## Widgets

Widgets declare requirements; they never check a provider.

```ts
{
  widgetId: 'online-sessions',
  requiredCapabilities: ['sessionMonitoring'],
  minimumRole: 'CASHIER',
  showWhenUnsupported: true,
}
```

`resolveWidgets(manifest, role, preferences)` applies precedence:

1. **Role** — above the user's role, the widget does not exist.
2. **Capability** — provider restrictions override user preferences (§18).
3. **Preference** — hide and reorder.

`showWhenUnsupported` chooses between two honest outcomes: hide the widget
entirely, or render an Empty Capability Card explaining why this provider does
not offer it. Wallet uses the card (an admin wants to know); active-subscribers
just disappears (a provider without a subscriber API has nothing to explain).

---

## Multi-provider aggregation

The trap: two providers, one reports live sessions, the other cannot. Summing
gives a number that looks complete and is not.

```ts
const metric = aggregateMetric(providers, 'sessionMonitoring', valueOf);
metric.total                      // sum over reporting providers only
metric.complete                   // false — someone could not report
metric.coverage.notReporting      // [{ providerId, providerName }]
metric.qualifier                  // Arabic qualifier the card must render
```

Rules:

- Sum only over providers that can report.
- When `complete` is `false`, render the qualifier **and** name who is missing.
- A provider that should report but returned nothing also sets
  `complete: false` — a failed fetch must not hide inside a confident total.
- `aggregateState()` returns `partial` for any mix, including
  supported + unsupported.

---

## Adding a capability key

1. Add it to `CAPABILITY_KEYS`.
2. Add its `CAPABILITY_META` entry (Arabic label + the hint shown when a
   provider lacks it).
3. If adapter methods back it, add them to `CAPABILITY_METHODS` in
   `contract.ts`.
4. Use it in widget `requiredCapabilities` or a `gate()` call.

It then appears in the capability matrix automatically. No UI changes.
