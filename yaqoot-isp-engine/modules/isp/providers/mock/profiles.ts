import { declare, type CapabilityManifest } from '../../capabilities/manifest';

/**
 * Mock provider simulation profiles (spec §33).
 *
 * These exist to prove the UI genuinely adapts. Each profile is a different
 * shape of provider, and the adapter factory attaches only the methods the
 * profile declares — so a profile that says "no sessions" really has no
 * getCurrentSession() to call.
 */
export const MOCK_PROFILES = ['full', 'basic', 'readonly', 'legacy', 'ftth', 'wireless'] as const;

export type MockProfile = (typeof MOCK_PROFILES)[number];

export function isMockProfile(value: string): value is MockProfile {
  return (MOCK_PROFILES as readonly string[]).includes(value);
}

export interface MockProfileDefinition {
  readonly profile: MockProfile;
  readonly displayName: string;
  readonly description: string;
  readonly capabilities: CapabilityManifest;
  /** Shapes the generated dataset (which optional fields are populated). */
  readonly dataShape: {
    readonly technologies: readonly ('pppoe' | 'ftth' | 'wireless')[];
    readonly includeContactDetails: boolean;
    readonly includeSpeeds: boolean;
    readonly includeWholesale: boolean;
    readonly includeSignal: boolean;
    readonly includeTower: boolean;
  };
}

/** Everything on — the reference "modern reseller API". */
const FULL: MockProfileDefinition = {
  profile: 'full',
  displayName: 'مزود كامل الخصائص',
  description: 'يدعم معظم العمليات: مشتركون، تجديد، جلسات، محفظة، حسابات تجريبية.',
  capabilities: declare({
    subscriberManagement: true,
    subscriberCreate: true,
    subscriberUpdate: true,
    activation: true,
    renewal: true,
    packageChange: true,
    suspend: true,
    resume: true,
    wallet: true,
    walletRecharge: false,
    walletTransactions: true,
    wholesaleCost: true,
    debtSupport: { state: 'configurable', note: 'الديون تُدار في دفاتر ياقوت، لا لدى المزود.' },
    reconciliation: true,
    sessionMonitoring: true,
    sessionHistory: true,
    disconnectSession: true,
    macReset: true,
    publicIp: true,
    signalData: false,
    testAccounts: true,
    towerManagement: false,
    tickets: true,
    smsNotification: true,
    whatsappNotification: false,
    emailNotification: false,
    ftth: true,
    pppoe: true,
    wireless: false,
  }),
  dataShape: {
    technologies: ['pppoe', 'ftth'],
    includeContactDetails: true,
    includeSpeeds: true,
    includeWholesale: true,
    includeSignal: false,
    includeTower: false,
  },
};

/** Subscribers + packages + renewal, nothing else. */
const BASIC: MockProfileDefinition = {
  profile: 'basic',
  displayName: 'مزود أساسي',
  description: 'مشتركون وباقات وتجديد فقط — بدون محفظة أو جلسات.',
  capabilities: declare({
    subscriberManagement: true,
    subscriberCreate: false,
    subscriberUpdate: false,
    activation: false,
    renewal: true,
    packageChange: false,
    suspend: false,
    resume: false,
    wallet: false,
    walletRecharge: false,
    walletTransactions: false,
    wholesaleCost: {
      state: 'configurable',
      note: 'المزود لا يرسل سعر الجملة — يُضبط لكل باقة في إعدادات ياقوت.',
    },
    debtSupport: { state: 'configurable' },
    reconciliation: false,
    sessionMonitoring: false,
    sessionHistory: false,
    disconnectSession: false,
    macReset: false,
    publicIp: false,
    signalData: false,
    testAccounts: false,
    towerManagement: false,
    tickets: false,
    smsNotification: false,
    whatsappNotification: false,
    emailNotification: false,
    ftth: false,
    pppoe: true,
    wireless: false,
  }),
  dataShape: {
    technologies: ['pppoe'],
    includeContactDetails: true,
    includeSpeeds: true,
    includeWholesale: false,
    includeSignal: false,
    includeTower: false,
  },
};

/** Read access only — every mutation is unsupported. */
const READONLY: MockProfileDefinition = {
  profile: 'readonly',
  displayName: 'مزود للقراءة فقط',
  description: 'عرض البيانات فقط — لا تجديد ولا تعديل ولا عمليات شبكة.',
  capabilities: declare({
    subscriberManagement: true,
    subscriberCreate: false,
    subscriberUpdate: false,
    activation: false,
    renewal: false,
    packageChange: false,
    suspend: false,
    resume: false,
    wallet: true,
    walletRecharge: false,
    walletTransactions: true,
    wholesaleCost: false,
    debtSupport: { state: 'configurable' },
    reconciliation: false,
    sessionMonitoring: true,
    sessionHistory: false,
    disconnectSession: false,
    macReset: false,
    publicIp: true,
    signalData: false,
    testAccounts: false,
    towerManagement: false,
    tickets: false,
    smsNotification: false,
    whatsappNotification: false,
    emailNotification: false,
    ftth: true,
    pppoe: true,
    wireless: false,
  }),
  dataShape: {
    technologies: ['pppoe', 'ftth'],
    includeContactDetails: true,
    includeSpeeds: true,
    includeWholesale: false,
    includeSignal: false,
    includeTower: false,
  },
};

