// ============================================================================
// تعريب النسخة الاحتياطية
// ----------------------------------------------------------------------------
// النسخة القديمة كانت تدز ملفات CSV بأسماء جداول وأعمدة إنكليزية
// (invoice_items: 59) — أرقام بلا معنى لصاحب المحل. هنا نحوّل كل شي لعربي:
// اسم الملف، عناوين الأعمدة، والقيم (نقد/دين، نعم/لا، الأوقات بتوقيت بغداد).
//
// ملاحظة مهمة: هذا التعريب للقراءة البشرية فقط. ملف _full_backup.json
// يبقى بالأسماء الأصلية لأنه هو النسخة اللي تنفع للاستعادة.
// ============================================================================

export type Group = "sales" | "customers" | "stock" | "repairs" | "money" | "system";

export type TableInfo = {
  ar: string;      // اسم الملف بالعربي
  group: Group;
  unit: string;    // وحدة العد: "فاتورة"، "زبون" …
  note: string;    // سطر شرح داخل الدليل
};

export const TABLES: Record<string, TableInfo> = {
  invoices: {
    ar: "الفواتير",
    group: "sales",
    unit: "فاتورة",
    note: "كل فاتورة بيع: الزبون، المبلغ الكلي، المدفوع، ونوع الدفع (نقد أو دين).",
  },
  invoice_items: {
    ar: "مواد الفواتير",
    group: "sales",
    unit: "مادة",
    note: "تفاصيل المواد داخل كل فاتورة — أي منتج، وكم قطعة، وبأي سعر.",
  },
  returns: {
    ar: "المرتجعات",
    group: "sales",
    unit: "مرتجع",
    note: "البضاعة اللي رجّعها الزبائن وطريقة إرجاع المبلغ.",
  },
  return_items: {
    ar: "مواد المرتجعات",
    group: "sales",
    unit: "مادة",
    note: "تفاصيل المواد داخل كل مرتجع وحالتها.",
  },

  customers: {
    ar: "الزبائن",
    group: "customers",
    unit: "زبون",
    note: "كل زبون مع دينه الحالي وسقف الدين المسموح بيه.",
  },
  debt_payments: {
    ar: "تسديدات الديون",
    group: "customers",
    unit: "تسديد",
    note: "كل تسديد دين: المبلغ، الدين قبله وبعده، ومنو سجّله.",
  },

  products: {
    ar: "المنتجات",
    group: "stock",
    unit: "منتج",
    note: "المخزن كامل: سعر الشراء، سعر البيع، والكمية الموجودة.",
  },
  categories: { ar: "الأقسام", group: "stock", unit: "قسم", note: "أقسام المنتجات." },
  shortages: {
    ar: "النواقص",
    group: "stock",
    unit: "نقص",
    note: "البضاعة اللي قاربت تخلص أو خلصت.",
  },

  repairs: {
    ar: "التصليحات",
    group: "repairs",
    unit: "وصل",
    note: "وصولات التصليح: الجهاز، العطل، الحالة، والكلفة.",
  },

  expenses: {
    ar: "المصاريف",
    group: "money",
    unit: "مصروف",
    note: "مصاريف المحل مع نوع كل مصروف ومنو سجّله.",
  },
  vault_entries: {
    ar: "حركات الصندوق",
    group: "money",
    unit: "حركة",
    note: "دخول وخروج النقد من الصندوق. هذا السجل ما ينحذف ولا ينعدّل.",
  },

  employees: {
    ar: "الموظفين",
    group: "system",
    unit: "موظف",
    note: "الموظفين وصلاحياتهم. رموز الدخول محذوفة من هذا الملف للأمان.",
  },
  profiles: {
    ar: "حسابات الدخول",
    group: "system",
    unit: "حساب",
    note: "حسابات الدخول للنظام. الرموز محذوفة من هذا الملف للأمان.",
  },
  app_sessions: {
    ar: "جلسات فتح البرنامج",
    group: "system",
    unit: "جلسة",
    note: "كل مرة انفتح بيها البرنامج: منو، من أي جهاز، وشوكت.",
  },
  pin_attempts: {
    ar: "محاولات الدخول بالرمز",
    group: "system",
    unit: "محاولة",
    note: "محاولات إدخال رمز الدخول، الناجحة والفاشلة.",
  },
  telegram_users: {
    ar: "مستخدمي البوت",
    group: "system",
    unit: "مستخدم",
    note: "المسموح لهم يستعملون بوت تلغرام وصلاحية كل واحد.",
  },
  telegram_unknown_attempts: {
    ar: "محاولات دخول مجهولة للبوت",
    group: "system",
    unit: "محاولة",
    note: "ناس غرباء حاولوا يستعملون البوت وانرفضوا.",
  },
  bot_settings: { ar: "إعدادات البوت", group: "system", unit: "إعداد", note: "إعدادات البوت." },
  bot_pending_actions: {
    ar: "طلبات البوت المعلّقة",
    group: "system",
    unit: "طلب",
    note: "تسديدات مطلوب تأكيدها بالبوت ولسه ما تأكدت.",
  },
};

