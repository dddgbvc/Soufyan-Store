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
window.SETUP_CONFIG = { illustration: "auto" };   // "auto" | "3d" | "svg"
```

* `auto` (الافتراضي): مشهد ثلاثي الأبعاد عند توفّر WebGL، وإلا رسوم SVG.
* `3d`: يفرض المشهد ثلاثي الأبعاد متى أمكن.
* `svg`: يفرض ملفات `assets/setup/*.svg` — استخدمه بعد وضع رسومك النهائية.

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
  `phone-body · phone-screen · camera · buttons · check · shield · envelope · otp-dots · sparkles · abstract-shapes · shadow`
* دورة الحركة لكل خطوة: `idle → enter → processing → success / error`، وتُطبَّق على الحاوية
  وعلى الطبقات الداخلية عند تضمين الـ SVG. الحركة تحترم `prefers-reduced-motion`.

بعد تعديل الرسوم، لتحديث النسخة المضمّنة:

```bash
node tools/build-illustrations.mjs   # لإعادة توليد الرسوم الافتراضية (اختياري)
node tools/embed-assets.mjs          # لتضمين ما في assets/setup داخل index.html
```

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
Set `SETUP_CONFIG.illustration` to `"svg"` to use your own SVG assets instead of the 3D stage.
Deleting `vendor/` degrades cleanly to CSS animations and SVG illustrations. It is an 18-step,
4-phase first-run setup wizard for a mobile-phone-store ERP: IMEI-level inventory, staff with
per-module permissions, A4 + 80mm thermal invoices. Arabic/RTL first, English secondary
(toggle in the header). Drop replacement SVGs into `assets/setup/` using the same filenames.
Set `window.SETUP_CONFIG.apiBaseUrl` to move OTP, PassKey and provisioning onto a real backend;
until then the wizard runs in a clearly-labelled local mode and never claims real verification.
Passwords and PINs are never written to browser storage.
