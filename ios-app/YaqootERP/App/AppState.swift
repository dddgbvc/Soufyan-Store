import SwiftUI

/// حالة التطبيق: الترحيب ← عنوان الخادم ← حساب المحل ← PIN ← الواجهة حسب الصلاحيات.
@Observable
final class AppState {
    static let shared = AppState()

    enum Phase: Equatable {
        case loading, setup, unpaired, locked, active
        case failed(String)
    }

    enum Appearance: String, CaseIterable, Identifiable {
        case system, light, dark
        var id: String { rawValue }
        var label: String { switch self { case .system: "حسب النظام"; case .light: "فاتح"; case .dark: "داكن" } }
        var scheme: ColorScheme? { switch self { case .system: nil; case .light: .light; case .dark: .dark } }
    }

    var phase: Phase = .loading
    var storeName = ""
    var employee: JSON = .null
    var permissions: Set<String> = []
    var message: String?
    var pendingRoute: AppSection?
    var selected: AppSection = .dashboard
    var showWelcome = !UserDefaults.standard.bool(forKey: "welcomed")
    var refreshTick = 0
    var searchTick = 0
    var unread = 0

    var appearance: Appearance = Appearance(rawValue: UserDefaults.standard.string(forKey: "appearance") ?? "") ?? .system {
        didSet { UserDefaults.standard.set(appearance.rawValue, forKey: "appearance") }
    }
    var idleMinutes: Int = {
        let v = UserDefaults.standard.integer(forKey: "idle_minutes")
        return v == 0 ? 10 : v
    }() {
        didSet { UserDefaults.standard.set(idleMinutes, forKey: "idle_minutes") }
    }

    private var backgroundedAt: Date?

    var isAdmin: Bool { employee["role"].text.uppercased() == "ADMIN" }
    var employeeName: String { employee["name"].text }

    func can(_ p: String) -> Bool { p == "__admin" ? isAdmin : permissions.contains(p) }
    func allowed(_ s: AppSection) -> Bool { s.anyOf.isEmpty || s.anyOf.contains(where: can) }
    var sections: [AppSection] { AppSection.allCases.filter(allowed) }

    // MARK: - دورة الدخول

    func boot() async {
        #if DEBUG
        if DemoData.enabled {
            await refresh()
            if let s = UserDefaults.standard.string(forKey: "YQDemoSection").flatMap(AppSection.init(rawValue:)) { selected = s }
            return
        }
        #endif
        guard API.shared.hasBase else { phase = .setup; return }
        await refresh()
    }

    func refresh() async {
        do {
            apply(try await API.shared.status())
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func apply(_ s: JSON, forceActive: Bool = false) {
        let st = forceActive ? "active" : s["state"].text
        if !s["store_name"].text.isEmpty { storeName = s["store_name"].text }
        switch st {
        case "active":
            employee = s["employee"]
            permissions = Set(s["permissions"].array.compactMap(\.string))
            message = nil
            if !allowed(selected) { selected = sections.first ?? .settings }
            phase = .active
            Task { await Notifier.shared.refreshIfEnabled() }
        case "locked":
            phase = .locked
        default:
            phase = .unpaired
        }
    }

    func lock(_ why: String? = nil) async {
        await API.shared.lock()
        message = why
        employee = .null
        permissions = []
        phase = .locked
    }

    func expire() {
        Task { await lock("انتهت الجلسة. أدخل رمزك من جديد.") }
    }

    func signOutStore() async {
        await Notifier.shared.unregister()
        Biometrics.disable()
        await API.shared.forgetStore()
        message = nil
        phase = .unpaired
    }

    func finishWelcome() {
        UserDefaults.standard.set(true, forKey: "welcomed")
        showWelcome = false
    }

    // MARK: - القفل التلقائي بعد الخمول

    func scenePhaseChanged(_ p: ScenePhase) {
        switch p {
        case .background:
            backgroundedAt = Date()
        case .active:
            if phase == .active, let at = backgroundedAt, Date().timeIntervalSince(at) >= Double(idleMinutes * 60) {
                Task { await lock("قُفلت الشاشة تلقائياً بعد فترة خمول.") }
            }
            backgroundedAt = nil
        default:
            break
        }
    }

    func checkIdle() {
        guard phase == .active else { return }
        if Date().timeIntervalSince(API.shared.lastActivity) >= Double(idleMinutes * 60) {
            Task { await lock("قُفلت الشاشة تلقائياً بعد فترة خمول.") }
        }
    }

    func touch() { API.shared.lastActivity = Date() }

    /// الانتقال لقسم (من إشعار أو اختصار أو بحث).
    func go(_ s: AppSection) {
        touch()
        if phase == .active, allowed(s) { selected = s } else { pendingRoute = s }
    }

    func consumePendingRoute() {
        if let r = pendingRoute, phase == .active, allowed(r) {
            selected = r
            pendingRoute = nil
        }
    }

    /// يحوّل رابط إشعار ("/#customers") إلى قسم.
    func route(fromURL url: String?) {
        guard let url, url.hasPrefix("/#") else { return }
        let key = String(url.dropFirst(2))
        let map: [String: AppSection] = ["notifications": .notifications, "inbox": .notifications, "activity": .activity]
        if let s = AppSection(rawValue: key) ?? map[key] { go(s) }
    }
}
