import ActivityKit
import Foundation
import SwiftUI

/// ملخص المحل للودجت والجزيرة الديناميكية (من ‎/api/native/summary‎ بنفس صلاحيات الموظف).
/// الحقول الغائبة = الموظف لا يملك صلاحية القسم، فلا تُعرض.
nonisolated struct ShopSummary: Codable, Hashable, Sendable {
    var at: Date
    var storeName: String?
    var employee: String?
    var salesToday: Double?
    var invoicesToday: Int?
    var collectedToday: Double?
    var mySales: Double?
    var vault: Double?
    var debts: Double?
    var debtors: Int?
    var ispExpired: Int?
    var ispSoon: Int?
    var ispTotal: Int?
    var repairsReady: Int?
    var unread: Int

    /// قراءة استجابة الخادم (أرقام Postgres قد تصل كنص).
    init?(server data: Data) {
        guard let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], o["ok"] as? Bool == true else { return nil }
        func num(_ v: Any?) -> Double? {
            if let n = v as? NSNumber { return n.doubleValue }
            if let s = v as? String { return Double(s) }
            return nil
        }
        func dict(_ k: String) -> [String: Any]? { o[k] as? [String: Any] }
        at = Date()
        storeName = o["store_name"] as? String
        employee = o["employee"] as? String
        salesToday = num(dict("sales")?["today_total"])
        invoicesToday = num(dict("sales")?["today_count"]).map { Int($0) }
        collectedToday = num(o["collected_today"])
        mySales = num(dict("my_sales")?["total"])
        vault = num(o["vault_balance"])
        debts = num(dict("debts")?["total"])
        debtors = num(dict("debts")?["debtors"]).map { Int($0) }
        ispExpired = num(dict("isp")?["expired"]).map { Int($0) }
        ispSoon = num(dict("isp")?["soon"]).map { Int($0) }
        ispTotal = num(dict("isp")?["total"]).map { Int($0) }
        repairsReady = num(o["repairs_ready"]).map { Int($0) }
        unread = Int(num(o["unread"]) ?? 0)
    }

    init(at: Date, storeName: String?, salesToday: Double?, invoicesToday: Int?, collectedToday: Double?, vault: Double?,
         debts: Double?, debtors: Int?, ispExpired: Int?, ispSoon: Int?, repairsReady: Int?, unread: Int) {
        self.at = at; self.storeName = storeName; self.salesToday = salesToday; self.invoicesToday = invoicesToday
        self.collectedToday = collectedToday; self.vault = vault; self.debts = debts; self.debtors = debtors
        self.ispExpired = ispExpired; self.ispSoon = ispSoon; self.repairsReady = repairsReady; self.unread = unread
    }

    /// للمعاينة في معرض الودجت فقط.
    static let placeholder = ShopSummary(at: Date(), storeName: "مكتب سفيان للموبايل", salesToday: 1_845_000, invoicesToday: 23,
                                         collectedToday: 420_000, vault: 4_250_000, debts: 6_735_000, debtors: 41,
                                         ispExpired: 9, ispSoon: 14, repairsReady: 4, unread: 3)
}

/// جلب الملخص من الخادم بالرمز السري للجهاز، وحفظه للودجت.
nonisolated enum SummaryLoader {
    static func fetch() async -> ShopSummary? {
        guard let base = SharedStore.baseURL, base.hasPrefix("https://"), let token = SharedStore.token(),
              let url = URL(string: base + "/api/native/summary") else { return nil }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = "POST"
        req.setValue(token, forHTTPHeaderField: "X-Yaqoot-Device")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200, let s = ShopSummary(server: data) else { return nil }
        SharedStore.saveSummary(s)
        return s
    }
}

/// تنسيق مختصر للأرقام في المساحات الصغيرة: 1.85م، 250ألف.
nonisolated enum Compact {
    static func money(_ v: Double?) -> String {
        guard let v else { return "—" }
        let a = abs(v)
        if a >= 1_000_000 { return trim(v / 1_000_000) + "م" }
        if a >= 1_000 { return trim(v / 1_000) + "ألف" }
        return String(Int(v))
    }

    static func full(_ v: Double?) -> String {
        guard let v else { return "—" }
        let s = String(Int64(v.rounded()).magnitude)
        var out = ""
        for (i, ch) in s.enumerated() {
            if i > 0 && (s.count - i) % 3 == 0 { out.append(",") }
            out.append(ch)
        }
        return (v < 0 ? "-" : "") + out
    }

    private static func trim(_ x: Double) -> String {
        let r = (x * 100).rounded() / 100
        return r == r.rounded() ? String(Int(r)) : String(format: r * 10 == (r * 10).rounded() ? "%.1f" : "%.2f", r)
    }
}

/// الجزيرة الديناميكية وشاشة القفل: متابعة مباشرة لأرقام اليوم.
nonisolated struct ShopActivityAttributes: ActivityAttributes {
    nonisolated struct ContentState: Codable, Hashable, Sendable {
        var salesToday: Double?
        var invoicesToday: Int?
        var collectedToday: Double?
        var unread: Int
        var ispExpired: Int?
        var ispSoon: Int?
        var updatedAt: Date

        init(_ s: ShopSummary) {
            salesToday = s.salesToday ?? s.mySales
            invoicesToday = s.invoicesToday
            collectedToday = s.collectedToday
            unread = s.unread
            ispExpired = s.ispExpired
            ispSoon = s.ispSoon
            updatedAt = s.at
        }
    }

    var storeName: String
}

/// رمز الشعار (الأعمدة الثلاثة) للمساحات الصغيرة: الجزيرة الديناميكية وشاشة القفل والودجت.
struct BrandGlyph: View {
    var height: CGFloat = 16
    var onDark = true

    var body: some View {
        let w = height * 0.28
        HStack(alignment: .bottom, spacing: w * 0.55) {
            Capsule().fill(onDark ? Color(red: 0.945, green: 0.929, blue: 0.894) : Color(red: 0.078, green: 0.204, blue: 0.247))
                .frame(width: w, height: height * 0.51)
            Capsule().fill(onDark ? Color(red: 0.945, green: 0.929, blue: 0.894) : Color(red: 0.078, green: 0.204, blue: 0.247))
                .frame(width: w, height: height * 0.755)
            Capsule().fill(Color(red: 0.784, green: 0.663, blue: 0.412))
                .frame(width: w, height: height)
        }
        .environment(\.layoutDirection, .leftToRight)
        .accessibilityLabel("مكتب سفيان للموبايل")
    }
}
