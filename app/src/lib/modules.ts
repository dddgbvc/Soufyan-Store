import {
  BookOpenCheck,
  Boxes,
  ChartNoAxesCombined,
  ScanBarcode,
  ShieldCheck,
  Truck,
  UsersRound,
} from 'lucide-react';
import type { BusinessSector, Currency, ErpModule, ModuleKey } from '../types/auth';

/* ==========================================================================
   كتالوج وحدات المنظومة ومعمارية النشر
   ========================================================================== */

export const ERP_MODULES: readonly ErpModule[] = [
  {
    key: 'core',
    label: 'النواة والصلاحيات',
    description: 'المستخدمون، الأدوار، سجل التدقيق',
    tables: 8,
    icon: ShieldCheck,
    required: true,
  },
  {
    key: 'ledger',
    label: 'دفتر الأستاذ العام',
    description: 'شجرة الحسابات والقيود المزدوجة',
    tables: 6,
    icon: BookOpenCheck,
    required: true,
  },
  {
    key: 'pos',
    label: 'نقاط البيع',
    description: 'الجلسات، الورديات، الإيصالات',
    tables: 7,
    icon: ScanBarcode,
    required: false,
  },
  {
    key: 'inventory',
    label: 'المخزون والمستودعات',
    description: 'الأصناف، الجرد، حركة البضاعة',
    tables: 9,
    icon: Boxes,
    required: false,
  },
  {
    key: 'crm',
    label: 'العملاء والذمم',
    description: 'ملفات العملاء وأرصدة الدين',
    tables: 5,
    icon: UsersRound,
    required: false,
  },
  {
    key: 'purchasing',
    label: 'المشتريات والموردون',
    description: 'أوامر الشراء وفواتير المورد',
    tables: 6,
    icon: Truck,
    required: false,
  },
  {
    key: 'reports',
    label: 'التقارير التحليلية',
    description: 'لوحات الأداء والتقارير الدورية',
    tables: 4,
    icon: ChartNoAxesCombined,
    required: false,
  },
] as const;

/** الوحدات المفعّلة افتراضيًا لمتجر تجزئة/اتصالات نموذجي. */
export const DEFAULT_MODULES: ModuleKey[] = ['core', 'ledger', 'pos', 'inventory', 'crm'];

export const REQUIRED_MODULES: ModuleKey[] = ERP_MODULES.filter((m) => m.required).map((m) => m.key);

/* -------------------------- خيارات ملف المنشأة -------------------------- */

export interface SectorOption {
  value: BusinessSector;
  label: string;
  hint: string;
}

export const SECTOR_OPTIONS: readonly SectorOption[] = [
  { value: 'telecom', label: 'اتصالات', hint: 'أجهزة، أرصدة، باقات إنترنت' },
  { value: 'retail', label: 'تجزئة', hint: 'بيع مباشر ومخزون أصناف' },
  { value: 'services', label: 'خدمات', hint: 'صيانة وأعمال بالساعة' },
] as const;

export interface CurrencyOption {
  value: Currency;
  label: string;
  symbol: string;
  hint: string;
}

export const CURRENCY_OPTIONS: readonly CurrencyOption[] = [
  { value: 'IQD', label: 'الدينار العراقي', symbol: 'د.ع', hint: 'IQD — بلا كسور عشرية' },
  { value: 'USD', label: 'الدولار الأمريكي', symbol: '$', hint: 'USD — منزلتان عشريتان' },
] as const;

/* -------------------------- حسابات المعمارية -------------------------- */

export const MIN_REGISTERS = 1;
export const MAX_REGISTERS = 12;

/** عدد جداول قاعدة البيانات الناتج عن الوحدات المختارة. */
export function countTables(modules: ModuleKey[]): number {
  return ERP_MODULES.filter((module) => modules.includes(module.key)).reduce(
    (total, module) => total + module.tables,
    0,
  );
}

/** حجم شجرة الحسابات الابتدائية بحسب القطاع والوحدات. */
export function countLedgerAccounts(sector: BusinessSector, modules: ModuleKey[]): number {
  const sectorBase: Record<BusinessSector, number> = {
    telecom: 46,
    retail: 41,
    services: 34,
  };
  const extras =
    (modules.includes('inventory') ? 8 : 0) +
    (modules.includes('purchasing') ? 6 : 0) +
    (modules.includes('crm') ? 5 : 0);

  return sectorBase[sector] + extras;
}

/** عدد جلسات البيع المتزامنة المدعومة (وردية صباحية ومسائية لكل سجل). */
export function countPosSessions(registers: number): number {
  return registers * 2;
}
