import { CAPABILITY_META, type CapabilityKey } from './keys';
import {
  resolveManifest,
  type CapabilityDeclaration,
  type CapabilityManifest,
  type CapabilityState,
  type ResolvedManifest,
} from './manifest';

/**
 * Capability resolution — the single place that decides what the UI may show.
 *
 * Product rule 11: never show an action the connected provider cannot perform.
 * Product rule 14: no provider-specific code leaks into universal components;
 * everything asks this module instead.
 */

/** States in which the provider can actually execute the operation. */
const ACTIONABLE_STATES: readonly CapabilityState[] = ['supported', 'partial'];

/** States in which *some* value exists — from the provider or from ERP config. */
const DATA_STATES: readonly CapabilityState[] = ['supported', 'partial', 'configurable'];

/** May the provider perform this operation? Drives buttons and workflows. */
export function canPerform(manifest: CapabilityManifest, key: CapabilityKey): boolean {
  const state = manifest[key]?.state;
  return state !== undefined && ACTIONABLE_STATES.includes(state);
}

/** Is there a value to render? Drives widgets, columns and cards. */
export function hasData(manifest: CapabilityManifest, key: CapabilityKey): boolean {
  const state = manifest[key]?.state;
  return state !== undefined && DATA_STATES.includes(state);
}

export function stateOf(manifest: CapabilityManifest, key: CapabilityKey): CapabilityState {
  return manifest[key]?.state ?? 'unknown';
}

export function declarationOf(
  manifest: CapabilityManifest,
  key: CapabilityKey,
): CapabilityDeclaration {
  return manifest[key] ?? { state: 'unknown' };
}

export interface GateResult {
  readonly allowed: boolean;
  readonly missing: readonly CapabilityKey[];
  /** Arabic explanation for an Empty Capability Card (§17). */
  readonly reason: string | null;
}

/**
 * Gate a widget/screen behind a set of capabilities. ALL keys must be
 * actionable-or-data-bearing; the first missing one supplies the copy.
 */
export function gate(
  manifest: CapabilityManifest,
  required: readonly CapabilityKey[],
): GateResult {
  const missing = required.filter((k) => !hasData(manifest, k));
  if (missing.length === 0) {
    return { allowed: true, missing: [], reason: null };
  }
  const first = missing[0];
  return {
    allowed: false,
    missing,
    // `first` is defined because missing.length > 0; the check keeps
    // noUncheckedIndexedAccess happy without a non-null assertion.
    reason: first ? CAPABILITY_META[first].unsupportedHint : null,
  };
}

/** Mutating operations. If none is actionable the connection is read-only (§3). */
const MUTATING_CAPABILITIES: readonly CapabilityKey[] = [
  'subscriberCreate',
  'subscriberUpdate',
  'activation',
  'renewal',
  'packageChange',
  'suspend',
  'resume',
  'disconnectSession',
  'macReset',
  'walletRecharge',
  'testAccounts',
];

export function isReadOnly(manifest: CapabilityManifest): boolean {
  return !MUTATING_CAPABILITIES.some((k) => canPerform(manifest, k));
}

export function resolve(manifest: CapabilityManifest): ResolvedManifest {
  return resolveManifest(manifest);
}

// ---------------------------------------------------------------------------
// Multi-provider aggregation (§19)
// ---------------------------------------------------------------------------

export interface ProviderManifest {
  readonly providerId: string;
  readonly providerName: string;
  readonly manifest: CapabilityManifest;
}

export interface CapabilityCoverage {
  readonly key: CapabilityKey;
  /** Providers that can supply this capability's data. */
  readonly reporting: readonly ProviderRef[];
  readonly notReporting: readonly ProviderRef[];
  readonly unknown: readonly ProviderRef[];
  /** True only when every selected provider reports. */
  readonly complete: boolean;
}

export interface ProviderRef {
  readonly providerId: string;
  readonly providerName: string;
}

export function coverageFor(
  providers: readonly ProviderManifest[],
  key: CapabilityKey,
): CapabilityCoverage {
  const reporting: ProviderRef[] = [];
  const notReporting: ProviderRef[] = [];
  const unknown: ProviderRef[] = [];

  for (const p of providers) {
    const ref: ProviderRef = { providerId: p.providerId, providerName: p.providerName };
    const state = stateOf(p.manifest, key);
    if (state === 'unknown') unknown.push(ref);
    else if (DATA_STATES.includes(state)) reporting.push(ref);
    else notReporting.push(ref);
  }

  return {
    key,
    reporting,
    notReporting,
    unknown,
    complete: providers.length > 0 && reporting.length === providers.length,
  };
}

/**
 * Combined capability state across providers — what the matrix header and the
 * "All Providers" view show.
 */
export function aggregateState(
  providers: readonly ProviderManifest[],
  key: CapabilityKey,
): CapabilityState {
  if (providers.length === 0) return 'unknown';
  const states = providers.map((p) => stateOf(p.manifest, key));
  if (states.every((s) => s === 'supported')) return 'supported';
  if (states.every((s) => s === 'unsupported')) return 'unsupported';
  if (states.every((s) => s === 'unknown')) return 'unknown';
  // Any mix — including supported+unsupported — is honestly "partial".
  return 'partial';
}

export interface MetricContribution {
  readonly providerId: string;
  readonly providerName: string;
  readonly value: number;
}

export interface AggregatedMetric {
  /** Sum over *reporting* providers only. */
  readonly total: number;
  readonly breakdown: readonly MetricContribution[];
  readonly coverage: CapabilityCoverage;
  /**
   * False when at least one selected provider cannot report this metric. The
   * UI must then qualify the number instead of presenting it as a full total.
   */
  readonly complete: boolean;
  /** Arabic qualifier, e.g. "المزودون الذين يوفرون بيانات مباشرة". */
  readonly qualifier: string | null;
}

/**
 * Aggregate a per-provider metric without lying about coverage (§19).
 *
 * Providers that cannot report the capability are excluded from the sum AND
 * named in `coverage.notReporting`, so the card can render
 * "الجلسات المتصلة — المزودون الذين يوفرون بيانات مباشرة" rather than a
 * bare total that silently omits them.
 */
export function aggregateMetric(
  providers: readonly ProviderManifest[],
  key: CapabilityKey,
  valueOf: (providerId: string) => number | null,
): AggregatedMetric {
  const coverage = coverageFor(providers, key);

  const breakdown: MetricContribution[] = [];
  for (const ref of coverage.reporting) {
    const value = valueOf(ref.providerId);
    if (value === null) continue;
    breakdown.push({ ...ref, value });
  }

  const total = breakdown.reduce((sum, c) => sum + c.value, 0);
  // Incomplete if a provider cannot report, or reports nothing when it should.
  const complete = coverage.complete && breakdown.length === coverage.reporting.length;

  return {
    total,
    breakdown,
    coverage,
    complete,
    qualifier: complete ? null : 'المزودون الذين يوفرون هذه البيانات فقط',
  };
}