/** Old API: few fields, no speeds, no contact details, unknown corners. */
const LEGACY: MockProfileDefinition = {
  profile: 'legacy',
  displayName: 'مزود قديم',
  description: 'واجهة برمجية قديمة بحقول محدودة — كثير من الخصائص غير معروفة.',
  capabilities: declare({
    subscriberManagement: true,
    subscriberCreate: false,
    subscriberUpdate: false,
    activation: false,
    renewal: { state: 'partial', note: 'التجديد يعمل، لكن المزود لا يعيد تاريخ الانتهاء الجديد.' },
    packageChange: false,
    suspend: false,
    resume: false,
    wallet: false,
    walletRecharge: false,
    walletTransactions: false,
    wholesaleCost: { state: 'configurable' },
    debtSupport: { state: 'configurable' },
    reconciliation: false,
    sessionMonitoring: false,
    sessionHistory: false,
    disconnectSession: false,
    macReset: false,
    publicIp: false,
    signalData: false,
    testAccounts: false,
    towerManagement: false,
    tickets: false,
    smsNotification: false,
    whatsappNotification: false,
    emailNotification: false,
    pppoe: true,
    // ftth / wireless intentionally omitted → they resolve to `unknown`,
    // which is the honest answer for an API that never says.
  }),
  dataShape: {
    technologies: ['pppoe'],
    includeContactDetails: false,
    includeSpeeds: false,
    includeWholesale: false,
    includeSignal: false,
    includeTower: false,
  },
};

/** Fibre operator: FTTH nodes, no wireless, no MAC concept. */
const FTTH: MockProfileDefinition = {
  profile: 'ftth',
  displayName: 'مزود ألياف ضوئية',
  description: 'خدمات FTTH مع عُقد الشبكة — بدون بيانات إشارة لاسلكية.',
  capabilities: declare({
    subscriberManagement: true,
    subscriberCreate: true,
    subscriberUpdate: true,
    activation: true,
    renewal: true,
    packageChange: true,
    suspend: true,
    resume: true,
    wallet: true,
    walletRecharge: false,
    walletTransactions: true,
    wholesaleCost: true,
    debtSupport: { state: 'configurable' },
    reconciliation: true,
    sessionMonitoring: true,
    sessionHistory: true,
    disconnectSession: true,
    macReset: false,
    publicIp: true,
    signalData: false,
    testAccounts: false,
    towerManagement: false,
    tickets: true,
    smsNotification: true,
    whatsappNotification: false,
    emailNotification: false,
    ftth: true,
    pppoe: false,
    wireless: false,
  }),
  dataShape: {
    technologies: ['ftth'],
    includeContactDetails: true,
    includeSpeeds: true,
    includeWholesale: true,
    includeSignal: false,
    includeTower: false,
  },
};

/** Wireless ISP: towers, sectors and signal metrics. */
const WIRELESS: MockProfileDefinition = {
  profile: 'wireless',
  displayName: 'مزود لاسلكي',
  description: 'شبكة لاسلكية بأبراج وقطاعات وبيانات إشارة.',
  capabilities: declare({
    subscriberManagement: true,
    subscriberCreate: true,
    subscriberUpdate: true,
    activation: true,
    renewal: true,
    packageChange: false,
    suspend: true,
    resume: true,
    wallet: false,
    walletRecharge: false,
    walletTransactions: false,
    wholesaleCost: { state: 'configurable' },
    debtSupport: { state: 'configurable' },
    reconciliation: false,
    sessionMonitoring: true,
    sessionHistory: true,
    disconnectSession: true,
    macReset: true,
    publicIp: false,
    signalData: true,
    testAccounts: true,
    towerManagement: true,
    tickets: false,
    smsNotification: false,
    whatsappNotification: false,
    emailNotification: false,
    ftth: false,
    pppoe: true,
    wireless: true,
  }),
  dataShape: {
    technologies: ['wireless', 'pppoe'],
    includeContactDetails: true,
    includeSpeeds: true,
    includeWholesale: false,
    includeSignal: true,
    includeTower: true,
  },
};

export const MOCK_PROFILE_DEFINITIONS: Record<MockProfile, MockProfileDefinition> = {
  full: FULL,
  basic: BASIC,
  readonly: READONLY,
  legacy: LEGACY,
  ftth: FTTH,
  wireless: WIRELESS,
};
