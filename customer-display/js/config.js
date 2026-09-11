/**
 * إعدادات شاشة الزبون.
 * كل ما يحتاج التاجر أو المطوّر تغييره موجود هنا — لا شيء مبعثر في الكود.
 *
 * يمكن تجاوز أي إعداد وقت التشغيل عبر معاملات الرابط، مثال:
 *   customer-display/?transport=ws&ws=wss://pos.example.com/display&theme=dark
 */

/** @typedef {'auto'|'broadcast'|'websocket'|'supabase'|'none'} TransportMode */

export const CONFIG = {
  /** هوية المتجر الظاهرة في الهيدر */
  store: {
    name: 'مكتب سفيان للاتصالات',
    branch: 'سامراء — الحويش، الشارع الرئيسي',
    /** مسار شعار اختياري (SVG أو PNG). اتركه فارغًا لاستخدام الشعار المدمج. */
    logoUrl: '',
    phone: '0773 164 4450',
  },

  /** صياغة الأرقام والعملة */
  currency: {
    /** الرمز الظاهر بجانب المبالغ */
    symbol: 'د.ع',
    /** كود العملة للأنظمة الخلفية */
    code: 'IQD',
    /** en-US ⇒ أرقام غربية بفواصل آلاف: 850,000 (المطلوب في الفواتير العراقية) */
    numberLocale: 'en-US',
    /** الدينار العراقي بلا كسور */
    fractionDigits: 0,
  },

  /** الضريبة — معطّلة افتراضيًا، ويمكن للجلسة القادمة من الكاشير تفعيلها */
  tax: {
    enabled: false,
    /** نسبة مئوية، مثال 15 يعني 15٪ */
    rate: 0,
    label: 'الضريبة',
  },

  /** طبقة الاتصال اللحظي */
  transport: {
    /** @type {TransportMode} */
    mode: 'auto',
    /** اسم القناة المشتركة بين الكاشير وشاشة الزبون */
    channel: 'yaqoot-pos',
    websocket: {
      url: '',
      reconnectBaseMs: 1000,
      reconnectMaxMs: 15000,
    },
    /**
     * Supabase Realtime — معطّل ما لم تُضبط القيم.
     * المشروع الحالي لا يستخدم Supabase، لذلك لا شيء يُحمَّل ما لم تُفعّله بنفسك.
     */
    supabase: {
      url: '',
      anonKey: '',
      table: 'pos_display_sessions',
      /** معرّف نقطة البيع/الجهاز الذي تتابعه هذه الشاشة */
      terminalId: 'terminal-1',
    },
  },

  /** مزامنة السمة مع البرنامج الرئيسي */
  theme: {
    /** نفس المفتاح المستخدم في واجهة المتجر (index.html) */
    storageKey: 'theme',
    /** قناة بث اختيارية لمزامنة فورية بين النوافذ */
    channel: 'yaqoot-theme',
    /** 'light' | 'dark' | 'auto' */
    fallback: 'auto',
  },

  /** سلوك الشاشة */
  behavior: {
    /** بعد نجاح الدفع: العودة تلقائيًا إلى شاشة الانتظار (ملّي ثانية، 0 = تعطيل) */
    resetAfterPaidMs: 15000,
    /** بعد الإلغاء */
    resetAfterCancelledMs: 8000,
    /** مدة انتقال الأرقام */
    tickerMs: 520,
    /** إظهار تلميح الوضع التجريبي عند عدم وجود أي اتصال */
    showDemoHint: true,
  },
};

/** يقرأ معاملات الرابط ويطبّقها فوق الإعدادات الافتراضية. */
export function applyUrlOverrides(config = CONFIG, search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search);
  const next = structuredClone(config);

  const transport = params.get('transport');
  if (transport) next.transport.mode = /** @type {TransportMode} */ (transport);

  const channel = params.get('channel');
  if (channel) next.transport.channel = channel;

  const ws = params.get('ws');
  if (ws) {
    next.transport.websocket.url = ws;
    if (!transport) next.transport.mode = 'websocket';
  }

  const terminal = params.get('terminal');
  if (terminal) next.transport.supabase.terminalId = terminal;

  const store = params.get('store');
  if (store) next.store.name = store;

  const branch = params.get('branch');
  if (branch) next.store.branch = branch;

  const currency = params.get('currency');
  if (currency) next.currency.symbol = currency;

  return next;
}

/** أوضاع التشغيل التجريبي المستخرجة من الرابط. */
export function readDemoMode(search = globalThis.location?.search ?? '') {
  const value = new URLSearchParams(search).get('demo');
  if (value === null) return { open: false, auto: false };
  if (value === 'auto') return { open: true, auto: true };
  if (value === '0' || value === 'false') return { open: false, auto: false };
  return { open: true, auto: false };
}
