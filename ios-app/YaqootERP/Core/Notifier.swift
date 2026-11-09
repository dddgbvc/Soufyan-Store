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

    var enabled: Bool { Keychain.get(tokenKey) != nil }

    func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])) ?? false
    }

    /// تفعيل إشعارات هذا الجهاز للموظف الحالي (يتطلب جلسة PIN).
    func enable(deviceName: String) async throws {
        var token = Keychain.get(tokenKey)
        if token == nil {
            token = randomToken()
            Keychain.set(token, for: tokenKey)
        }
        let last = try await API.shared.nativeRegister(token: token!, deviceName: deviceName)
        UserDefaults.standard.set(last, forKey: sinceKey)
        scheduleBackgroundRefresh()
    }

    func disable() async {
        if let token = Keychain.get(tokenKey) { await API.shared.nativeUnregister(token: token) }
        Keychain.delete(tokenKey)
        UserDefaults.standard.removeObject(forKey: sinceKey)
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.refreshTaskID)
    }

    func refreshIfEnabled() async {
        guard enabled else { return }
        _ = await pollOnce()
        scheduleBackgroundRefresh()
    }

    func scheduleBackgroundRefresh() {
        guard enabled else { return }
        let req = BGAppRefreshTaskRequest(identifier: Self.refreshTaskID)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(req)
    }

    /// يجلب الجديد ويعرضه كإشعارات محلية. يعيد عدد غير المقروء إن عُرف.
    @discardableResult
    func pollOnce() async -> Int? {
        guard let token = Keychain.get(tokenKey), API.shared.hasBase else { return nil }
        let since = UserDefaults.standard.integer(forKey: sinceKey)
        guard let r = try? await API.shared.nativePoll(token: token, since: since) else { return nil }
        guard r.json["ok"].isTrue else {
            if r.json["reason"].string == "unregistered" { Keychain.delete(tokenKey) }
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
