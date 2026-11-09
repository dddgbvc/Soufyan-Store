import Foundation
import Testing
@testable import YaqootERP

final class BundleToken {}

func fixture(_ name: String) throws -> URL {
    let parts = name.split(separator: ".")
    let url = Bundle(for: BundleToken.self).url(forResource: String(parts[0]), withExtension: String(parts[1]))
    return try #require(url, "fixture \(name) missing from test bundle")
}

@Suite("JSON")
struct JSONTests {
    @Test func decodesMixedPostgresPayload() throws {
        let data = Data(#"{"ok":true,"total":"125000.50","count":3,"items":[{"id":"a"},{"id":7}],"none":null}"#.utf8)
        let j = try JSONDecoder().decode(JSON.self, from: data)
        #expect(j["ok"].isTrue)
        #expect(j["total"].num == 125000.5)
        #expect(j["count"].int == 3)
        #expect(j["items"].array.count == 2)
        #expect(j["items"][1]["id"].text == "7")
        #expect(j["none"].isNull)
        #expect(j["missing"]["deep"].isNull)
    }

    @Test func encodesIntegersWithoutFraction() throws {
        let j: JSON = ["amount": .num(25000), "ratio": 0.5]
        let s = String(decoding: try JSONEncoder().encode(j), as: UTF8.self)
        #expect(s.contains("\"amount\":25000"))
        #expect(s.contains("0.5"))
    }

    @Test func recordsGetStableFallbackIDs() {
        let rows: [JSON] = [["name": "x"], ["id": "abc"]]
        #expect(rows.records.map(\.id) == ["row-0", "abc"])
    }
}

@Suite("Format")
struct FormatTests {
    @Test func moneyGroupsThousands() {
        #expect(Fmt.money(0.0) == "0")
        #expect(Fmt.money(1_250_000.0) == "1,250,000")
        #expect(Fmt.money(-35_000.0) == "-35,000")
        #expect(Fmt.iqd(999.6) == "1,000 د.ع")
    }

    @Test func parsesArabicDigitsAndSeparators() {
        #expect(Fmt.parseMoney("١٢٥٬٠٠٠") == 125000)
        #expect(Fmt.parseMoney("125,000 د.ع") == 125000)
        #expect(Fmt.parseMoney("۵۰۰") == 500)
        #expect(Fmt.parseMoney("") == 0)
    }

    @Test(arguments: [
        ("2026-11-08T10:15:30.123456+00:00", 13),
        ("2026-11-08T21:00:00Z", 0),
        ("2026-11-08 10:15:30+03", 10),
    ])
    func parsesPostgresTimestamps(raw: String, baghdadHour: Int) throws {
        let d = try #require(Fmt.parse(raw))
        #expect(Fmt.calendar.component(.hour, from: d) == baghdadHour)
    }

    @Test func parsesDateOnly() throws {
        let d = try #require(Fmt.parse("2026-11-09"))
        #expect(Fmt.calendar.component(.day, from: d) == 9)
    }

    @Test func whatsappNumbers() {
        #expect(Fmt.waNumber("0770 123 4567") == "9647701234567")
        #expect(Fmt.waNumber("+964 780 111 2222") == "9647801112222")
        #expect(Fmt.waNumber("٠٧٨٠١١١٢٢٢٢") == "9647801112222")
        #expect(Fmt.waNumber("") == "")
    }
}

@Suite("CSV")
struct CSVTests {
    @Test func quotesCommasAndEscapedQuotes() {
        let g = CSVReader.parse("name,phone\n\"Ali, Hassan\",0770\n\"Sara \"\"S\"\"\",0780\n")
        #expect(g == [["name", "phone"], ["Ali, Hassan", "0770"], ["Sara \"S\"", "0780"]])
    }

    @Test func detectsSemicolonAndStripsBOM() throws {
        let data = try Data(contentsOf: try fixture("debts.csv"))
        let g = CSVReader.parse(CSVReader.decode(data))
        #expect(g.count == 3)
        #expect(g[0] == ["الاسم", "الهاتف", "الدين"])
        #expect(g[1][0] == "حسن، علي")
        #expect(g[2][0] == "سارة \"الصغيرة\"")
    }

    @Test func multilineCell() {
        let g = CSVReader.parse("a,b\n\"line1\nline2\",x\n")
        #expect(g[1][0] == "line1\nline2")
    }
}

@Suite("XLSX")
struct XLSXTests {
    @Test func readsFirstSheetWithSharedStrings() throws {
        let data = try Data(contentsOf: try fixture("subscribers.xlsx"))
        let g = try XLSXReader.read(data)
        #expect(g.count == 6)
        #expect(g[1].first == "اسم المشترك")
        #expect(g[2][0] == "علي حسين")
        #expect(g[2][5] == "35000")
        #expect(g[3][5] == "25,000")
    }

    @Test func columnLetters() {
        #expect(XLSXReader.column("A1") == 0)
        #expect(XLSXReader.column("F12") == 5)
        #expect(XLSXReader.column("AA3") == 26)
    }

    @Test func rejectsNonZip() {
        #expect(throws: (any Error).self) { try XLSXReader.read(Data("not a zip file at all, definitely".utf8)) }
    }
}

@Suite("Import normalizer")
struct NormalizerTests {
    @Test func guessesArabicHeaders() {
        let m = Normalizer.guessMapping(["اسم المشترك", "رقم الهاتف", "اسم المستخدم", "الباقة", "تاريخ الانتهاء", "المبلغ المتبقي", "x"])
        #expect(m == [.name, .phone, .username, .package, .expiry, .debt, .ignore])
    }

