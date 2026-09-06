# `@sufyan/print` — الفواتير والوصولات والملصقات بصيغة TypeScript

كل مطبوعات مكتب سفيان للموبايل كدوال TypeScript صافية: تمرّر بيانات
موصوفة بأنواع، ويرجع لك `PrintableDoc` — جسم HTML وقواعد CSS بمقاسات
المليمتر الصحيحة. لا شيء يُطبع من تلقاء نفسه.

---

## المطبوعات

| الدالة | المقاس | الملف |
|---|---|---|
| `serviceTicketA5` | 148 × 210 مم | `service-ticket.ts` |
| `serviceReceipt80` | رول حراري 80 مم | `service-ticket.ts` |
| `deviceLabel` | 90 × 50 مم | `service-ticket.ts` |
| `invoiceThermal80` | رول حراري 80 مم | `invoice.ts` |
| `invoiceA5` | 148 × 210 مم | `invoice.ts` |
| `labelSheet` | A4 — عدد نسخ | `labels.ts` |
| `singleLabel` | مقاس الملصق نفسه | `labels.ts` |

المقاسان المعتمدان للملصقات: **الهاتف 75 × 50 مم** بمواصفات الجهاز،
و**الإكسسوارات 50 × 30 مم** اسمًا وسعرًا وباركود فقط.

---

## الاستعمال

```ts
import {
  invoiceThermal80, invoiceA5, printDocument, renderDocument,
  invoiceNo, today,
} from '@sufyan/print';

const invoice = {
  no: invoiceNo(318),                       // SFN-INV-00318
  customer: 'أحمد عبد الله حسين',
  phone: '0771 234 5678',
  items: [
    { name: 'Samsung Galaxy A54 — 256GB أسود', qty: 1, price: 385_000,
      imei: '356938035643809' },
    { name: 'شاحن سريع 25W', qty: 2, price: 15_000 },
  ],
  discount: 10_000,
  payment: 'نقدًا' as const,
  seller: 'سفيان',
  date: today(),
};

printDocument(invoiceThermal80(invoice));   // في المتصفّح
const html = renderDocument(invoiceA5(invoice));  // على الخادم — احفظه أو حوّله PDF
```

ملصق هاتف:

```ts
import { singleLabel, labelSheet, sku } from '@sufyan/print';

printDocument(singleLabel({
  kind: 'phone',
  name: 'Samsung Galaxy A54 5G',
  price: 385_000,
  sku: sku('PH', 1043),
  model: 'SM-A546E/DS',
  imei: '356938035643809',
  storage: '8GB / 256GB',
  color: 'أسود',
  battery: '100%',
  condition: 'جديد بالكارتون',
  notes: 'ضمان 6 أشهر · مع الشاحن',
}));                                        // 75 × 50 مم افتراضيًا

printDocument(labelSheet({
  kind: 'accessory', name: 'سماعة بلوتوث لاسلكية',
  price: 18_000, sku: sku('AC', 2210),
}, 24));                                    // شيت A4 · 24 ملصق 50 × 30 مم
```

وصل صيانة:

```ts
import { serviceReceipt80, deviceLabel, ticketNo } from '@sufyan/print';

const ticket = {
  no: ticketNo(1427),
  customer: 'أحمد عبد الله حسين',
  phone: '0771 234 5678',
  device: 'Samsung Galaxy A54',
  imei: '356938035643809',
  faults: ['شاشة', 'شحن'] as const,
  dateIn: today(),
  cost: 85_000,
  paid: 25_000,
};

printDocument(serviceReceipt80(ticket));
printDocument(deviceLabel(ticket));
```

---

## قواعد ثابتة في التصميم

- **المجاميع تُشتق ولا تُمرَّر.** `totals()` تحسب المجموع الفرعي والخصم
  والإجمالي والمتبقّي من الأسطر، فلا تفترق الفاتورة المطبوعة عن المحفوظة.
  الخصم لا يتجاوز المجموع الفرعي، و`paid: undefined` تعني «مسدّدة بالكامل».
- **`fill="none"` خاصية عرض على كل مسار في الشعار** — لا في CSS: محوّلات
  مثل كانفا لا تورّث `fill` من عنصر `<svg>` فتملأ منحنى القاعدة بالأسود.
- **الرول الحراري أسود على أبيض فقط.** الطابعة أحادية اللون، فأُزيلت كل
  ألوان الهوية من مطبوعاتها وصارت الفواصل خطوطًا صريحة.
- **الأرقام اللاتينية داخل `dir="ltr"`.** بدونها ينقلب ترتيب الرقمين داخل
  التدفّق العربي.
- **تسلسلان مستقلّان:** `SFN-00001` للوصولات و`SFN-INV-00001` للفواتير،
  حتى لا تختلط المراجعة.

---

## الباركود

`code128.ts` مولّد **Code 128** من الصفر بلا اعتماديات. يختار النمط C
تلقائيًا للنصوص الرقمية ذات الطول الزوجي (ضِعف الكثافة) والنمط B لغيرها،
ويرمي `RangeError` على أي محرف خارج ASCII القابل للطباعة. مجموع التدقيق
مُتحقَّق منه مقابل القيم المنشورة: `CODE128` → 26.

```ts
import { Code128 } from '@sufyan/print';

Code128.svg('SFN-INV-00318', { height: 56, module: 2, fontSize: 12 });
Code128.encode('CODE128');   // [104, 35, 47, 36, 37, 17, 18, 24, 26, 106]
```

---

## البناء

```bash
cd brand/ts
tsc                 # يبني dist/ مع ملفات الأنواع .d.ts
tsc --noEmit        # فحص الأنواع فقط
node demo/render.mjs   # يولّد نماذج HTML في demo/out/ للمعاينة
```

يُبنى تحت `strict` و`noUncheckedIndexedAccess` بلا أي تحذير.

---

## الملفات

```
ts/
├── src/
│   ├── types.ts           الأنواع والواجهات — ابدأ من هنا
│   ├── shop.ts            بيانات المحل، الألوان، الشعار، حساب المجاميع
│   ├── code128.ts         مولّد الباركود
│   ├── service-ticket.ts  وصل A5 · وصل حراري · ستيكر الجهاز
│   ├── invoice.ts         فاتورة حرارية · فاتورة A5
│   ├── labels.ts          ملصقات الهاتف والإكسسوارات
│   ├── print.ts           بناء المستند الكامل والطباعة
│   └── index.ts           التصدير الموحّد
└── demo/render.mjs        يولّد نموذجًا من كل مطبوع
```

نفس المنطق مدمج داخل `index.html` بلا وحدات (ES5) ليعمل مباشرة في
المتصفّح؛ هذه الحزمة هي نسخته المكتوبة بأنواع لأي مشروع لاحق.
