# منظومة سفيان — بوابة المصادقة والتهيئة

نظام مصادقة وتهيئة (Authentication · Onboarding · Setup) لمنصّة ERP/POS عربية،
مبني بواجهة داكنة تنفيذية تدعم RTL بالكامل.

## التشغيل

```bash
cd app
npm install
npm run dev        # خادم تطوير على http://localhost:5173
npm run build      # فحص الأنواع + بناء الإنتاج إلى dist/
npm run preview    # معاينة نسخة الإنتاج
npm run typecheck  # فحص TypeScript فقط
```

> نسخة الإنتاج في `dist/` تحتاج إلى خادم HTTP (وحدات ES لا تعمل عبر `file://`).
> مثال: `npx http-server dist` أو `npm run preview`.

## التقنيات

| الطبقة | الأداة |
| --- | --- |
| الواجهة | React 18 + TypeScript (وضع `strict`) |
| التنسيق | Tailwind CSS 3.4 |
| الحركة | Framer Motion 11 |
| الأيقونات | Lucide React (SVG فقط — بلا رموز تعبيرية) |
| البناء | Vite 5 |

## بنية المشروع

```
src/
├── components/
│   ├── AuthPortal.tsx          # الغلاف الجذري والتخطيط المتكيّف
│   ├── LoginForm.tsx           # بوابة تسجيل الدخول
│   ├── RegisterWizard.tsx      # معالج التهيئة (٣ خطوات)
│   ├── ForgotPasswordFlow.tsx  # استعادة كلمة المرور (٣ خطوات)
│   ├── SuccessView.tsx         # شاشة الاكتمال والتحويل التلقائي
│   ├── ShowcasePane.tsx        # لوحة معاينة التحليلات (سطح المكتب)
│   ├── DashboardGateway.tsx    # وجهة ما بعد المصادقة
│   ├── register/               # خطوات معالج التهيئة
│   ├── recover/                # خطوات استعادة كلمة المرور
│   └── ui/                     # مكوّنات الأساس (حقول، أزرار، مقاييس…)
├── state/
│   ├── authMachine.ts          # المخفّض — مصدر الحقيقة الوحيد
│   └── AuthProvider.tsx        # المزوّد وتنسيق الطلبات
├── services/authService.ts     # حدّ الخادم (محاكاة قابلة للاستبدال)
├── lib/                        # الحركة، التحقق، قوة كلمة المرور، الوحدات
├── hooks/useCountdown.ts
└── types/auth.ts               # العقود النوعية
```

## المسارات

1. **تسجيل الدخول** — معرّف (بريد/هاتف) مع اكتشاف تلقائي للنوع، كلمة مرور بإظهار/إخفاء،
   «إبقائي مسجّلًا»، ورابط الاستعادة.
2. **معالج التهيئة (٣ خطوات)** — بيانات المسؤول ← ملف المنشأة والقطاع والعملة ←
   المعمارية ونشر الوحدات (ملخّص حيّ للجداول وسجلات البيع وحسابات دفتر الأستاذ).
3. **استعادة كلمة المرور (٣ خطوات)** — تحديد الهوية ← رمز تحقق من ٦ أرقام ←
   كلمة مرور جديدة مع مؤشر قوة لحظي.
4. **شاشة الاكتمال** — تأكيد متوهّج وتحويل تلقائي إلى لوحة التحكم.

## ربط خادم حقيقي

كل الاتصال بالخادم يمرّ عبر واجهة واحدة في `src/services/authService.ts`:

```ts
export interface AuthService {
  signIn(values: LoginValues): Promise<AuthResult>;
  provisionTenant(values: RegisterValues): Promise<ProvisionSummary>;
  requestOtp(identifier: string): Promise<void>;
  verifyOtp(values: Pick<RecoverValues, 'identifier' | 'otp'>): Promise<void>;
  resetPassword(values: RecoverValues): Promise<void>;
}
```

اكتب تنفيذًا يعتمد `fetch`، ثم مرّره للمزوّد:

```tsx
<AuthProvider service={httpAuthService}>…</AuthProvider>
```

لا يحتاج أي مكوّن واجهة إلى تعديل.

### قيم تجريبية لاختبار مسارات الخطأ

| المدخل | النتيجة |
| --- | --- |
| كلمة المرور `wrong-pass` | «بيانات الدخول غير صحيحة» |
| رمز التحقق `000000` | «الرمز غير صحيح أو انتهت صلاحيته» |

ما عدا ذلك تنجح العمليات بعد زمن استجابة محاكى.

## الاستجابة والأجهزة

| النطاق | السلوك |
| --- | --- |
| ٣٢٠–٤٨٠px | عمود مفرد، تمرير داخلي ناعم، `100dvh` لتفادي قفزة لوحة المفاتيح |
| ٧٦٨–١٠٢٤px | نافذة أكريليك عائمة متمركزة (طولي وعرضي) |
| ‏1024px فأعلى | عرض مقسوم: النموذج يمينًا ولوحة التحليلات يسارًا (`max-w-6xl`) |
| نقاط البيع | تباين عالٍ، أهداف لمس ≥ ٤٤×٤٤px، استجابة فورية عند الضغط |

- مناطق الأمان: `env(safe-area-inset-*)` مع `viewport-fit=cover`.
- حقول الإدخال بحجم ١٦px على الجوال لمنع تكبير iOS التلقائي.
- رمز التحقق: `inputMode="numeric"` و`autocomplete="one-time-code"`.

## إمكانية الوصول

- تحقق عند مغادرة الحقل (`blur`) لا عند الإرسال فقط.
- `aria-invalid` و`aria-describedby` و`role="alert"` لكل رسالة خطأ.
- اللون ليس المؤشر الوحيد: كل خطأ يرافقه نص وأيقونة.
- دعم `prefers-reduced-motion` و`prefers-reduced-transparency` و`prefers-contrast`.
- تنقّل كامل بلوحة المفاتيح مع حلقات تركيز واضحة.

## ملاحظات تصميمية

- **بلا تباعد أحرف على النص العربي**: `letter-spacing` يكسر اتصال الحروف؛
  التتبّع مقصور على النصوص اللاتينية والأرقام عبر صنف `.latin`.
- **الحركة**: نابض `stiffness: 320 / damping: 26` (نسبة إخماد ≈ ٠٫٧٣)،
  وتتابع ظهور ٠٫٠٦ ثانية لكل عنصر.
- **اتجاه انزلاق الخطوات** يُضبط من ثابت واحد: `STEP_SLIDE_MODE` في `src/lib/motion.ts`.
- الخط الأساسي `Tajawal` من Google Fonts، مع سلسلة بدائل عربية/نظامية
  تحافظ على التخطيط عند تعذّر التحميل.
