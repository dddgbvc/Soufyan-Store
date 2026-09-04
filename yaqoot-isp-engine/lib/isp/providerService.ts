import 'server-only';
import { randomUUID } from 'node:crypto';
import { bootstrapAdapters, enabledAdapterKeys } from '@/modules/isp/providers/bootstrap';
import { getAdapter } from '@/modules/isp/providers/core/registry';
import type {
  ISPProviderAdapter,
  ProviderSession,
  SubscriberQuery,
} from '@/modules/isp/providers/core/adapter';
import type {
  AuthCredentials,
  AuthOutcome,
  AuthRequirements,
  AuthState,
  SessionPersistence,
  SecondFactorChallenge,
} from '@/modules/isp/providers/core/auth';
import type { CapabilityManifest } from '@/modules/isp/capabilities/manifest';
import { canPerform, isReadOnly } from '@/modules/isp/capabilities/resolver';
import { isSuccess, type OperationResult } from '@/modules/isp/core/result';
import { redact } from '@/modules/isp/core/errors';
import type { Provider, Subscriber, Wallet } from '@/modules/isp/core/types';
import { daysUntil, EXPIRING_SOON_DAYS } from '@/modules/isp/subscriptions/renewal';
import {
  dropSession,
  getAgentName,
  getSession,
  putSession,
  rememberChallenge,
  takeChallenge,
} from './providerSession';

/**
 * Server-side provider service.
 *
 * Everything the UI needs, assembled here so route handlers stay thin and so
 * there is exactly one place where adapter calls happen. Nothing in this file
 * returns provider credentials or raw provider errors to the caller.
 */

bootstrapAdapters();

export interface ProviderSummary {
  readonly provider: Provider;
  readonly authState: AuthState;
  readonly agentDisplayName: string | null;
  /** Empty until the provider is authenticated and discovery has run (§43). */
  readonly capabilities: CapabilityManifest;
  readonly readOnly: boolean;
  readonly requiresAuth: boolean;
}

function adapterFor(providerId: string): ISPProviderAdapter {
  return getAdapter(providerId);
}

export async function listProviders(sid: string | null): Promise<readonly ProviderSummary[]> {
  const summaries: ProviderSummary[] = [];

  for (const key of enabledAdapterKeys()) {
    const adapter = adapterFor(key);
    const provider = await adapter.getProviderProfile();
    const session = getSession(sid, provider.id);

    let authState: AuthState = 'UNAUTHENTICATED';
    let capabilities: CapabilityManifest = {};

    if (session) {
      const status = await adapter.getAuthenticationStatus(session);
      authState = status.state;
      // Capabilities are only meaningful for an authenticated session, and
      // the UI must not render a dashboard before discovery (§43).
      if (status.state === 'AUTHENTICATED') {
        capabilities = await adapter.getCapabilities(session);
      }
    }

    const requirements = await adapter.getAuthenticationRequirements();
    const requiresAuth = !requirements.methods.some((m) => m.kind === 'none');

    summaries.push({
      provider,
      authState,
      agentDisplayName: getAgentName(sid, provider.id),
      capabilities,
      readOnly: Object.keys(capabilities).length > 0 && isReadOnly(capabilities),
      requiresAuth,
    });
  }

  return summaries;
}

export async function authRequirements(providerId: string): Promise<AuthRequirements> {
  return adapterFor(providerId).getAuthenticationRequirements();
}

export type LoginResult =
  | { readonly kind: 'authenticated'; readonly agentDisplayName: string | null }
  | { readonly kind: 'mfa'; readonly challenge: SecondFactorChallenge }
  | { readonly kind: 'error'; readonly message: string; readonly reason: string };

