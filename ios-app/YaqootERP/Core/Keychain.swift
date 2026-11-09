import Foundation
import LocalAuthentication
import Security

/// تخزين آمن في Keychain. لا تُحفظ كلمات المرور في الشيفرة أو الملفات أبداً.
/// - مفاتيح الجلسة (yq_store / yq_sess / yq_pur) ورموز التكاملات: متاحة بعد أول فتح للجهاز فقط وغير قابلة للنقل لجهاز آخر.
/// - رمز PIN للفتح بـ Face ID: محمي بالبصمة الحالية (biometryCurrentSet) ويُمسح تلقائياً إن تغيّرت البصمات.
nonisolated enum Keychain {
    static let service = "iq.yaqoot.erp"

    private static func base(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    @discardableResult
    static func set(_ value: String?, for account: String) -> Bool {
        SecItemDelete(base(account) as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return true }
        var q = base(account)
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    static func get(_ account: String) -> String? {
        var q = base(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ account: String) { SecItemDelete(base(account) as CFDictionary) }

    // MARK: - عناصر محمية بـ Face ID / Touch ID

    static func setBiometric(_ value: String, for account: String) -> Bool {
        delete(account)
        guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                                                           .biometryCurrentSet, nil),
              let data = value.data(using: .utf8) else { return false }
        var q = base(account)
        q[kSecValueData as String] = data
        q[kSecAttrAccessControl as String] = access
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    /// يطلب Face ID ثم يعيد القيمة. يُستدعى خارج الخيط الرئيسي لأنه ينتظر المستخدم.
    static func getBiometric(_ account: String, prompt: String) -> String? {
        let ctx = LAContext()
        ctx.localizedReason = prompt
        var q = base(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        q[kSecUseAuthenticationContext as String] = ctx
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func exists(_ account: String) -> Bool {
        let ctx = LAContext()
        ctx.interactionNotAllowed = true
        var q = base(account)
        q[kSecUseAuthenticationContext as String] = ctx
        let status = SecItemCopyMatching(q as CFDictionary, nil)
        return status == errSecSuccess || status == errSecInteractionNotAllowed
    }
}
