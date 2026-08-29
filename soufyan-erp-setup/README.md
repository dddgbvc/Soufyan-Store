# الإعداد الأولي — نظام إدارة متجر الهواتف
**Initial Setup Wizard — Mobile Store ERP**

معالج إعداد كامل من 18 خطوة ضمن 4 مراحل، مبنيّ خصيصًا لمتاجر الهواتف: أجهزة بأرقام IMEI،
موظفون بصلاحيات دقيقة، فواتير A4 وحرارية 80mm. عربي أولًا (RTL) مع الإنجليزية كلغة ثانية.

---

## التشغيل

افتح **`index.html`** مباشرة في المتصفح — بنقرة مزدوجة. لا يحتاج تثبيتًا ولا خادمًا ولا أي تبعيات.

للتشغيل عبر خادم محلي (يُفضَّل عند استبدال ملفات SVG لأنه يسمح بتضمينها وتحريك طبقاتها):

```bash
python3 -m http.server 8080
# ثم افتح  http://localhost:8080/
```

---

## المحتويات

```
index.html                    ← التطبيق كاملًا (HTML + CSS + JS + مسرح ثلاثي الأبعاد)
vendor/                       ← Three.js · GSAP · Motion — محليًا، بلا إنترنت وبلا خطوة بناء
assets/setup/*.svg            ← 18 رسمة بديلة، اسم لكل خطوة (قابلة للاستبدال)
tools/build-illustrations.mjs ← مولّد رسوم SVG (خامة واحدة، إضاءة واحدة، لوحة زرقاء واحدة)
tools/embed-assets.mjs        ← يضمّن الرسوم داخل index.html كنسخة احتياطية
```

---

## المراحل والخطوات

| المرحلة | الخطوات |
|---|---|
| **01 — الهوية** | ترحيب · ملف المتجر · حساب المالك · توثيق البريد (OTP) · الحماية |
| **02 — إعداد المتجر** | نشاط المتجر · المخزون و IMEI · المنتجات · المبيعات · الزبائن والديون |
| **03 — الفريق** | الموظفون · توثيق الموظفين (OTP) · الأدوار والصلاحيات |
| **04 — النظام** | الفواتير والطباعة · التفضيلات · المراجعة · التهيئة · الاكتمال |

---

## محرّكات الحركة

ثلاث مكتبات مضمّنة محليًا في `vendor/` — لكل واحدة دور محدّد، بلا تحميل من الإنترنت وبلا خطوة بناء:

