# الطلب المسبق — Pre-Order System

نظام مستقل داخل ERP لمتجر هواتف وإلكترونيات: يسجّل المنتجات التي يطلبها العملاء وغير متوفرة حاليًا،
ويتعرّف تلقائيًا على وصولها إلى المخزون، ثم ينبّه الموظفين والمدير، ويتيح الحجز والإشعار عبر واتساب
وإتمام البيع — مع الاحتفاظ بالعلاقة الكاملة بين الطلب والبيع.

**نسخة فانيلا:** HTML + CSS + JavaScript فقط. لا مكتبات، لا أدوات بناء، لا خادم.

---

## التشغيل

افتح `index.html` في المتصفح مباشرة. لا حاجة إلى أي تثبيت.

> البيانات تُحفظ في `localStorage` الخاص بالمتصفح. لتشغيل النظام على أكثر من جهاز
> استبدل طبقة `core/store.js` بواجهة API (انظر [الربط بخادم حقيقي](#الربط-بخادم-حقيقي)).

عند أول تشغيل تُحمَّل بيانات تجريبية (10 طلبات، 7 عملاء، 10 منتجات، مخزون، فاتورة).
يمكن حذفها من **الإعدادات → بدء من الصفر**.

---

## دورة حياة الطلب

```
PENDING ──► WAITING_ARRIVAL ──► ARRIVED ──► CUSTOMER_NOTIFIED ──► RESERVED ──► SOLD
   │               │               │                │                │
   └───────────────┴───────────────┴────────────────┴────────────────┘
                        CANCELLED  /  EXPIRED  ──► (إعادة فتح) PENDING
```

| الحالة | المعنى | الإجراء التالي المقترح |
|---|---|---|
| `PENDING` | سُجّل الطلب ولم يُطلب من المورد بعد | تأكيد الانتظار |
| `WAITING_ARRIVAL` | مطلوب من المورد | تسجيل الوصول (أو يتم تلقائيًا) |
| `ARRIVED` | وصل المنتج وطابق الطلب | إشعار العميل |
| `CUSTOMER_NOTIFIED` | أُبلغ العميل | حجز للعميل |
| `RESERVED` | قطعة فعلية محجوزة باسمه | إتمام البيع |
| `SOLD` | اكتمل — مرتبط بفاتورة | — |
| `CANCELLED` | أُلغي (يُفكّ الحجز تلقائيًا) | إعادة فتح |
| `EXPIRED` | انتهت مدة الصلاحية | إعادة فتح |

الانتقالات محكومة بجدول صريح في `domain/preorder.js` (`TRANSITIONS`)، وأي انتقال خارجه **يُرفض بخطأ**.
كل انتقال يُسجَّل في `order.history` وفي سجل الأحداث.

---

## المطابقة التلقائية مع المخزون

عند أي استلام بضاعة (`inventory.receive`) يعمل محرّك المطابقة على الطلبات المفتوحة.

**المعايير والأوزان** (`domain/matching.js`) — مجموعها 100 عند التطابق التام:

| المعيار | الوزن |
|---|---|
| SKU | 40 |
| Variant | 20 |
| Product | 15 |
| Model | 10 |
| Storage | 8 |
| Color | 7 |

- **بوابة:** لا تطابق إطلاقًا ما لم يتطابق المنتج أو الـ SKU (منتج مختلف = 0).
- **الحد الأدنى** قابل للضبط من الإعدادات (افتراضيًا 55).
- **الأولوية في التوزيع:** الطلب العاجل أولًا، ثم الأعلى تطابقًا، ثم الأقدم (FIFO).
- المطابقة **تقترح** القطع ولا تحجزها — الحجز قرار الموظف.

عند التطابق يُطلق الحدث:

```js
PREORDER_MATCHED {
  preOrderId, code, customerId, customerName, productName,
  storage, color, sku, quantity, matchedQuantity,
  stockItemIds, serials, score, confidence, reasons
}
```

ويظهر تنبيه **«وصل منتج مطلوب مسبقًا»** باسم العميل والمنتج والكمية، في:
لوحة الطلبات (Glass Panel علوية) + جرس الإشعارات + Toast + سجل الأحداث.

كذلك عند إنشاء طلب جديد لمنتج **متوفر أصلًا**، يُطابق فورًا (`matching.checkExistingStock`).

---

## الحجز و IMEI / Serial

`preorder.reserve(orderId, stockItemIds)` يتحقق من:

1. عدد القطع = كمية الطلب بالضبط.
2. كل قطعة `AVAILABLE` (أو مرتبطة بهذا الطلب مسبقًا).
3. الـ Variant مطابق للمطلوب.

المنتجات التي `tracksSerial = true` (الهواتف) يُربط بها **الجهاز الفعلي برقم IMEI**،
ويظهر الرقم في الطلب وفي الفاتورة. الإلغاء أو فك الحجز يعيد القطع إلى `AVAILABLE` تلقائيًا.

---

## واتساب — كمزوّد اتصال قابل للاستبدال

واتساب **ليس جزءًا من منطق العمل**. طبقة الاتصال (`providers/communication.js`) تسجّل مزوّدين بعقد موحّد:

```js
ERP.comm.register({
  id: 'sms',
  name: 'رسائل SMS',
  channel: 'sms',
  available() { return true; },
  async send({ to, text, meta }) {
    // نداء الـ API الخاص بك
    return { ref: 'sms:123', mode: 'api' };
  },
});
```

المزوّدون الجاهزون: `whatsapp` (رابط wa.me — بلا مفاتيح)، `copy` (نسخ للحافظة)، `log` (اختبار).

**الفصل يعمل هكذا:** الواجهة تنادي `messaging.sendForPreOrder()` → المزوّد يرسل → يُطلق `MESSAGE_SENT` →
نطاق الطلب المسبق يستمع للحدث وينقل الطلب من `ARRIVED` إلى `CUSTOMER_NOTIFIED`.
لا سطر واحد داخل `domain/` يعرف ما هو واتساب.

### القوالب والمتغيرات

قابلة للتعديل من شاشة **قوالب الرسائل**. المتغيرات المدعومة:

`{customer_name}` `{customer_phone}` `{product_name}` `{brand}` `{model}` `{storage}` `{color}`
`{variant}` `{sku}` `{quantity}` `{order_code}` `{order_date}` `{expected_date}` `{price}` `{total}`
`{deposit}` `{serial}` `{store_name}` `{store_address}` `{staff_name}`

---

## البيع

`sales.createFromPreOrder(preOrderId, { discount, paymentMethod, unitPrice })`:

- يشترط أن يكون الطلب `RESERVED`.
- ينشئ الفاتورة من القطع المحجوزة نفسها (بأرقام IMEI).
- يعلّم القطع `SOLD`، وينقل الطلب إلى `SOLD`.
- **العلاقة محفوظة في الاتجاهين:** `sale.preOrderId` ⇄ `preOrder.saleId`.

---

## البنية

```
erp/
├─ index.html
└─ assets/
   ├─ css/
   │  ├─ tokens.css        نظام التصميم: ألوان، مسافات، حركة، سمة داكنة/فاتحة
   │  ├─ base.css          تهيئة وأساسيات
   │  ├─ layout.css        الهيكل: شريط جانبي، شريط علوي، استجابة
   │  ├─ components.css    بطاقات، Glass، Chips، جداول، نوافذ، Toasts
   │  └─ views.css         أنماط الشاشات + تحويل الجدول إلى بطاقات على الجوال
   └─ js/
      ├─ core/             util · icons · bus · seed · store
      ├─ domain/           events · notifications · customers · preorder ·
      │                    matching · inventory · sales     ← منطق العمل
      ├─ providers/        templates · communication · whatsapp · mock
      └─ ui/               components · actions · app · views/*
```

**قاعدة معمارية:** `domain/` لا يستورد أي شيء من `ui/` أو `providers/`.
التواصل بينها عبر `core/bus.js` (أحداث) فقط.

### الأحداث

`PREORDER_CREATED` · `PREORDER_STATUS_CHANGED` · `PREORDER_MATCHED` · `PREORDER_RESERVED` ·
`PREORDER_RELEASED` · `PREORDER_NOTIFIED` · `PREORDER_SOLD` · `PREORDER_CANCELLED` ·
`PREORDER_EXPIRED` · `INVENTORY_RECEIVED` · `STOCK_RESERVED` · `STOCK_RELEASED` · `STOCK_SOLD` ·
`MESSAGE_SENT` · `MESSAGE_FAILED` · `SALE_CREATED` · `CUSTOMER_CREATED` · `TEMPLATE_UPDATED`

جميعها ظاهرة في شاشة **سجل الأحداث** وقابلة للتصدير CSV.

---

## الربط بخادم حقيقي

النظام مصمّم ليُربط دون إعادة كتابة:

1. **البيانات:** `core/store.js` هو نقطة الوصول الوحيدة للحالة.
   استبدل `load/persist` بنداءات REST، أو أبقِ الحالة محليًا وزامنها.
2. **المخزون:** نادِ `ERP.inventory.receive(...)` من أي مكان يدخل فيه المخزون فعليًا
   (فاتورة شراء، مسح باركود، API المورد) — المطابقة والتنبيهات ستعمل تلقائيًا.
3. **الإشعارات:** استمع للأحداث من خارج الواجهة:
   ```js
   ERP.bus.on('event:PREORDER_MATCHED', (ev) => fetch('/api/notify', {
     method: 'POST', body: JSON.stringify(ev.payload),
   }));
   ```
4. **المبيعات:** إن كان لديك نظام فواتير، استبدل `domain/sales.js` مع الحفاظ على
   حقلي `preOrderId` / `saleId` لتبقى العلاقة قائمة.

---

## الاختصارات

| المفتاح | الإجراء |
|---|---|
| `N` | طلب مسبق جديد |
| `/` | البحث في الطلبات |
| `Ctrl/⌘ + K` | لوحة الأوامر (بحث شامل + تنقّل) |
| `Esc` | إغلاق النافذة أو اللوحة |
| `Enter` | فتح تفاصيل الطلب المحدد |

---

## التصميم

لغة تصميم أصلية: بطاقات صلبة للمعلومات، وزجاج (Glass) للطبقات التي تعلو المحتوى فقط —
الشريط الجانبي، الشريط العلوي، النوافذ، لوحة التفاصيل، وتنبيه الوصول.

- **الحركة:** 110–280ms، هادئة وهادفة (Fade / Scale / Blur / Spring خفيف)، وتحترم `prefers-reduced-motion`.
- **الوصولية:** تنقّل كامل بلوحة المفاتيح، حبس التركيز داخل النوافذ، `aria-*` على الحالات والجداول،
  حلقات تركيز واضحة، ومنطقة `aria-live` للتنبيهات.
- **الاستجابة:** Desktop أولًا (شريط جانبي كامل) ← Tablet (شريط أيقونات + شبكة 3×3)
  ← Mobile (شريط سفلي + بطاقات مؤشرات أفقية + تحويل الجدول إلى بطاقات).
- **السمتان:** داكنة وفاتحة، تُبدَّل من الشريط العلوي وتُحفظ.