export const GROUP_LABEL: Record<Group, string> = {
  sales: "المبيعات",
  customers: "الزبائن والديون",
  stock: "المخزن",
  repairs: "التصليح",
  money: "الفلوس",
  system: "ملفات النظام",
};

export const GROUP_ORDER: Group[] = ["sales", "customers", "stock", "repairs", "money", "system"];

// ------------------------------ أسماء الأعمدة ------------------------------

/** أعمدة متكررة بكل الجداول. */
const COMMON: Record<string, string> = {
  name: "الاسم",
  phone: "الهاتف",
  address: "العنوان",
  notes: "ملاحظات",
  note: "ملاحظة",
  actor: "سجّله",
  status: "الحالة",
  amount: "المبلغ",
  total: "المجموع",
  quantity: "الكمية",
  reason: "السبب",
  category: "النوع",
  serials: "الأرقام التسلسلية",
  customer_name: "اسم الزبون",
  customer_phone: "هاتف الزبون",
  product_name: "المادة",
  unit_price: "سعر القطعة",
  total_amount: "المبلغ الكلي",
  created_at: "تاريخ الإنشاء",
  updated_at: "آخر تعديل",
  display_name: "الاسم المعروض",
  role: "الصلاحية",
  department: "القسم",
  telegram_id: "رقم تلغرام",
};

/** تسميات خاصة بكل جدول — تسبق العامة. */
const PER_TABLE: Record<string, Record<string, string>> = {
  customers: {
    balance: "الدين الحالي",
    credit_limit: "سقف الدين",
    grace_period_days: "مهلة السماح (أيام)",
  },
  products: {
    barcode: "الباركود",
    category_id: "القسم",
    cost_price: "سعر الشراء",
    selling_price: "سعر البيع",
    stock_quantity: "الكمية بالمخزن",
    min_stock_alert: "حد التنبيه",
    has_imei: "له IMEI",
  },
  categories: { slug: "المعرّف اللاتيني" },
  invoices: {
    invoice_number: "رقم الفاتورة",
    total_amount: "إجمالي الفاتورة",
    paid_amount: "المدفوع",
    delivery_price: "أجور التوصيل",
    province_name: "المحافظة",
    payment_type: "نوع الدفع",
  },
  invoice_items: {
    invoice_id: "رقم الفاتورة",
    discount: "الخصم",
    total: "صافي السطر",
  },
  returns: {
    return_number: "رقم المرتجع",
    invoice_number: "رقم الفاتورة الأصلية",
    refund_method: "طريقة الإرجاع",
  },
  return_items: {
    return_id: "رقم المرتجع",
    condition: "حالة المادة",
  },
  debt_payments: {
    previous_debt: "الدين السابق",
    amount_paid: "المبلغ المسدّد",
    waived_amount: "السماح (إعفاء)",
    waiver_reason: "سبب السماح",
    remaining_debt: "الدين المتبقي",
    is_zeroed: "انصفّر الحساب",
  },
  expenses: { description: "الوصف" },
  repairs: {
    ticket_no: "رقم الوصل",
    device: "الجهاز",
    imei: "IMEI",
    fault: "العطل",
    cost: "كلفة القطع",
    labour: "أجور التصليح",
    lock_code: "رمز القفل",
  },
  shortages: {
    current_qty: "الكمية الحالية",
    limit_qty: "حد التنبيه",
    is_manual: "مضاف يدوي",
    resolved: "انحلّت",
  },
  vault_entries: {
    seq: "التسلسل",
    kind: "نوع الحركة",
    reverses: "يعكس حركة رقم",
  },
  employees: { pin_updated_at: "آخر تغيير للرمز" },
  profiles: { full_name: "الاسم الكامل", pin_updated_at: "آخر تغيير للرمز" },
  app_sessions: {
    terminal_id: "معرّف الجهاز",
    employee_name: "الموظف",
    app_version: "نسخة البرنامج",
    platform: "المنصّة",
    opened_at: "وكت الفتح",
    last_seen_at: "آخر إشارة",
    closed_at: "وكت الغلق",
    close_reason: "سبب الغلق",
    ip: "IP العام",
    local_ip: "IP المحلي",
    mac: "MAC",
    country: "الدولة",
    device_name: "اسم الجهاز",
    os: "النظام",
  },
  pin_attempts: { terminal_id: "الجهاز", ok: "نجحت", at: "الوقت" },
  telegram_users: {
    label: "الاسم",
    can_read: "يقدر يشوف",
    can_write: "يقدر يسدّد",
    is_active: "فعّال",
  },
  telegram_unknown_attempts: {
    username: "معرّف تلغرام",
    first_name: "الاسم الأول",
    last_name: "الاسم الأخير",
    attempts: "عدد المحاولات",
    first_seen: "أول محاولة",
    last_seen: "آخر محاولة",
  },
  bot_settings: { key: "المفتاح", value: "القيمة" },
  bot_pending_actions: {
    token: "رمز الطلب",
    action: "الإجراء",
    chat_id: "رقم المحادثة",
    expires_at: "ينتهي بـ",
  },
};

