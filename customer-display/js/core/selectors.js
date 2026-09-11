/**
 * حسابات الفاتورة — دوال نقية بلا أي تعامل مع DOM.
 * كل ما تعرضه الشاشة من مبالغ يمرّ من هنا، فتبقى الأرقام متّسقة دائمًا.
 */

/** إجمالي السطر قبل الخصم. */
export function lineGross(item) {
  return item.qty * item.unitPrice;
}

/** إجمالي السطر بعد خصم السطر. */
export function lineNet(item) {
  return Math.max(0, lineGross(item) - (item.lineDiscount || 0));
}

/** عدد القطع الكلي في السلة. */
export function totalUnits(session) {
  return session.items.reduce((sum, item) => sum + item.qty, 0);
}

/**
 * ملخّص الفاتورة الكامل.
 * @returns {{
 *   subtotal:number, lineDiscounts:number, invoiceDiscount:number,
 *   discountTotal:number, taxableBase:number, taxAmount:number, taxRate:number|null,
 *   total:number, paid:number, due:number, change:number, isSettled:boolean, units:number, count:number
 * }}
 */
export function summarize(session) {
  const subtotal = session.items.reduce((sum, item) => sum + lineGross(item), 0);
  const lineDiscounts = session.items.reduce((sum, item) => sum + (item.lineDiscount || 0), 0);

  // خصم الفاتورة لا يتجاوز المتبقي بعد خصومات الأسطر
  const invoiceDiscount = Math.min(session.discount || 0, Math.max(0, subtotal - lineDiscounts));
  const discountTotal = lineDiscounts + invoiceDiscount;

  const taxableBase = Math.max(0, subtotal - discountTotal);
  const taxRate = session.taxRate;
  const taxAmount = taxRate ? round(taxableBase * (taxRate / 100)) : 0;

  const total = round(taxableBase + taxAmount);
  const paid = session.paid || 0;
  const balance = round(total - paid);

  return {
    subtotal: round(subtotal),
    lineDiscounts: round(lineDiscounts),
    invoiceDiscount: round(invoiceDiscount),
    discountTotal: round(discountTotal),
    taxableBase: round(taxableBase),
    taxAmount,
    taxRate,
    total,
    paid: round(paid),
    due: balance > 0 ? balance : 0,
    change: balance < 0 ? Math.abs(balance) : 0,
    isSettled: paid > 0 && balance <= 0,
    units: totalUnits(session),
    count: session.items.length,
  };
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
