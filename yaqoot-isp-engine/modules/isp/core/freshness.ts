import type { SyncMeta } from './types';

/**
 * Data-freshness classification (spec §13).
 *
 * Rule 13 of the product rules: never make external data look real-time when
 * it is stale. Every provider-sourced surface must render one of these.
 */
export type FreshnessLevel = 'live' | 'fresh' | 'stale' | 'offline' | 'error';

export interface Freshness {
  readonly level: FreshnessLevel;
  /** Arabic label, e.g. "مُزامن قبل ٣٠ ثانية". */
  readonly label: string;
  readonly ageSeconds: number | null;
}

/** Under this age a synced value may be presented as effectively live. */
const LIVE_WINDOW_SECONDS = 10;
/** Beyond this age the value is explicitly flagged as stale. */
const STALE_AFTER_SECONDS = 300;

function arabicDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ساعة`;
  return `${Math.floor(hours / 24)} يوم`;
}

/**
 * @param sync   record-level sync metadata
 * @param now    injected for deterministic tests
 * @param online whether the provider connection is currently reachable
 */
export function classifyFreshness(
  sync: SyncMeta,
  now: Date = new Date(),
  online = true,
): Freshness {
  if (sync.syncStatus === 'error') {
    return { level: 'error', label: 'خطأ في المزامنة', ageSeconds: null };
  }

  // Yaqoot-owned data is authoritative locally; it is never "stale".
  if (sync.owner === 'yaqoot') {
    return { level: 'live', label: 'بيانات محلية', ageSeconds: 0 };
  }

  if (sync.fetchedAt === null || sync.syncStatus === 'never') {
    return { level: 'offline', label: 'غير مُزامن', ageSeconds: null };
  }

  const fetched = Date.parse(sync.fetchedAt);
  if (Number.isNaN(fetched)) {
    return { level: 'error', label: 'خطأ في المزامنة', ageSeconds: null };
  }

  const ageSeconds = Math.max(0, Math.floor((now.getTime() - fetched) / 1000));

  if (!online) {
    return {
      level: 'offline',
      label: `غير متصل — آخر مزامنة قبل ${arabicDuration(ageSeconds)}`,
      ageSeconds,
    };
  }

  if (sync.syncStatus === 'stale' || ageSeconds > STALE_AFTER_SECONDS) {
    return {
      level: 'stale',
      label: `مُزامن قبل ${arabicDuration(ageSeconds)}`,
      ageSeconds,
    };
  }

  if (ageSeconds <= LIVE_WINDOW_SECONDS) {
    return { level: 'live', label: 'مباشر', ageSeconds };
  }

  return {
    level: 'fresh',
    label: `مُزامن قبل ${arabicDuration(ageSeconds)}`,
    ageSeconds,
  };
}

export function syncMeta(
  owner: SyncMeta['owner'],
  fetchedAt: string | null = null,
  externalReference: string | null = null,
  syncStatus: SyncMeta['syncStatus'] = fetchedAt ? 'ok' : 'never',
): SyncMeta {
  return { owner, fetchedAt, externalReference, syncStatus };
}

/** Convenience for records the ERP owns outright (invoices, local debts). */
export const YAQOOT_OWNED: SyncMeta = {
  owner: 'yaqoot',
  fetchedAt: null,
  externalReference: null,
  syncStatus: 'ok',
};
