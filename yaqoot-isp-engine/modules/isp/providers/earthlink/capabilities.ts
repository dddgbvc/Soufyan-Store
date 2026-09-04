import type { CapabilityManifest } from '../../capabilities/manifest';

/**
 * Earthlink capability declaration.
 *
 * IMPORTANT — read before editing.
 *
 * No official, public Earthlink Iraq reseller API documentation was available
 * when this adapter was written. Per spec §1 and §38 we therefore refuse to
 * guess: every capability is declared `unknown`, which the UI renders as
 * "غير معروف" and which grants NO operations. Nothing here is a claim about
 * what Earthlink can or cannot do.
 *
 * The domain concepts below are drawn from Earthlink's *public* reseller/agent
 * material (account management, activation, renewal, payment management,
 * pricing, technical support, reseller administration). They are recorded as
 * observed domain concepts, not as verified API capabilities.
 *
 * To implement this adapter for real:
 *   1. Obtain official API documentation and sandbox credentials from the
 *      vendor.
 *   2. Replace each `unknown` below with `supported` / `unsupported` /
 *      `partial` based on documented endpoints only.
 *   3. Implement the matching adapter methods in ./adapter.ts.
 *   4. Run `npm test` — tests/adapter-contract.test.ts will fail if a
 *      capability is declared usable without a method behind it.
 */
export const EARTHLINK_CAPABILITIES: CapabilityManifest = {
  subscriberManagement: {
    state: 'unknown',
    note: 'إدارة الحسابات مذكورة في مواد الوكلاء العامة، لكن لا توجد وثائق واجهة برمجية رسمية متاحة.',
    detail: { observedInPublicMaterial: true, apiDocumented: false },
  },
  activation: {
    state: 'unknown',
    note: 'تفعيل الاشتراكات مذكور في مواد الوكلاء العامة — بانتظار وثائق الواجهة البرمجية.',
    detail: { observedInPublicMaterial: true, apiDocumented: false },
  },
  renewal: {
    state: 'unknown',
    note: 'تجديد الاشتراكات مذكور في مواد الوكلاء العامة — بانتظار وثائق الواجهة البرمجية.',
    detail: { observedInPublicMaterial: true, apiDocumented: false },
  },
  wallet: {
    state: 'unknown',
    note: 'إدارة المدفوعات مذكورة في مواد الوكلاء العامة، دون تفاصيل عن محفظة عبر واجهة برمجية.',
    detail: { observedInPublicMaterial: true, apiDocumented: false },
  },
  tickets: {
    state: 'unknown',
    note: 'الدعم الفني مذكور في مواد الوكلاء العامة — لا توجد واجهة تذاكر موثّقة.',
    detail: { observedInPublicMaterial: true, apiDocumented: false },
  },
  towerManagement: {
    state: 'unknown',
    note: 'معلومات الأبراج/المواقع مذكورة ضمن طلبات الوكلاء — غير موثّقة برمجياً.',
    detail: { observedInPublicMaterial: true, apiDocumented: false },
  },
  // Every other capability is intentionally omitted: `resolveManifest()` fills
  // omissions with `unknown`, which is the honest state for an undocumented API.
};

/** Machine-readable integration status, surfaced in the capability matrix. */
export const EARTHLINK_INTEGRATION_STATUS = {
  implemented: false,
  reason: 'no_official_api_documentation',
  /** What a developer needs before this adapter can do anything. */
  blockedOn: [
    'Official reseller/agent API documentation (endpoints, auth, payloads)',
    'Sandbox credentials for an agent account',
    'Documented package identifiers and pricing model',
    'Documented renewal semantics (period start/extension rules)',
  ],
} as const;
