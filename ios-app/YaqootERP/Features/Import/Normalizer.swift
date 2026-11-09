import CryptoKit
import Foundation

/// الحقول التي يمكن ربط أعمدة الكشف بها.
nonisolated enum ImportField: String, CaseIterable, Identifiable, Sendable {
    case ignore, name, phone, username, package, expiry, debt, price, reference, note
    var id: String { rawValue }
    var label: String {
        switch self {
        case .ignore: "تجاهل"
        case .name: "الاسم"
        case .phone: "الهاتف"
        case .username: "اسم المستخدم لدى المزوّد"
        case .package: "الباقة"
        case .expiry: "تاريخ الانتهاء"
        case .debt: "الدين/المبلغ المستحق"
        case .price: "السعر"
        case .reference: "رقم مرجعي/فاتورة"
        case .note: "ملاحظات"
        }
    }

    /// مرادفات العناوين بالعربية والإنجليزية (بعد التطبيع).
    var synonyms: [String] {
        switch self {
        case .ignore: []
        case .name: ["الاسم", "اسم", "اسم المشترك", "اسم الزبون", "المشترك", "الزبون", "العميل", "اسم العميل", "name", "full name", "customer", "subscriber", "client"]
        case .phone: ["الهاتف", "هاتف", "رقم الهاتف", "الموبايل", "موبايل", "جوال", "رقم الموبايل", "phone", "mobile", "tel", "telephone"]
        case .username: ["اسم المستخدم", "المستخدم", "يوزر", "اليوزر", "username", "user", "login", "user name"]
        case .package: ["الباقه", "باقه", "الاشتراك", "نوع الاشتراك", "profile", "package", "plan", "service", "السرعه"]
        case .expiry: ["الانتهاء", "تاريخ الانتهاء", "ينتهي", "تاريخ الانتهاء", "expiry", "expiration", "expires", "end date", "expire"]
        case .debt: ["الدين", "الديون", "المبلغ", "المتبقي", "الرصيد", "المطلوب", "مستحق", "debt", "balance", "amount", "due"]
        case .price: ["السعر", "سعر", "سعر البيع", "price", "fee", "cost"]
        case .reference: ["المرجع", "رقم الفاتوره", "الفاتوره", "رقم الوصل", "ref", "reference", "invoice", "receipt"]
        case .note: ["ملاحظات", "ملاحظه", "notes", "note", "remarks"]
        }
    }
}

/// صف بعد التطبيع.
nonisolated struct ImportRow: Identifiable, Hashable, Sendable {
    let id: Int
    var name = ""
    var phone = ""
    var username = ""
    var package = ""
    var expiry = ""
    var debt: Double = 0
    var price: Double = 0
    var reference = ""
    var note = ""
    var issues: [String] = []
    var duplicateOfRow: Int?
    var include = true
    /// زبون موجود في ياقوت (بالهاتف أو الاسم) — يُضاف الدين عليه بدل إنشاء زبون جديد.
    var existingID: String?
    var existingName: String?
    var existingBalance: Double?

    /// مفتاح هوية الشخص: الهاتف (آخر 10 أرقام) إن وُجد، وإلا الاسم بعد التطبيع.
    var personKey: String { phone.count >= 10 ? "p:" + String(phone.suffix(10)) : "n:" + Normalizer.normalizeName(name) }

    var isValid: Bool { !name.isEmpty && issues.isEmpty }
}

