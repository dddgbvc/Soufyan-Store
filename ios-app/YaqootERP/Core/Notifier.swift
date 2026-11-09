import BackgroundTasks
import UIKit
import UserNotifications

/// إشعارات iOS بدون APNs حالياً:
/// • أثناء فتح التطبيق: فحص كل دقيقة.
/// • في الخلفية: BGAppRefreshTask (iOS يقرر التوقيت حسب استعمال التطبيق، عادة كل 15–60 دقيقة).
/// المصدر واحد: صندوق إشعارات الموظف على الخادم (/api/native/poll) بنفس التفضيلات والصلاحيات وساعات الهدوء.
/// للإشعار الفوري حتى والتطبيق مغلق نحتاج مفتاح APNs (.p8) — انظر INTEGRATIONS.md.
@Observable
final class Notifier {
    static let shared = Notifier()
    static let refreshTaskID = "iq.yaqoot.erp.refresh"

    private let tokenKey = "notify_token"
    private let sinceKey = "notify_since"
    private let notifyKey = "notify_on"
    private let widgetsKey = "widgets_on"

    /// الجهاز مسجّل على الخادم (رمز سري) — يستعمله الإشعار والودجت والجزيرة الديناميكية.
    var registered: Bool { token != nil }
    /// إشعارات الجهاز مفعّلة (عرض إشعارات محلية).
    var enabled: Bool { registered && UserDefaults.standard.object(forKey: notifyKey) as? Bool ?? true }
    /// تحديث الودجت في الخلفية مفعّل.
    var widgetsEnabled: Bool { registered && UserDefaults.standard.bool(forKey: widgetsKey) }

    private var token: String? { SharedStore.token() ?? Keychain.get(tokenKey) }

    private func storeToken(_ t: String?) {
        Keychain.set(t, for: tokenKey)
        SharedStore.setToken(t)
    }

    func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])) ?? false
    }

    /// يسجّل الجهاز للموظف الحالي إن لم يكن مسجلاً (يتطلب جلسة PIN).
    private func ensureRegistered(deviceName: String) async throws {
        var t = token
        if t == nil {
            t = randomToken()
            storeToken(t)
        } else {
            SharedStore.setToken(t)
        }
        let last = try await API.shared.nativeRegister(token: t!, deviceName: deviceName)
        if UserDefaults.standard.integer(forKey: sinceKey) == 0 { UserDefaults.standard.set(last, forKey: sinceKey) }
        scheduleBackgroundRefresh()
    }

    /// تفعيل إشعارات هذا الجهاز للموظف الحالي.
    func enable(deviceName: String) async throws {
        try await ensureRegistered(deviceName: deviceName)
        UserDefaults.standard.set(true, forKey: notifyKey)
    }

    func disable() async {
        UserDefaults.standard.set(false, forKey: notifyKey)
        if !UserDefaults.standard.bool(forKey: widgetsKey) { await unregister() }
    }

    /// الودجت والجزيرة الديناميكية: تسجيل الجهاز دون عرض إشعارات إن لم تكن مفعّلة.
    func enableWidgets(deviceName: String) async throws {
        if !registered { UserDefaults.standard.set(false, forKey: notifyKey) }
        try await ensureRegistered(deviceName: deviceName)
        UserDefaults.standard.set(true, forKey: widgetsKey)
        await WidgetBridge.refresh()
    }

    func disableWidgets() async {
        UserDefaults.standard.set(false, forKey: widgetsKey)
        if !(UserDefaults.standard.object(forKey: notifyKey) as? Bool ?? true) { await unregister() }
        WidgetBridge.reload()
    }

    /// عند الخروج من حساب المحل.
    func unregister() async {
        if let t = token { await API.shared.nativeUnregister(token: t) }
        storeToken(nil)
        UserDefaults.standard.removeObject(forKey: sinceKey)
        UserDefaults.standard.removeObject(forKey: widgetsKey)
        UserDefaults.standard.removeObject(forKey: notifyKey)
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.refreshTaskID)
        await LiveShop.stop()
        WidgetBridge.reload()
    }

    func refreshIfEnabled() async {
        guard registered else { return }
        // ترقية من نسخة سابقة: نسخ الرمز إلى Keychain المشترك حتى تقرأه الودجت.
        if SharedStore.token() == nil, let t = Keychain.get(tokenKey) { SharedStore.setToken(t) }
        if enabled { _ = await pollOnce() }
        await WidgetBridge.refresh()
        scheduleBackgroundRefresh()
    }

    func scheduleBackgroundRefresh() {
        guard registered else { return }
        let req = BGAppRefreshTaskRequest(identifier: Self.refreshTaskID)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(req)
    }

    /// مهمة الخلفية: الإشعارات + تحديث الودجت والجزيرة الديناميكية.
    func backgroundRefresh() async {
        if enabled { await pollOnce() }
        await WidgetBridge.refresh()
        scheduleBackgroundRefresh()
    }

    /// يجلب الجديد ويعرضه كإشعارات محلية. يعيد عدد غير المقروء إن عُرف.
    @discardableResult
    func pollOnce() async -> Int? {
        guard enabled, let token, API.shared.hasBase else { return nil }
        let since = UserDefaults.standard.integer(forKey: sinceKey)
        guard let r = try? await API.shared.nativePoll(token: token, since: since) else { return nil }
        guard r.json["ok"].isTrue else {
            if r.json["reason"].string == "unregistered" { storeToken(nil) }
            return nil
        }
        let quiet = r.json["quiet"].isTrue
        let center = UNUserNotificationCenter.current()
        for n in r.json["items"].array {
            let content = UNMutableNotificationContent()
            content.title = n["title"].string ?? "مكتب سفيان للموبايل"
            content.body = n["body"].text
            content.sound = quiet ? nil : .default
            content.interruptionLevel = quiet ? .passive : .active
            content.threadIdentifier = n["kind"].string ?? "yaqoot"
            content.userInfo = ["url": n["url"].text]
            let req = UNNotificationRequest(identifier: "yq-\(n["id"].text)", content: content, trigger: nil)
            try? await center.add(req)
        }
        let last = r.json["last_id"].int ?? since
        if last > since { UserDefaults.standard.set(last, forKey: sinceKey) }
        let unread = r.json["unread"].int
        if let unread { try? await center.setBadgeCount(unread) }
        return unread
    }
}

