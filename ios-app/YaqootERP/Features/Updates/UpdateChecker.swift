import SwiftUI
import UIKit

/// نظام التحديثات: يقرأ ‎/app/ios.json‎ من خادم المحل ويقارن رقم البناء.
/// • نسخة موقّعة (Ad Hoc) مع manifest_url: «تحديث الآن» يثبّت التحديث من داخل التطبيق (itms-services).
/// • نسخة غير موقّعة (Sideloadly): يفتح رابط ملف IPA الجديد لتنزيله وتثبيته فوق النسخة الحالية.
@Observable
final class UpdateChecker {
    static let shared = UpdateChecker()

    var available: JSON?
    var dismissedBuild = UserDefaults.standard.integer(forKey: "update_dismissed")

    static var currentBuild: Int {
        Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0
    }
    static var currentVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    }

    var showBanner: Bool {
        guard let a = available, let b = a["build"].int else { return false }
        return b > Self.currentBuild && b != dismissedBuild
    }

    func check() async {
        guard let r = await API.shared.latestRelease(), let b = r["build"].int else { return }
        available = b > Self.currentBuild ? r : nil
    }

    func dismiss() {
        if let b = available?["build"].int {
            dismissedBuild = b
            UserDefaults.standard.set(b, forKey: "update_dismissed")
        }
    }

    /// رابط التثبيت: OTA للنسخة الموقّعة، أو تنزيل IPA.
    var installURL: URL? {
        guard let a = available else { return nil }
        if let m = a["manifest_url"].string, !m.isEmpty,
           var c = URLComponents(string: "itms-services://") {
            c.queryItems = [URLQueryItem(name: "action", value: "download-manifest"), URLQueryItem(name: "url", value: m)]
            return c.url
        }
        return a["ipa_url"].string.flatMap(URL.init(string:))
    }
}

/// شريط «تحديث متوفر» أعلى الرئيسية.
struct UpdateBanner: View {
    @State private var updates = UpdateChecker.shared
    @Environment(\.openURL) private var openURL

    var body: some View {
        if updates.showBanner, let a = updates.available {
            GlassPanel(tint: Yq.blue, padding: 12) {
                HStack(spacing: 12) {
                    Image(systemName: "arrow.down.app.fill").font(.title2).foregroundStyle(Yq.blue)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("تحديث متوفر \(a["version"].text)").font(.headline)
                        Text(a["notes"].string ?? "تحسينات وإصلاحات").font(.caption).foregroundStyle(.secondary).lineLimit(3)
                    }
                    Spacer(minLength: 0)
                    VStack(spacing: 6) {
                        if let url = updates.installURL {
                            Button(a["manifest_url"].string?.isEmpty == false ? "تحديث الآن" : "تنزيل") { openURL(url) }
                                .buttonStyle(.glassProminent).tint(Yq.blue).controlSize(.small)
                        }
                        Button("لاحقاً") { withAnimation { updates.dismiss() } }.font(.caption)
                    }
                }
            }
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}