/** أعمدة تقنية ما تنفع القارئ البشري — تنشال من CSV وتبقى بملف JSON. */
const HIDDEN = new Set([
  "id",
  "client_id",
  "user_id",
  "customer_id",
  "product_id",
  "employee_id",
  "avatar_url",
  "pin_hash",       // للأمان: ما ينرسل بملف يمر بتلغرام
  "prev_hash",
  "hash",
  "meta",
  "payload",
  "user_agent",
]);

export function isHidden(table: string, col: string): boolean {
  if (col === "invoice_id" && table === "invoice_items") return false; // ينبدل برقم الفاتورة
  if (col === "return_id" && table === "return_items") return false;
  if (col === "category_id" && table === "products") return false;     // ينبدل باسم القسم
  if (col === "invoice_id" && table === "returns") return true;
  return HIDDEN.has(col);
}

export function columnLabel(table: string, col: string): string {
  return PER_TABLE[table]?.[col] ?? COMMON[col] ?? col;
}

export function tableLabel(table: string): string {
  return TABLES[table]?.ar ?? table;
}

// -------------------------------- القيم --------------------------------

const ENUMS: Record<string, Record<string, string>> = {
  payment_type: { CASH: "نقد", DEBT: "دين" },
  role: { ADMIN: "مدير عام", MANAGER: "مدير", CASHIER: "كاشير" },
  status: {
    active: "فعّال",
    inactive: "موقوف",
    intake: "استلام",
    diagnosing: "تشخيص",
    awaiting_parts: "بانتظار قطع",
    ready: "جاهز",
    delivered: "تسلّمه الزبون",
    unrepairable: "ما ينصلح",
    open: "مفتوح",
    resolved: "انحلّ",
    pending: "بالانتظار",
    done: "تم",
    cancelled: "ملغي",
    expired: "منتهي",
  },
  close_reason: {
    normal: "غلق عادي",
    logout: "تسجيل خروج",
    timeout: "انقطع الاتصال",
    crash: "انطفأ فجأة",
  },
  kind: { in: "دخول", out: "خروج", open: "افتتاح", close: "إغلاق" },
  refund_method: { cash: "نقد", debt: "خصم من الدين", exchange: "استبدال" },
  condition: { new: "جديدة", used: "مستعملة", damaged: "متضررة" },
};

const ISO_TS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** وقت بغداد بصيغة قصيرة يفهمها الإنسان وإكسل. */
export function baghdadTime(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

export function formatValue(col: string, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (Array.isArray(v)) return v.join(" | ");
  if (typeof v === "object") return JSON.stringify(v);

  const s = String(v);
  const enums = ENUMS[col];
  if (enums && enums[s]) return enums[s];
  if (ISO_TS.test(s)) return baghdadTime(s);
  return s;
}
