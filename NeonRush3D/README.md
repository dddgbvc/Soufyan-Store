# NEON RUSH 3D — تقرير التنفيذ

لعبة Endless Runner ثلاثية الأبعاد على Unity 2022.3 LTS مع URP، تعمل بالكامل بدون إنترنت، وموجّهة إلى iPhone (Metal / IL2CPP / ARM64 / ProMotion).

## 1. البيئة التي نُفّذ فيها العمل

| البند | النتيجة |
|---|---|
| نظام التشغيل | حاوية Linux سحابية (Ubuntu 24.04)، وليست جهازك |
| Unity Editor | **غير مثبّت**، ولا توجد أدوات Unity MCP متصلة بهذه الجلسة |
| macOS / Xcode | **غير متوفرين** |
| جهاز شخصي متصل | لا يوجد |
| خوادم Unity (download / packages) | محجوبة في شبكة هذه البيئة |

لذلك لم يكن ممكناً فتح Unity Editor أو تشغيل Play Mode أو إنتاج IPA هنا. ما تم بدلاً من ذلك:

- نزّلت من صورة Docker الرسمية لـ game-ci (`unityci/editor:ubuntu-2022.3.62f1-ios-3`) ملفات Unity 2022.3.62f1 الحقيقية: مكتبات المحرّك والمحرّر، ومكتبات مشغّل iOS IL2CPP، وحزم URP 14.0.12 وuGUI وTest Framework 1.1.33. استُخدمت هذه الملفات **للترجمة فقط**، فتشغيل المحرّر نفسه يتطلب ترخيص Unity.
- كتبت أداة تعيد تنفيذ ترجمة Unity المبنية على ملفات asmdef، وترجمت بها المشروع بالكامل مع URP ومكتبات Unity كما هي.

## 2. نتائج الاختبار الفعلية

| الاختبار | الحالة |
|---|---|
| ترجمة المحرّر (`UNITY_EDITOR`، هدف iOS): Runtime + Editor + اختبارات EditMode + اختبارات PlayMode | ✅ **0 أخطاء** |
| ترجمة مشغّل iOS (IL2CPP arm64 Release، مع مكتبات iOS الحقيقية) + URP 14 | ✅ **0 أخطاء** |
| 17 اختبار منطق نقي من `CoreLogicTests.cs` على .NET 8 مع `UnityEngine.CoreModule` الحقيقي (سياسة FPS، الحرارة، المضاعف، المسارات، Safe Area، NumberCache، مستويات الجودة) | ✅ **17/17 نجح** |
| تعديل Info.plist (ProMotion/بدون تشفير/بدون Wi-Fi): التطبيق المتكرر لا يغيّر النتيجة، والناتج يُقرأ كملف plist صالح | ✅ نجح |
| `verify_signing.py` على شهادة P12 وملف MobileProvision تجريبيين أنشأتهما هنا: حالة متوافقة، وحالة Bundle ID خاطئ وجهاز غير مُدرج، وحالة كلمة مرور خاطئة | ✅ نجح (الحالات الثلاث) |
| اختبارات EditMode التي تحتاج المحرّر (المشهد، المراجع المفقودة، إعدادات iOS، المواد، الـ Prefabs، المسبح) | ⏳ **مكتوبة ولم تُشغَّل**: تحتاج Unity Editor |
| 12 اختبار PlayMode (التشغيل، التسارع، العوائق، التصادم، حفظ أعلى نتيجة، Pause/Resume، Restart بدون تسريب، Floating Origin، الإعدادات، FPS، الواجهة) | ⏳ **مكتوبة ولم تُشغَّل**: تحتاج Unity Editor |

> لم تُشغَّل اللعبة في Play Mode، ولم يُقس أي FPS على جهاز حقيقي. أي رقم أداء يظهر لاحقاً سيأتي من تشغيل الاختبارات على جهازك أو في CI.

## 3. التشغيل على جهازك (مرة واحدة)

1. افتح المجلد `NeonRush3D` في Unity Hub بإصدار **2022.3.62f1** (أو أي إصدار 2022.3)، مع وحدة **iOS Build Support**.
2. من القائمة: **NeonRush › Build Everything (Configure + Scene)**. ينشئ هذا الأمر تلقائياً:
   - أصل URP (أو يستخدم الموجود دون استبداله) وإعدادات iOS
   - 17 مادة، وMeshes مدموجة، و5 Prefabs (السيارة، مقطع الطريق، 3 عوائق)
   - المشهد `Assets/NeonRush/Scenes/NeonRush.unity` بكامل الأنظمة والواجهة، وكل المراجع موصولة
   - إضافة المشهد إلى Build Settings، ثم فحص Missing References
