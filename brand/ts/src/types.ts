/**
 * مكتب سفيان للموبايل — أنواع الفواتير والوصولات والملصقات.
 *
 * كل مبلغ هنا بالدينار العراقي كعدد صحيح — لا كسور ولا نص.
 * كل تاريخ بصيغة ISO القصيرة `YYYY-MM-DD`.
 */

/** بيانات المحل الثابتة — مصدر واحد لكل المطبوعات. */
export interface ShopInfo {
  /** الاسم العربي كما يظهر في ترويسة كل مطبوع. */
  name: string;
  /** الاسم اللاتيني تحت العربي. */
  latin: string;
  /** العنوان في سطر واحد. */
  address: string;
  /** أرقام الهاتف والواتساب. */
  phones: readonly string[];
  /** رقم خط الإنترنت. */
  internet: string;
  /** الشعار اللفظي في تذييل الفاتورة A5. */
  tagline: string;
}

/** تاريخ بصيغة `YYYY-MM-DD`. */
export type IsoDate = string;

/* ══════════════════ وصل الصيانة ══════════════════ */

/** أنواع الخلل المعتمدة في خانات الوصل. */
export const FAULT_KINDS = [
  'شاشة', 'بطارية', 'شحن', 'صوت', 'كاميرا', 'ماء', 'سوفتوير', 'شبكة', 'أخرى',
] as const;

export type FaultKind = (typeof FAULT_KINDS)[number];

/** وصل استلام جهاز للصيانة. */
export interface ServiceTicket {
  /** رقم الوصل التسلسلي `SFN-00001` — يُطبع كباركود. */
  no: string;
  /** اسم الزبون. */
  customer: string;
  /** رقم هاتف الزبون. */
  phone: string;
  /** نوع الجهاز — الشركة والموديل. */
  device: string;
  /** رقم الجهاز IMEI. */
  imei?: string;
  /** رمز قفل الشاشة إن سلّمه الزبون. */
  lockCode?: string;
  /** الملحقات المستلمة مع الجهاز. */
  accessories?: string;
  /** نوع الخلل — خانات متعددة الاختيار. */
  faults: FaultKind[];
  /** وصف الخلل بكلام الزبون. */
  description?: string;
  /** تاريخ الاستلام. */
  dateIn: IsoDate;
  /** موعد التسليم المتوقّع. */
  dateOut?: IsoDate;
  /** الكلفة التقديرية بالدينار. */
  cost?: number;
  /** المدفوع مقدّمًا بالدينار. */
  paid?: number;
  /** الموظّف الذي استلم الجهاز. */
  staff?: string;
  /** لحظة الإنشاء — تُستعمل لطباعة الساعة. */
  at?: number;
}

/* ══════════════════ فاتورة البيع ══════════════════ */

/** سطر واحد في فاتورة البيع. */
export interface InvoiceItem {
  /** اسم المادة كما يُطبع. */
  name: string;
  /** الكمية — عدد صحيح موجب. */
  qty: number;
  /** سعر الوحدة بالدينار. */
  price: number;
  /** رقم الجهاز — يُطبع تحت اسم المادة للأجهزة فقط. */
  imei?: string;
}

