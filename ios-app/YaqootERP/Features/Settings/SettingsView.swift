import SwiftUI
import UIKit

/// الإعدادات: الحساب، إشعارات الجهاز وأنواعها، Face ID، القفل التلقائي، المظهر، والخادم.
struct SettingsView: View {
    @State private var app = AppState.shared
    @State private var notifier = Notifier.shared
    @State private var deviceOn = Notifier.shared.enabled
    @State private var widgetsOn = Notifier.shared.widgetsEnabled
    @State private var liveOn = LiveShop.isRunning
    @State private var bioOn = Biometrics.isEnabled
    @State private var busy = false
    @State private var toast: Toast?
    @State private var askPin = false
    @State private var pinForBio = ""
    @State private var confirmSignOut = false

    var body: some View {
        Form {
            SwiftUI.Section {
                AccountHeader().listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                LabeledContent("الصلاحيات", value: "\(app.permissions.count) صلاحية")
            }

            SwiftUI.Section {
                Toggle(isOn: Binding(get: { deviceOn }, set: { v in Task { await toggleDevice(v) } })) {
                    Label("إشعارات هذا الجهاز", systemImage: "bell.badge")
                }
                .disabled(busy)
            } header: {
                Text("الإشعارات")
            } footer: {
                Text("يفحص التطبيق صندوقك كل دقيقة أثناء فتحه، وفي الخلفية حسب جدولة iOS. الإشعار الفوري والتطبيق مغلق يحتاج مفتاح APNs على الخادم.")
            }

            SwiftUI.Section {
                Toggle(isOn: Binding(get: { widgetsOn }, set: { v in Task { await toggleWidgets(v) } })) {
                    Label("تحديث الودجت في الخلفية", systemImage: "square.grid.2x2")
                }
                .disabled(busy)
                Toggle(isOn: Binding(get: { liveOn }, set: { v in Task { await toggleLive(v) } })) {
                    Label("متابعة مباشرة في الجزيرة الديناميكية", systemImage: "capsule.inset.filled")
                }
                .disabled(busy)
            } header: {
                Text("الودجت والجزيرة الديناميكية")
            } footer: {
                Text("أضف ودجت «مكتب سفيان» من الشاشة الرئيسية أو شاشة القفل (اضغط مطولاً ← تعديل ← إضافة ودجت). تعرض الأرقام حسب صلاحياتك وتتحدث كل 15 دقيقة تقريباً، والمتابعة المباشرة تتحدث كل دقيقة والتطبيق مفتوح.")
            }

            SwiftUI.Section {
                NavigationLink {
                    RemoteView(load: { try await API.shared.prefs() }) { prefs, _ in
                        PrefsEditor(initial: prefs, permissions: app.permissions, admin: app.isAdmin) { patch in
                            try await API.shared.setPrefs(patch)
                        }
                        .navigationTitle("أنواع الإشعارات")
                    }
                } label: {
                    Label("أنواع الإشعارات وساعات الهدوء", systemImage: "slider.horizontal.3")
                }
            }

            SwiftUI.Section {
                if Biometrics.isAvailable {
                    Toggle(isOn: Binding(get: { bioOn }, set: { v in
                        if v { askPin = true } else { Biometrics.disable(); bioOn = false }
                    })) {
                        Label("الفتح بـ \(Biometrics.label)", systemImage: Biometrics.symbol)
                    }
                    if let owner = Biometrics.owner { Text("مفعّل لـ \(owner)").font(.footnote).foregroundStyle(.secondary) }
                }
                Picker(selection: $app.idleMinutes) {
                    ForEach([5, 10, 15, 30], id: \.self) { Text("\($0) دقائق").tag($0) }
                } label: {
                    Label("القفل التلقائي بعد الخمول", systemImage: "lock.rotation")
                }
                Button { Task { await app.lock() } } label: { Label("قفل الآن وتبديل الموظف", systemImage: "lock.fill") }
            } header: {
                Text("الأمان")
            } footer: {
                Text("يُحفظ رمزك محمياً بالبصمة في Keychain ويُمسح تلقائياً إن تغيّرت بصمات الجهاز. الخادم يبقى يتحقق من الرمز في كل مرة.")
            }

            SwiftUI.Section("المظهر") {
                Picker(selection: $app.appearance) {
                    ForEach(AppState.Appearance.allCases) { Text($0.label).tag($0) }
                } label: {
                    Label("المظهر", systemImage: "circle.lefthalf.filled")
                }
                Button {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                } label: {
                    Label("حجم الخط واللغة من إعدادات النظام", systemImage: "textformat.size")
                }
            }

            SwiftUI.Section("الخادم") {
                LabeledContent("العنوان") {
                    Text(URL(string: API.shared.baseURL)?.host() ?? "—").font(.footnote.monospaced()).lineLimit(1).truncationMode(.middle)
                }
                LabeledContent("الإصدار", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")
                Button(role: .destructive) { confirmSignOut = true } label: {
                    Label("الخروج من حساب المحل على هذا الجهاز", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
        .yaqootBackground()
        .toast($toast)
        .alert("أدخل رمزك لتفعيل \(Biometrics.label)", isPresented: $askPin) {
            SecureField("رمز PIN", text: $pinForBio).keyboardType(.numberPad)
            Button("إلغاء", role: .cancel) { pinForBio = "" }
            Button("تفعيل") { Task { await enableBiometrics() } }
        } message: {
            Text("يُتحقق من الرمز على الخادم أولاً.")
        }
        .confirmationDialog("الخروج من حساب المحل؟", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("خروج", role: .destructive) { Task { await app.signOutStore() } }
        } message: {
            Text("سيُلغى تفعيل هذا الجهاز ويحتاج حساب المالك من جديد.")
        }
    }

    private func toggleDevice(_ on: Bool) async {
        busy = true
        defer { busy = false }
        do {
            if on {
                guard await notifier.requestPermission() else {
                    toast = Toast(text: "اسمح بالإشعارات من الإعدادات ← متابعة مكتب سفيان", error: true)
                    return
                }
                try await notifier.enable(deviceName: "\(UIDevice.current.model) • \(app.employeeName)")
                toast = Toast(text: "تم تفعيل إشعارات هذا الجهاز")
            } else {
                await notifier.disable()
            }
            deviceOn = on
        } catch APIError.sessionExpired {
            app.expire()
        } catch {
            toast = Toast(text: error.localizedDescription, error: true)
        }
    }

    private func toggleWidgets(_ on: Bool) async {
        busy = true
        defer { busy = false }
        do {
            if on {
                try await notifier.enableWidgets(deviceName: "\(UIDevice.current.model) • \(app.employeeName)")
                toast = Toast(text: "تم تفعيل تحديث الودجت")
            } else {
                await notifier.disableWidgets()
            }
            widgetsOn = on
        } catch APIError.sessionExpired {
            app.expire()
        } catch {
            toast = Toast(text: error.localizedDescription, error: true)
        }
    }

    private func toggleLive(_ on: Bool) async {
        busy = true
        defer { busy = false }
        do {
            if on {
                if !notifier.widgetsEnabled {
                    try await notifier.enableWidgets(deviceName: "\(UIDevice.current.model) • \(app.employeeName)")
                    widgetsOn = true
                }
                try await LiveShop.start(store: app.storeName)
                toast = Toast(text: "بدأت المتابعة المباشرة")
            } else {
                await LiveShop.stop()
            }
            liveOn = LiveShop.isRunning
        } catch APIError.sessionExpired {
            app.expire()
        } catch {
            liveOn = LiveShop.isRunning
            toast = Toast(text: error.localizedDescription, error: true)
        }
    }

    /// يتحقق من الرمز على الخادم (نفس مسار الدخول) قبل حفظه محمياً بالبصمة.
    private func enableBiometrics() async {
        let pin = pinForBio
        pinForBio = ""
        do {
            let r = try await API.shared.pin(pin)
            guard r["employee"]["id"].text == app.employee["id"].text else {
                toast = Toast(text: "هذا الرمز لموظف آخر.", error: true)
                app.apply(r, forceActive: true)
                return
            }
            if Biometrics.enable(pin: pin, employeeName: app.employeeName) {
                bioOn = true
                toast = Toast(text: "تم تفعيل \(Biometrics.label)")
            } else {
                toast = Toast(text: "تعذر الحفظ في Keychain. تأكد من ضبط رمز قفل للجهاز.", error: true)
            }
        } catch {
            toast = Toast(text: error.localizedDescription, error: true)
        }
    }
}