nonisolated enum Normalizer {
    static func normalizeHeader(_ s: String) -> String {
        normalizeName(s).replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: ":", with: "")
    }

    /// تطبيع الأسماء العربية للمقارنة: الهمزات والتاء المربوطة والألف المقصورة والتشكيل والمسافات.
    static func normalizeName(_ s: String) -> String {
        var t = Fmt.normalizeDigits(s).lowercased()
        let map: [Character: Character] = ["أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي"]
        t = String(t.map { map[$0] ?? $0 })
        t = t.unicodeScalars.filter { !(0x064B...0x065F).contains($0.value) && $0.value != 0x0640 }.reduce(into: "") { $0.unicodeScalars.append($1) }
        return t.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// تخمين ربط الأعمدة من صف العناوين.
    static func guessMapping(_ header: [String]) -> [ImportField] {
        let priority: [ImportField] = [.username, .phone, .expiry, .package, .debt, .price, .note, .reference, .name]
        var used = Set<ImportField>()
        return header.map { raw in
            let h = normalizeHeader(raw)
            guard !h.isEmpty else { return .ignore }
            if let exact = priority.first(where: { f in !used.contains(f) && f.synonyms.map(normalizeHeader).contains(h) }) {
                used.insert(exact); return exact
            }
            if let partial = priority.first(where: { f in !used.contains(f) && f.synonyms.map(normalizeHeader).contains { h.contains($0) } }) {
                used.insert(partial); return partial
            }
            return .ignore
        }
    }

    /// أول صف (من أول 10) يحوي عنوانين معروفين على الأقل.
    static func headerRow(_ grid: Grid) -> Int? {
        for (i, row) in grid.prefix(10).enumerated() where guessMapping(row).filter({ $0 != .ignore }).count >= 2 {
            return i
        }
        return nil
    }

    /// هاتف عراقي بصيغة 07XXXXXXXXX. يعيد nil إن لم يكن صالحاً.
    static func phone(_ raw: String) -> String? {
        var d = String(Fmt.normalizeDigits(raw).filter { $0.isASCII && $0.isNumber })
        if d.isEmpty { return "" }
        if d.hasPrefix("00964") { d = "0" + d.dropFirst(5) }
        else if d.hasPrefix("964") { d = "0" + d.dropFirst(3) }
        if d.count == 10 && d.hasPrefix("7") { d = "0" + d }
        return d.count == 11 && d.hasPrefix("07") ? d : nil
    }

    static func rows(_ grid: Grid, mapping: [ImportField], headerIndex: Int?) -> [ImportRow] {
        let start = (headerIndex ?? -1) + 1
        guard start < grid.count else { return [] }
        var out: [ImportRow] = []
        var firstByKey: [String: Int] = [:]
        for (offset, cells) in grid[start...].enumerated() {
            var r = ImportRow(id: start + offset)
            for (c, field) in mapping.enumerated() where c < cells.count {
                let v = cells[c].trimmingCharacters(in: .whitespacesAndNewlines)
                guard !v.isEmpty else { continue }
                switch field {
                case .ignore: break
                case .name: r.name = r.name.isEmpty ? v : r.name + " " + v
                case .phone:
                    if let p = phone(v) { r.phone = p } else { r.issues.append("هاتف غير صالح: \(v)") }
                case .username: r.username = v
                case .package: r.package = v
                case .expiry: r.expiry = v
                case .debt: r.debt = Fmt.parseMoney(v)
                case .price: r.price = Fmt.parseMoney(v)
                case .reference: r.reference = v
                case .note: r.note = v
                }
            }
            if r.name.isEmpty && r.phone.isEmpty && r.username.isEmpty && r.debt == 0 { continue }
            if r.name.isEmpty { r.name = r.username }
            if r.name.trimmingCharacters(in: .whitespaces).count < 2 { r.issues.append("الاسم مفقود") }
            if r.debt < 0 { r.issues.append("مبلغ سالب"); r.debt = 0 }
            if let first = firstByKey[r.personKey] {
                r.duplicateOfRow = first
                r.include = false
            } else {
                firstByKey[r.personKey] = r.id
            }
            if !r.isValid { r.include = false }
            out.append(r)
        }
        return out
    }

    /// معرّف عملية ثابت ومشتق من المحتوى: رفع نفس الكشف مرة ثانية يعيد نفس المعرّفات،
    /// فيرجع الخادم العملية السابقة بدل تكرار الزبون أو الدين.
    static func clientID(_ parts: [String]) -> String {
        let digest = SHA256.hash(data: Data(parts.joined(separator: "|").utf8))
        return "imp-" + digest.map { String(format: "%02x", $0) }.joined().prefix(40)
    }

    static func customerClientID(_ r: ImportRow) -> String { clientID(["c", r.personKey]) }

    static func debtClientID(_ r: ImportRow) -> String {
        clientID(["d", r.personKey, String(Int64(r.debt.rounded())), normalizeName(r.reference), normalizeName(r.expiry)])
    }

    /// ملاحظة الزبون: بيانات الاشتراك كما وردت (للمرجعية فقط، لا تُستعمل كرقم زبون).
    static func customerNote(_ r: ImportRow, source: String) -> String {
        var parts = ["استيراد من \(source)"]
        if !r.username.isEmpty { parts.append("مستخدم المزوّد: \(r.username)") }
        if !r.package.isEmpty { parts.append("الباقة: \(r.package)") }
        if !r.expiry.isEmpty { parts.append("الانتهاء: \(r.expiry)") }
        if !r.note.isEmpty { parts.append(r.note) }
        return String(parts.joined(separator: " • ").prefix(400))
    }
}
