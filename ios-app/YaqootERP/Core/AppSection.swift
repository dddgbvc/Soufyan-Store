import SwiftUI

/// أقسام التطبيق. تظهر حسب صلاحيات الموظف في قاعدة البيانات (employee_permissions)،
/// والخادم يرفض أي طلب خارج الصلاحية حتى لو ظهر القسم بالخطأ.
enum AppSection: String, CaseIterable, Identifiable, Hashable, Sendable {
    case dashboard, invoices, products, shortages, customers, vault, expenses, purchases, suppliers
    case repairs, returns, shipping, isp, network, importer, whatsapp, assistant, employees, sessions, activity, reports, analytics
    case notifications, settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .dashboard: "الرئيسية"
        case .invoices: "المبيعات والفواتير"
        case .products: "المخزون"
        case .shortages: "النواقص"
        case .customers: "الزبائن والديون"
        case .vault: "الخزنة"
        case .expenses: "المصروفات"
        case .purchases: "المشتريات"
        case .suppliers: "الموردون"
        case .repairs: "الصيانة"
        case .returns: "المرتجعات"
        case .shipping: "الشحن والتوصيل"
        case .isp: "إدارة الإنترنت"
        case .network: "أجهزة الشبكة"
        case .importer: "استيراد الكشوفات"
        case .whatsapp: "واتساب المحل"
        case .assistant: "المساعد الذكي"
        case .analytics: "التحليلات"
        case .employees: "الموظفون والصلاحيات"
        case .sessions: "الجلسات والأجهزة"
        case .activity: "سجل العمليات"
        case .reports: "التقارير"
        case .notifications: "الإشعارات"
        case .settings: "الإعدادات"
        }
    }

    var short: String {
        switch self {
        case .dashboard: "الرئيسية"
        case .invoices: "المبيعات"
        case .customers: "الديون"
        case .isp: "الإنترنت"
        default: title
        }
    }

    var icon: String {
        switch self {
        case .dashboard: "square.grid.2x2"
        case .invoices: "doc.text"
        case .products: "shippingbox"
        case .shortages: "exclamationmark.triangle"
        case .customers: "person.2.wave.2"
        case .vault: "building.columns"
        case .expenses: "arrow.up.forward.circle"
        case .purchases: "cart"
        case .suppliers: "truck.box"
        case .repairs: "wrench.and.screwdriver"
        case .returns: "arrow.uturn.backward.circle"
        case .shipping: "shippingbox.and.arrow.backward"
        case .isp: "wifi"
        case .network: "point.3.connected.trianglepath.dotted"
        case .importer: "doc.viewfinder"
        case .whatsapp: "bubble.left.and.text.bubble.right"
        case .assistant: "sparkles"
        case .analytics: "chart.xyaxis.line"
        case .employees: "person.badge.key"
        case .sessions: "macbook.and.iphone"
        case .activity: "clock.arrow.trianglehead.counterclockwise.rotate.90"
        case .reports: "chart.bar.xaxis"
        case .notifications: "bell.badge"
        case .settings: "gearshape"
        }
    }

    var tint: Color {
        switch self {
        case .dashboard, .invoices: Yq.teal
        case .customers, .suppliers, .purchases: Yq.deepGold
        case .vault, .reports, .analytics: Yq.purple
        case .expenses, .shortages: Yq.red
        case .products, .returns: Yq.amber
        case .isp, .network, .repairs, .shipping: Yq.blue
        case .whatsapp: Yq.green
        case .assistant: Yq.deepGold
        default: Yq.teal
        }
    }

    /// يكفي امتلاك واحدة من هذه الصلاحيات. فارغة = متاح للجميع.
    var anyOf: [String] {
        switch self {
        case .dashboard, .reports, .analytics: ["dashboard"]
        case .invoices: ["pos"]
        case .products: ["inventory"]
        case .shortages: ["shortages"]
        case .customers, .isp, .whatsapp: ["customers"]
        case .vault: ["vaults"]
        case .expenses: ["expenses"]
        case .purchases, .suppliers: ["purchase.view"]
        case .repairs: ["repairs"]
        case .returns: ["returns"]
        case .shipping: ["shipping", "shipping.view"]
        case .employees: ["employees"]
        case .sessions: ["employees", "employees.permissions"]
        case .activity: ["employees.permissions"]
        case .network: ["network", "network.devices"]
        case .importer: ["customers.edit"]
        case .notifications, .settings, .assistant: []
        }
    }

    var group: String {
        switch self {
        case .dashboard, .invoices, .customers, .vault, .expenses, .reports, .analytics, .assistant: "المال والمبيعات"
        case .products, .shortages, .purchases, .suppliers, .returns: "المخزون والمشتريات"
        case .isp, .network, .importer: "الإنترنت والشبكة"
        case .repairs, .shipping, .whatsapp: "العمليات"
        case .employees, .sessions, .activity, .notifications, .settings: "الإدارة"
        }
    }

    static let groups = ["المال والمبيعات", "المخزون والمشتريات", "الإنترنت والشبكة", "العمليات", "الإدارة"]

    /// الأقسام الظاهرة في شريط تبويب الآيفون (الباقي في «المزيد» وفي الشريط الجانبي للآيباد).
    static let phoneTabs: [AppSection] = [.dashboard, .customers, .isp]
}
