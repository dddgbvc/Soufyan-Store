import type { CapabilityKey } from '../capabilities/keys';
import type { CapabilityManifest } from '../capabilities/manifest';
import { gate, type GateResult } from '../capabilities/resolver';

/**
 * Widget registry (spec §15).
 *
 * There is no per-provider dashboard layout anywhere in this codebase. The
 * dashboard renders whatever this registry yields for the active capability
 * manifest and the current user's permissions — nothing else.
 */

export type WidgetSize = 'sm' | 'md' | 'lg' | 'xl';

export type WidgetVariant =
  | 'metric'
  | 'financial'
  | 'status'
  | 'progress'
  | 'chart'
  | 'action'
  | 'list'
  | 'provider'
  | 'alert';

/** ERP roles, matching public.employees.role in the host system. */
export type Role = 'CASHIER' | 'MANAGER' | 'ADMIN';

const ROLE_RANK: Record<Role, number> = { CASHIER: 1, MANAGER: 2, ADMIN: 3 };

export interface WidgetDefinition {
  readonly widgetId: string;
  readonly title: string;
  readonly description: string;
  /** lucide-react icon name; resolved at render time. */
  readonly icon: string;
  readonly size: WidgetSize;
  readonly variant: WidgetVariant;
  /** Higher sorts first; also drives the mobile single-column order (§18). */
  readonly priority: number;
  /**
   * ALL of these must be data-bearing for the widget to appear. Empty means
   * the widget is universal (ERP-owned data only).
   */
  readonly requiredCapabilities: readonly CapabilityKey[];
  /** Key into the dashboard snapshot. */
  readonly dataSource: string;
  /** Seconds; null means it never auto-refreshes. */
  readonly refreshInterval: number | null;
  readonly minimumRole: Role;
  /**
   * When true, an unsupported capability renders an Empty Capability Card
   * instead of hiding the widget — useful for administrators (§17).
   */
  readonly showWhenUnsupported: boolean;
}

export const WIDGETS: readonly WidgetDefinition[] = [
  {
    widgetId: 'wallet-balance',
    title: 'رصيد المحفظة',
    description: 'رصيد محفظة الوكيل لدى المزود.',
    icon: 'Wallet',
    size: 'md',
    variant: 'financial',
    priority: 100,
    requiredCapabilities: ['wallet'],
    dataSource: 'wallet',
    refreshInterval: 120,
    minimumRole: 'MANAGER',
    showWhenUnsupported: true,
  },
  {
    widgetId: 'active-subscribers',
    title: 'المشتركون الفعّالون',
    description: 'عدد المشتركين الفعّالين حالياً.',
    icon: 'Users',
    size: 'md',
    variant: 'metric',
    priority: 95,
    requiredCapabilities: ['subscriberManagement'],
    dataSource: 'subscribers.active',
    refreshInterval: 300,
    minimumRole: 'CASHIER',
    showWhenUnsupported: false,
  },
  {
    widgetId: 'expiring-soon',
    title: 'قارب على الانتهاء',
    description: 'اشتراكات تنتهي خلال أيام.',
    icon: 'CalendarClock',
    size: 'md',
    variant: 'metric',
    priority: 90,
    requiredCapabilities: ['subscriberManagement'],
    dataSource: 'expiringSoon',
    refreshInterval: 300,
    minimumRole: 'CASHIER',
    showWhenUnsupported: false,
  },
  {
    widgetId: 'online-sessions',
    title: 'الجلسات المتصلة',
    description: 'المشتركون المتصلون الآن.',
    icon: 'Activity',
    size: 'md',
    variant: 'status',
    priority: 85,
    requiredCapabilities: ['sessionMonitoring'],
    dataSource: 'onlineNow',
    refreshInterval: 60,
    minimumRole: 'CASHIER',
    showWhenUnsupported: true,
  },
  {
    widgetId: 'daily-revenue',
    title: 'إيراد اليوم',
    description: 'مبيعات وحدة الإنترنت اليوم — من دفاتر ياقوت.',
    icon: 'TrendingUp',
    size: 'md',
    variant: 'financial',
    priority: 80,
    // ERP-owned: no provider capability required (§15).
    requiredCapabilities: [],
    dataSource: 'revenueToday',
    refreshInterval: 300,
    minimumRole: 'MANAGER',
    showWhenUnsupported: false,
  },
  {
    widgetId: 'provider-cost',
    title: 'كلفة المزود',
    description: 'كلفة الجملة لعمليات اليوم.',
    icon: 'Receipt',
    size: 'md',
    variant: 'financial',
    priority: 75,
    requiredCapabilities: ['wholesaleCost'],
    dataSource: 'costToday',
    refreshInterval: 300,
    minimumRole: 'MANAGER',
    showWhenUnsupported: true,
  },
  {
    widgetId: 'profit',
    title: 'الربح',
    description: 'الفرق بين الإيراد والكلفة — يظهر عند معرفة الطرفين.',
    icon: 'PiggyBank',
    size: 'md',
    variant: 'financial',
    priority: 70,
    // Needs cost as well as revenue; without cost the number would be a lie.
    requiredCapabilities: ['wholesaleCost'],
    dataSource: 'profitToday',
    refreshInterval: 300,
    minimumRole: 'MANAGER',
    showWhenUnsupported: false,
  },
  {
    widgetId: 'reconciliation-queue',
    title: 'بانتظار المطابقة',
    description: 'عمليات نتيجتها غامضة ولم تُطابق بعد.',
    icon: 'AlertTriangle',
    size: 'md',
    variant: 'alert',
    priority: 98,
    requiredCapabilities: [],
    dataSource: 'pendingReconciliation',
    refreshInterval: 120,
    minimumRole: 'MANAGER',
    showWhenUnsupported: false,
  },
  {
    widgetId: 'provider-health',
    title: 'حالة الاتصال',
    description: 'صحة الاتصال بالمزود وزمن الاستجابة.',
    icon: 'HeartPulse',
    size: 'md',
    variant: 'provider',
    priority: 65,
    requiredCapabilities: [],
    dataSource: 'health',
    refreshInterval: 60,
    minimumRole: 'MANAGER',
    showWhenUnsupported: false,
  },
  {
    widgetId: 'test-accounts',
    title: 'الحسابات التجريبية',
    description: 'إنشاء حساب تجريبي بمدة يحددها المزود.',
    icon: 'FlaskConical',
    size: 'md',
    variant: 'action',
    priority: 55,
    requiredCapabilities: ['testAccounts'],
    dataSource: 'testAccounts',
    refreshInterval: null,
    minimumRole: 'CASHIER',
    // §11 is explicit: if the provider has no test accounts, hide the widget.
    // Unlike the wallet, there is nothing an administrator can configure here,
    // so an Empty Capability Card would be noise.
    showWhenUnsupported: false,
  },
  {
    widgetId: 'support-tickets',
    title: 'تذاكر الدعم',
    description: 'تذاكر الدعم المفتوحة لدى المزود.',
    icon: 'LifeBuoy',
    size: 'md',
    variant: 'list',
    priority: 50,
    requiredCapabilities: ['tickets'],
    dataSource: 'tickets',
    refreshInterval: 600,
    minimumRole: 'CASHIER',
    showWhenUnsupported: false,
  },
  {
    widgetId: 'recent-renewals',
    title: 'آخر التجديدات',
    description: 'أحدث عمليات التجديد المسجّلة.',
    icon: 'History',
    size: 'lg',
    variant: 'list',
    priority: 45,
    requiredCapabilities: [],
    dataSource: 'recentTransactions',
    refreshInterval: 300,
    minimumRole: 'CASHIER',
    showWhenUnsupported: false,
  },
];

