/**
 * كتالوج تجريبي — يغذّي الوضع التجريبي ومحاكي الكاشير فقط.
 * الأسعار بالدينار العراقي، والأصناف مأخوذة من كتالوج مركز سفيان الحقيقي.
 *
 * لاحظ: بعض الأصناف بلا `imageUrl` عمدًا للتحقّق من الرمز البديل.
 */

export const DEMO_CATALOG = [
  {
    sku: 'p002',
    name: 'iPhone 15 Pro Max',
    variant: '256GB · تيتانيوم طبيعي',
    unitPrice: 2_100_000,
  },
  {
    sku: 'p001',
    name: 'Samsung Galaxy S24 Ultra',
    variant: '256GB · أسود',
    unitPrice: 1_750_000,
  },
  {
    sku: 'p011',
    name: 'iPhone 15',
    variant: '128GB · أزرق',
    unitPrice: 1_250_000,
  },
  {
    sku: 'p003',
    name: 'iPhone 13',
    variant: '128GB · أبيض',
    unitPrice: 900_000,
  },
  {
    sku: 'p004',
    name: 'Samsung Galaxy A55',
    variant: '128GB · ليموني',
    unitPrice: 520_000,
  },
  {
    sku: 'p005',
    name: 'Redmi Note 13 Pro',
    variant: '256GB · أخضر',
    unitPrice: 420_000,
  },
  {
    sku: 'a005',
    name: 'سماعة AirPods Pro 2',
    variant: 'عزل ضوضاء فعّال',
    unitPrice: 340_000,
  },
  {
    sku: 'a001',
    name: 'شاحن Anker 65W GaN',
    variant: '3 منافذ · شحن سريع PD',
    unitPrice: 45_000,
  },
  {
    sku: 'a006',
    name: 'سماعة Redmi Buds 5',
    variant: 'ANC · بطارية 40 ساعة',
    unitPrice: 38_000,
  },
  {
    sku: 'a003',
    name: 'جراب iPhone 15 Pro سيليكون',
    variant: 'حماية كاملة',
    unitPrice: 12_000,
  },
  {
    sku: 'a007',
    name: 'واقي شاشة زجاجي 9H',
    variant: 'لأغلب الموديلات',
    unitPrice: 7_000,
  },
  {
    sku: 'c001',
    name: 'كيبل USB-C سريع',
    variant: '1 متر · 60W',
    unitPrice: 15_000,
  },
];

/** فاتورة جاهزة تُستخدم لعرض الشاشة بسرعة. */
export const DEMO_BASKET = [
  { sku: 'p002', qty: 1 },
  { sku: 'c001', qty: 2 },
  { sku: 'a007', qty: 1 },
];

export function findProduct(sku) {
  return DEMO_CATALOG.find((product) => product.sku === sku) ?? null;
}
