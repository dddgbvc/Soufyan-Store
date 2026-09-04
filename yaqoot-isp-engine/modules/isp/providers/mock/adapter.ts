import { canPerform } from '../../capabilities/resolver';
import type { CapabilityManifest } from '../../capabilities/manifest';
import { ProviderError, operatorMessage, type ProviderErrorReason } from '../../core/errors';
import { fail, needsReconciliation, ok, type OperationResult } from '../../core/result';
import { money } from '../../core/money';
import { syncMeta } from '../../core/freshness';
import { computeExpiry } from '../../subscriptions/renewal';
import type {
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
} from '../core/auth';
import type {
  ISPProviderAdapter,
  NotificationRequest,
  Page,
  PackageChangeRequest,
  ProviderSession,
  ReconciliationEntry,
  RenewalRequest,
  RequiredAdapterMethods,
  OptionalAdapterMethods,
  SubscriberQuery,
} from '../core/adapter';
import { buildMockDataset, type MockDataset } from './data';
import { MOCK_PROFILE_DEFINITIONS, type MockProfile, type MockProfileDefinition } from './profiles';

/**
 * Mock ISP provider (spec §32).
 *
 * Two things make this more than a stub:
 *
 *  1. It only attaches the methods its profile supports. A `basic` provider
 *     has no `getCurrentSession` at all — so the contract test and the UI are
 *     exercised against a genuinely narrower object, not a method that
 *     returns "unsupported".
 *  2. It models the awkward paths: idempotent retries, injected failures and
 *     the ambiguous timeout that must land in REQUIRES_RECONCILIATION.
 */

export interface MockAdapterOptions {
  readonly profile?: MockProfile;
  readonly seed?: number;
  /** 0..1 — probability that a mutating call fails. Deterministic per key. */
  readonly failureRate?: number;
  /** Fixed clock for tests. */
  readonly now?: () => Date;
  /** Require an OTP second factor, to exercise the MFA flow. */
  readonly requireMfa?: boolean;
}

const DEMO_USERNAME = 'agent';
const DEMO_PASSWORD = 'demo1234';
const DEMO_OTP = '123456';

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `mock-req-${Date.now().toString(36)}-${requestCounter}`;
}

function diagnostics(durationMs = 12): { requestId: string; adapterKey: string; durationMs: number } {
  return { requestId: nextRequestId(), adapterKey: 'mock', durationMs };
}

/** Stable hash so the same idempotency key always gets the same verdict. */
function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

interface MutationRecord {
  readonly result: OperationResult<unknown>;
}

