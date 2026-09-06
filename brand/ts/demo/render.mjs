/** يولّد نماذج من كل مطبوع في out/ — للتحقّق البصري ولمعاينة المقاسات. */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  serviceTicketA5, serviceReceipt80, deviceLabel,
  invoiceThermal80, invoiceA5, labelSheet, singleLabel,
  renderDocument, ticketNo, invoiceNo, sku, today, totals,
} from '../dist/index.js';

const out = new URL('./out/', import.meta.url);
mkdirSync(out, { recursive: true });

const ticket = {
  no: ticketNo(1427),
  customer: 'أحمد عبد الله حسين',
  phone: '0771 234 5678',
  device: 'Samsung Galaxy A54',
  imei: '356938035643809',
  lockCode: '1234',
  accessories: 'كفر فقط',
  faults: ['شاشة', 'شحن'],
  description: 'الشاشة مكسورة من الزاوية العليا واللمس ما يشتغل بالنص. الشحن يفصل ويرجع.',
  dateIn: '2026-09-06',
  dateOut: '2026-09-08',
  cost: 85000,
  paid: 25000,
  staff: 'سفيان',
  at: Date.parse('2026-09-06T12:40:00'),
};

const invoice = {
  no: invoiceNo(318),
  customer: 'أحمد عبد الله حسين',
  phone: '0771 234 5678',
  items: [
    { name: 'Samsung Galaxy A54 — 256GB أسود', qty: 1, price: 385000, imei: '356938035643809' },
    { name: 'كفر سيليكون شفاف', qty: 1, price: 7000 },
    { name: 'واقي شاشة زجاجي — تركيب مجاني', qty: 1, price: 8000 },
    { name: 'شاحن سريع 25W', qty: 2, price: 15000 },
  ],
  discount: 10000,
  payment: 'نقدًا',
  seller: 'سفيان',
  date: '2026-09-06',
  at: Date.parse('2026-09-06T13:20:00'),
};

const phone = {
  kind: 'phone', name: 'Samsung Galaxy A54 5G', price: 385000, sku: sku('PH', 1043),
  model: 'SM-A546E/DS', imei: '356938035643809', storage: '8GB / 256GB', color: 'أسود',
  battery: '100%', condition: 'جديد بالكارتون', fault: '', notes: 'ضمان 6 أشهر · مع الشاحن',
};

const accessory = { kind: 'accessory', name: 'سماعة بلوتوث لاسلكية', price: 18000, sku: sku('AC', 2210) };

const jobs = {
  'service-ticket-a5': serviceTicketA5(ticket),
  'service-receipt-80': serviceReceipt80(ticket),
  'device-label-90x50': deviceLabel(ticket),
  'invoice-thermal-80': invoiceThermal80(invoice),
  'invoice-a5': invoiceA5(invoice),
  'label-phone-75x50': singleLabel(phone),
  'label-accessory-50x30': singleLabel(accessory),
  'label-sheet-a4': labelSheet(accessory, 24),
};

for (const [name, doc] of Object.entries(jobs)) {
  writeFileSync(new URL(`./out/${name}.html`, import.meta.url), renderDocument(doc));
  console.log(`  ✓ ${name}.html  — ${doc.paper}`);
}

const T = totals(invoice);
console.log('\nمجاميع الفاتورة:', JSON.stringify(T));
console.assert(T.subtotal === 430000, 'المجموع الفرعي');
console.assert(T.grand === 420000, 'الإجمالي');
console.assert(T.count === 5, 'عدد المواد');
console.assert(T.rest === 0, 'المتبقّي');
console.log('اليوم:', today());