3. اضغط Play. التحكم: ‎A/D‎ أو الأسهم، وEsc/P للإيقاف المؤقت، وSpace للبدء أو الإعادة. على iPhone: سحب أو لمس يمين/يسار.

أو من سطر الأوامر:
- macOS/Linux: `BuildTools/unity_batch.sh all` (يجهّز، ثم يختبر، ثم يصدّر Xcode، ثم ينتج IPA على Mac)
- Windows: `BuildTools\unity_batch_windows.bat all`

## 4. بنية المشروع

```
Assets/NeonRush/
  Scripts/Runtime/  (NeonRush.Runtime)
    Core/      GameBootstrap, GameManager, GameState
    Gameplay/  PlayerController, CameraController, RoadGenerator, RoadSegment,
               ObstacleSpawner, Obstacle, CollisionHandler, ScoreManager
    Pooling/   ObjectPoolManager, ComponentPool<T>
    Systems/   SettingsManager, PerformanceManager, FrameRatePolicy, DeviceThermal,
               LocalSaveManager, AudioManager
    UI/        UIManager, SafeAreaFitter, NumberCache
  Scripts/Editor/   (NeonRush.Editor) ProjectSetup, SceneBuilder, AssetFactory, Validator,
                    Build, IOSPostProcess
  Plugins/iOS/NeonRushDevice.mm   (thermalState, Low Power Mode, maximumFramesPerSecond)
  Tests/EditMode, Tests/PlayMode
BuildTools/  make_ipa.sh, verify_signing.py, unity_batch.sh, unity_batch_windows.bat
.github/workflows/neonrush-ios.yml (في جذر المستودع)
```

- **GameManager** يحدّث كل الأنظمة من `Update` واحد وبترتيب ثابت: الإدخال، ثم الحركة، ثم التوليد، ثم الطريق، ثم التصادم، ثم النقاط.
- **التصادم** فيزيائي حقيقي: `Physics.OverlapBoxNonAlloc` بصندوق يمتد على المسافة التي قُطعت في الإطار، فلا تفلت العوائق عند السرعات العالية. لا توجد Rigidbodies، ولذلك محاكاة الفيزياء معطّلة (`SimulationMode.Script`).
- **Floating Origin**: يُعاد تمركز العالم كل 1000 م للحفاظ على دقة الأرقام في الجولات الطويلة.
- **الصوت** يُولَّد برمجياً عند الإقلاع (موسيقى synthwave، صوت محرك، اصطدام، تبديل مسار، نقرة). لا ملفات صوتية، ولا Assets مدفوعة، ولا إعلانات أو تحليلات أو تسجيل دخول.

## 5. الأداء على iPhone

| البند | التنفيذ |
|---|---|
| معدل الإطارات | `vSyncCount = 0`، و`targetFrameRate` = معدل تحديث الشاشة الفعلي (`UIScreen.maximumFramesPerSecond` على iOS): 120 على ProMotion و60 على غيرها، ولا يتجاوز أبداً قدرة الشاشة |
| ProMotion | `appleEnableProMotion = true`، و`CADisableMinimumFrameDurationOnPhone = YES` في Info.plist (ضروري لـ 120Hz على iPhone) |
| Low Power Mode | سقف 60 FPS |
| الحرارة | `serious`: دقة 85% وإيقاف Bloom. `critical`: دقة 70% وسقف 60 FPS |
| دقة ديناميكية | خفض renderScale بخطوات 10% إذا تجاوز متوسط زمن الإطار ‎1.25×‎ الميزانية، ثم استعادتها بعد 10 ثوانٍ من الاستقرار |
| Object Pooling | مقاطع الطريق في حلقة ثابتة من 14 مقطعاً، والعوائق في مسابح مُسخّنة مسبقاً. لا Instantiate ولا Destroy أثناء اللعب |
| Draw Calls | دمج الـ Meshes حسب المادة (مقطع الطريق: 14 renderer، العائق: 3، جسم السيارة: 6 + العجلات)، وSRP Batcher، وGPU Instancing على كل المواد |
| Overdraw | مواد معتمة Unlit/Simple Lit، والشفافية فقط في خطوط السرعة (160 جزيئاً كحد أقصى) |
| GC | واجهة HUD بـ 10Hz وتُحدَّث فقط عند تغيّر القيمة، وسلاسل أرقام محفوظة مسبقاً، واستعلامات NonAlloc، وIncremental GC |
| الظلال والإضاءة | بدون ظلال، وبدون GI مخبوز، وضوء اتجاهي واحد، وضباب خطي |
| الجودة | Low/Medium/High: renderScale ‏0.7/0.85/1.0، وMSAA ‏1/2/4، وBloom وخطوط السرعة من Medium فما فوق، وأفق المدينة البعيد على High فقط |
| عرض الأداء | FPS الفعلي، ومتوسط زمن الإطار بالـ ms، ومعدل الشاشة. تظهر في شاشة الإعدادات أيضاً نسبة الدقة وحالة الحرارة |