function toLoginResult(
  outcome: AuthOutcome,
  sid: string,
  providerId: string,
  persistence: SessionPersistence,
): LoginResult {
  switch (outcome.state) {
    case 'AUTHENTICATED': {
      const session: ProviderSession = {
        sessionRef: outcome.sessionRef,
        providerId,
        expiresAt: outcome.expiresAt,
      };
      putSession(sid, providerId, session, persistence, outcome.agentDisplayName);
      return { kind: 'authenticated', agentDisplayName: outcome.agentDisplayName };
    }
    case 'REQUIRES_MFA':
      rememberChallenge(outcome.challenge.challengeId, sid, providerId);
      return { kind: 'mfa', challenge: outcome.challenge };
    case 'ERROR':
      return { kind: 'error', message: outcome.message, reason: outcome.reason };
    default: {
      const never: never = outcome;
      throw new Error(`Unhandled auth outcome: ${JSON.stringify(never)}`);
    }
  }
}

export async function login(
  sid: string,
  providerId: string,
  methodId: string,
  credentials: AuthCredentials,
  persistence: SessionPersistence,
): Promise<LoginResult> {
  const adapter = adapterFor(providerId);
  const outcome = await adapter.authenticate(credentials, methodId);
  return toLoginResult(outcome, sid, providerId, persistence);
}

export async function submitSecondFactor(
  challengeId: string,
  answers: AuthCredentials,
): Promise<LoginResult> {
  const pending = takeChallenge(challengeId);
  if (!pending) {
    return {
      kind: 'error',
      reason: 'AUTH_FAILED',
      message: 'انتهت صلاحية رمز التحقق — أعد تسجيل الدخول.',
    };
  }

  const adapter = adapterFor(pending.providerId);
  if (typeof adapter.submitSecondFactor !== 'function') {
    return {
      kind: 'error',
      reason: 'UNSUPPORTED_AUTH_METHOD',
      message: 'التحقق بخطوتين غير مدعوم لدى هذا المزود.',
    };
  }

  const outcome = await adapter.submitSecondFactor(challengeId, answers);
  return toLoginResult(outcome, pending.sid, pending.providerId, 'session_only');
}

export async function logout(sid: string, providerId: string): Promise<void> {
  const session = getSession(sid, providerId);
  if (session) {
    await adapterFor(providerId).logout(session);
  }
  dropSession(sid, providerId);
}

// ---------------------------------------------------------------------------
// Capability discovery (§43)
// ---------------------------------------------------------------------------

export interface DiscoveryResult {
  readonly capabilities: CapabilityManifest;
  readonly packagesLoaded: number;
  readonly walletLoaded: boolean;
  readonly readOnly: boolean;
}

/**
 * Runs after a successful login and before the dashboard renders. Each step is
 * optional and failure of one does not abort the rest — a provider that has
 * packages but no wallet still yields a usable dashboard.
 */
export async function discoverCapabilities(
  sid: string,
  providerId: string,
): Promise<DiscoveryResult | null> {
  const session = getSession(sid, providerId);
  if (!session) return null;

  const adapter = adapterFor(providerId);
  const capabilities = await adapter.getCapabilities(session);

  let packagesLoaded = 0;
  if (typeof adapter.getPackages === 'function') {
    const result = await adapter.getPackages(session);
    if (isSuccess(result)) packagesLoaded = result.data.length;
  }

  let walletLoaded = false;
  if (typeof adapter.getWalletBalance === 'function') {
    const result = await adapter.getWalletBalance(session);
    walletLoaded = isSuccess(result);
  }

  return {
    capabilities,
    packagesLoaded,
    walletLoaded,
    readOnly: isReadOnly(capabilities),
  };
}

// ---------------------------------------------------------------------------
// Dashboard snapshot
// ---------------------------------------------------------------------------

export interface DashboardSnapshot {
  readonly providerId: string;
  readonly generatedAt: string;
  readonly capabilities: CapabilityManifest;
  readonly subscribers: {
    readonly total: number;
    readonly active: number;
    readonly byStatus: Readonly<Record<string, number>>;
  } | null;
  readonly expiringSoon: number | null;
  readonly onlineNow: number | null;
  readonly wallet: Wallet | null;
  readonly health: {
    readonly reachable: boolean;
    readonly latencyMs: number | null;
    readonly checkedAt: string;
  };
}

