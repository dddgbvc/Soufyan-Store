import { CAPABILITY_KEYS, type CapabilityKey } from './keys';

/**
 * A capability is not a boolean (spec §20). "Configurable" and "unknown" are
 * first-class: they are the honest answer when the ERP can supply a value the
 * provider cannot, or when discovery has not run yet.
 */
export const CAPABILITY_STATES = [
  'supported',
  'unsupported',
  'partial',
  'configurable',
  'unknown',
] as const;

export type CapabilityState = (typeof CAPABILITY_STATES)[number];

export const CAPABILITY_STATE_LABELS: Record<CapabilityState, string> = {
  supported: 'مدعوم',
  unsupported: 'غير مدعوم',
  partial: 'مدعوم جزئياً',
  configurable: 'قابل للضبط',
  unknown: 'غير معروف',
};

export interface CapabilityDeclaration {
  readonly state: CapabilityState;
  /** Adapter's own explanation — shown when an admin clicks the cell (§20). */
  readonly note?: string;
  /**
   * For `partial`: which sub-operations work. For `configurable`: which ERP
   * setting supplies the value.
   */
  readonly detail?: Readonly<Record<string, unknown>>;
}

export type CapabilityManifest = Readonly<Partial<Record<CapabilityKey, CapabilityDeclaration>>>;

/** A fully-resolved manifest: every known key has an explicit state. */
export type ResolvedManifest = Readonly<Record<CapabilityKey, CapabilityDeclaration>>;

const UNKNOWN: CapabilityDeclaration = { state: 'unknown' };

/**
 * Fill in every key the adapter did not mention as `unknown`, so downstream
 * code never has to deal with `undefined`. An omitted capability is NOT the
 * same as an unsupported one — omission means discovery has not told us yet.
 */
export function resolveManifest(manifest: CapabilityManifest): ResolvedManifest {
  const out = {} as Record<CapabilityKey, CapabilityDeclaration>;
  for (const key of CAPABILITY_KEYS) {
    out[key] = manifest[key] ?? UNKNOWN;
  }
  return out;
}

/** Shorthand for building a manifest from plain booleans in an adapter. */
export function declare(
  flags: Partial<Record<CapabilityKey, boolean | CapabilityDeclaration>>,
): CapabilityManifest {
  const out: Partial<Record<CapabilityKey, CapabilityDeclaration>> = {};
  for (const [key, value] of Object.entries(flags) as [
    CapabilityKey,
    boolean | CapabilityDeclaration | undefined,
  ][]) {
    if (value === undefined) continue;
    out[key] =
      typeof value === 'boolean' ? { state: value ? 'supported' : 'unsupported' } : value;
  }
  return out;
}
