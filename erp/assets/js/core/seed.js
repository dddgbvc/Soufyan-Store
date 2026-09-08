/* ============================================================
   core/seed.js — بيانات تشغيل أولية (Demo data)
   تُنشأ مرة واحدة فقط عند أول تشغيل، ثم تُحفظ محليًا.
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const U = ERP.util;

  const iso = (daysAgo, hour = 11) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, (daysAgo * 7) % 60, 0, 0);
    return d.toISOString();
  };
  const isoIn = (days, hour = 12) => iso(-days, hour);

  function build() {
    /* ---------------- الكتالوج ---------------- */
    const products = [
      p('prd_ip15pm', 'iPhone 15 Pro Max', 'Apple', 'A3108', 'phone', true, [
        v('var_ip15pm_256_nt', 'APL-15PM-256-NT', '256GB', 'تيتانيوم طبيعي', '#B7AFA3', 2100000),
        v('var_ip15pm_512_bt', 'APL-15PM-512-BT', '512GB', 'تيتانيوم أزرق', '#3F4C5C', 2450000),
      ]),
      p('prd_ip15', 'iPhone 15', 'Apple', 'A3090', 'phone', true, [
        v('var_ip15_128_bk', 'APL-15-128-BK', '128GB', 'أسود', '#1C1C1E', 1250000),
        v('var_ip15_256_pk', 'APL-15-256-PK', '256GB', 'وردي', '#E8C3C8', 1420000),
      ]),
      p('prd_s24u', 'Galaxy S24 Ultra', 'Samsung', 'SM-S928', 'phone', true, [
        v('var_s24u_256_gy', 'SAM-S24U-256-GY', '256GB', 'رمادي تيتانيوم', '#6E6E73', 1750000),
        v('var_s24u_512_bk', 'SAM-S24U-512-BK', '512GB', 'أسود تيتانيوم', '#2B2B2E', 1980000),
      ]),
      p('prd_a55', 'Galaxy A55', 'Samsung', 'SM-A556', 'phone', true, [
        v('var_a55_128_ib', 'SAM-A55-128-IB', '128GB', 'أزرق ثلجي', '#9FC3DE', 520000),
        v('var_a55_256_nv', 'SAM-A55-256-NV', '256GB', 'كحلي', '#2C3550', 585000),
      ]),
      p('prd_a15', 'Galaxy A15', 'Samsung', 'SM-A155', 'phone', true, [
        v('var_a15_128_bb', 'SAM-A15-128-BB', '128GB', 'أزرق أسود', '#25313F', 185000),
      ]),
      p('prd_note13p', 'Redmi Note 13 Pro', 'Xiaomi', '2312DRA50G', 'phone', true, [
        v('var_n13p_256_bk', 'XIA-N13P-256-BK', '256GB', 'أسود منتصف الليل', '#191A1D', 420000),
        v('var_n13p_128_pu', 'XIA-N13P-128-PU', '128GB', 'بنفسجي شفقي', '#8E7BC0', 375000),
      ]),
      p('prd_x6pro', 'Poco X6 Pro', 'Xiaomi', '2311DRK48G', 'phone', true, [
        v('var_x6p_256_yl', 'XIA-X6P-256-YL', '256GB', 'أصفر', '#E9C93B', 480000),
      ]),
      p('prd_note40p', 'Infinix Note 40 Pro', 'Infinix', 'X6850', 'phone', true, [
        v('var_n40p_256_gd', 'INF-N40P-256-GD', '256GB', 'ذهبي تيتان', '#C7A96B', 310000),
      ]),
      p('prd_airpods', 'AirPods Pro 2', 'Apple', 'A2931', 'accessory', false, [
        v('var_airpods_w', 'APL-APP2-WH', '—', 'أبيض', '#F2F2F4', 320000),
      ]),
      p('prd_charger', 'شاحن Anker 65W', 'Anker', 'A2667', 'accessory', false, [
        v('var_charger_bk', 'ANK-65W-BK', '—', 'أسود', '#1F1F22', 45000),
      ]),
    ];

    function p(id, name, brand, model, category, tracksSerial, variants) {
      variants.forEach((vr) => (vr.productId = id));
      return { id, name, brand, model, category, tracksSerial, variants, active: true };
    }
    function v(id, sku, storage, color, colorHex, price) {
      return { id, sku, storage, color, colorHex, price, cost: Math.round(price * 0.88) };
    }

    /* ---------------- العملاء ---------------- */
    const customers = [
      c('cus_001', 'أحمد الجبوري', '07731644450', 'زبون دائم — يفضّل الدفع نقدًا'),
      c('cus_002', 'مصطفى العزاوي', '07901234567', ''),
      c('cus_003', 'زينب الحسيني', '07811223344', 'تفضّل التواصل عبر واتساب فقط'),
      c('cus_004', 'عمر الدليمي', '07709876543', ''),
      c('cus_005', 'حسن السامرائي', '07744485771', 'صاحب محل — طلبات بالجملة'),
      c('cus_006', 'نور الخفاجي', '07512345678', ''),
      c('cus_007', 'سيف الطائي', '07803334455', 'يسأل دائمًا عن الأقساط'),
    ];
    function c(id, name, phone, notes) {
      return { id, name, phone, notes, createdAt: iso(90), tags: [] };
    }

    /* ---------------- المخزون ---------------- */
    let serialSeq = 350000;
    const stockItems = [];
    function stock(variantId, opts = {}) {
      const prod = products.find((pr) => pr.variants.some((vr) => vr.id === variantId));
      const vr = prod.variants.find((x) => x.id === variantId);
      const item = {
        id: U.uid('stk'),
        productId: prod.id,
        variantId,
        sku: vr.sku,
        serial: prod.tracksSerial ? '3567' + String(serialSeq++).padStart(11, '0') : null,
        status: opts.status || 'AVAILABLE',      // AVAILABLE | RESERVED | SOLD
        preOrderId: opts.preOrderId || null,
        cost: vr.cost,
        supplier: opts.supplier || 'مورد بغداد المركزي',
        receivedAt: opts.receivedAt || iso(opts.daysAgo === undefined ? 6 : opts.daysAgo, 10),
        batchId: opts.batchId || null,
      };
      stockItems.push(item);
      return item;
    }

    /* بضاعة متوفرة عمومًا */
    stock('var_ip15_128_bk'); stock('var_ip15_128_bk');
    stock('var_a55_128_ib'); stock('var_a55_128_ib'); stock('var_a55_128_ib');
    stock('var_a15_128_bb'); stock('var_a15_128_bb');
    stock('var_n13p_256_bk');
    stock('var_charger_bk'); stock('var_charger_bk'); stock('var_charger_bk');

    /* ---------------- الطلبات المسبقة ---------------- */
    let poSeq = 0;
    const year = new Date().getFullYear();
    const preOrders = [];
    const events = [];
    const notifications = [];
    const sales = [];

    function ev(type, payload, at) {
      events.push({ id: U.uid('ev'), type, payload, at: at || U.nowISO(), actor: 'النظام' });
    }

    function po(opts) {
      const code = 'PO-' + year + '-' + String(++poSeq).padStart(4, '0');
      const prod = products.find((x) => x.id === opts.productId);
      const vr = prod.variants.find((x) => x.id === opts.variantId);
      const createdAt = iso(opts.daysAgo, 12);
      const order = {
        id: U.uid('po'),
        code,
        customerId: opts.customerId,
        productId: opts.productId,
        variantId: opts.variantId,
        // لقطة من مواصفات الطلب (تبقى ثابتة حتى لو تغيّر الكتالوج)
        target: {
          productName: prod.name,
          brand: prod.brand,
          model: prod.model,
          sku: vr.sku,
          storage: vr.storage,
          color: vr.color,
          colorHex: vr.colorHex,
        },
        quantity: opts.quantity || 1,
        status: opts.status,
        priority: opts.priority || 'NORMAL',       // LOW | NORMAL | HIGH
        expectedAt: opts.expectedAt || null,
        expiresAt: opts.expiresAt || isoIn(30 - opts.daysAgo),
        notes: opts.notes || '',
        depositAmount: opts.depositAmount || 0,
        unitPrice: vr.price,
        createdAt,
        updatedAt: opts.updatedAt || createdAt,
        createdBy: opts.createdBy || 'سفيان',
        stockItemIds: [],
        saleId: null,
        notifiedAt: null,
        arrivedAt: null,
        matchedAt: null,
        lastMessage: null,
        history: [{ at: createdAt, from: null, to: 'PENDING', by: opts.createdBy || 'سفيان', note: 'إنشاء الطلب' }],
      };
      preOrders.push(order);
      ev('PREORDER_CREATED', { preOrderId: order.id, code, customerId: order.customerId }, createdAt);
      return order;
    }
    function step(order, to, daysAgo, note) {
      const at = iso(daysAgo, 14);
      order.history.push({ at, from: order.history[order.history.length - 1].to, to, by: 'سفيان', note: note || '' });
      order.status = to;
      order.updatedAt = at;
      if (to === 'ARRIVED') order.arrivedAt = at;
      if (to === 'CUSTOMER_NOTIFIED') order.notifiedAt = at;
      ev('PREORDER_STATUS_CHANGED', { preOrderId: order.id, code: order.code, to }, at);
      return at;
    }

    /* 1 — قيد الانتظار */
    po({ customerId: 'cus_002', productId: 'prd_ip15pm', variantId: 'var_ip15pm_256_nt',
         quantity: 1, status: 'PENDING', daysAgo: 1, priority: 'HIGH',
         notes: 'يريده قبل نهاية الشهر', depositAmount: 200000 });

    /* 2 — قيد الانتظار (كمية) */
    po({ customerId: 'cus_005', productId: 'prd_a15', variantId: 'var_a15_128_bb',
         quantity: 5, status: 'PENDING', daysAgo: 2, notes: 'طلب جملة لمحل الحويش' });

    /* 3 — بانتظار الوصول */
    const o3 = po({ customerId: 'cus_001', productId: 'prd_s24u', variantId: 'var_s24u_512_bk',
         quantity: 1, status: 'PENDING', daysAgo: 8, expectedAt: isoIn(4), priority: 'HIGH',
         depositAmount: 300000, notes: 'دفع عربون 300 ألف' });
    step(o3, 'WAITING_ARRIVAL', 7, 'تم تأكيد الطلب مع المورد');

    /* 4 — بانتظار الوصول */
    const o4 = po({ customerId: 'cus_006', productId: 'prd_x6pro', variantId: 'var_x6p_256_yl',
         quantity: 1, status: 'PENDING', daysAgo: 6, expectedAt: isoIn(9) });
    step(o4, 'WAITING_ARRIVAL', 5, '');

    /* 5 — وصلت (مطابقة تلقائية) */
    const o5 = po({ customerId: 'cus_003', productId: 'prd_ip15', variantId: 'var_ip15_256_pk',
         quantity: 1, status: 'PENDING', daysAgo: 12, expectedAt: iso(2) });
    step(o5, 'WAITING_ARRIVAL', 11, '');
    const arrivedAt5 = step(o5, 'ARRIVED', 1, 'مطابقة تلقائية عند استلام البضاعة');
    o5.matchedAt = arrivedAt5;
    const stk5 = stock('var_ip15_256_pk', { daysAgo: 1 });
    o5.suggestedStockItemIds = [stk5.id];
    o5.matchInfo = {
      score: 100, confidence: 'EXACT',
      reasons: ['SKU', 'Variant', 'المنتج', 'الموديل', 'السعة', 'اللون'],
      at: arrivedAt5,
    };
    ev('PREORDER_MATCHED', {
      preOrderId: o5.id, code: o5.code, customerId: o5.customerId,
      customerName: 'زينب الحسيني', productName: 'iPhone 15', quantity: 1,
      stockItemIds: [stk5.id], score: 100, confidence: 'EXACT',
    }, arrivedAt5);
    notifications.push({
      id: U.uid('ntf'), type: 'PREORDER_MATCHED', severity: 'success',
      title: 'وصل منتج مطلوب مسبقًا',
      body: 'زينب الحسيني · iPhone 15 · 256GB وردي · الكمية 1',
      refType: 'preorder', refId: o5.id, at: arrivedAt5, read: false, audience: ['staff', 'manager'],
    });

    /* 6 — تم إشعار العميل */
    const o6 = po({ customerId: 'cus_004', productId: 'prd_note13p', variantId: 'var_n13p_128_pu',
         quantity: 1, status: 'PENDING', daysAgo: 15 });
    step(o6, 'WAITING_ARRIVAL', 14, '');
    step(o6, 'ARRIVED', 3, '');
    step(o6, 'CUSTOMER_NOTIFIED', 3, 'أُرسلت رسالة واتساب');
    o6.lastMessage = { channel: 'whatsapp', at: o6.notifiedAt, templateId: 'tpl_arrived', ref: 'wa_demo_1' };
    const stk6 = stock('var_n13p_128_pu', { daysAgo: 3 });
    o6.matchedAt = o6.arrivedAt;
    o6.suggestedStockItemIds = [stk6.id];
    o6.matchInfo = {
      score: 100, confidence: 'EXACT',
      reasons: ['SKU', 'Variant', 'المنتج', 'الموديل', 'السعة', 'اللون'],
      at: o6.arrivedAt,
    };

    /* 7 — محجوزة */
    const o7 = po({ customerId: 'cus_007', productId: 'prd_a55', variantId: 'var_a55_256_nv',
         quantity: 1, status: 'PENDING', daysAgo: 20, depositAmount: 100000 });
    step(o7, 'WAITING_ARRIVAL', 19, '');
    step(o7, 'ARRIVED', 5, '');
    step(o7, 'CUSTOMER_NOTIFIED', 5, '');
    step(o7, 'RESERVED', 4, 'حُجز الجهاز باسم العميل');
    const stk7 = stock('var_a55_256_nv', { daysAgo: 5, status: 'RESERVED' });
    stk7.preOrderId = o7.id;
    o7.stockItemIds = [stk7.id];
    o7.lastMessage = { channel: 'whatsapp', at: o7.notifiedAt, templateId: 'tpl_arrived', ref: 'wa_demo_2' };
    ev('PREORDER_RESERVED', { preOrderId: o7.id, code: o7.code, stockItemIds: [stk7.id] }, o7.updatedAt);

    /* 8 — تم بيعها */
    const o8 = po({ customerId: 'cus_001', productId: 'prd_note40p', variantId: 'var_n40p_256_gd',
         quantity: 1, status: 'PENDING', daysAgo: 32 });
    step(o8, 'WAITING_ARRIVAL', 31, '');
    step(o8, 'ARRIVED', 12, '');
    step(o8, 'CUSTOMER_NOTIFIED', 12, '');
    step(o8, 'RESERVED', 11, '');
    const soldAt = step(o8, 'SOLD', 10, 'تم البيع وتسليم الجهاز');
    const stk8 = stock('var_n40p_256_gd', { daysAgo: 12, status: 'SOLD' });
    stk8.preOrderId = o8.id;
    o8.stockItemIds = [stk8.id];
    const sale8 = {
      id: U.uid('sal'), code: 'INV-' + year + '-0001',
      preOrderId: o8.id, customerId: o8.customerId,
      items: [{ productId: o8.productId, variantId: o8.variantId, stockItemId: stk8.id, qty: 1, unitPrice: 310000 }],
      subtotal: 310000, discount: 10000, total: 300000,
      paymentMethod: 'CASH', createdAt: soldAt, createdBy: 'سفيان',
    };
    sales.push(sale8);
    o8.saleId = sale8.id;
    ev('PREORDER_SOLD', { preOrderId: o8.id, code: o8.code, saleId: sale8.id, total: 300000 }, soldAt);

    /* 9 — ملغاة */
    const o9 = po({ customerId: 'cus_002', productId: 'prd_airpods', variantId: 'var_airpods_w',
         quantity: 2, status: 'PENDING', daysAgo: 26 });
    step(o9, 'WAITING_ARRIVAL', 25, '');
    step(o9, 'CANCELLED', 18, 'العميل اشترى من مكان آخر');

    /* 10 — منتهية الصلاحية */
    const o10 = po({ customerId: 'cus_006', productId: 'prd_ip15pm', variantId: 'var_ip15pm_512_bt',
         quantity: 1, status: 'PENDING', daysAgo: 70, expiresAt: iso(10) });
    step(o10, 'WAITING_ARRIVAL', 69, '');
    step(o10, 'EXPIRED', 10, 'انتهت مدة الطلب دون توفر المنتج');

    /* ---------------- قوالب الرسائل ---------------- */
    const templates = [
      {
        id: 'tpl_arrived', name: 'وصول المنتج', channel: 'whatsapp', system: true,
        description: 'تُرسل فور وصول المنتج المطلوب مسبقًا.',
        body: 'مرحبًا {customer_name} 👋\nوصل طلبك المسبق إلى {store_name}:\n\n📱 {product_name} — {storage} / {color}\n🔢 الكمية: {quantity}\n🧾 رقم الطلب: {order_code}\n\nنحتفظ به لك لمدة 48 ساعة. تحب نحجزه باسمك؟',
      },
      {
        id: 'tpl_reserved', name: 'تأكيد الحجز', channel: 'whatsapp', system: true,
        description: 'تأكيد أن الجهاز محجوز باسم العميل.',
        body: 'أهلًا {customer_name} ✅\nحجزنا لك {product_name} ({storage} / {color}) باسمك.\nرقم الطلب: {order_code}\nالسعر: {price}\n\nبانتظارك في {store_name} — {store_address}',
      },
      {
        id: 'tpl_reminder', name: 'تذكير بالاستلام', channel: 'whatsapp', system: false,
        description: 'تذكير لطيف للعميل الذي لم يستلم بعد.',
        body: 'تذكير ودّي 🙂\n{customer_name}، ما زال {product_name} محجوزًا باسمك في {store_name}.\nرقم الطلب: {order_code}\nنرجو مراجعتنا خلال 24 ساعة حتى لا يُلغى الحجز.',
      },
      {
        id: 'tpl_delay', name: 'اعتذار عن التأخير', channel: 'whatsapp', system: false,
        description: 'إبلاغ العميل بتأجيل موعد الوصول.',
        body: 'مرحبًا {customer_name}،\nنعتذر عن تأخر وصول {product_name}.\nالموعد الجديد المتوقع: {expected_date}\nرقم الطلب: {order_code}\nشكرًا لصبرك 🌹',
      },
    ];

    /* ---------------- الإعدادات ---------------- */
    const settings = {
      storeName: 'مركز سفيان للهواتف',
      storeAddress: 'سامراء — الحويش — الشارع الرئيسي',
      currency: 'IQD',
      staffName: 'سفيان',
      defaultProvider: 'whatsapp',
      defaultTemplateId: 'tpl_arrived',
      preorderValidityDays: 30,
      matchThreshold: 55,
      autoAdvanceOnMatch: true,     // نقل الطلب تلقائيًا إلى "وصلت" عند المطابقة
      autoNotify: false,            // لا نرسل للعميل تلقائيًا — قرار الموظف
      theme: 'dark',
    };

    notifications.push({
      id: U.uid('ntf'), type: 'SYSTEM', severity: 'info',
      title: 'نظام الطلب المسبق جاهز',
      body: 'تم تحميل بيانات تجريبية. يمكنك حذفها من الإعدادات في أي وقت.',
      refType: null, refId: null, at: iso(0, 9), read: false, audience: ['manager'],
    });

    return {
      version: 1,
      settings,
      products,
      customers,
      stockItems,
      preOrders,
      sales,
      templates,
      events: events.sort((a, b) => (a.at < b.at ? 1 : -1)),
      notifications,
      outbox: [],
      counters: { preorder: poSeq, sale: 1 },
    };
  }

  ERP.seed = { build };
})(window);