export function createMockAdapter(options: MockAdapterOptions = {}): ISPProviderAdapter {
  const profile: MockProfile = options.profile ?? 'full';
  const definition: MockProfileDefinition = MOCK_PROFILE_DEFINITIONS[profile];
  const seed = options.seed ?? 1404;
  const failureRate = Math.min(Math.max(options.failureRate ?? 0, 0), 1);
  const now = options.now ?? ((): Date => new Date());
  const capabilities = definition.capabilities;

  let dataset: MockDataset = buildMockDataset(definition, seed, now());
  const sessions = new Map<string, { expiresAt: string | null }>();
  const pendingMfa = new Map<string, { methodId: string }>();
  /** Idempotency ledger: a repeated key returns the first outcome verbatim. */
  const mutations = new Map<string, MutationRecord>();

  function requireSession(session: ProviderSession): void {
    if (!sessions.has(session.sessionRef)) {
      throw new ProviderError('CREDENTIALS_EXPIRED');
    }
  }

  function injectedFailure(key: string): ProviderErrorReason | null {
    if (failureRate <= 0) return null;
    const roll = hashKey(key);
    if (roll >= failureRate) return null;
    // Spread the roll across the failure taxonomy, weighted toward the
    // ambiguous ones so reconciliation gets exercised.
    const bucket = Math.floor((roll / failureRate) * 4);
    const reasons: ProviderErrorReason[] = [
      'TIMEOUT',
      'PROVIDER_UNAVAILABLE',
      'RATE_LIMITED',
      'UNKNOWN_RESULT',
    ];
    return reasons[Math.min(bucket, reasons.length - 1)] ?? 'TIMEOUT';
  }

  /**
   * Wrap a mutation with the idempotency ledger and the failure injector.
   * Ambiguous failures become REQUIRES_RECONCILIATION, never a plain FAILED,
   * because the provider may already have applied the change.
   */
  function mutate<T>(idempotencyKey: string, run: () => T): OperationResult<T> {
    const existing = mutations.get(idempotencyKey);
    if (existing) {
      return existing.result as OperationResult<T>;
    }

    const failure = injectedFailure(idempotencyKey);
    let result: OperationResult<T>;

    if (failure === 'TIMEOUT' || failure === 'UNKNOWN_RESULT') {
      result = needsReconciliation(
        failure,
        operatorMessage(failure),
        diagnostics(30_000),
        'انقطع الاتصال بعد إرسال الطلب — يجب مطابقة الحركة مع المزود قبل إعادة المحاولة.',
        `MOCK-REF-${idempotencyKey.slice(0, 8)}`,
      );
    } else if (failure !== null) {
      result = fail(failure, operatorMessage(failure), diagnostics());
    } else {
      result = ok(run(), diagnostics());
    }

    mutations.set(idempotencyKey, { result });
    return result;
  }

  function findSubscriber(externalId: string): Subscriber | undefined {
    return dataset.subscribers.find((s) => s.externalSubscriberId === externalId);
  }

  function findSubscription(subscriberId: string): Subscription | undefined {
    return dataset.subscriptions.find((s) => s.subscriberId === subscriberId);
  }

  function replaceSubscription(updated: Subscription): void {
    dataset = {
      ...dataset,
      subscriptions: dataset.subscriptions.map((s) => (s.id === updated.id ? updated : s)),
    };
  }

  function replaceSubscriber(updated: Subscriber): void {
    dataset = {
      ...dataset,
      subscribers: dataset.subscribers.map((s) => (s.id === updated.id ? updated : s)),
    };
  }

  // -------------------------------------------------------------------------
  // Required methods
  // -------------------------------------------------------------------------

  const required: RequiredAdapterMethods = {
    key: 'mock',

    async getProviderProfile(): Promise<Provider> {
      const timestamp = now().toISOString();
      return {
        id: 'mock',
        name: 'mock',
        displayName: `مزود تجريبي — ${definition.displayName}`,
        logoUrl: null,
        accentColor: '#5B6EFF',
        country: 'IQ',
        currency: 'IQD',
        timezone: 'Asia/Baghdad',
        status: 'active',
        adapterKey: 'mock',
        apiVersion: profile === 'legacy' ? 'v1' : 'v2',
        supportUrl: null,
        configuration: { profile, seed },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    },

    async getCapabilities(): Promise<CapabilityManifest> {
      return capabilities;
    },

    async getAuthenticationRequirements(): Promise<AuthRequirements> {
      return {
        methods: [
          {
            kind: 'agent_code',
            id: 'agent_code',
            label: 'رمز الوكيل وكلمة المرور',
            fields: [
              {
                key: 'username',
                type: 'text',
                label: 'رمز الوكيل',
                required: true,
                ltr: true,
                placeholder: DEMO_USERNAME,
                helpText: 'بيانات العرض التجريبي: agent / demo1234',
              },
              {
                key: 'password',
                type: 'password',
                label: 'كلمة المرور',
                required: true,
                secure: true,
                ltr: true,
              },
            ],
            requiresSecondFactor: options.requireMfa === true,
          },
        ],
        defaultMethodId: 'agent_code',
        sessionDurationSeconds: 8 * 3600,
        allowPersistentSession: true,
        helpUrl: null,
      };
    },

    async authenticate(credentials: AuthCredentials, methodId: string): Promise<AuthOutcome> {
      if (methodId !== 'agent_code') {
        return {
          state: 'ERROR',
          reason: 'UNSUPPORTED_AUTH_METHOD',
          message: operatorMessage('UNSUPPORTED_AUTH_METHOD'),
        };
      }

      if (credentials.username !== DEMO_USERNAME || credentials.password !== DEMO_PASSWORD) {
        return {
          state: 'ERROR',
          reason: 'INVALID_CREDENTIALS',
          message: operatorMessage('INVALID_CREDENTIALS'),
        };
      }

      if (options.requireMfa === true) {
        const challengeId = `mfa-${Math.random().toString(36).slice(2, 10)}`;
        pendingMfa.set(challengeId, { methodId });
        return {
          state: 'REQUIRES_MFA',
          challenge: {
            kind: 'otp',
            prompt: 'أدخل رمز التحقق المرسل إلى هاتف الوكيل (رمز العرض: 123456)',
            challengeId,
            expiresAt: new Date(now().getTime() + 300_000).toISOString(),
            fields: [
              {
                key: 'otp',
                type: 'otp',
                label: 'رمز التحقق',
                required: true,
                ltr: true,
                secure: true,
                validation: { pattern: '^[0-9]{6}$', message: 'الرمز مكوّن من ٦ أرقام.' },
              },
            ],
          },
        };
      }

      return grantSession();
    },

    async getAuthenticationStatus(session: ProviderSession): Promise<AuthStatus> {
      const record = sessions.get(session.sessionRef);
      const checkedAt = now().toISOString();
      if (!record) {
        return {
          state: 'UNAUTHENTICATED',
          expiresAt: null,
          agentDisplayName: null,
          lastCheckedAt: checkedAt,
        };
      }
      const expired =
        record.expiresAt !== null && Date.parse(record.expiresAt) <= now().getTime();
      return {
        state: expired ? 'EXPIRED' : 'AUTHENTICATED',
        expiresAt: record.expiresAt,
        agentDisplayName: 'وكيل العرض التجريبي',
        lastCheckedAt: checkedAt,
      };
    },

    async logout(session: ProviderSession): Promise<void> {
      sessions.delete(session.sessionRef);
    },
  };

  function grantSession(): AuthOutcome {
    const sessionRef = `mock-sess-${Math.random().toString(36).slice(2, 12)}`;
    const expiresAt = new Date(now().getTime() + 8 * 3600 * 1000).toISOString();
    sessions.set(sessionRef, { expiresAt });
    return {
      state: 'AUTHENTICATED',
      sessionRef,
      expiresAt,
      agentDisplayName: 'وكيل العرض التجريبي',
    };
  }

  // -------------------------------------------------------------------------
  // Optional methods — attached only where the profile supports them
  // -------------------------------------------------------------------------

  const optional: OptionalAdapterMethods = {};

  if (options.requireMfa === true) {
    optional.submitSecondFactor = async (
      challengeId: string,
      answers: AuthCredentials,
    ): Promise<AuthOutcome> => {
      if (!pendingMfa.has(challengeId)) {
        return { state: 'ERROR', reason: 'AUTH_FAILED', message: operatorMessage('AUTH_FAILED') };
      }
      if (answers.otp !== DEMO_OTP) {
        return { state: 'ERROR', reason: 'REQUIRES_OTP', message: 'رمز التحقق غير صحيح.' };
      }
      pendingMfa.delete(challengeId);
      return grantSession();
    };
  }

  optional.testConnection = async (): Promise<OperationResult<{ latencyMs: number }>> => {
    const latencyMs = 8 + Math.floor(hashKey(String(seed)) * 40);
    return ok({ latencyMs }, diagnostics(latencyMs));
  };

  if (canPerform(capabilities, 'subscriberManagement')) {
    optional.searchSubscribers = async (
      session: ProviderSession,
      query: SubscriberQuery,
    ): Promise<OperationResult<Page<Subscriber>>> => {
      requireSession(session);
      const text = query.text?.trim().toLowerCase() ?? '';
      const filtered = dataset.subscribers.filter((s) => {
        if (query.status && s.status !== query.status) return false;
        if (query.technology && s.technology !== query.technology) return false;
        if (query.username && s.username !== query.username) return false;
        if (query.phone && s.phoneNumber !== query.phone) return false;
        if (text.length === 0) return true;
        return (
          s.fullName.toLowerCase().includes(text) ||
          s.externalSubscriberId.toLowerCase().includes(text) ||
          (s.username?.toLowerCase().includes(text) ?? false) ||
          (s.phoneNumber?.includes(text) ?? false) ||
          (s.address?.toLowerCase().includes(text) ?? false)
        );
      });

      const limit = Math.min(query.limit ?? 25, 100);
      const start = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
      const items = filtered.slice(start, start + limit);
      const nextIndex = start + items.length;

      return ok(
        {
          items,
          nextCursor: nextIndex < filtered.length ? String(nextIndex) : null,
          total: filtered.length,
        },
        diagnostics(),
      );
    };

    optional.getSubscriber = async (
      session: ProviderSession,
      externalSubscriberId: string,
    ): Promise<OperationResult<Subscriber>> => {
      requireSession(session);
      const found = findSubscriber(externalSubscriberId);
      if (!found) return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      return ok(found, diagnostics());
    };

    optional.getSubscription = async (
      session: ProviderSession,
      externalSubscriberId: string,
    ): Promise<OperationResult<Subscription>> => {
      requireSession(session);
      const subscriber = findSubscriber(externalSubscriberId);
      const subscription = subscriber ? findSubscription(subscriber.id) : undefined;
      if (!subscription) return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      return ok(subscription, diagnostics());
    };

    optional.getPackages = async (
      session: ProviderSession,
    ): Promise<OperationResult<readonly Package[]>> => {
      requireSession(session);
      return ok(dataset.packages, diagnostics());
    };
  }

  if (canPerform(capabilities, 'subscriberCreate')) {
    optional.getSubscriberFormSchema = async (): Promise<FormSchema> => ({
      fields: [
        { key: 'full_name', type: 'text', label: 'الاسم الكامل', required: true },
        { key: 'phone_number', type: 'tel', label: 'رقم الهاتف', required: true, ltr: true },
        {
          key: 'pppoe_username',
          type: 'text',
          label: 'اسم المستخدم',
          required: true,
          ltr: true,
          validation: { pattern: '^[a-z0-9_.-]{3,32}$', message: 'أحرف إنجليزية وأرقام فقط.' },
        },
        {
          key: 'mac_address',
          type: 'mac',
          label: 'عنوان MAC',
          required: false,
          ltr: true,
        },
        ...(definition.dataShape.includeTower
          ? ([
              {
                key: 'tower',
                type: 'select' as const,
                label: 'البرج',
                required: true,
                options: Array.from({ length: 12 }, (_, i) => ({
                  value: `TWR-${String(i + 1).padStart(2, '0')}`,
                  label: `برج ${i + 1}`,
                })),
              },
            ] as const)
          : []),
        {
          key: 'package_id',
          type: 'select',
          label: 'الباقة',
          required: true,
          options: dataset.packages.map((p) => ({
            value: p.externalPackageId,
            label: p.displayName,
          })),
        },
      ],
    });

    optional.createSubscriber = async (
      session: ProviderSession,
      values: Readonly<Record<string, unknown>>,
      idempotencyKey: string,
    ): Promise<OperationResult<Subscriber>> => {
      requireSession(session);
      return mutate(idempotencyKey, () => {
        const index = dataset.subscribers.length + 1001;
        const externalId = `SUB-${String(index).padStart(5, '0')}`;
        const timestamp = now().toISOString();
        const created: Subscriber = {
          id: `mock:${externalId}`,
          providerId: 'mock',
          externalSubscriberId: externalId,
          erpCustomerId: null,
          fullName: String(values.full_name ?? 'مشترك جديد'),
          phoneNumber: values.phone_number ? String(values.phone_number) : null,
          alternatePhone: null,
          address: null,
          area: null,
          governorate: null,
          zone: null,
          towerId: values.tower ? String(values.tower) : null,
          networkNodeId: null,
          technology: definition.dataShape.technologies[0] ?? 'pppoe',
          username: values.pppoe_username ? String(values.pppoe_username) : null,
          status: 'pending',
          metadata: {},
          sync: syncMeta('provider', timestamp, externalId),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        dataset = { ...dataset, subscribers: [...dataset.subscribers, created] };
        return created;
      });
    };
  }

  if (canPerform(capabilities, 'subscriberUpdate')) {
    optional.updateSubscriber = async (
      session: ProviderSession,
      externalSubscriberId: string,
      values: Readonly<Record<string, unknown>>,
    ): Promise<OperationResult<Subscriber>> => {
      requireSession(session);
      const existing = findSubscriber(externalSubscriberId);
      if (!existing) return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      const updated: Subscriber = {
        ...existing,
        fullName: values.full_name ? String(values.full_name) : existing.fullName,
        phoneNumber: values.phone_number ? String(values.phone_number) : existing.phoneNumber,
        updatedAt: now().toISOString(),
      };
      replaceSubscriber(updated);
      return ok(updated, diagnostics());
    };
  }

  if (canPerform(capabilities, 'renewal')) {
    optional.planRenewal = async (
      session: ProviderSession,
      request: RenewalRequest,
    ): Promise<OperationResult<RenewalPlan>> => {
      requireSession(session);
      const subscriber = findSubscriber(request.subscriberId);
      const pkg = dataset.packages.find((p) => p.externalPackageId === request.packageId);
      if (!subscriber || !pkg) {
        return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      }
      const subscription = findSubscription(subscriber.id);
      const computed = computeExpiry(
        pkg.renewalSemantics,
        subscription?.expiresAt ?? null,
        pkg.duration,
        now(),
      );
      return ok(
        {
          semantics: pkg.renewalSemantics,
          currentExpiry: subscription?.expiresAt ?? null,
          // A legacy provider does not return the new expiry — say so rather
          // than inventing a date.
          newExpiry: profile === 'legacy' ? null : computed.newExpiry,
          price: pkg.retailPrice,
          cost: pkg.wholesalePrice,
          explanation:
            profile === 'legacy'
              ? 'هذا المزود لا يُرجع تاريخ الانتهاء الجديد — يظهر بعد المزامنة.'
              : computed.explanation,
        },
        diagnostics(),
      );
    };

    optional.renewSubscription = async (
      session: ProviderSession,
      request: RenewalRequest,
    ): Promise<OperationResult<Subscription>> => {
      requireSession(session);
      const subscriber = findSubscriber(request.subscriberId);
      const pkg = dataset.packages.find((p) => p.externalPackageId === request.packageId);
      if (!subscriber || !pkg) {
        return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      }
      const subscription = findSubscription(subscriber.id);
      if (!subscription) return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());

      const wholesale = pkg.wholesalePrice.value;
      if (wholesale && dataset.wallet.availableBalance.amount < wholesale.amount) {
        return fail('INSUFFICIENT_FUNDS', operatorMessage('INSUFFICIENT_FUNDS'), diagnostics());
      }

      return mutate(request.idempotencyKey, () => {
        const computed = computeExpiry(
          pkg.renewalSemantics,
          subscription.expiresAt,
          pkg.duration,
          now(),
        );
        const renewed: Subscription = {
          ...subscription,
          status: 'active',
          packageId: pkg.id,
          expiresAt: computed.newExpiry ?? subscription.expiresAt,
          suspendedAt: null,
          sync: syncMeta('provider', now().toISOString(), subscription.externalSubscriptionId),
        };
        replaceSubscription(renewed);
        replaceSubscriber({ ...subscriber, status: 'active', updatedAt: now().toISOString() });

        if (wholesale) {
          const before = dataset.wallet.currentBalance;
          const after = money(before.amount - wholesale.amount, before.currency);
          dataset = {
            ...dataset,
            wallet: { ...dataset.wallet, currentBalance: after, availableBalance: after },
            walletTransactions: [
              {
                id: `mock:tx:${request.idempotencyKey.slice(0, 8)}`,
                walletId: dataset.wallet.id,
                providerTransactionId: `TX-${request.idempotencyKey.slice(0, 6).toUpperCase()}`,
                type: 'renewal',
                direction: 'debit',
                amount: wholesale,
                balanceBefore: before,
                balanceAfter: after,
                referenceType: 'subscription',
                referenceId: subscriber.externalSubscriberId,
                status: 'posted',
                metadata: {},
                createdAt: now().toISOString(),
              },
              ...dataset.walletTransactions,
            ],
          };
        }
        return renewed;
      });
    };
  }

  if (canPerform(capabilities, 'activation')) {
    optional.activateSubscription = async (
      session: ProviderSession,
      request: RenewalRequest,
    ): Promise<OperationResult<Subscription>> => {
      requireSession(session);
      const subscriber = findSubscriber(request.subscriberId);
      const subscription = subscriber ? findSubscription(subscriber.id) : undefined;
      if (!subscription) return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      return mutate(request.idempotencyKey, () => {
        const activated: Subscription = {
          ...subscription,
          status: 'active',
          startedAt: now().toISOString(),
        };
        replaceSubscription(activated);
        return activated;
      });
    };
  }

  if (canPerform(capabilities, 'packageChange')) {
    optional.getPackageChangeOptions = async (
      session: ProviderSession,
      subscriberId: string,
      targetPackageId: string,
    ): Promise<OperationResult<readonly PackageChangeOption[]>> => {
      requireSession(session);
      const subscriber = findSubscriber(subscriberId);
      const subscription = subscriber ? findSubscription(subscriber.id) : undefined;
      const current = dataset.packages.find((p) => p.id === subscription?.packageId);
      const target = dataset.packages.find((p) => p.externalPackageId === targetPackageId);
      if (!target) return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());

      const delta =
        current === undefined
          ? null
          : money(target.retailPrice.amount - current.retailPrice.amount, target.currency);
      const isUpgrade = delta !== null && delta.amount > 0;

      return ok(
        [
          { timing: 'immediate', label: 'فوري', allowed: true, priceDelta: delta },
          {
            timing: 'next_cycle',
            label: 'مع الدورة القادمة',
            allowed: true,
            priceDelta: money(0, target.currency),
          },
          {
            timing: 'prorated',
            label: 'محتسب بالتناسب',
            // Downgrades are not prorated by this provider — an example of a
            // provider-defined rule the ERP must not assume.
            allowed: isUpgrade,
            reason: isUpgrade ? undefined : 'التناسب متاح عند الترقية فقط.',
            priceDelta: delta,
          },
        ],
        diagnostics(),
      );
    };

    optional.changePackage = async (
      session: ProviderSession,
      request: PackageChangeRequest,
    ): Promise<OperationResult<Subscription>> => {
      requireSession(session);
      const subscriber = findSubscriber(request.subscriberId);
      const subscription = subscriber ? findSubscription(subscriber.id) : undefined;
      const target = dataset.packages.find((p) => p.externalPackageId === request.packageId);
      if (!subscription || !target) {
        return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      }
      return mutate(request.idempotencyKey, () => {
        const changed: Subscription = {
          ...subscription,
          packageId: target.id,
          metadata: { ...subscription.metadata, packageChangeTiming: request.timing },
        };
        replaceSubscription(changed);
        return changed;
      });
    };
  }

  if (canPerform(capabilities, 'suspend')) {
    optional.suspendSubscriber = async (
      session: ProviderSession,
      externalSubscriberId: string,
    ): Promise<OperationResult<Subscription>> => {
      requireSession(session);
      const subscriber = findSubscriber(externalSubscriberId);
      const subscription = subscriber ? findSubscription(subscriber.id) : undefined;
      if (!subscription || !subscriber) {
        return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      }
      const suspended: Subscription = {
        ...subscription,
        status: 'suspended',
        suspendedAt: now().toISOString(),
      };
      replaceSubscription(suspended);
      replaceSubscriber({ ...subscriber, status: 'suspended' });
      return ok(suspended, diagnostics());
    };
  }

  if (canPerform(capabilities, 'resume')) {
    optional.resumeSubscriber = async (
      session: ProviderSession,
      externalSubscriberId: string,
    ): Promise<OperationResult<Subscription>> => {
      requireSession(session);
      const subscriber = findSubscriber(externalSubscriberId);
      const subscription = subscriber ? findSubscription(subscriber.id) : undefined;
      if (!subscription || !subscriber) {
        return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      }
      const resumed: Subscription = { ...subscription, status: 'active', suspendedAt: null };
      replaceSubscription(resumed);
      replaceSubscriber({ ...subscriber, status: 'active' });
      return ok(resumed, diagnostics());
    };
  }

  if (canPerform(capabilities, 'sessionMonitoring')) {
    optional.getCurrentSession = async (
      session: ProviderSession,
      externalSubscriberId: string,
    ): Promise<OperationResult<NetworkSession | null>> => {
      requireSession(session);
      const subscriber = findSubscriber(externalSubscriberId);
      if (!subscriber) return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      const found = dataset.sessions.find((s) => s.subscriberId === subscriber.id) ?? null;
      return ok(found, diagnostics());
    };
  }

  if (canPerform(capabilities, 'sessionHistory')) {
    optional.getSessionHistory = async (
      session: ProviderSession,
      externalSubscriberId: string,
      limit: number,
    ): Promise<OperationResult<readonly NetworkSession[]>> => {
      requireSession(session);
      const subscriber = findSubscriber(externalSubscriberId);
      if (!subscriber) return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      const current = dataset.sessions.filter((s) => s.subscriberId === subscriber.id);
      return ok(current.slice(0, Math.max(1, limit)), diagnostics());
    };
  }

  if (canPerform(capabilities, 'disconnectSession')) {
    optional.disconnectSession = async (
      session: ProviderSession,
      externalSubscriberId: string,
      idempotencyKey: string,
    ): Promise<OperationResult<void>> => {
      requireSession(session);
      const subscriber = findSubscriber(externalSubscriberId);
      if (!subscriber) return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      return mutate(idempotencyKey, () => {
        dataset = {
          ...dataset,
          sessions: dataset.sessions.map((s) =>
            s.subscriberId === subscriber.id
              ? { ...s, online: false, ipAddress: null, terminateCause: 'Admin-Reset' }
              : s,
          ),
        };
      });
    };
  }

  if (canPerform(capabilities, 'macReset')) {
    optional.resetMac = async (
      session: ProviderSession,
      externalSubscriberId: string,
      idempotencyKey: string,
    ): Promise<OperationResult<void>> => {
      requireSession(session);
      const subscriber = findSubscriber(externalSubscriberId);
      if (!subscriber) return fail('NOT_FOUND', operatorMessage('NOT_FOUND'), diagnostics());
      return mutate(idempotencyKey, () => {
        dataset = {
          ...dataset,
          sessions: dataset.sessions.map((s) =>
            s.subscriberId === subscriber.id ? { ...s, macAddress: null } : s,
          ),
        };
      });
    };
  }

  if (canPerform(capabilities, 'wallet')) {
    optional.getWalletBalance = async (
      session: ProviderSession,
    ): Promise<OperationResult<Wallet>> => {
      requireSession(session);
      return ok({ ...dataset.wallet, lastSyncedAt: now().toISOString() }, diagnostics());
    };
  }

  if (canPerform(capabilities, 'walletTransactions')) {
    optional.getWalletTransactions = async (
      session: ProviderSession,
      limit: number,
    ): Promise<OperationResult<readonly WalletTransaction[]>> => {
      requireSession(session);
      return ok(dataset.walletTransactions.slice(0, Math.max(1, limit)), diagnostics());
    };
  }

  if (canPerform(capabilities, 'testAccounts')) {
    optional.getTestAccountOptions = async (
      session: ProviderSession,
    ): Promise<OperationResult<readonly { durationHours: number; label: string }[]>> => {
      requireSession(session);
      // Durations come from the provider — the ERP never assumes 2/4/24h (§11).
      return ok(
        [
          { durationHours: 3, label: '٣ ساعات' },
          { durationHours: 12, label: '١٢ ساعة' },
          { durationHours: 48, label: 'يومان' },
        ],
        diagnostics(),
      );
    };

    optional.createTestAccount = async (
      session: ProviderSession,
      durationHours: number,
      idempotencyKey: string,
    ): Promise<OperationResult<TestAccount>> => {
      requireSession(session);
      return mutate(idempotencyKey, () => {
        const created = now();
        return {
          id: `mock:test:${idempotencyKey.slice(0, 8)}`,
          providerId: 'mock',
          username: `trial${Math.floor(Math.random() * 90_000 + 10_000)}`,
          createdAt: created.toISOString(),
          expiresAt: new Date(created.getTime() + durationHours * 3600_000).toISOString(),
          cost: { value: money(0, 'IQD'), origin: 'provider' },
          status: 'active',
          metadata: { durationHours },
        } satisfies TestAccount;
      });
    };
  }

  if (canPerform(capabilities, 'tickets')) {
    optional.getSupportTickets = async (
      session: ProviderSession,
    ): Promise<OperationResult<readonly SupportTicket[]>> => {
      requireSession(session);
      const timestamp = now().toISOString();
      return ok(
        [
          {
            id: 'mock:ticket:1',
            providerId: 'mock',
            externalTicketId: 'TK-4471',
            subscriberId: dataset.subscribers[3]?.id ?? null,
            subject: 'انقطاع متكرر في الخدمة',
            status: 'open',
            priority: 'high',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        diagnostics(),
      );
    };
  }

  if (canPerform(capabilities, 'smsNotification')) {
    optional.sendNotification = async (
      session: ProviderSession,
      request: NotificationRequest,
    ): Promise<OperationResult<void>> => {
      requireSession(session);
      if (request.channel !== 'sms') {
        return fail(
          'UNSUPPORTED_OPERATION',
          operatorMessage('UNSUPPORTED_OPERATION'),
          diagnostics(),
        );
      }
      return mutate(request.idempotencyKey, () => undefined);
    };
  }

  if (canPerform(capabilities, 'reconciliation')) {
    optional.reconcileTransactions = async (
      session: ProviderSession,
      since: string,
    ): Promise<OperationResult<readonly ReconciliationEntry[]>> => {
      requireSession(session);
      const cutoff = Date.parse(since);
      const entries = dataset.walletTransactions
        .filter((t) => Number.isNaN(cutoff) || Date.parse(t.createdAt) >= cutoff)
        .map<ReconciliationEntry>((t) => ({
          externalTransactionId: t.providerTransactionId ?? t.id,
          occurredAt: t.createdAt,
          amountMinor: t.amount.amount,
          currency: t.amount.currency,
          subscriberReference: t.referenceId,
          kind: t.type,
        }));
      return ok(entries, diagnostics());
    };
  }

  return { ...required, ...optional };
}
