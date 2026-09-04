import type { CapabilityManifest } from '../../capabilities/manifest';
import type { OperationResult } from '../../core/result';
import type {
  Agent,
  FormSchema,
  NetworkSession,
  Package,
  PackageChangeOption,
  Provider,
  RenewalPlan,
  Subscriber,
  Subscription,
  SupportTicket,
  TestAccount,
  Wallet,
  WalletTransaction,
} from '../../core/types';
import type {
  AuthCredentials,
  AuthOutcome,
  AuthRequirements,
  AuthStatus,
} from './auth';

/**
 * The provider adapter contract (spec §2, §31).
 *
 * Only the `required` half of this interface must be implemented. Everything
 * else is optional — and an adapter that omits a method MUST also declare the
 * matching capability as `unsupported`, so the UI hides it rather than
 * offering a button that throws.
 *
 * `ProviderAdapterContract` in ./contract.ts asserts exactly that invariant,
 * and tests/adapter-contract.test.ts runs it against every registered adapter.
 */

/** Opaque handle to a server-side provider session. Never a raw token. */
export interface ProviderSession {
  readonly sessionRef: string;
  readonly providerId: string;
  readonly expiresAt: string | null;
}

export interface SubscriberQuery {
  readonly text?: string;
  readonly status?: string;
  readonly technology?: string;
  readonly packageId?: string;
  readonly username?: string;
  readonly phone?: string;
  readonly ipAddress?: string;
  readonly macAddress?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly total: number | null;
}

export interface RenewalRequest {
  readonly subscriberId: string;
  readonly packageId: string;
  /**
   * Caller-generated key. The adapter MUST treat a repeat of the same key as
   * the same operation and return the original outcome (§21, §34).
   */
  readonly idempotencyKey: string;
}

export interface PackageChangeRequest extends RenewalRequest {
  readonly timing: PackageChangeOption['timing'];
}

export interface NotificationRequest {
  readonly subscriberId: string;
  readonly channel: 'sms' | 'whatsapp' | 'email';
  readonly templateKey: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly idempotencyKey: string;
}

export interface ReconciliationEntry {
  readonly externalTransactionId: string;
  readonly occurredAt: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly subscriberReference: string | null;
  readonly kind: string;
}

/**
 * Methods every adapter must implement. These are what the shell needs before
 * it can render anything at all.
 */
export interface RequiredAdapterMethods {
  readonly key: string;
  getProviderProfile(): Promise<Provider>;
  /** Called after authentication; drives the whole UI (§43). */
  getCapabilities(session: ProviderSession | null): Promise<CapabilityManifest>;
  getAuthenticationRequirements(): Promise<AuthRequirements>;
  authenticate(credentials: AuthCredentials, methodId: string): Promise<AuthOutcome>;
  getAuthenticationStatus(session: ProviderSession): Promise<AuthStatus>;
  logout(session: ProviderSession): Promise<void>;
}

/** Everything a provider *may* support. Absent ⇒ capability is `unsupported`. */
export interface OptionalAdapterMethods {
  submitSecondFactor?(challengeId: string, answers: AuthCredentials): Promise<AuthOutcome>;
  refreshSession?(session: ProviderSession): Promise<AuthOutcome>;
  revokeSession?(session: ProviderSession): Promise<void>;

  getAgent?(session: ProviderSession): Promise<OperationResult<Agent>>;

  getPackages?(session: ProviderSession): Promise<OperationResult<readonly Package[]>>;

  searchSubscribers?(
    session: ProviderSession,
    query: SubscriberQuery,
  ): Promise<OperationResult<Page<Subscriber>>>;
  getSubscriber?(
    session: ProviderSession,
    externalSubscriberId: string,
  ): Promise<OperationResult<Subscriber>>;
  /** Field schema for creating a subscriber — rendered by DynamicForm (§9). */
  getSubscriberFormSchema?(session: ProviderSession): Promise<FormSchema>;
  createSubscriber?(
    session: ProviderSession,
    values: Readonly<Record<string, unknown>>,
    idempotencyKey: string,
  ): Promise<OperationResult<Subscriber>>;
  updateSubscriber?(
    session: ProviderSession,
    externalSubscriberId: string,
    values: Readonly<Record<string, unknown>>,
  ): Promise<OperationResult<Subscriber>>;

