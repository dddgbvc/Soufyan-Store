/**
 * The closed set of capability keys the ERP understands (spec §3, §20).
 *
 * Adding a provider must never require touching universal UI. It may require
 * adding a key here — and that key then flows automatically into the
 * capability matrix, the widget registry and every `<CapabilityGate>`.
 */
export const CAPABILITY_KEYS = [
  // Subscriber & subscription
  'subscriberManagement',
  'subscriberCreate',
  'subscriberUpdate',
  'activation',
  'renewal',
  'packageChange',
  'suspend',
  'resume',

  // Financial
  'wallet',
  'walletRecharge',
  'walletTransactions',
  'wholesaleCost',
  'debtSupport',
  'reconciliation',

  // Network
  'sessionMonitoring',
  'sessionHistory',
  'disconnectSession',
  'macReset',
  'publicIp',
  'signalData',

  // Provisioning extras
  'testAccounts',
  'towerManagement',
  'tickets',

  // Notifications
  'smsNotification',
  'whatsappNotification',
  'emailNotification',

  // Technologies
  'ftth',
  'pppoe',
  'wireless',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export type CapabilityGroup =
  | 'subscribers'
  | 'financial'
  | 'network'
  | 'provisioning'
  | 'notifications'
  | 'technology';

interface CapabilityMeta {
  readonly group: CapabilityGroup;
  /** Arabic label used by the capability matrix and empty-capability cards. */
  readonly label: string;
  /** Shown when a provider does not support it. */
  readonly unsupportedHint: string;
}

export const CAPABILITY_META: Record<CapabilityKey, CapabilityMeta> = {
  subscriberManagement: {
    group: 'subscribers',
    label: 'إدارة المشتركين',
    unsupportedHint: 'هذا المزود لا يتيح قراءة سجل المشتركين عبر الواجهة البرمجية.',
  },
  subscriberCreate: {
    group: 'subscribers',
    label: 'إنشاء مشترك',
    unsupportedHint: 'إنشاء المشتركين يتم من بوابة المزود مباشرة.',
  },
  subscriberUpdate: {
    group: 'subscribers',
    label: 'تعديل مشترك',
    unsupportedHint: 'بيانات المشترك للقراءة فقط لدى هذا المزود.',
  },
  activation: {
    group: 'subscribers',
    label: 'التفعيل',
    unsupportedHint: 'التفعيل غير متاح عبر الواجهة البرمجية لهذا المزود.',
  },
  renewal: {
    group: 'subscribers',
    label: 'التجديد',
    unsupportedHint: 'التجديد غير متاح عبر الواجهة البرمجية لهذا المزود.',
  },
  packageChange: {
    group: 'subscribers',
    label: 'تغيير الباقة',
    unsupportedHint: 'تغيير الباقة يتم من بوابة المزود.',
  },
  suspend: {
    group: 'subscribers',
    label: 'الإيقاف المؤقت',
    unsupportedHint: 'الإيقاف المؤقت غير مدعوم.',
  },
  resume: {
    group: 'subscribers',
    label: 'إعادة التشغيل',
    unsupportedHint: 'إعادة التشغيل غير مدعومة.',
  },
  wallet: {
    group: 'financial',
    label: 'المحفظة',
    unsupportedHint: 'هذا المزود لا يعرض رصيد محفظة الوكيل.',
  },
  walletRecharge: {
    group: 'financial',
    label: 'شحن المحفظة',
    unsupportedHint: 'الشحن يتم عبر قنوات المزود خارج النظام.',
  },
  walletTransactions: {
    group: 'financial',
    label: 'حركات المحفظة',
    unsupportedHint: 'كشف حركات المحفظة غير متاح.',
  },
  wholesaleCost: {
    group: 'financial',
    label: 'سعر الجملة',
    unsupportedHint: 'سعر الجملة غير متاح من المزود — يمكن ضبطه يدوياً في النظام.',
  },
  debtSupport: {
    group: 'financial',
    label: 'ديون الزبائن',
    unsupportedHint: 'الديون تُدار محلياً في ياقوت.',
  },
  reconciliation: {
    group: 'financial',
    label: 'مطابقة الحركات',
    unsupportedHint: 'المزود لا يوفر كشفاً للمطابقة الآلية.',
  },
  sessionMonitoring: {
    group: 'network',
    label: 'مراقبة الجلسات',
    unsupportedHint: 'حالة الاتصال المباشر غير متاحة من هذا المزود.',
  },
  sessionHistory: {
    group: 'network',
    label: 'سجل الجلسات',
    unsupportedHint: 'سجل الجلسات غير متاح.',
  },
  disconnectSession: {
    group: 'network',
    label: 'قطع الجلسة',
    unsupportedHint: 'قطع الجلسة غير مدعوم.',
  },
  macReset: {
    group: 'network',
    label: 'تصفير MAC',
    unsupportedHint: 'تصفير عنوان MAC غير مدعوم.',
  },
  publicIp: {
    group: 'network',
    label: 'IP عام',
    unsupportedHint: 'تصنيف العنوان غير متاح.',
  },
  signalData: {
    group: 'network',
    label: 'بيانات الإشارة',
    unsupportedHint: 'بيانات الإشارة متاحة للشبكات اللاسلكية فقط.',
  },
  testAccounts: {
    group: 'provisioning',
    label: 'حسابات تجريبية',
    unsupportedHint: 'الحسابات التجريبية غير مدعومة لدى هذا المزود.',
  },
  towerManagement: {
    group: 'provisioning',
    label: 'إدارة الأبراج',
    unsupportedHint: 'إدارة الأبراج غير مدعومة.',
  },
  tickets: {
    group: 'provisioning',
    label: 'تذاكر الدعم',
    unsupportedHint: 'الدعم الفني يتم عبر قنوات المزود.',
  },
  smsNotification: {
    group: 'notifications',
    label: 'رسائل SMS',
    unsupportedHint: 'إرسال SMS غير متاح عبر المزود.',
  },
  whatsappNotification: {
    group: 'notifications',
    label: 'واتساب',
    unsupportedHint: 'الإرسال عبر واتساب غير متاح من المزود.',
  },
  emailNotification: {
    group: 'notifications',
    label: 'البريد الإلكتروني',
    unsupportedHint: 'الإرسال بالبريد غير متاح.',
  },
  ftth: {
    group: 'technology',
    label: 'FTTH',
    unsupportedHint: 'المزود لا يقدم خدمات الألياف.',
  },
  pppoe: {
    group: 'technology',
    label: 'PPPoE',
    unsupportedHint: 'المزود لا يستخدم PPPoE.',
  },
  wireless: {
    group: 'technology',
    label: 'لاسلكي',
    unsupportedHint: 'المزود لا يقدم خدمات لاسلكية.',
  },
};

export const CAPABILITY_GROUP_LABELS: Record<CapabilityGroup, string> = {
  subscribers: 'المشتركون',
  financial: 'المالية',
  network: 'الشبكة',
  provisioning: 'التزويد',
  notifications: 'الإشعارات',
  technology: 'التقنيات',
};

export function isCapabilityKey(value: string): value is CapabilityKey {
  return (CAPABILITY_KEYS as readonly string[]).includes(value);
}

export function capabilitiesInGroup(group: CapabilityGroup): CapabilityKey[] {
  return CAPABILITY_KEYS.filter((k) => CAPABILITY_META[k].group === group);
}
