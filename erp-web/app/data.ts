// الأقسام مربوطة بمفاتيح الصلاحيات الفعلية في قاعدة البيانات (employee_permissions / web_permission_catalog)
// وبنفس الوحدة التي تفحصها دوال web_*_list على الخادم.

export type Employee = {id: string; name: string; role: string; department: string | null; avatar_url: string | null};
export type Row = Record<string, any>;

export type SectionKey =
  | 'dashboard' | 'invoices' | 'customers' | 'products' | 'shortages' | 'repairs'
  | 'returns' | 'expenses' | 'shipping' | 'employees' | 'sessions' | 'settings';

export type Section = {
  key: SectionKey;
  title: string;
  desc: string;
  group: 'work' | 'ops' | 'admin';
  /** كل المفاتيح مطلوبة — تطابق web_guard(module, action) */
  perms: string[];
};

export const sections: Section[] = [
  {key: 'dashboard', title: 'نظرة عامة', desc: 'ملخص يومك من بيانات المحل الفعلية', group: 'work', perms: ['dashboard']},
  {key: 'invoices', title: 'المبيعات والفواتير', desc: 'فواتير البيع المسجلة من برنامج المكتب', group: 'work', perms: ['pos']},
  {key: 'customers', title: 'الزبائن والديون', desc: 'أرصدة الزبائن والمستحقات', group: 'work', perms: ['customers']},
  {key: 'products', title: 'المخزون', desc: 'المنتجات وكمياتها وأسعارها', group: 'work', perms: ['inventory']},
  {key: 'shortages', title: 'النواقص', desc: 'نواقص يدوية ومنتجات تحت حد التنبيه', group: 'work', perms: ['shortages']},
  {key: 'repairs', title: 'الصيانة', desc: 'تذاكر الصيانة وحالتها', group: 'ops', perms: ['repairs']},
  {key: 'returns', title: 'المرتجعات', desc: 'مرتجعات البيع وأصنافها', group: 'ops', perms: ['returns']},
  {key: 'expenses', title: 'المصروفات', desc: 'سندات الصرف والمصاريف', group: 'ops', perms: ['expenses']},
  {key: 'shipping', title: 'الشحن والتوصيل', desc: 'طلبات شركات الشحن وحالتها', group: 'ops', perms: ['shipping', 'shipping.view']},
  {key: 'employees', title: 'الموظفون', desc: 'الموظفون وأدوارهم ورموزهم', group: 'admin', perms: ['employees']},
  {key: 'sessions', title: 'الجلسات والأجهزة', desc: 'من دخل، من أي جهاز، ومتى', group: 'admin', perms: ['employees', 'employees.permissions']},
  {key: 'settings', title: 'الإعدادات', desc: 'تفضيلاتك وصلاحياتك وحساب المحل', group: 'admin', perms: []},
];

export const can = (perms: string[], need: string[]) => need.every(p => perms.includes(p));

export const roleLabel: Record<string, string> = {
  ADMIN: 'المدير العام', MANAGER: 'مدير', ACCOUNTANT: 'محاسب', CASHIER: 'كاشير', TECHNICIAN: 'فني صيانة', DELIVERY: 'مندوب توصيل',
};

export const permissionGroups: Record<string, string> = {
  dashboard: 'لوحة المعلومات', pos: 'نقطة البيع', repairs: 'الصيانة', returns: 'المرتجعات', delivery: 'التوصيل',
  shipping: 'الشحن', inventory: 'المخزون', shortages: 'النواقص', purchase: 'المشتريات', vaults: 'الخزائن',
  customers: 'الزبائن', trusts: 'الأمانات', expenses: 'المصروفات', employees: 'الموظفون', network: 'الشبكة',
  analytics: 'التحليلات', settings: 'الإعدادات', offers: 'العروض', website: 'المتجر الإلكتروني',
};

export const paymentLabel = (v?: string | null) =>
  ({CASH: 'نقدي', DEBT: 'آجل', CREDIT: 'آجل', CARD: 'بطاقة', MIXED: 'مختلط'} as Record<string, string>)[String(v || '').toUpperCase()] || v || '—';

const TZ = 'Asia/Baghdad';
export const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
export const dayOf = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(iso)) : '';
export const money = (v: unknown) => new Intl.NumberFormat('en-US', {maximumFractionDigits: 0}).format(Number(v) || 0);
export const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('ar-IQ', {timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '—';
export const dateOnly = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ar-IQ', {timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric'}) : '—';
