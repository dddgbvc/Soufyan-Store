import type { CapabilityKey } from '../../capabilities/keys';
import type { CapabilityManifest } from '../../capabilities/manifest';
import { canPerform } from '../../capabilities/resolver';
import {
  implementsMethod,
  REQUIRED_ADAPTER_METHODS,
  type ISPProviderAdapter,
  type OptionalAdapterMethodName,
} from './adapter';

/**
 * The contract that keeps the capability system honest.
 *
 * A capability declared `supported` is a promise that the UI will render a
 * control for it. If the adapter has no method behind that promise, the user
 * gets a button that throws — exactly the "fake button" the spec forbids
 * (§2: "Unsupported operations must be represented explicitly as unsupported
 * capabilities rather than fake buttons").
 *
 * `validateAdapter()` makes that a test failure instead of a production bug.
 */
const CAPABILITY_METHODS: Partial<Record<CapabilityKey, readonly OptionalAdapterMethodName[]>> = {
  subscriberManagement: ['searchSubscribers', 'getSubscriber'],
  subscriberCreate: ['createSubscriber', 'getSubscriberFormSchema'],
  subscriberUpdate: ['updateSubscriber'],
  activation: ['activateSubscription'],
  renewal: ['renewSubscription', 'planRenewal'],
  packageChange: ['changePackage', 'getPackageChangeOptions'],
  suspend: ['suspendSubscriber'],
  resume: ['resumeSubscriber'],
  wallet: ['getWalletBalance'],
  walletTransactions: ['getWalletTransactions'],
  sessionMonitoring: ['getCurrentSession'],
  sessionHistory: ['getSessionHistory'],
  disconnectSession: ['disconnectSession'],
  macReset: ['resetMac'],
  testAccounts: ['createTestAccount', 'getTestAccountOptions'],
  tickets: ['getSupportTickets'],
  reconciliation: ['reconcileTransactions'],
  smsNotification: ['sendNotification'],
  whatsappNotification: ['sendNotification'],
  emailNotification: ['sendNotification'],
};

export interface ContractViolation {
  readonly kind: 'missing_required_method' | 'capability_without_method' | 'method_without_capability';
  readonly message: string;
  readonly capability?: CapabilityKey;
  readonly method?: string;
}

/**
 * @param strict when true, also reports methods implemented while the matching
 *        capability is not declared supported. That is not a bug in itself
 *        (an adapter may keep a method for internal use), but it usually
 *        means a capability was forgotten, so the test suite runs strict.
 */
export function validateAdapter(
  adapter: ISPProviderAdapter,
  manifest: CapabilityManifest,
  strict = false,
): readonly ContractViolation[] {
  const violations: ContractViolation[] = [];

  for (const method of REQUIRED_ADAPTER_METHODS) {
    if (typeof adapter[method] !== 'function') {
      violations.push({
        kind: 'missing_required_method',
        method,
        message: `Adapter "${adapter.key}" does not implement required method ${method}().`,
      });
    }
  }

  for (const [capability, methods] of Object.entries(CAPABILITY_METHODS) as [
    CapabilityKey,
    readonly OptionalAdapterMethodName[],
  ][]) {
    const declared = canPerform(manifest, capability);
    const missing = methods.filter((m) => !implementsMethod(adapter, m));

    if (declared && missing.length > 0) {
      violations.push({
        kind: 'capability_without_method',
        capability,
        method: missing.join(', '),
        message:
          `Adapter "${adapter.key}" declares "${capability}" as usable but does not ` +
          `implement ${missing.map((m) => `${m}()`).join(', ')}. ` +
          `Declare the capability unsupported, or implement the method.`,
      });
    }

    if (strict && !declared && missing.length === 0 && methods.length > 0) {
      violations.push({
        kind: 'method_without_capability',
        capability,
        method: methods.join(', '),
        message:
          `Adapter "${adapter.key}" implements ${methods.map((m) => `${m}()`).join(', ')} ` +
          `but does not declare "${capability}" as supported, so the UI will hide it.`,
      });
    }
  }

  return violations;
}

/** Which adapter methods back a capability — used by the matrix drill-down (§20). */
export function methodsFor(capability: CapabilityKey): readonly OptionalAdapterMethodName[] {
  return CAPABILITY_METHODS[capability] ?? [];
}

export function assertValidAdapter(
  adapter: ISPProviderAdapter,
  manifest: CapabilityManifest,
): void {
  const violations = validateAdapter(adapter, manifest);
  if (violations.length > 0) {
    throw new Error(
      `Adapter contract violated:\n${violations.map((v) => `  - ${v.message}`).join('\n')}`,
    );
  }
}