    @Test func iraqiPhones() {
        #expect(Normalizer.phone("0770 123 4567") == "07701234567")
        #expect(Normalizer.phone("+9647801234567") == "07801234567")
        #expect(Normalizer.phone("009647501234567") == "07501234567")
        #expect(Normalizer.phone("7701234567") == "07701234567")
        #expect(Normalizer.phone("12345") == nil)
        #expect(Normalizer.phone("") == "")
    }

    @Test func normalizesArabicNames() {
        #expect(Normalizer.normalizeName("  أحمد   عليّ ") == Normalizer.normalizeName("احمد علي"))
        #expect(Normalizer.normalizeName("فاطمة") == Normalizer.normalizeName("فاطمه"))
    }

    @Test func fullPipelineFromXLSX() throws {
        let g = try XLSXReader.read(try Data(contentsOf: try fixture("subscribers.xlsx")))
        let header = try #require(Normalizer.headerRow(g))
        #expect(header == 1)
        let rows = Normalizer.rows(g, mapping: Normalizer.guessMapping(g[header]), headerIndex: header)
        #expect(rows.count == 4)
        #expect(rows[0].phone == "07701234567")
        #expect(rows[0].debt == 35000)
        #expect(rows[1].phone == "07801234567")
        #expect(rows[1].debt == 25000)
        // نفس الهاتف في صف آخر: مكرر في الملف ومستبعد افتراضياً.
        #expect(rows[2].duplicateOfRow == rows[0].id)
        #expect(rows[2].include == false)
        // هاتف غير صالح: مستبعد مع سبب.
        #expect(rows[3].issues.isEmpty == false)
        #expect(rows[3].include == false)
    }

    @Test func idempotencyKeysAreStableAndServerValid() {
        var a = ImportRow(id: 3)
        a.name = "علي حسين"; a.phone = "07701234567"; a.debt = 35000; a.reference = "INV-1"
        var b = ImportRow(id: 99)   // نفس البيانات من رفع ثانٍ للملف (موضع مختلف)
        b.name = "علي  حسين"; b.phone = "07701234567"; b.debt = 35000.2; b.reference = "inv-1"
        #expect(Normalizer.customerClientID(a) == Normalizer.customerClientID(b))
        #expect(Normalizer.debtClientID(a) == Normalizer.debtClientID(b))
        var c = a
        c.debt = 40000
        #expect(Normalizer.debtClientID(a) != Normalizer.debtClientID(c))
        // web_client_id في القاعدة: ^[A-Za-z0-9_-]{8,80}$
        let id = Normalizer.debtClientID(a)
        #expect(id.range(of: "^[A-Za-z0-9_-]{8,80}$", options: .regularExpression) != nil)
    }

    @Test func randomClientIDsMatchServerRule() {
        let id = newClientID()
        #expect(id.count == 24)
        #expect(id.range(of: "^[A-Za-z0-9_-]{8,80}$", options: .regularExpression) != nil)
        #expect(newClientID() != id)
    }
}

@Suite("Text tables & sections")
struct MiscTests {
    @Test func splitsPDFTextLines() {
        let g = TextTable.split("الاسم    الهاتف\tالدين\nعلي  07701234567  5000\n\n")
        #expect(g == [["الاسم", "الهاتف", "الدين"], ["علي", "07701234567", "5000"]])
    }

    @Test func sectionsFollowPermissions() {
        let app = AppState.shared
        app.employee = ["role": "CASHIER"]
        app.permissions = ["pos", "customers"]
        #expect(app.allowed(.invoices))
        #expect(app.allowed(.customers))
        #expect(!app.allowed(.vault))
        #expect(!app.allowed(.activity))
        #expect(app.allowed(.settings))
        app.permissions = []
        app.employee = .null
    }

    @Test func notificationRouting() {
        let app = AppState.shared
        app.phase = .loading
        app.route(fromURL: "/#isp")
        #expect(app.pendingRoute == .isp)
        app.route(fromURL: "https://evil.example/#vault")
        #expect(app.pendingRoute == .isp)
        app.pendingRoute = nil
    }
}

@Suite("Widgets & Live Activity")
struct WidgetTests {
    @Test func parsesServerSummaryWithNumericStrings() throws {
        let raw = #"{"ok":true,"store_name":"مكتب سفيان للموبايل","sales":{"today_total":"1845000.00","today_count":23},"collected_today":420000,"debts":{"total":110000.00,"debtors":2},"isp":{"expired":1,"soon":0,"total":1},"vault_balance":"221700.00","unread":3}"#
        let s = try #require(ShopSummary(server: Data(raw.utf8)))
        #expect(s.salesToday == 1_845_000)
        #expect(s.invoicesToday == 23)
        #expect(s.vault == 221_700)
        #expect(s.debtors == 2)
        #expect(s.ispExpired == 1)
        #expect(s.unread == 3)
        #expect(s.repairsReady == nil)   // لا صلاحية صيانة = لا يظهر
    }

    @Test func rejectsFailedSummary() {
        #expect(ShopSummary(server: Data(#"{"ok":false,"reason":"unregistered"}"#.utf8)) == nil)
    }

    @Test func compactMoney() {
        #expect(Compact.money(1_850_000) == "1.85م")
        #expect(Compact.money(1_500_000) == "1.5م")
        #expect(Compact.money(2_000_000) == "2م")
        #expect(Compact.money(250_000) == "250ألف")
        #expect(Compact.money(nil) == "—")
        #expect(Compact.full(1_845_000) == "1,845,000")
    }

    @Test func liveActivityStateUsesSummary() {
        let st = ShopActivityAttributes.ContentState(.placeholder)
        #expect(st.salesToday == 1_845_000)
        #expect(st.ispSoon == 14)
    }
}
