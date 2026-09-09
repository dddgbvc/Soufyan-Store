# مطبوعات مكتب سفيان للموبايل

ستيكرات ووصولات **بمقاسها الحقيقي — طباعة مباشرة ١:١** بلا تحجيم، جاهزة للربط بالبرنامج.
بلا أي مكتبة خارجية: الباركود والخطوط والقوالب كلها داخل الحزمة.

افتح `index.html` لتشوف كل شيء.

---

## المقاسات

### الستيكرات

| المفتاح | الستيكر | المقاس |
|---|---|---|
| `sticker.service` | ستيكر الصيانة — يُلصق على الجهاز عند الاستلام | **90 × 50 مم** |
| `sticker.phone` | ستيكر الموبايلات — بيانات الجهاز كاملة | **75 × 50 مم** |
| `sticker.accessory` | ستيكر الإكسسوارات — المقاس المعتمد | **50 × 30 مم** |
| `sticker.box` | ستيكر العلب | **60 × 40 مم** |
| `sticker.small` | ستيكر القطع الصغيرة | **40 × 25 مم** |
| `sticker.void` | **ستيكر قابل للكسر** — الكفالة | **25 × 15 مم** |
| `sticker.voidRound` | ستيكر قابل للكسر — دائري | **Ø 20 مم** |
| `sticker.logoRound` | ستيكر الشعار الدائري | **Ø 54 مم** |
| `sticker.badge` | شارة — كفالة سنة · تم الفحص · شكراً لطلبك | **Ø 40 مم** |
| `sticker.bar` | شريط واتساب / الاسم | **80 × 25 مم** |
| `sticker.icon` | أيقونة صغيرة | **20 × 20 مم** |
| `sticker.price` | ملصق السعر | **54 × 29 مم** |
| `sticker.seal` | شريط الختم — مغلق بإحكام | **170 × 14 مم** |

### الوصولات الحرارية

| المفتاح | الوصل | المقاس |
|---|---|---|
| `thermal.serviceCustomer` | وصل صيانة — نسخة الزبون | **80 مم × طول متغيّر** |
| `thermal.serviceShop` | وصل صيانة — نسخة المحل (بتواقيع) | **80 مم × طول متغيّر** |
| `thermal.sale` | فاتورة بيع جهاز | **80 مم × طول متغيّر** |

> مساحة الطباعة الفعلية على رول 80 مم هي **72 مم** — والقالب مضبوط عليها.
> الوصولات **أسود على أبيض فقط**، بلا ألوان ولا تدرّجات، لأن الطابعة الحرارية أحادية اللون.

---

## الربط بالبرنامج

```html
<link rel="stylesheet" href="assets/sufyan-print.css">
<script src="assets/sufyan-print.js"></script>
```

```js
// 1) طباعة مباشرة بالمقاس الصحيح
SufyanPrint.print("sticker.phone", {
  name: "Samsung Galaxy A54",
  price: 385000,
  storage: "128GB · 8GB RAM",
  color: "أسود",
  imei: "356938035643809",
  battery: "92%",
  condition: "مستعمل — ممتاز",
  notes: "خدش بسيط بزاوية الشاشة",
  sku: "SFN-PH-1042"          // يذهب للباركود
});

// 2) دفعة كاملة — كل ستيكر بصفحة مستقلة
SufyanPrint.printMany("sticker.accessory", [
  { name: "شاحن سريع 33W", price: 18000, sku: "SFN-AC-2210" },
  { name: "كيبل Type-C",   price: 7500,  sku: "SFN-AC-2211" }
]);

// 3) HTML فقط — إذا تريد تتحكم بالعرض بنفسك
element.innerHTML = SufyanPrint.html("thermal.sale", order);

// 4) تركيب مباشر داخل عنصر
SufyanPrint.mount("#preview", "sticker.service", ticket);
```

أي حقل تتركه فارغاً **يُحذف صفّه كلياً** — ما يطلع سطر فاضي.

### الحقول

```js
"sticker.service"   → { code, customer, phone, device, imei, fault, shopPhone }
"sticker.phone"     → { name, price, storage, color, imei, battery, condition, notes, sku }
"sticker.accessory" → { name, spec, price, sku }        // ونفسها للعلب والقطع الصغيرة
"sticker.void"      → { note, serial }
"sticker.badge"     → { text, icon: "shield"|"check"|"heart", bg, fg }
"sticker.bar"       → { label, sub, variant: "light" }
"sticker.price"     → { label, price, variant: "dark" }
"sticker.icon"      → { shape: "square"|"round", tone: "deep"|"teal"|"gold"|"light" }

"thermal.serviceCustomer" / "thermal.serviceShop" → {
  code, date, staff, customer, phone, device, imei, lock, accessories,
  faults: [], description, due, estimate, paid, rest?   // rest يُحسب تلقائياً
}

"thermal.sale" → {
  code, date, customer, phone, staff,
  items: [{ name, detail, price, qty }],
  discount, paid, subtotal?, total?, rest?,             // تُحسب تلقائياً
  imei, warranty
}
```

### تعديل بيانات المحل

كلها في مكان واحد أعلى `assets/sufyan-print.js`:

```js
var SHOP = { name, latin, address, phone1, phone2, net, hours };
```

---

## الباركود

مولّد **Code 128** كامل داخل `sufyan-print.js` — بلا مكتبة ولا إنترنت.
يختار ترميز C تلقائياً للأرقام الصِرفة الزوجية (أقصر وأوضح)، وإلا يستخدم B.
مُتحقَّق منه: 107 نمط، كل نمط 11 وحدة (13 للـ STOP)، بلا تكرار.

```js
SufyanPrint.barcode("SFN-01427")   // → نص SVG
```

---

## ملاحظات الطباعة

**المقاس ١:١** — كل صفحة معاينة تحمل قاعدة `@page` مطابقة لمقاسها،
و`SufyanPrint.print()` يحقن نفس القاعدة. في نافذة الطباعة:

- الهوامش: **بلا هوامش (None)**
- التحجيم: **100%** — لا «ملاءمة الصفحة» ولا «Fit to page»
- فعّل **طباعة ألوان/صور الخلفية** للستيكرات الملوّنة

**الورق:**

| الستيكر | الورق |
|---|---|
| الصيانة · الهاتف · الإكسسوارات · العلب · القطع الصغيرة | رول لاصق حراري أو ورق لاصق مطفي |
| الشعار · الشارات · الشريط · الأيقونة · السعر · الختم | ورق لاصق مطفي |
| **القابل للكسر** | **ورق قابل للكسر (Eggshell) أو بولستر VOID — إجباري** |

> الستيكر القابل للكسر يعمل بخاصية **الورق** لا بالتصميم: الورق العادي يُنزع سليماً
> فيسقط الغرض منه. اطلبه من المطبعة باسم **Eggshell / Destructible Vinyl**،
> أو **VOID Polyester** الذي يترك كلمة VOID على الجهاز عند النزع.

---

## البنية

```
assets/
  sufyan-print.css     نظام المطبوعات — كل المقاسات بالمليمتر
  sufyan-print.js      القوالب + مولّد Code 128 + الطباعة
  fonts/               خط ثمانية Sans — 5 أوزان
stickers/*.html        معاينة وطباعة مباشرة لكل ستيكر
thermal/*.html         معاينة وطباعة الوصولات الحرارية
index.html             الفهرس
```

الألوان من دليل الهوية: `#14343F` · `#C8A96A` · `#F2EDE4` · `#2F6F6B`.
الرمز مطابق للشعار المصحَّح — ثلاثة أعمدة بلا قاعدة.
