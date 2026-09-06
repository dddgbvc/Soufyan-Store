/**
 * مكتب سفيان للموبايل — مطبوعات المحل بصيغة TypeScript.
 *
 * ```ts
 * import { invoiceThermal80, printDocument, invoiceNo } from '@sufyan/print';
 *
 * printDocument(invoiceThermal80({
 *   no: invoiceNo(318),
 *   customer: 'أحمد عبد الله',
 *   phone: '0771 234 5678',
 *   items: [
 *     { name: 'Samsung Galaxy A54 — 256GB أسود', qty: 1, price: 385_000, imei: '356938035643809' },
 *     { name: 'شاحن سريع 25W', qty: 2, price: 15_000 },
 *   ],
 *   discount: 10_000,
 *   payment: 'نقدًا',
 *   seller: 'سفيان',
 *   date: today(),
 * }));
 * ```
 *
 * كل دالة تُعيد `PrintableDoc` — لا تطبع بنفسها. أنت تقرّر: طباعة عبر
 * `printDocument`، أو حفظ عبر `renderDocument`، أو تمرير لمولّد PDF.
 */

export * from './types.js';
export * from './shop.js';
export * from './service-ticket.js';
export * from './invoice.js';
export * from './labels.js';
export * from './print.js';
export * as Code128 from './code128.js';
