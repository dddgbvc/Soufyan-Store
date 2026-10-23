# قوالب الطباعة — مكتب سفيان للموبايل

ستيكرات (أبيض وأسود) ووصولات حرارية 80mm بخط المسيري، كقوالب برمجية يملأها البرنامج بالبيانات ويطبعها.

| المفتاح | القالب | المقاس |
|---|---|---|
| `phone_sticker` | ستيكر هاتف | 75×50 |
| `repair_sticker` | ستيكر صيانة | 90×50 |
| `product_sticker_l` / `_m` / `_s` | ستيكر منتجات | 60×40 / 50×30 / 40×25 |
| `receipt_sale` | وصل بيع | 80mm |
| `receipt_payment` | وصل قبض وديون | 80mm |
| `receipt_repair` | وصل صيانة — نسخة الزبون | 80mm |
| `receipt_return` | وصل مرتجعات | 80mm |

## الاستدعاء من البرنامج

```js
// من سوبابيس (نفس جلسة الموظف المستخدمة بباقي دوال البرنامج)
const { data: bundle } = await supabase.rpc('print_templates_get', { p_session_id: sessionId });
// أو بدون إنترنت: const bundle = require('./print-templates/dist/print-templates.json');

const html = SufyanPrint.render(bundle, 'receipt_sale', {
  number: 'SFN-B-00318', date: '2026-09-09 18:05', customer: 'مصطفى كريم',
  items: [{ name: 'Samsung Galaxy A54', detail: '128GB · أسود', amount: 385000 }],
  total: 385000,
}, { autoPrint: true });
// افتح html بنافذة (iframe أو window) — تنطبع تلقائياً بمقاس القالب
```

- `render.js` يشتغل بالمتصفح (`SufyanPrint`) وبـ Node/Electron (`require`).
- الحقول المطلوبة لكل قالب موجودة بـ `fields`، ومثال كامل بـ `sample`.
- الأرقام تنكتب بفواصل تلقائياً، والحقل الفارغ ينخفي سطره.
- الخط: يحمّل El Messiri من Google Fonts. بدون إنترنت مرّر `{ fontsCss: 'print-templates/fonts/fonts.css' }`.
- الباركود Code128 يتولد داخل القالب بدون أي مكتبة خارجية.

## التعديل

1. عدّل الملفات تحت `src/` (القوالب، `base.css`، `base.js`، `templates.json`).
2. شغّل `node print-templates/build.mjs` — يحدّث `dist/` و `supabase/seed_print_templates.sql`.
3. افتح `dist/preview.html` للمعاينة.
4. طبّق `supabase/seed_print_templates.sql` على سوبابيس (يحدّث الصفوف الموجودة).

بسوبابيس: صفوف `tenant_id = null` هي القوالب الافتراضية؛ أي متجر يگدر يضيف صف بنفس `key` يغطي عليها.
