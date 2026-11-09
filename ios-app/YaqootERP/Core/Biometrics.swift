import Foundation
import LocalAuthentication

/// فتح الجلسة بـ Face ID / Touch ID: يُحفظ رمز PIN للموظف محمياً بالبصمة، ويُرسل للخادم كأنه أُدخل يدوياً.
/// الخادم يبقى صاحب القرار: نفس فحص الرمز والقفل بعد المحاولات الخاطئة.
enum Biometrics {
    private static let pinAccount = "bio_pin"
    private static let ownerKey = "bio_owner"

    enum Kind { case none, faceID, touchID, opticID }

    static var kind: Kind {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else { return .none }
        switch ctx.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        case .opticID: return .opticID
        default: return .none
        }
    }

    static var label: String {
        switch kind {
        case .faceID: "Face ID"
        case .touchID: "Touch ID"
        case .opticID: "Optic ID"
        case .none: "البصمة"
        }
    }

    static var symbol: String {
        switch kind {
        case .faceID: "faceid"
        case .touchID: "touchid"
        case .opticID: "opticid"
        case .none: "lock.shield"
        }
    }

    static var isAvailable: Bool { kind != .none }

    /// اسم الموظف الذي فعّل الفتح السريع على هذا الجهاز.
    static var owner: String? { Keychain.get(ownerKey) }
    static var isEnabled: Bool { owner != nil && Keychain.exists(pinAccount) }

    static func enable(pin: String, employeeName: String) -> Bool {
        guard Keychain.setBiometric(pin, for: pinAccount) else { return false }
        Keychain.set(employeeName, for: ownerKey)
        return true
    }

    static func disable() {
        Keychain.delete(pinAccount)
        Keychain.delete(ownerKey)
    }

    /// يعرض نافذة Face ID ويعيد الرمز إن نجح التحقق.
    static func unlock() async -> String? {
        await Task.detached(priority: .userInitiated) {
            Keychain.getBiometric("bio_pin", prompt: "افتح جلستك في ياقوت")
        }.value
    }
}
