# متابعة مكتب سفيان للموبايل — أندرويد (Kotlin)

تطبيق أندرويد أصلي بـ Kotlin و Jetpack Compose، يحل محل نسخة Flutter في `android-app/` (المحفوظة كما هي).
معرّف التطبيق `iq.sufyan.mobile`: نسخة كاملة مستقلة تُثبَّت بجانب أي نسخة قديمة، لا كتحديث فوقها.

## البناء

```bash
export ANDROID_HOME=/path/to/android-sdk
./gradlew assembleRelease \
  -PYQ_BASE_URL=https://<خادم-المحل> \
  -PYQ_SIGNING=/path/outside/repo/key.properties
```

- `YQ_BASE_URL` يُضمَّن وقت البناء ولا يُحفظ في المستودع. بدونه يطلب التطبيق العنوان عند أول تشغيل.
- `key.properties` (storeFile, storePassword, keyAlias, keyPassword) وملف المفتاح خارج المستودع دائماً.

## البنية

| المجلد | المحتوى |
|---|---|
| `core/Api.kt` | الاتصال بالخادم (OkHttp)، الكوكيز، `/api/erp` و`/api/assistant` و`/api/sas4` |
| `core/Secure.kt` | تخزين مشفّر بمفتاح Android Keystore (AES-256-GCM) لكوكي المحل والجلسة ورمز الإشعارات |
| `core/Notify.kt` | الإشعارات: فحص كل 15 ثانية أثناء الفتح، وWorkManager كل ~15 دقيقة في الخلفية |
| `core/Pdf.kt` | تقارير PDF بأداة أندرويد الرسمية `PdfDocument`، صفحات A4 وعربي من اليمين لليسار |
| `ui/` | الشاشات بـ Compose: الدخول، القائمة، الفواتير، الديون، الخزنة، المخزون، النواقص، الصيانة، الإنترنت وSAS4 بالأبراج، واتساب، المساعد الذكي، التحليلات، الإشعارات، الإعدادات |

لا توجد أسرار في الكود: كلمة مرور المالك لا تُحفظ، كلمات مرور أبراج SAS4 مشفّرة في الخادم ولا تصل للهاتف.
