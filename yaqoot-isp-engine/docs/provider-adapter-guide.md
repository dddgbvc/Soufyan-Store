# Adding a provider

Seven steps. None of them touch the dashboard, a widget, the subscriber
registry or the billing code.

---

## 1. Create the folder

```
modules/isp/providers/<your-provider>/
  capabilities.ts   what the provider can do
  mapper.ts         provider payloads → canonical models
  adapter.ts        the adapter itself
```

## 2. Declare capabilities honestly

```ts
import { declare } from '../../capabilities/manifest';

export const CAPABILITIES = declare({
  subscriberManagement: true,
  renewal: true,
  wallet: false,
  wholesaleCost: {
    state: 'configurable',
    note: 'المزود لا يرسل سعر الجملة — يُضبط لكل باقة في إعدادات ياقوت.',
  },
  // Omit anything you have not verified. Omission resolves to `unknown`,
  // which is the honest answer and grants nothing.
});
```

**The rule that matters:** never declare `supported` for something you have not
seen work against the real API. `unknown` costs you nothing; a false
`supported` produces a button that charges a customer and then throws.

## 3. Define authentication

Return a field *schema*, not a form. The UI renders it with Yaqoot's own
components, so a provider needing an API key, an agent code, OAuth or an OTP
all work without a single UI change.

```ts
async getAuthenticationRequirements(): Promise<AuthRequirements> {
  return {
    methods: [{
      kind: 'api_key',
      id: 'api_key',
      label: 'مفتاح الواجهة البرمجية',
      requiresSecondFactor: false,
      fields: [
        { key: 'api_key', type: 'password', label: 'المفتاح',
          required: true, secure: true, ltr: true },
      ],
    }],
    defaultMethodId: 'api_key',
    sessionDurationSeconds: 3600,
    allowPersistentSession: false,
    helpUrl: null,
  };
}
```

`authenticate()` returns an opaque `sessionRef`. Never return a provider token
to the caller — it would end up in the browser.

## 4. Map responses to canonical models

Keep the mapper separate from the adapter. Rules:

- Never invent a value. A missing speed is `null`, not `0`.
- Provider-specific fields go in `metadata`, never as a new column on a
  universal entity.
- Every provider-sourced record carries `sync: syncMeta('provider', fetchedAt, ref)`
  so the UI can label its freshness.
- Money goes through `money()` / `fromMajor()`, never raw floats.

```ts
export function toSubscriber(raw: VendorSubscriber, fetchedAt: string): Subscriber {
  return {
    id: `myisp:${raw.id}`,
    providerId: 'myisp',
    externalSubscriberId: String(raw.id),
    erpCustomerId: null,
    fullName: raw.name,
    phoneNumber: raw.mobile ?? null,   // null, not ''
    // …
    metadata: { vendorTier: raw.tier },
    sync: syncMeta('provider', fetchedAt, String(raw.id)),
  };
}
```

## 5. Implement only the methods you declared

If you declared `renewal`, implement `renewSubscription()` **and**
`planRenewal()`. If you did not declare a capability, do not implement its
methods — the contract test flags both directions.

Two non-negotiables for mutating calls:

- **Idempotency.** The caller supplies `idempotencyKey`. A repeat of the same
  key must return the original outcome, not perform the action again.
- **Ambiguity.** On a timeout or an unparseable response, return
  `needsReconciliation(...)`, never `fail(...)`. The provider may have applied
  the change; a blind retry double-charges.

```ts
if (isAmbiguousOutcome(reason)) {
  return needsReconciliation(
    reason, operatorMessage(reason), diagnostics,
    'انقطع الاتصال بعد إرسال الطلب — يجب مطابقة الحركة قبل إعادة المحاولة.',
    providerRef,
  );
}
```

## 6. Register it

```ts
// modules/isp/providers/bootstrap.ts
registerAdapter('myisp', createMyIspAdapter);
```

Then add `myisp` to `ISP_ENABLED_ADAPTERS`.

## 7. Run the tests

```bash
npm test
```

`tests/adapter-contract.test.ts` picks up every registered adapter. It fails if
a declared capability has no method behind it, or if a required method is
missing. Add your provider to the profile list there to have it checked on
every run.

---

## Renewal semantics

Never assume a period. Declare what the provider actually does:

| semantics             | behaviour                                       |
|-----------------------|-------------------------------------------------|
| `extend_from_expiry`  | adds to the current expiry, even if it is past  |
| `start_from_now`      | period starts at the moment of renewal          |
| `calendar_month`      | ends at the start of the next month             |
| `fixed_cycle`         | keeps the provider's billing day                |
| `provider_defined`    | the ERP computes nothing; the provider decides  |

`computeExpiry()` handles the first four. For `provider_defined` it returns
`null` and the UI says the date appears after sync — which is the truth.

---

## Checklist before you ship

- [ ] No `if (provider === ...)` anywhere outside your adapter folder
- [ ] Every declared capability has a working method
- [ ] Mutating calls honour `idempotencyKey`
- [ ] Timeouts return `REQUIRES_RECONCILIATION`, never `FAILED`
- [ ] No token, password or API key is returned to the caller or logged
- [ ] Missing values are `null`, never `0` or `''`
- [ ] Operator-facing messages are Arabic and free of provider internals
- [ ] `npm run verify` is green