/** طرق الدفع المعتمدة. */
export const PAYMENT_METHODS = ['نقدًا', 'زين كاش', 'آسيا حوالة', 'بطاقة', 'آجل'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** فاتورة بيع. */
export interface SaleInvoice {
  /** رقم الفاتورة التسلسلي `SFN-INV-00001` — يُطبع كباركود. */
  no: string;
  /** اسم الزبون. */
  customer: string;
  /** رقم هاتف الزبون. */
  phone?: string;
  /** المواد المباعة — سطر لكل مادة. */
  items: InvoiceItem[];
  /** الخصم بالدينار على مجموع الأسطر. */
  discount?: number;
  /**
   * المدفوع بالدينار. إذا تُرك `undefined` تُعتبر الفاتورة مسدّدة بالكامل
   * ويُطبع «المدفوع» مساويًا للإجمالي.
   */
  paid?: number;
  /** طريقة الدفع. */
  payment?: PaymentMethod;
  /** البائع. */
  seller?: string;
  /** ملاحظات تُطبع على الفاتورة. */
  note?: string;
  /** تاريخ البيع. */
  date: IsoDate;
  /** لحظة الإنشاء — تُستعمل لطباعة الساعة. */
  at?: number;
}

/** مجاميع الفاتورة المحسوبة — لا تُخزَّن، تُشتق دائمًا من الأسطر. */
export interface InvoiceTotals {
  /** مجموع الأسطر قبل الخصم. */
  subtotal: number;
  /** الخصم فعليًا — لا يتجاوز المجموع الفرعي أبدًا. */
  discount: number;
  /** الإجمالي بعد الخصم. */
  grand: number;
  /** المدفوع — الإجمالي إذا لم يُحدَّد. */
  paid: number;
  /** المتبقّي — صفر إذا سُدِّدت. */
  rest: number;
  /** مجموع الكميات. */
  count: number;
}

/* ══════════════════ الملصقات ══════════════════ */

/** مقاسات الملصقات المعتمدة بالمليمتر. */
export type LabelSizeKey = '75x50' | '60x40' | '50x30' | '40x25';

/** أبعاد ملصق ومقاسات عناصره — كلها بالمليمتر عدا `barcodeModule`. */
export interface LabelSize {
  /** العرض بالمليمتر. */
  w: number;
  /** الارتفاع بالمليمتر. */
  h: number;
  /** مقاس اسم المنتج. */
  nameMm: number;
  /** مقاس السعر. */
  priceMm: number;
  /** ارتفاع الباركود. */
  barcodeMm: number;
  /** عرض أنحف عمود في الباركود. */
  barcodeModule: number;
  /** مقاس سطر المواصفات في ملصق الهاتف. */
  specMm: number;
  /** مقاسات بديلة تُستعمل حين يحمل الملصق مواصفات جهاز. */
  phone: { nameMm: number; priceMm: number; barcodeMm: number };
}

/** حالة الجهاز المستعمل. */
export const DEVICE_CONDITIONS = [
  'جديد بالكارتون', 'جديد بدون كارتون',
  'مستعمل — ممتاز', 'مستعمل — جيد', 'مستعمل — مقبول',
] as const;

export type DeviceCondition = (typeof DEVICE_CONDITIONS)[number];

/** ملصق إكسسوار — اسم وسعر وباركود فقط، المقاس المعتمد 50 × 30 مم. */
export interface AccessoryLabel {
  kind: 'accessory';
  /** اسم المنتج. */
  name: string;
  /** السعر بالدينار. */
  price: number;
  /** رقم المنتج `SFN-AC-0000` — محتوى الباركود. */
  sku: string;
}

/** ملصق هاتف — يحمل مواصفات الجهاز، المقاس المعتمد 75 × 50 مم. */
export interface PhoneLabel {
  kind: 'phone';
  /** اسم الجهاز التجاري. */
  name: string;
  /** السعر بالدينار. */
  price: number;
  /** رقم المنتج `SFN-PH-0000` — محتوى الباركود. */
  sku: string;
  /** رقم النموذج الدقيق. */
  model?: string;
  /** رقم الجهاز IMEI. */
  imei?: string;
  /** الذاكرة — الوصول والتخزين. */
  storage?: string;
  /** اللون. */
  color?: string;
  /** صحة البطارية. */
  battery?: string;
  /** حالة الجهاز. */
  condition?: DeviceCondition;
  /** الأعطال إن وجدت. */
  fault?: string;
  /** ملاحظات — ضمان، ملحقات، أي اتفاق. */
  notes?: string;
}

/** أي ملصق باركود. */
export type ProductLabel = AccessoryLabel | PhoneLabel;

/* ══════════════════ ناتج التوليد ══════════════════ */

/**
 * مستند جاهز للطباعة: جسم HTML وقواعد CSS الخاصة به.
 * الدوال هنا لا تطبع بنفسها — تُعيد هذا، وأنت تقرّر: طباعة أم حفظ أم إرسال.
 */
export interface PrintableDoc {
  /** محتوى `<body>`. */
  html: string;
  /** قواعد CSS بما فيها `@page` — تُضاف بعد الأساسية. */
  css: string;
  /** وصف المقاس للسجل والواجهة. */
  paper: string;
}