export async function dashboardSnapshot(
  sid: string,
  providerId: string,
): Promise<DashboardSnapshot | null> {
  const session = getSession(sid, providerId);
  if (!session) return null;

  const adapter = adapterFor(providerId);
  const capabilities = await adapter.getCapabilities(session);
  const generatedAt = new Date().toISOString();

  let subscribers: DashboardSnapshot['subscribers'] = null;
  let expiringSoon: number | null = null;
  let onlineNow: number | null = null;

  if (canPerform(capabilities, 'subscriberManagement') && adapter.searchSubscribers) {
    const result = await adapter.searchSubscribers(session, { limit: 100 });
    if (isSuccess(result)) {
      const items = result.data.items;
      const byStatus: Record<string, number> = {};
      for (const s of items) {
        byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
      }
      subscribers = {
        total: result.data.total ?? items.length,
        active: byStatus.active ?? 0,
        byStatus,
      };

      // Expiry needs the subscription, which not every provider exposes.
      if (adapter.getSubscription) {
        let count = 0;
        for (const subscriber of items) {
          const sub = await adapter.getSubscription(session, subscriber.externalSubscriberId);
          if (!isSuccess(sub)) continue;
          const days = daysUntil(sub.data.expiresAt);
          if (days !== null && days >= 0 && days <= EXPIRING_SOON_DAYS) count += 1;
        }
        expiringSoon = count;
      }

      // Only count sessions when the provider actually reports them (§19).
      if (canPerform(capabilities, 'sessionMonitoring') && adapter.getCurrentSession) {
        let online = 0;
        for (const subscriber of items) {
          const s = await adapter.getCurrentSession(session, subscriber.externalSubscriberId);
          if (isSuccess(s) && s.data?.online) online += 1;
        }
        onlineNow = online;
      }
    }
  }

  let wallet: Wallet | null = null;
  if (canPerform(capabilities, 'wallet') && adapter.getWalletBalance) {
    const result = await adapter.getWalletBalance(session);
    if (isSuccess(result)) wallet = result.data;
  }

  let reachable = false;
  let latencyMs: number | null = null;
  if (adapter.testConnection) {
    const result = await adapter.testConnection(session);
    reachable = isSuccess(result);
    if (isSuccess(result)) latencyMs = result.data.latencyMs;
  }

  return {
    providerId,
    generatedAt,
    capabilities,
    subscribers,
    expiringSoon,
    onlineNow,
    wallet,
    health: { reachable, latencyMs, checkedAt: generatedAt },
  };
}

// ---------------------------------------------------------------------------
// Subscribers
// ---------------------------------------------------------------------------

export interface SubscriberSearchResult {
  readonly items: readonly Subscriber[];
  readonly total: number | null;
  readonly nextCursor: string | null;
  readonly capabilities: CapabilityManifest;
}

export async function searchSubscribers(
  sid: string,
  providerId: string,
  query: SubscriberQuery,
): Promise<SubscriberSearchResult | null> {
  const session = getSession(sid, providerId);
  if (!session) return null;

  const adapter = adapterFor(providerId);
  const capabilities = await adapter.getCapabilities(session);

  if (!canPerform(capabilities, 'subscriberManagement') || !adapter.searchSubscribers) {
    return { items: [], total: 0, nextCursor: null, capabilities };
  }

  const result = await adapter.searchSubscribers(session, query);
  if (!isSuccess(result)) {
    return { items: [], total: 0, nextCursor: null, capabilities };
  }

  return {
    items: result.data.items,
    total: result.data.total,
    nextCursor: result.data.nextCursor,
    capabilities,
  };
}

/** Idempotency keys are minted server-side so a double-click cannot double-charge. */
export function newIdempotencyKey(): string {
  return randomUUID();
}

/**
 * Convert any adapter outcome into something safe to hand the browser.
 * Diagnostics are kept, but redacted, and only administrators are shown them.
 */
export function toClientResult<T>(result: OperationResult<T>): {
  ok: boolean;
  state: string;
  message?: string;
  data?: T;
  diagnostics: unknown;
} {
  if (isSuccess(result)) {
    return {
      ok: true,
      state: result.state,
      data: result.data,
      diagnostics: redact(result.diagnostics),
    };
  }
  return {
    ok: false,
    state: result.state,
    message: result.message,
    diagnostics: redact(result.diagnostics),
  };
}