**قياسات فعلية:** لا يوجد قياس FPS على جهاز. اختبار `PerformanceManagerReportsRealFrameTimes` يطبع عينة قياس في سجلّ الاختبار عند تشغيله.

## 6. إعدادات iOS (تُطبَّق بـ NeonRush › 1. Configure Project)

Platform iOS، وARM64، وIL2CPP (Release)، وMetal فقط، وLandscape يسار ويمين، وDisplay Name `Neon Rush`، و`com.sufyan.neonrush`، والإصدار 1.0.0 (Build 1)، وEnable ProMotion Support، و`UIRequiresPersistentWiFi = NO`، و`ITSAppUsesNonExemptEncryption = NO`، والحد الأدنى iOS 13.0، وColor Space Linear. لا Entitlements ولا صلاحيات إضافية، والتوقيع اليدوي يتم في `make_ipa.sh`.

## 7. بناء iOS وIPA

| الخطوة | الحالة |
|---|---|
| مشروع Xcode | ❌ لم يُصدَّر هنا: Unity غير متاح في هذه البيئة |
| `NeonRush-iOS-v1.0.0.ipa` | ❌ **لم يُنشأ**: يتطلب macOS مع Xcode (`xcodebuild`) |
| التوقيع | ❌ لم يُنفَّذ: لم تُقدَّم ملفات P12 أو MobileProvision، ولن تُطلب في المحادثة |

### طرق إنتاج IPA

**أ) على Mac فيه Unity وXcode:**
```bash
BuildTools/unity_batch.sh all
# الناتج: Builds/iOS/NeonRush-iOS-v1.0.0.ipa (يطبع السكربت المسار والحجم وSHA-256 ويتحقق من Bundle ID والإصدار)
```
- بدون متغيرات توقيع: يُنتج **IPA غير موقّع** (Payload/*.app) جاهزاً لـ ESign.
- مع التوقيع: `NR_P12_PATH` و`NR_PROFILE_PATH` و`NR_P12_PASSWORD` و`NR_EXPORT_METHOD`. يرفض السكربت أي ملف تعريف لا يطابق `com.sufyan.neonrush`، ولا يغيّر Bundle ID.

**ب) من Windows:** `unity_batch_windows.bat xcode` يصدّر `Builds\iOS\Xcode`. انقل المجلد إلى Mac وشغّل `make_ipa.sh`، أو استخدم الطريقة (ج).

**ج) GitHub Actions** (`.github/workflows/neonrush-ios.yml`، تشغيل يدوي فقط): اختبارات EditMode وPlayMode على Linux، ثم تصدير Xcode على Linux، ثم IPA على macOS، ويُرفع الناتج كـ Artifact. يحتاج الأسرار التالية في المستودع: `UNITY_LICENSE` و`UNITY_EMAIL` و`UNITY_PASSWORD`. أسرار التوقيع اختيارية: `IOS_P12_BASE64` و`IOS_P12_PASSWORD` و`IOS_PROFILE_BASE64` و`IOS_EXPORT_METHOD`. تُحذف ملفات التوقيع من الـ runner بعد البناء. هذه الخدمة لم تُشغَّل.

### فحص الشهادة قبل ESign
```bash
python3 BuildTools/verify_signing.py --p12 cert.p12 --profile app.mobileprovision --udid <UDID>
```
يتحقق من تطابق Bundle ID، ومن أن الشهادة مضمّنة في ملف التعريف، ومن وجود المفتاح الخاص، ومن الصلاحية والانتهاء، ومن نوع التوزيع ووجود الجهاز. كلمة المرور تُقرأ من متغير بيئة أو بإدخال مخفي، ولا يُكتب المفتاح على القرص.