| المكتبة | الدور | الإصدار والرخصة |
|---|---|---|
| **Three.js** | مسرح الرسوم ثلاثي الأبعاد: مجسّمات طين مطفي بكاميرا وإضاءة وخامة موحّدة، مشهد لكل خطوة | r149 · MIT |
| **GSAP** | التوقيت والتتابع: انتقال الخطوات، أشرطة المراحل، تتابع مهام التهيئة، كنس نجاح رمز OTP، عدّادات الشاشة الأخيرة، وقيادة انتقالات المشهد ثلاثي الأبعاد | 3.13 · [رخصة GSAP القياسية](https://gsap.com/standard-license) |
| **Motion** | نوابض التفاعل: ضغط الأزرار، اختيار البطاقات، مقبض المفاتيح، فتح الحوارات والتنبيهات، وظهور أقسام المراجعة عبر `inView` | 10.18 · MIT |

**ملاحظة عن Framer Motion:** المكتبة المعروفة بهذا الاسم تعمل داخل React حصرًا، وهذا المشروع
بلا إطار عمل. لذلك استُخدمت **Motion** (`motion.dev`) وهي المكتبة الرسمية بلغة JavaScript الصِرفة
من الفريق نفسه وبالمحرّك الفيزيائي نفسه. لو انتقل النظام إلى React لاحقًا، يمكن استبدالها
بـ `framer-motion` مباشرة لأن مفاهيم النوابض متطابقة.

### وضع الرسم

```js
window.SETUP_CONFIG = { illustration: "svg" };   // "svg" | "3d" | "auto"
```

* `svg` (الافتراضي): **نظام الرسوم الحيّة** — يُدرَج ملف SVG داخل الصفحة وتُقاد طبقاته
  بخط زمني واحد. هذا هو الوضع الذي بُنيت عليه التجربة.
* `3d`: يفرض المشهد ثلاثي الأبعاد متى توفّر WebGL.
* `auto`: ثلاثي الأبعاد إن توفّر، وإلا الرسوم الحيّة.

---

## نظام الرسوم الحيّة — LiveSVG

الرسمة ليست صورة. عند عرض أي خطوة يُدرَج ملف SVG داخل الصفحة، وتُفهرَس طبقاته
(`data-layer`)، ويقودها متحكّم واحد بدل ثمانية عشر نظام حركة منفصل:

```js
ERPSetup.illustration.setIllustrationState("processing");   // idle · enter · active
ERPSetup.illustration.triggerShake("otp-dots");             // interaction · processing
ERPSetup.illustration.triggerSuccess();                     // success · error · exit
ERPSetup.illustration.triggerProcessing();
ERPSetup.illustration.triggerAttention("shield");
ERPSetup.illustration.el.otp(3, 6);        // تقدّم إدخال الرمز
ERPSetup.illustration.el.progress(0.42);   // شريط التهيئة داخل الرسمة
ERPSetup.illustration.el.scan("boxes", true);   // مسح IMEI
```

| السلوك | التنفيذ |
|---|---|
| **حركة محيطة** | المشهد يتنفّس، الظل يجاريه، الأشكال تنجرف، البريق يومض — بلا تحريك كل شيء |
| **دوران مستمر** | خط زمني **دائم** بتوقيت خطّي يكمل 0°→360° ويستأنف بلا قفزة. تغيّر الحالة يعدّل `timeScale` فقط ولا يقطع الدورة |
| **دخول/خروج** | الرسمة السابقة تخرج قبل استبدالها، والجديدة تدخل بتتابع على الطبقات — لا تلاشٍ مجرّد |
| **تفاعل** | التركيز يرفع البطل، الكتابة تنبض، البريد الصحيح ينتقل إلى حالة الجاهزية |
| **نجاح** | حلقة تُرسم 360° ثم تُكتب علامة الصح بـ `stroke-dashoffset` ثم نبضة |
| **خطأ** | ‎-8 +8 -6 +6 -3 +3 0 على الطبقة المعنيّة وحدها: القفل للـ PIN، خانات الرمز للـ OTP، الظرف للبريد |
| **تقليل الحركة** | `prefers-reduced-motion` يوقف الحركة ويُبقي النجاح والخطأ مقروءين |

الدوران يُعلَن داخل ملف SVG نفسه، فأي رسمة بديلة تشترك في السلوك:

```xml
<g id="orbit" data-layer="orbit" data-spin="16" data-spin-origin="240 152">
```

`data-spin` زمن الدورة بالثواني، و`data-spin-origin` مركز الدوران بإحداثيات `viewBox`.

### التدرّج الآمن

| الحالة | النتيجة |
|---|---|
| حذف مجلد `vendor/` كاملًا | يعمل كل شيء بحركات CSS ورسوم SVG |
| لا يوجد WebGL | عودة تلقائية إلى رسوم SVG |
| `prefers-reduced-motion` | إيقاف المشهد ثلاثي الأبعاد وكل الحركات، وعرض ساكن |
| تجمّد إطار الرسم (تبويب مخفي) | التنقّل بين الخطوات مضمون بمهلة حارسة لا تعتمد على الحركة |

الدورة لكل خطوة: `enter → idle → processing → success / error`، ويقودها GSAP على المشهد
ثلاثي الأبعاد وعلى حاوية SVG بالتساوي.

---

## استبدال الرسوم (SVG)

ضع ملفك في `assets/setup/` بنفس الاسم — دون أي تعديل على الصفحة:

```
welcome.svg  store.svg   owner.svg      email-otp.svg  security.svg  business.svg
inventory.svg products.svg sales.svg    customers.svg  employees.svg employee-otp.svg
permissions.svg invoices.svg preferences.svg review.svg preparing.svg complete.svg
```

* الحاوية ثابتة الأبعاد (نسبة 4:3)، فلا يتغيّر التخطيط سواء وُجد الملف أو لم يوجد.
* عند غياب الملف: تُستخدم النسخة المضمّنة داخل `index.html`، وإن غابت أيضًا يظهر مربّع محايد بنفس المقاس.
* الطبقات الجاهزة للتحريك تحمل `id` و`data-layer`:
  `phone-body · phone-screen · camera · buttons · check · shield · lock · envelope · otp-dots ·
  boxes · coin · receipt · orbit · progress · modules · sparkles · abstract-shapes · shadow`
* `otp-dots` يُستكمل وقت التركيب: أي خانة بلا نقطة تُنشأ لها نقطة، فيتبع الرسم الإدخال رقمًا برقم.
* `check` إن حمل مسارًا بـ `fill="none"` وحدًّا، رُسمت العلامة بطول المسار نفسه.
* دورة الحركة لكل خطوة: `enter → idle ⇄ active/interaction → processing → success / error → exit`.
  الحركة تحترم `prefers-reduced-motion`، وتُقتل الخطوط الزمنية عند مغادرة الخطوة.

بعد تعديل الرسوم، لتحديث النسخة المضمّنة:

```bash
node tools/build-illustrations.mjs   # لإعادة توليد الرسوم الافتراضية (اختياري)
node tools/embed-assets.mjs          # لتضمين ما في assets/setup داخل index.html
```

---

## قالب الفاتورة — من Supabase، لا مُعاد تصميمه

الفاتورة المعروضة في خطوة **الفواتير** وفي **المراجعة** ليست معاينة مرسومة داخل
الصفحة. هي قالب الفاتورة نفسه الذي يطبع فواتير المحل في الإنتاج، يُولَّد على
Supabase ويعود PDF مملوءًا ببيانات هذا المعالج.

```
حالة الإعداد ──▶ POST /functions/v1/setup-invoice ──▶ buildInvoice + buildDocumentPdf ──▶ PDF
```

* الدالة `setup-invoice` **تستورد** القالب من `docgen` مثبَّتًا على نفس الـ commit
  المنشور منه (`documents.ts` و`pdf.ts`)، فلا توجد نسخة ثانية من القالب ولا تصميم بديل.
* الدالة لا تقرأ بيانات ولا تكتب شيئًا ولا تحمل مفتاح خدمة — هي عرض صِرف.
  مصدرها في هذا المستودع تحت `supabase/functions/setup-invoice/`.
* ما ينتقل من المعالج إلى القالب: اسم المتجر · الفرع · العنوان · الهواتف · التذييل ·
  رقم الفاتورة (البادئة + بداية الترقيم) · اسم المالك كبائع · بيانات الزبون إن فُعّلت ·
  أرقام IMEI إن كان التتبّع والإظهار مفعّلين · الخصم بحدّ الخصم المسموح · نوع الدفع
  حسب تفعيل البيع الآجل · مدّة الكفالة.
* **عند تعذّر الوصول تظهر حالة خطأ صريحة مع إعادة محاولة.** لا تُستبدل الفاتورة
  بتصميم بديل في أي حال.

الضبط:

```js
window.SETUP_CONFIG = {
  supabaseUrl     : "https://<project>.supabase.co",
  supabaseAnonKey : "<المفتاح العلني anon>",   // علني بطبيعته — لا مفتاح خدمة في الواجهة
  invoiceFunction : "setup-invoice"
};
```

الرسالة الوحيدة التي لا يغطّيها القالب الحالي: القالب يطبع المبالغ بالدينار العراقي
(`د.ع`) وبمقاس A4. العملة المختارة في الإعداد تُمرَّر إلى القالب ضمن ملاحظات الفاتورة،
ولم يُعدَّل القالب لأن تعديله خارج نطاق هذا العمل.

على الهواتف التي لا تعرض PDF داخل الصفحة يظهر زر «فتح الفاتورة» بدل إطار مكسور.

---

## الربط بخادم حقيقي

المعالج يعمل الآن في **وضع محلي بلا خادم**: التحقق يجري داخل المتصفح لتجربة الواجهة فقط،
ويُعلَن ذلك بوضوح في الشاشة وفي ملخّص الإعداد وفي الملف المُصدَّر (`method: "local-demo"`).
**ليس توثيقًا حقيقيًا** ولا يُعتمد عليه في التشغيل الفعلي.

لوصل الخادم، أضف قبل نهاية `<body>` (أو عدّل `CONFIG` في أعلى السكربت):

```html
<script>
  window.SETUP_CONFIG = {
    apiBaseUrl : "https://api.example.com",  // بمجرد ضبطه يتوقف الوضع المحلي تمامًا
    appEntryUrl: "/app"                      // وجهة زر «دخول إلى النظام»
  };
</script>
```

نقاط النهاية المتوقّعة (JSON، وطريقة POST):

| المسار | الطلب | الرد |
|---|---|---|
| `/setup/otp/send` | `{email, scope}` | `{expiresIn}` |
| `/setup/otp/verify` | `{email, code, scope}` | `{verified:true}` · `400/401` رمز خاطئ · `410` منتهي |
| `/setup/passkey/challenge` | `{email}` | `PublicKeyCredentialCreationOptions` بترميز base64url |
| `/setup/passkey/register` | بيانات الاعتماد | `{ok:true}` |
| `/setup/provision` | `{task, payload}` | `{ok:true}` |

`scope` يساوي `"owner"` لحساب المالك و`"employee:<id>"` للموظف.
مهام `provision` بالترتيب: `workspace · store · permissions · inventory · products · defaults · finalize`.

**PassKey و QR:** لا يظهران فعّالين إلا إذا كان الخادم مضبوطًا (و`PublicKeyCredential` مدعومًا للـ PassKey)؛
وبغير ذلك يظهران معطّلين مع سبب واضح، بلا أي محاكاة.

---

## الأمان

* **لا تُخزَّن كلمة المرور ولا رموز PIN في المتصفح إطلاقًا** — تبقى في ذاكرة الصفحة حتى نهاية الإعداد،
  وبعد أي تحديث للصفحة يُطلب إدخالها من جديد بدل ادّعاء أنها مضبوطة.
* لا تُسجَّل الأسرار ولا رموز OTP في الـ console ولا في الملف المُصدَّر.
* الموظف لا يصبح **نشطًا** قبل توثيق بريده فعليًا؛ الحالة مشتقّة لا تُكتب يدويًا.
* حذف الموظف يُبقي مرجعًا مؤرشفًا، والتعطيل هو الخيار المقترح للحفاظ على السجلات.

## الحالة والاستمرارية

تُحفظ الحالة في `localStorage` تحت `soufyan.erp.setup.v1` وتصمد أمام: التالي، رجوع، تحديث الصفحة،
والعودة إلى خطوة سابقة من شاشة المراجعة. وفي الوضع المحلي تُكتب مخرجات التهيئة تحت `soufyan.erp.*`
(`workspace · store · permissions · inventory · catalog · defaults · config · setup_completed`).

يُطلق زر «دخول إلى النظام» الحدث `erp:setup-complete` ومعه ملف الإعداد كاملًا (بلا أسرار):

```js
window.addEventListener("erp:setup-complete", e => console.log(e.detail));
```

كما تتاح الواجهة البرمجية `window.ERPSetup` (`state · wizard · employees · permissions · services · config`).

## الوصولية و RTL

تنقّل كامل بلوحة المفاتيح، مؤشّر تركيز ظاهر، حصر التركيز داخل الحوارات، `aria-live` للإعلانات،
أدوار ARIA على الاختيارات والمفاتيح وحقول OTP، دعم `prefers-reduced-motion`، ومظهر فاتح/داكن/حسب النظام.
البناء RTL أولًا عبر الخصائص المنطقية، والتبديل إلى الإنجليزية يقلب الاتجاه والأسهم فورًا.

---

## Quick English notes

Open `index.html` in any modern browser — no build step, no network. Motion is powered by three
vendored libraries in `vendor/`: **Three.js** (the matte-clay 3D stage, one scene per step),
**GSAP** (step choreography, provisioning sequence, counters) and **Motion** (interaction springs).
Framer Motion itself is React-only, so this vanilla build uses `motion.dev`, the same team's
plain-JavaScript library; swapping in `framer-motion` after a React migration is a drop-in change.
Illustrations default to the **LiveSVG** system: each `assets/setup/*.svg` is inlined and its
`data-layer` groups are driven by one controller — ambient motion, enter/exit, focus and typing
reactions, a processing state, a 360-degree success ring with a stroke-drawn checkmark, and a
targeted error shake. Continuous rotations live on a permanent linear timeline whose `timeScale`
is modulated by state, so a spin always completes 0-360 and resumes without a jump. Set
`SETUP_CONFIG.illustration` to `"3d"` for the Three.js stage instead.
The invoice shown in the Invoices and Review steps is the **existing Supabase invoice template**
(docgen's `buildInvoice` + `buildDocumentPdf`, imported at the pinned commit by the additive
`setup-invoice` edge function) rendered live with the wizard's own data — never a redrawn mock-up.
If Supabase is unreachable the demo shows an explicit error and retry, never a substitute design.
Deleting `vendor/` degrades cleanly to CSS animations and SVG illustrations. It is an 18-step,
4-phase first-run setup wizard for a mobile-phone-store ERP: IMEI-level inventory, staff with
per-module permissions, A4 + 80mm thermal invoices. Arabic/RTL first, English secondary
(toggle in the header). Drop replacement SVGs into `assets/setup/` using the same filenames.
Set `window.SETUP_CONFIG.apiBaseUrl` to move OTP, PassKey and provisioning onto a real backend;
until then the wizard runs in a clearly-labelled local mode and never claims real verification.
Passwords and PINs are never written to browser storage.