export interface ResolvedWidget {
  readonly definition: WidgetDefinition;
  readonly gate: GateResult;
  /** true ⇒ render the real widget; false ⇒ Empty Capability Card. */
  readonly enabled: boolean;
}

export interface WidgetPreferences {
  /** Widget ids the user hid. Capability restrictions still win (§18). */
  readonly hidden?: readonly string[];
  /** Explicit order; widgets not listed keep registry priority. */
  readonly order?: readonly string[];
}

/**
 * Decide what the dashboard renders.
 *
 * Precedence, highest first:
 *   1. permission (role) — a widget above the user's role never appears
 *   2. capability — provider restrictions override user preferences (§18)
 *   3. user preference — hide/reorder
 */
export function resolveWidgets(
  manifest: CapabilityManifest,
  role: Role,
  preferences: WidgetPreferences = {},
): readonly ResolvedWidget[] {
  const hidden = new Set(preferences.hidden ?? []);
  const order = preferences.order ?? [];

  const resolved: ResolvedWidget[] = [];

  for (const definition of WIDGETS) {
    if (ROLE_RANK[role] < ROLE_RANK[definition.minimumRole]) continue;
    if (hidden.has(definition.widgetId)) continue;

    const g = gate(manifest, definition.requiredCapabilities);

    // Unsupported and not worth explaining ⇒ the widget simply does not exist.
    if (!g.allowed && !definition.showWhenUnsupported) continue;

    resolved.push({ definition, gate: g, enabled: g.allowed });
  }

  return resolved.sort((a, b) => {
    const ai = order.indexOf(a.definition.widgetId);
    const bi = order.indexOf(b.definition.widgetId);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return b.definition.priority - a.definition.priority;
  });
}

/** Tailwind column spans per size — desktop 4-col, tablet 2-col, mobile 1-col (§18). */
export const WIDGET_SPAN: Record<WidgetSize, string> = {
  sm: 'col-span-1',
  md: 'col-span-1 md:col-span-1 xl:col-span-1',
  lg: 'col-span-1 md:col-span-2',
  xl: 'col-span-1 md:col-span-2 xl:col-span-4',
};
