import Foundation
import Security

/// مساحة مشتركة بين التطبيق والودجت (App Group):
/// • عنوان الخادم وآخر ملخص للمحل في UserDefaults المشترك.
/// • الرمز السري للجهاز في Keychain مشترك (لا يُكتب في الملفات).
/// إذا غيّرت أداة التثبيت (مثل Sideloadly) معرّف المجموعة، نجرّب ‎group.<bundle id>‎ تلقائياً.
nonisolated enum SharedStore {
    static let defaultGroup = "group.iq.yaqoot.erp"

    static let groupID: String? = {
        var candidates: [String] = []
        if let g = Bundle.main.object(forInfoDictionaryKey: "YQAppGroup") as? String, !g.isEmpty { candidates.append(g) }
        if var b = Bundle.main.bundleIdentifier {
            if b.hasSuffix(".widgets") { b = String(b.dropLast(".widgets".count)) }
            candidates.append("group." + b)
        }
        candidates.append(defaultGroup)
        return candidates.first { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) != nil }
    }()

    static var isAvailable: Bool { groupID != nil }
    static var defaults: UserDefaults? { groupID.flatMap { UserDefaults(suiteName: $0) } }

    // MARK: عنوان الخادم
    static var baseURL: String? {
        get { defaults?.string(forKey: "base_url") }
        set { defaults?.set(newValue, forKey: "base_url") }
    }

    // MARK: آخر ملخص
    static func saveSummary(_ s: ShopSummary) {
        guard let d = try? JSONEncoder().encode(s) else { return }
        defaults?.set(d, forKey: "summary")
    }

    static func loadSummary() -> ShopSummary? {
        guard let d = defaults?.data(forKey: "summary") else { return nil }
        return try? JSONDecoder().decode(ShopSummary.self, from: d)
    }

    // MARK: الرمز السري للجهاز (Keychain مشترك عبر App Group)
    private static func query(_ group: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "iq.yaqoot.erp.shared",
         kSecAttrAccount as String: "device_token",
         kSecAttrAccessGroup as String: group]
    }

    @discardableResult
    static func setToken(_ token: String?) -> Bool {
        guard let group = groupID else { return false }
        SecItemDelete(query(group) as CFDictionary)
        guard let token, let data = token.data(using: .utf8) else { return true }
        var q = query(group)
        q[kSecValueData as String] = data
        // متاح بعد أول فتح للجهاز حتى تعمل ودجت شاشة القفل والجهاز مقفول.
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    static func token() -> String? {
        guard let group = groupID else { return nil }
        var q = query(group)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
}
