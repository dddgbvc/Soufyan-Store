import type { Money } from './money';

/**
 * Canonical, provider-neutral domain (spec §4).
 *
 * Rules encoded here:
 *  - No provider name appears in any field. External identity is always
 *    `provider_id` + `external*Id`.
 *  - Anything a specific provider adds lives in `metadata`, never as a new
 *    column on a universal entity.
 *  - Anything sourced from a provider carries `SyncMeta` so the UI can tell
 *    live data from stale data (§13).
 */

/** Where a value came from — drives the "provider supplied / ERP configured / unavailable" label (§5). */
export type ValueOrigin = 'provider' | 'erp' | 'unavailable';

export interface Sourced<T> {
  readonly value: T;
  readonly origin: ValueOrigin;
}

export function sourced<T>(value: T, origin: ValueOrigin): Sourced<T> {
  return { value, origin };
}

/** ERP-configured or provider-supplied cost, explicitly nullable (§5). */
export type OptionalCost = Sourced<Money | null>;

export interface SyncMeta {
  /** Who owns this record's truth. Never silently overwrite `yaqoot` data (§24). */
  readonly owner: 'yaqoot' | 'provider' | 'synced';
  readonly fetchedAt: string | null;
  readonly externalReference: string | null;
  readonly syncStatus: 'ok' | 'stale' | 'error' | 'never';
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export type ProviderStatus = 'active' | 'inactive' | 'suspended';

export interface Provider {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly logoUrl: string | null;
  /** Optional brand accent. Stays subordinate to the Yaqoot shell (§48). */
  readonly accentColor: string | null;
  readonly country: string;
  readonly currency: string;
  readonly timezone: string;
  readonly status: ProviderStatus;
  readonly adapterKey: string;
  readonly apiVersion: string | null;
  readonly supportUrl: string | null;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ConnectionEnvironment = 'sandbox' | 'production';
export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface ProviderConnection {
  readonly id: string;
  readonly providerId: string;
  readonly connectionName: string;
  readonly environment: ConnectionEnvironment;
  readonly status: 'connected' | 'disconnected' | 'error';
  readonly lastSyncAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastErrorAt: string | null;
  readonly lastErrorReason: string | null;
  readonly healthStatus: HealthStatus;
  /**
   * Opaque pointer to credentials held server-side. NEVER the credentials
   * themselves — this object crosses to the browser (§4, §21).
   */
  readonly credentialsReference: string | null;
  readonly latencyMs: number | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface Agent {
  readonly id: string;
  readonly providerId: string;
  readonly externalAgentId: string | null;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly status: 'active' | 'inactive';
  readonly walletId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Subscriber & subscription
// ---------------------------------------------------------------------------

export const SUBSCRIBER_STATUSES = [
  'active',
  'expiring',
  'expired',
  'suspended',
  'disabled',
  'pending',
  'unknown',
] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

/** Open-ended on purpose: a provider may report a technology we don't model. */
export type NetworkTechnology = 'pppoe' | 'ftth' | 'wireless' | 'hotspot' | 'other';

export interface Subscriber {
  readonly id: string;
  readonly providerId: string;
  readonly externalSubscriberId: string;
  /** Links provider subscriber → Yaqoot ERP customer. Null until reconciled. */
  readonly erpCustomerId: string | null;
  readonly fullName: string;
  readonly phoneNumber: string | null;
  readonly alternatePhone: string | null;
  readonly address: string | null;
  readonly area: string | null;
  readonly governorate: string | null;
  readonly zone: string | null;
  readonly towerId: string | null;
  readonly networkNodeId: string | null;
  readonly technology: NetworkTechnology | null;
  readonly username: string | null;
  readonly status: SubscriberStatus;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly sync: SyncMeta;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type SubscriptionStatus =
  | 'active'
  | 'expired'
  | 'suspended'
  | 'cancelled'
  | 'pending';

export interface Subscription {
  readonly id: string;
  readonly subscriberId: string;
  readonly providerId: string;
  readonly externalSubscriptionId: string | null;
  readonly packageId: string | null;
  readonly status: SubscriptionStatus;
  readonly startedAt: string | null;
  readonly expiresAt: string | null;
  readonly suspendedAt: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly sync: SyncMeta;
}

// ---------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------

/**
 * Renewal semantics are declared by the provider, never assumed (§8, rule 3).
 * There is deliberately no default of "30 days" anywhere in this codebase.
 */
export type RenewalSemantics =
  | 'extend_from_expiry'
  | 'start_from_now'
  | 'fixed_cycle'
  | 'calendar_month'
  | 'provider_defined';

export type BillingModel = 'prepaid' | 'postpaid' | 'quota' | 'unlimited' | 'provider_defined';

export type DurationUnit = 'hour' | 'day' | 'week' | 'month' | 'year';

export interface PackageDuration {
  readonly value: number;
  readonly unit: DurationUnit;
}

export interface Package {
  readonly id: string;
  readonly providerId: string;
  readonly externalPackageId: string;
  readonly name: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly technology: NetworkTechnology | null;
  /** Speeds in Mbps. Null where the provider does not publish them. */
  readonly downloadSpeed: number | null;
  readonly uploadSpeed: number | null;
  /** Null for packages with no fixed period (e.g. quota-only bundles). */
  readonly duration: PackageDuration | null;
  readonly renewalSemantics: RenewalSemantics;
  readonly retailPrice: Money;
  /** Frequently unavailable from the API — hence Sourced + nullable (§5). */
  readonly wholesalePrice: OptionalCost;
  readonly currency: string;
  readonly billingModel: BillingModel;
  readonly active: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly sync: SyncMeta;
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export interface Wallet {
  readonly id: string;
  readonly providerId: string;
  readonly agentId: string | null;
  readonly currency: string;
  readonly currentBalance: Money;
  readonly availableBalance: Money;
  readonly creditLimit: Money | null;
  readonly reservedAmount: Money | null;
  readonly lowBalanceThreshold: Money | null;
  readonly lastSyncedAt: string | null;
  readonly sync: SyncMeta;
}

export type WalletTransactionType =
  | 'recharge'
  | 'activation'
  | 'renewal'
  | 'package_change'
  | 'refund'
  | 'adjustment'
  | 'commission'
  | 'fee'
  | 'unknown';

export interface WalletTransaction {
  readonly id: string;
  readonly walletId: string;
  readonly providerTransactionId: string | null;
  readonly type: WalletTransactionType;
  readonly direction: 'credit' | 'debit';
  readonly amount: Money;
  /** Null when the provider does not report running balances. */
  readonly balanceBefore: Money | null;
  readonly balanceAfter: Money | null;
  readonly referenceType: string | null;
  readonly referenceId: string | null;
  readonly status: 'posted' | 'pending' | 'reversed';
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export interface NetworkSession {
  readonly id: string;
  readonly subscriberId: string;
  readonly online: boolean;
  readonly username: string | null;
  readonly macAddress: string | null;
  readonly ipAddress: string | null;
  readonly ipClassification: 'public' | 'private' | null;
  readonly startedAt: string | null;
  readonly uptimeSeconds: number | null;
  readonly nasIdentifier: string | null;
  readonly vlan: string | null;
  readonly bytesIn: number | null;
  readonly bytesOut: number | null;
  readonly signal: Readonly<Record<string, number>> | null;
  readonly terminateCause: string | null;
  readonly sync: SyncMeta;
}

export interface TestAccount {
  readonly id: string;
  readonly providerId: string;
  readonly username: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly cost: OptionalCost;
  readonly status: 'active' | 'expired' | 'revoked';
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface SupportTicket {
  readonly id: string;
  readonly providerId: string;
  readonly externalTicketId: string | null;
  readonly subscriberId: string | null;
  readonly subject: string;
  readonly status: 'open' | 'pending' | 'resolved' | 'closed';
  readonly priority: 'low' | 'normal' | 'high' | 'urgent' | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Dynamic form schema (§9)
// ---------------------------------------------------------------------------

export type FieldType =
  | 'text'
  | 'password'
  | 'number'
  | 'email'
  | 'tel'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'date'
  | 'mac'
  | 'ip'
  | 'otp'
  | 'textarea';

export interface FieldOption {
  readonly value: string;
  readonly label: string;
}

export interface FieldValidation {
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
  /** Arabic message shown when validation fails. */
  readonly message?: string;
}

export interface FieldDefinition {
  readonly key: string;
  readonly type: FieldType;
  /** Arabic label. Falls back to `key` when the provider supplies none. */
  readonly label: string;
  readonly required: boolean;
  readonly readOnly?: boolean;
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly options?: readonly FieldOption[];
  readonly validation?: FieldValidation;
  /** Render the input LTR — usernames, MACs, IPs, IDs (§28). */
  readonly ltr?: boolean;
  /** Never echoed back from the server, never logged. */
  readonly secure?: boolean;
}

export interface FormSchema {
  readonly fields: readonly FieldDefinition[];
}

// ---------------------------------------------------------------------------
// Subscription operation inputs
// ---------------------------------------------------------------------------

export interface RenewalPlan {
  readonly semantics: RenewalSemantics;
  readonly currentExpiry: string | null;
  readonly newExpiry: string | null;
  readonly price: Money;
  readonly cost: OptionalCost;
  /** Human-readable Arabic explanation of how the new expiry was derived. */
  readonly explanation: string;
}

export type PackageChangeTiming = 'immediate' | 'next_cycle' | 'prorated';

export interface PackageChangeOption {
  readonly timing: PackageChangeTiming;
  readonly label: string;
  readonly allowed: boolean;
  /** Arabic reason shown when `allowed` is false. */
  readonly reason?: string;
  readonly priceDelta: Money | null;
}
