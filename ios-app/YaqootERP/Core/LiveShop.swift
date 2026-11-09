import ActivityKit
import Foundation
import WidgetKit

/// تحديث الودجت والجزيرة الديناميكية من ملخص الخادم.
enum WidgetBridge {
    /// يجلب الملخص (بالرمز السري للجهاز) ويحدّث الودجت والمتابعة المباشرة.
    static func refresh() async {
        guard Notifier.shared.registered else { return }
        guard let s = await SummaryLoader.fetch() else { return }
        reload()
        await LiveShop.update(s)
    }

    static func reload() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}

/// المتابعة المباشرة (Live Activity): أرقام اليوم في الجزيرة الديناميكية وشاشة القفل.
/// تتحدث كل دقيقة والتطبيق مفتوح، وفي الخلفية حسب جدولة iOS. التحديث الفوري والتطبيق مغلق يحتاج APNs.
enum LiveShop {
    static var isRunning: Bool { !Activity<ShopActivityAttributes>.activities.isEmpty }
    static var isAllowed: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    static func start(store: String) async throws {
        guard isAllowed else {
            throw APIError.server(message: "فعّل «الأنشطة المباشرة» للتطبيق من إعدادات الآيفون.", reason: "activities_disabled", status: 0)
        }
        let s = await SummaryLoader.fetch() ?? SharedStore.loadSummary()
        guard let s else {
            throw APIError.server(message: "تعذر جلب أرقام اليوم. فعّل «تحديث الودجت» أولاً.", reason: "no_summary", status: 0)
        }
        await stop()
        let content = ActivityContent(state: ShopActivityAttributes.ContentState(s), staleDate: Date().addingTimeInterval(30 * 60))
        _ = try Activity.request(attributes: ShopActivityAttributes(storeName: s.storeName ?? store), content: content, pushType: nil)
    }

    static func update(_ s: ShopSummary) async {
        let content = ActivityContent(state: ShopActivityAttributes.ContentState(s), staleDate: Date().addingTimeInterval(30 * 60))
        for a in Activity<ShopActivityAttributes>.activities { await a.update(content) }
    }

    static func stop() async {
        for a in Activity<ShopActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
    }
}