  getSubscription?(
    session: ProviderSession,
    externalSubscriberId: string,
  ): Promise<OperationResult<Subscription>>;
  /** Provider computes the new expiry — the ERP never assumes a period (§8). */
  planRenewal?(
    session: ProviderSession,
    request: RenewalRequest,
  ): Promise<OperationResult<RenewalPlan>>;
  activateSubscription?(
    session: ProviderSession,
    request: RenewalRequest,
  ): Promise<OperationResult<Subscription>>;
  renewSubscription?(
    session: ProviderSession,
    request: RenewalRequest,
  ): Promise<OperationResult<Subscription>>;
  /** Which change timings this provider actually permits (§8). */
  getPackageChangeOptions?(
    session: ProviderSession,
    subscriberId: string,
    targetPackageId: string,
  ): Promise<OperationResult<readonly PackageChangeOption[]>>;
  changePackage?(
    session: ProviderSession,
    request: PackageChangeRequest,
  ): Promise<OperationResult<Subscription>>;
  suspendSubscriber?(
    session: ProviderSession,
    externalSubscriberId: string,
  ): Promise<OperationResult<Subscription>>;
  resumeSubscriber?(
    session: ProviderSession,
    externalSubscriberId: string,
  ): Promise<OperationResult<Subscription>>;

  getCurrentSession?(
    session: ProviderSession,
    externalSubscriberId: string,
  ): Promise<OperationResult<NetworkSession | null>>;
  getSessionHistory?(
    session: ProviderSession,
    externalSubscriberId: string,
    limit: number,
  ): Promise<OperationResult<readonly NetworkSession[]>>;
  disconnectSession?(
    session: ProviderSession,
    externalSubscriberId: string,
    idempotencyKey: string,
  ): Promise<OperationResult<void>>;
  resetMac?(
    session: ProviderSession,
    externalSubscriberId: string,
    idempotencyKey: string,
  ): Promise<OperationResult<void>>;

  getWalletBalance?(session: ProviderSession): Promise<OperationResult<Wallet>>;
  getWalletTransactions?(
    session: ProviderSession,
    limit: number,
  ): Promise<OperationResult<readonly WalletTransaction[]>>;

  getTestAccountOptions?(
    session: ProviderSession,
  ): Promise<OperationResult<readonly { durationHours: number; label: string }[]>>;
  createTestAccount?(
    session: ProviderSession,
    durationHours: number,
    idempotencyKey: string,
  ): Promise<OperationResult<TestAccount>>;

  getSupportTickets?(
    session: ProviderSession,
  ): Promise<OperationResult<readonly SupportTicket[]>>;
  sendNotification?(
    session: ProviderSession,
    request: NotificationRequest,
  ): Promise<OperationResult<void>>;

  reconcileTransactions?(
    session: ProviderSession,
    since: string,
  ): Promise<OperationResult<readonly ReconciliationEntry[]>>;

  /** Cheap liveness probe for the Health Center (§14). */
  testConnection?(session: ProviderSession | null): Promise<OperationResult<{ latencyMs: number }>>;
}

export type ISPProviderAdapter = RequiredAdapterMethods & OptionalAdapterMethods;

/** Optional adapter method names, as a runtime-checkable list. */
export const OPTIONAL_ADAPTER_METHODS = [
  'submitSecondFactor',
  'refreshSession',
  'revokeSession',
  'getAgent',
  'getPackages',
  'searchSubscribers',
  'getSubscriber',
  'getSubscriberFormSchema',
  'createSubscriber',
  'updateSubscriber',
  'getSubscription',
  'planRenewal',
  'activateSubscription',
  'renewSubscription',
  'getPackageChangeOptions',
  'changePackage',
  'suspendSubscriber',
  'resumeSubscriber',
  'getCurrentSession',
  'getSessionHistory',
  'disconnectSession',
  'resetMac',
  'getWalletBalance',
  'getWalletTransactions',
  'getTestAccountOptions',
  'createTestAccount',
  'getSupportTickets',
  'sendNotification',
  'reconcileTransactions',
  'testConnection',
] as const satisfies readonly (keyof OptionalAdapterMethods)[];

export type OptionalAdapterMethodName = (typeof OPTIONAL_ADAPTER_METHODS)[number];

export const REQUIRED_ADAPTER_METHODS = [
  'getProviderProfile',
  'getCapabilities',
  'getAuthenticationRequirements',
  'authenticate',
  'getAuthenticationStatus',
  'logout',
] as const satisfies readonly Exclude<keyof RequiredAdapterMethods, 'key'>[];

export function implementsMethod(
  adapter: ISPProviderAdapter,
  method: OptionalAdapterMethodName,
): boolean {
  return typeof adapter[method] === 'function';
}