/// مندوب التطبيق: الضغط على إشعار يفتح القسم المناسب، واختصارات الشاشة الرئيسية.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        if let item = options.shortcutItem { QuickAction.handle(item) }
        let cfg = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
        cfg.delegateClass = SceneDelegate.self
        return cfg
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification)
        async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let url = response.notification.request.content.userInfo["url"] as? String
        await MainActor.run { AppState.shared.route(fromURL: url) }
    }
}

final class SceneDelegate: NSObject, UIWindowSceneDelegate {
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem) async -> Bool {
        QuickAction.handle(shortcutItem)
        return true
    }
}

/// اختصارات أيقونة التطبيق (ضغط مطوّل).
enum QuickAction {
    static func install() {
        UIApplication.shared.shortcutItems = [
            UIApplicationShortcutItem(type: "route.customers", localizedTitle: "الديون",
                                      localizedSubtitle: "إضافة دين أو تسديد", icon: UIApplicationShortcutIcon(systemImageName: "person.2.wave.2")),
            UIApplicationShortcutItem(type: "route.isp", localizedTitle: "مشتركو الإنترنت",
                                      localizedSubtitle: "المنتهية والقريبة", icon: UIApplicationShortcutIcon(systemImageName: "wifi")),
            UIApplicationShortcutItem(type: "route.notifications", localizedTitle: "الإشعارات",
                                      localizedSubtitle: nil, icon: UIApplicationShortcutIcon(systemImageName: "bell.badge")),
            UIApplicationShortcutItem(type: "route.importer", localizedTitle: "استيراد كشف",
                                      localizedSubtitle: "PDF أو Excel أو صورة", icon: UIApplicationShortcutIcon(systemImageName: "doc.viewfinder")),
        ]
    }

    static func handle(_ item: UIApplicationShortcutItem) {
        guard item.type.hasPrefix("route."), let s = AppSection(rawValue: String(item.type.dropFirst(6))) else { return }
        AppState.shared.go(s)
    }
}
