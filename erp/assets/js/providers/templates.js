/* ============================================================
   providers/templates.js — قوالب الرسائل + المتغيرات
   القوالب قابلة للتعديل من الواجهة، ومستقلة عن مزوّد الإرسال.
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { store, util: U } = ERP;

  /** كتالوج المتغيرات المدعومة */
  const VARIABLES = [
    { key: 'customer_name',  label: 'اسم العميل',        sample: 'أحمد الجبوري' },
    { key: 'customer_phone', label: 'هاتف العميل',       sample: '07731644450' },
    { key: 'product_name',   label: 'اسم المنتج',        sample: 'iPhone 15 Pro Max' },
    { key: 'brand',          label: 'العلامة التجارية',  sample: 'Apple' },
    { key: 'model',          label: 'الموديل',           sample: 'A3108' },
    { key: 'storage',        label: 'السعة',             sample: '256GB' },
    { key: 'color',          label: 'اللون',             sample: 'تيتانيوم طبيعي' },
    { key: 'variant',        label: 'الـ Variant كاملًا', sample: '256GB / تيتانيوم طبيعي' },
    { key: 'sku',            label: 'رمز المنتج SKU',    sample: 'APL-15PM-256-NT' },
    { key: 'quantity',       label: 'الكمية',            sample: '1' },
    { key: 'order_code',     label: 'رقم الطلب',         sample: 'PO-2026-0007' },
    { key: 'order_date',     label: 'تاريخ الطلب',       sample: '12/03/2026' },
    { key: 'expected_date',  label: 'الموعد المتوقع',    sample: '20/03/2026' },
    { key: 'price',          label: 'السعر',             sample: '2,100,000 د.ع' },
    { key: 'total',          label: 'الإجمالي',          sample: '2,100,000 د.ع' },
    { key: 'deposit',        label: 'العربون',           sample: '200,000 د.ع' },
    { key: 'serial',         label: 'IMEI / السيريال',   sample: '356700035000012' },
    { key: 'store_name',     label: 'اسم المتجر',        sample: 'مركز سفيان للهواتف' },
    { key: 'store_address',  label: 'عنوان المتجر',      sample: 'سامراء — الحويش' },
    { key: 'staff_name',     label: 'اسم الموظف',        sample: 'سفيان' },
  ];

  const RE = /\{([a-z_]+)\}/g;

  const templates = {
    VARIABLES,

    list(channel) {
      const all = store.templates();
      return channel ? all.filter((t) => t.channel === channel) : all;
    },
    get(id) { return store.template(id); },

    save(id, patch) {
      return store.update((s) => {
        const t = s.templates.find((x) => x.id === id);
        if (!t) return null;
        Object.assign(t, patch, { updatedAt: U.nowISO() });
        return t;
      });
    },

    create({ name, body, channel = 'whatsapp', description = '' }) {
      const t = {
        id: U.uid('tpl'), name: name || 'قالب جديد', body: body || '',
        channel, description, system: false, updatedAt: U.nowISO(),
      };
      store.update((s) => s.templates.push(t));
      return t;
    },

    remove(id) {
      return store.update((s) => {
        const i = s.templates.findIndex((x) => x.id === id);
        if (i > -1 && !s.templates[i].system) { s.templates.splice(i, 1); return true; }
        return false;
      });
    },

    /**
     * بناء قيم المتغيرات من طلب مسبق.
     * لا يعرف شيئًا عن قناة الإرسال — مجرد بيانات.
     */
    varsFromPreOrder(preOrder) {
      if (!preOrder) return {};
      const st = store.settings();
      const customer = store.customer(preOrder.customerId);
      const t = preOrder.target || {};
      const serials = (preOrder.stockItemIds || [])
        .map((id) => store.stockItem(id))
        .filter(Boolean).map((s) => s.serial).filter(Boolean);

      return {
        customer_name:  customer ? customer.name : '',
        customer_phone: customer ? customer.phone : '',
        product_name:   t.productName || '',
        brand:          t.brand || '',
        model:          t.model || '',
        storage:        t.storage && t.storage !== '—' ? t.storage : '',
        color:          t.color || '',
        variant:        [t.storage && t.storage !== '—' ? t.storage : null, t.color].filter(Boolean).join(' / '),
        sku:            t.sku || '',
        quantity:       String(preOrder.quantity || 1),
        order_code:     preOrder.code || '',
        order_date:     U.fmtDateShort(preOrder.createdAt),
        expected_date:  preOrder.expectedAt ? U.fmtDateShort(preOrder.expectedAt) : 'قيد التحديد',
        price:          U.fmtMoney(preOrder.unitPrice),
        total:          U.fmtMoney((preOrder.unitPrice || 0) * (preOrder.quantity || 1)),
        deposit:        U.fmtMoney(preOrder.depositAmount || 0),
        serial:         serials.join(' · '),
        store_name:     st.storeName,
        store_address:  st.storeAddress,
        staff_name:     st.staffName,
      };
    },

    /** قيم تجريبية لمعاينة القالب في المحرر */
    sampleVars() {
      const out = {};
      VARIABLES.forEach((v) => { out[v.key] = v.sample; });
      const st = store.settings();
      out.store_name = st.storeName;
      out.store_address = st.storeAddress;
      out.staff_name = st.staffName;
      return out;
    },

    /**
     * استبدال المتغيرات داخل النص.
     * @returns {{text:string, missing:string[], unknown:string[]}}
     */
    render(body, vars = {}) {
      const missing = [];
      const unknown = [];
      const known = new Set(VARIABLES.map((v) => v.key));
      const text = String(body || '').replace(RE, (m, key) => {
        if (!known.has(key)) { unknown.push(key); return m; }
        const val = vars[key];
        if (val === undefined || val === null || val === '') { missing.push(key); return ''; }
        return String(val);
      });
      return { text: text.replace(/[ \t]+\n/g, '\n'), missing: [...new Set(missing)], unknown: [...new Set(unknown)] };
    },

    /** المتغيرات المستخدمة فعليًا داخل قالب */
    usedVars(body) {
      const out = [];
      String(body || '').replace(RE, (m, key) => { out.push(key); return m; });
      return [...new Set(out)];
    },
  };

  ERP.templates = templates;
})(window);
