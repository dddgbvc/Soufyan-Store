import { money, type Money } from '../../core/money';
import { syncMeta } from '../../core/freshness';
import type {
  NetworkSession,
  NetworkTechnology,
  Package,
  Subscriber,
  SubscriberStatus,
  Subscription,
  Wallet,
  WalletTransaction,
} from '../../core/types';
import type { MockProfileDefinition } from './profiles';

/**
 * Deterministic dataset for the mock provider (spec §32).
 *
 * Same seed ⇒ same data, so tests can assert on concrete records and the demo
 * looks identical on every machine.
 */

/** mulberry32 — small, fast, good enough for fixtures. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'أحمد', 'محمد', 'علي', 'حسين', 'عمر', 'مصطفى', 'يوسف', 'إبراهيم',
  'زينب', 'فاطمة', 'مريم', 'نور', 'سارة', 'رقية', 'هدى', 'آية',
];

const FAMILY_NAMES = [
  'العبيدي', 'الجبوري', 'الدليمي', 'السامرائي', 'التكريتي', 'الحديثي',
  'الزيدي', 'الركابي', 'الخفاجي', 'الطائي',
];

const GOVERNORATES = ['صلاح الدين', 'بغداد', 'نينوى', 'الأنبار', 'ديالى', 'كركوك'];

const AREAS = ['الحويش', 'القادسية', 'الشهامة', 'الدور', 'بيجي', 'الضلوعية'];

function pick<T>(rng: () => number, list: readonly T[]): T {
  const index = Math.floor(rng() * list.length);
  // Clamp defensively: rng() can theoretically return values at the boundary.
  const safe = Math.min(Math.max(index, 0), list.length - 1);
  const value = list[safe];
  if (value === undefined) {
    throw new Error('Cannot pick from an empty list');
  }
  return value;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function isoOffsetDays(from: Date, days: number): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

export interface MockDataset {
  readonly packages: readonly Package[];
  readonly subscribers: readonly Subscriber[];
  readonly subscriptions: readonly Subscription[];
  readonly sessions: readonly NetworkSession[];
  readonly wallet: Wallet;
  readonly walletTransactions: readonly WalletTransaction[];
}

const PROVIDER_ID = 'mock';

interface PackageSeed {
  readonly id: string;
  readonly name: string;
  readonly display: string;
  readonly down: number;
  readonly up: number;
  readonly days: number;
  readonly retail: number;
  readonly wholesale: number;
  readonly tech: NetworkTechnology;
}

const PACKAGE_SEEDS: readonly PackageSeed[] = [
  { id: 'P-4M-30', name: 'home-4m', display: 'منزلي ٤ ميغا', down: 4, up: 2, days: 30, retail: 25_000, wholesale: 19_000, tech: 'pppoe' },
  { id: 'P-8M-30', name: 'home-8m', display: 'منزلي ٨ ميغا', down: 8, up: 4, days: 30, retail: 40_000, wholesale: 31_000, tech: 'pppoe' },
  { id: 'P-16M-30', name: 'home-16m', display: 'منزلي ١٦ ميغا', down: 16, up: 8, days: 30, retail: 65_000, wholesale: 52_000, tech: 'pppoe' },
  { id: 'P-F50-30', name: 'fiber-50', display: 'ألياف ٥٠ ميغا', down: 50, up: 25, days: 30, retail: 110_000, wholesale: 88_000, tech: 'ftth' },
  { id: 'P-F100-30', name: 'fiber-100', display: 'ألياف ١٠٠ ميغا', down: 100, up: 50, days: 30, retail: 175_000, wholesale: 141_000, tech: 'ftth' },
  { id: 'P-W10-90', name: 'wifi-10', display: 'لاسلكي ١٠ ميغا — ٣ أشهر', down: 10, up: 5, days: 90, retail: 150_000, wholesale: 120_000, tech: 'wireless' },
];

function buildPackages(def: MockProfileDefinition, now: Date): Package[] {
  const fetchedAt = now.toISOString();
  return PACKAGE_SEEDS.filter((seed) =>
    (def.dataShape.technologies as readonly NetworkTechnology[]).includes(seed.tech),
  ).map((seed) => ({
    id: `${PROVIDER_ID}:${seed.id}`,
    providerId: PROVIDER_ID,
    externalPackageId: seed.id,
    name: seed.name,
    displayName: seed.display,
    description: null,
    technology: seed.tech,
    // A legacy API simply does not publish speeds.
    downloadSpeed: def.dataShape.includeSpeeds ? seed.down : null,
    uploadSpeed: def.dataShape.includeSpeeds ? seed.up : null,
    duration: { value: seed.days, unit: 'day' as const },
    renewalSemantics: 'extend_from_expiry' as const,
    retailPrice: money(seed.retail, 'IQD'),
    wholesalePrice: def.dataShape.includeWholesale
      ? { value: money(seed.wholesale, 'IQD'), origin: 'provider' as const }
      : { value: null, origin: 'unavailable' as const },
    currency: 'IQD',
    billingModel: 'prepaid' as const,
    active: true,
    metadata: {},
    sync: syncMeta('provider', fetchedAt, seed.id),
  }));
}

const STATUS_WEIGHTS: readonly { status: SubscriberStatus; weight: number }[] = [
  { status: 'active', weight: 62 },
  { status: 'expiring', weight: 12 },
  { status: 'expired', weight: 14 },
  { status: 'suspended', weight: 8 },
  { status: 'pending', weight: 4 },
];

function pickStatus(rng: () => number): SubscriberStatus {
  const total = STATUS_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let roll = rng() * total;
  for (const entry of STATUS_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.status;
  }
  return 'active';
}

function macFor(rng: () => number): string {
  const byte = (): string =>
    Math.floor(rng() * 256)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return [byte(), byte(), byte(), byte(), byte(), byte()].join(':');
}

export function buildMockDataset(
  def: MockProfileDefinition,
  seed: number,
  now: Date = new Date(),
  subscriberCount = 48,
): MockDataset {
  const rng = makeRng(seed);
  const packages = buildPackages(def, now);
  const fetchedAt = now.toISOString();

  const subscribers: Subscriber[] = [];
  const subscriptions: Subscription[] = [];
  const sessions: NetworkSession[] = [];

  for (let i = 0; i < subscriberCount; i += 1) {
    const externalId = `SUB-${pad(i + 1001, 5)}`;
    const id = `${PROVIDER_ID}:${externalId}`;
    const fullName = `${pick(rng, FIRST_NAMES)} ${pick(rng, FAMILY_NAMES)}`;
    const status = pickStatus(rng);
    const pkg = packages.length > 0 ? pick(rng, packages) : null;
    const technology = pkg?.technology ?? pick(rng, def.dataShape.technologies);
    const username = `u${pad(i + 1001, 5)}`;

    // Expiry follows status so the registry filters are meaningful.
    const daysToExpiry =
      status === 'expired'
        ? -Math.floor(rng() * 40) - 1
        : status === 'expiring'
          ? Math.floor(rng() * 5)
          : Math.floor(rng() * 28) + 5;

    const includeContact = def.dataShape.includeContactDetails;

    subscribers.push({
      id,
      providerId: PROVIDER_ID,
      externalSubscriberId: externalId,
      erpCustomerId: null,
      fullName,
      phoneNumber: includeContact ? `077${pad(Math.floor(rng() * 100_000_00), 8)}` : null,
      alternatePhone: null,
      address: includeContact ? `${pick(rng, AREAS)} - محلة ${Math.floor(rng() * 40) + 1}` : null,
      area: includeContact ? pick(rng, AREAS) : null,
      governorate: includeContact ? pick(rng, GOVERNORATES) : null,
      zone: null,
      towerId: def.dataShape.includeTower ? `TWR-${pad(Math.floor(rng() * 12) + 1, 2)}` : null,
      networkNodeId:
        technology === 'ftth' ? `NODE-${pad(Math.floor(rng() * 20) + 1, 3)}` : null,
      technology,
      username,
      status,
      metadata: def.dataShape.includeTower
        ? { sector: `S${Math.floor(rng() * 4) + 1}` }
        : {},
      sync: syncMeta('provider', fetchedAt, externalId),
      createdAt: isoOffsetDays(now, -Math.floor(rng() * 900) - 30),
      updatedAt: fetchedAt,
    });

    subscriptions.push({
      id: `${id}:sub`,
      subscriberId: id,
      providerId: PROVIDER_ID,
      externalSubscriptionId: `SUBS-${pad(i + 1001, 5)}`,
      packageId: pkg?.id ?? null,
      status:
        status === 'expired'
          ? 'expired'
          : status === 'suspended'
            ? 'suspended'
            : status === 'pending'
              ? 'pending'
              : 'active',
      startedAt: isoOffsetDays(now, daysToExpiry - (pkg?.duration?.value ?? 30)),
      expiresAt: isoOffsetDays(now, daysToExpiry),
      suspendedAt: status === 'suspended' ? isoOffsetDays(now, -Math.floor(rng() * 10)) : null,
      metadata: {},
      sync: syncMeta('provider', fetchedAt, `SUBS-${pad(i + 1001, 5)}`),
    });

    const online = status === 'active' && rng() > 0.35;
    sessions.push({
      id: `${id}:session`,
      subscriberId: id,
      online,
      username,
      macAddress: macFor(rng),
      ipAddress: online
        ? `10.${Math.floor(rng() * 250)}.${Math.floor(rng() * 250)}.${Math.floor(rng() * 250)}`
        : null,
      ipClassification: online ? 'private' : null,
      startedAt: online ? isoOffsetDays(now, -rng() * 3) : null,
      uptimeSeconds: online ? Math.floor(rng() * 250_000) : null,
      nasIdentifier: `NAS-${pad(Math.floor(rng() * 6) + 1, 2)}`,
      vlan: technology === 'ftth' ? `VLAN-${Math.floor(rng() * 400) + 100}` : null,
      bytesIn: online ? Math.floor(rng() * 90_000_000_000) : null,
      bytesOut: online ? Math.floor(rng() * 12_000_000_000) : null,
      signal: def.dataShape.includeSignal
        ? {
            rssi: -Math.floor(rng() * 40) - 45,
            snr: Math.floor(rng() * 25) + 10,
          }
        : null,
      terminateCause: online ? null : pick(rng, ['User-Request', 'Idle-Timeout', 'NAS-Reboot']),
      sync: syncMeta('provider', fetchedAt, externalId),
    });
  }

  const currentBalance: Money = money(3_450_000 + Math.floor(rng() * 500_000), 'IQD');
  const wallet: Wallet = {
    id: `${PROVIDER_ID}:wallet`,
    providerId: PROVIDER_ID,
    agentId: `${PROVIDER_ID}:agent`,
    currency: 'IQD',
    currentBalance,
    availableBalance: currentBalance,
    creditLimit: money(1_000_000, 'IQD'),
    reservedAmount: null,
    lowBalanceThreshold: money(500_000, 'IQD'),
    lastSyncedAt: fetchedAt,
    sync: syncMeta('provider', fetchedAt, 'wallet'),
  };

  const walletTransactions: WalletTransaction[] = [];
  let running = currentBalance.amount;
  for (let i = 0; i < 25; i += 1) {
    const isRecharge = i % 7 === 0;
    const amount = isRecharge
      ? money(500_000, 'IQD')
      : money(PACKAGE_SEEDS[i % PACKAGE_SEEDS.length]?.wholesale ?? 30_000, 'IQD');
    const before = running;
    running = isRecharge ? running - amount.amount : running + amount.amount;
    walletTransactions.push({
      id: `${PROVIDER_ID}:tx:${pad(i + 1, 4)}`,
      walletId: wallet.id,
      providerTransactionId: `TX-${pad(90_000 - i, 6)}`,
      type: isRecharge ? 'recharge' : 'renewal',
      direction: isRecharge ? 'credit' : 'debit',
      amount,
      balanceBefore: money(running, 'IQD'),
      balanceAfter: money(before, 'IQD'),
      referenceType: isRecharge ? null : 'subscription',
      referenceId: isRecharge ? null : `SUB-${pad(1001 + (i % subscriberCount), 5)}`,
      status: 'posted',
      metadata: {},
      createdAt: isoOffsetDays(now, -i * 0.7),
    });
  }

  return { packages, subscribers, subscriptions, sessions, wallet, walletTransactions };
}
