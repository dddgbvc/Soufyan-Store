/**
 * Outcome envelope for every provider operation.
 *
 * The states come straight from the product spec (§25). The one that matters
 * most is REQUIRES_RECONCILIATION: when an external mutation may have
 * succeeded but the local ERP write did not, we must NOT retry blindly — we
 * park the operation for a human/reconciliation job instead.
 */
export const OPERATION_STATES = [
  'PENDING',
  'PROCESSING',
  'SUCCESS',
  'FAILED',
  'REQUIRES_RECONCILIATION',
  'CANCELLED',
] as const;

export type OperationState = (typeof OPERATION_STATES)[number];

/** States after which no automatic retry may be issued. */
export const TERMINAL_STATES: readonly OperationState[] = [
  'SUCCESS',
  'CANCELLED',
  'REQUIRES_RECONCILIATION',
];

export function isTerminal(state: OperationState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * A blind retry is only ever safe from FAILED (we know nothing happened
 * remotely) or from the two pre-flight states. Anything that may have taken
 * effect upstream must go through reconciliation.
 */
export function isRetryable(state: OperationState): boolean {
  return state === 'FAILED' || state === 'PENDING' || state === 'PROCESSING';
}

export interface OperationDiagnostics {
  /** Adapter-assigned correlation id, echoed into audit logs. */
  readonly requestId: string;
  readonly adapterKey: string;
  readonly durationMs?: number;
  readonly httpStatus?: number;
  /** Provider's own error code, surfaced to administrators only. */
  readonly providerCode?: string;
  readonly attempt?: number;
}

export interface OperationSuccess<T> {
  readonly state: 'SUCCESS';
  readonly data: T;
  readonly diagnostics: OperationDiagnostics;
  /** Set when the provider reported success for only part of a batch. */
  readonly partial?: { readonly succeeded: number; readonly failed: number };
}

export interface OperationFailure {
  readonly state: Exclude<OperationState, 'SUCCESS'>;
  /** Arabic, safe to show any operator. */
  readonly message: string;
  /** Machine-readable reason; see errors.ts. */
  readonly reason: ProviderErrorReason;
  readonly diagnostics: OperationDiagnostics;
  /**
   * Present when the provider may have applied the change. Carries whatever
   * reference we managed to capture so reconciliation has something to match.
   */
  readonly reconciliation?: {
    readonly externalReference?: string;
    readonly note: string;
  };
}

export type OperationResult<T> = OperationSuccess<T> | OperationFailure;

export function isSuccess<T>(r: OperationResult<T>): r is OperationSuccess<T> {
  return r.state === 'SUCCESS';
}

export function ok<T>(data: T, diagnostics: OperationDiagnostics): OperationSuccess<T> {
  return { state: 'SUCCESS', data, diagnostics };
}

export function fail(
  reason: ProviderErrorReason,
  message: string,
  diagnostics: OperationDiagnostics,
  state: Exclude<OperationState, 'SUCCESS'> = 'FAILED',
): OperationFailure {
  return { state, reason, message, diagnostics };
}

/**
 * Build the outcome for "the provider call may have landed but our side
 * failed". Never retried automatically.
 */
export function needsReconciliation(
  reason: ProviderErrorReason,
  message: string,
  diagnostics: OperationDiagnostics,
  note: string,
  externalReference?: string,
): OperationFailure {
  return {
    state: 'REQUIRES_RECONCILIATION',
    reason,
    message,
    diagnostics,
    reconciliation: { note, externalReference },
  };
}

import type { ProviderErrorReason } from './errors';
