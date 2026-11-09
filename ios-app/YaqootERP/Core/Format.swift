import Foundation
import SwiftUI
import UIKit

/// تنسيق الأرقام والتواريخ (بتوقيت بغداد) والتسميات. أرقام لاتينية دائماً كما في الويب والأندرويد.
enum Fmt {
    static let baghdad = TimeZone(identifier: "Asia/Baghdad") ?? TimeZone(secondsFromGMT: 3 * 3600)!

    static let months = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول",
                         "تشرين الأول", "تشرين الثاني", "كانون الأول"]
    /// حسب Calendar.weekday: 1 = الأحد.
    static let days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]

    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = baghdad
        return c
    }

    static func money(_ v: Double) -> String {
        let n = Int64(v.rounded())
        let s = String(n.magnitude)
        var out = ""
        for (i, ch) in s.enumerated() {
            if i > 0 && (s.count - i) % 3 == 0 { out.append(",") }
            out.append(ch)
        }
        return (n < 0 ? "-" : "") + out
    }

    static func money(_ j: JSON) -> String { money(j.num) }
    static func iqd(_ v: Double) -> String { "\(money(v)) د.ع" }
    static func iqd(_ j: JSON) -> String { iqd(j.num) }

    /// يقرأ تاريخ ISO من Postgres (مع أجزاء الثانية حتى 6 أرقام) أو تاريخاً فقط.
    static func parse(_ raw: String?) -> Date? {
        guard var s = raw?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
        if s.count == 10 {
            let f = DateFormatter()
            f.calendar = Calendar(identifier: .gregorian)
            f.locale = Locale(identifier: "en_US_POSIX")
            f.timeZone = baghdad
            f.dateFormat = "yyyy-MM-dd"
            return f.date(from: s)
        }
        s = s.replacingOccurrences(of: " ", with: "T")
        if let dot = s.firstIndex(of: "."), let end = s[dot...].firstIndex(where: { $0 == "+" || $0 == "-" || $0 == "Z" }) {
            s.removeSubrange(dot..<end)
        } else if let dot = s.firstIndex(of: ".") {
            s.removeSubrange(dot..<s.endIndex)
        }
        if s.count == 19 { s += "Z" }
        if s.range(of: #"T.*[+-]\d\d$"#, options: .regularExpression) != nil { s += ":00" }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

    static func when(_ j: JSON) -> String { when(parse(j.string)) }

    static func when(_ d: Date?) -> String {
        guard let d else { return "—" }
        let c = calendar.dateComponents([.day, .month, .hour, .minute], from: d)
        let h24 = c.hour ?? 0
        let h = h24 % 12 == 0 ? 12 : h24 % 12
        return "\(c.day ?? 1) \(months[(c.month ?? 1) - 1]) • \(h):\(String(format: "%02d", c.minute ?? 0)) \(h24 < 12 ? "ص" : "م")"
    }

    /// "9/11 8:12م" للجداول الضيقة.
    static func shortWhen(_ d: Date) -> String {
        let c = calendar.dateComponents([.day, .month, .hour, .minute], from: d)
        let h24 = c.hour ?? 0
        return "\(c.day ?? 1)/\(c.month ?? 1) \(h24 % 12 == 0 ? 12 : h24 % 12):\(String(format: "%02d", c.minute ?? 0))\(h24 < 12 ? "ص" : "م")"
    }

    static func dateOnly(_ j: JSON) -> String {
        guard let d = parse(j.string) else { return "—" }
        let c = calendar.dateComponents([.day, .month, .year], from: d)
        return "\(c.day ?? 1) \(months[(c.month ?? 1) - 1]) \(c.year ?? 2026)"
    }

    static func weekday(_ ymd: String) -> String {
        guard let d = parse(ymd) else { return "" }
        return days[calendar.component(.weekday, from: d) - 1]
    }

    static func shortDay(_ ymd: String) -> String {
        guard let d = parse(ymd) else { return ymd }
        let c = calendar.dateComponents([.day, .month], from: d)
        return "\(c.day ?? 1)/\(c.month ?? 1)"
    }

    static func todayLong(_ now: Date = Date()) -> String {
        let c = calendar.dateComponents([.weekday, .day, .month], from: now)
        return "\(days[(c.weekday ?? 1) - 1]) \(c.day ?? 1) \(months[(c.month ?? 1) - 1])"
    }

    static func relativeDays(_ days: Int?) -> String {
        guard let days else { return "" }
        if days < 0 { return "منذ \(-days) يوم" }
        if days == 0 { return "اليوم" }
        return "بعد \(days) يوم"
    }

    static let roles: [String: String] = [
        "ADMIN": "المدير العام", "MANAGER": "مدير", "ACCOUNTANT": "محاسب",
        "CASHIER": "كاشير", "TECHNICIAN": "فني صيانة", "DELIVERY": "مندوب توصيل",
    ]

    static func role(_ j: JSON) -> String { roles[j.text.uppercased()] ?? j.text }

    static func payment(_ j: JSON) -> String {
        ["CASH": "نقدي", "DEBT": "آجل", "CREDIT": "آجل", "CARD": "بطاقة", "MIXED": "مختلط"][j.text.uppercased()] ?? (j.string ?? "—")
    }

    /// رقم عراقي بصيغة واتساب الدولية.
    static func waNumber(_ phone: String) -> String {
        var d = String(normalizeDigits(phone).filter { $0.isASCII && $0.isNumber })
        if d.isEmpty { return "" }
        if d.hasPrefix("00") { d.removeFirst(2) }
        if d.hasPrefix("964") { return d }
        if d.hasPrefix("0") { d.removeFirst() }
        return d.count == 10 && d.hasPrefix("7") ? "964" + d : d
    }

    static func whatsapp(_ phone: String, _ text: String) -> URL? {
        let n = waNumber(phone)
        guard !n.isEmpty else { return nil }
        var c = URLComponents(string: "https://wa.me/\(n)")
        c?.queryItems = [URLQueryItem(name: "text", value: text)]
        return c?.url
    }

    static func tel(_ phone: String) -> URL? {
        let d = String(normalizeDigits(phone).filter { ($0.isASCII && $0.isNumber) || $0 == "+" })
        return d.isEmpty ? nil : URL(string: "tel:\(d)")
    }

    /// يحوّل الأرقام العربية-الهندية والفارسية إلى لاتينية.
    nonisolated static func normalizeDigits(_ s: String) -> String {
        var out = ""
        for u in s.unicodeScalars {
            switch u.value {
            case 0x0660...0x0669: out.unicodeScalars.append(Unicode.Scalar(u.value - 0x0660 + 48)!)
            case 0x06F0...0x06F9: out.unicodeScalars.append(Unicode.Scalar(u.value - 0x06F0 + 48)!)
            default: out.unicodeScalars.append(u)
            }
        }
        return out
    }

    /// يقرأ مبلغاً من نص المستخدم: "125,000" أو "١٢٥٬٠٠٠" أو "125000 د.ع".
    nonisolated static func parseMoney(_ s: String) -> Double {
        let d = normalizeDigits(s)
        var cleaned = ""
        var seenDot = false
        for ch in d {
            if ch.isNumber { cleaned.append(ch) }
            else if (ch == "." || ch == "٫") && !seenDot { cleaned.append("."); seenDot = true }
            else if ch == "-" && cleaned.isEmpty { cleaned.append("-") }
        }
        return Double(cleaned) ?? 0
    }
}

/// ألوان العلامة (من شعار مكتب سفيان للموبايل): كحلي #14343F، ذهبي #C8A969، عاجي #F1EDE4.
enum Yq {
    static let navy = Color(red: 0x14 / 255, green: 0x34 / 255, blue: 0x3F / 255)
    static let cream = Color(red: 0xF1 / 255, green: 0xED / 255, blue: 0xE4 / 255)
    /// اللون الأساسي للتطبيق: كحلي الشعار في الوضع الفاتح، ودرجة أفتح منه في الداكن حتى يبقى مقروءاً.
    static let teal = Color(uiColor: UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0x86 / 255, green: 0xAE / 255, blue: 0xBD / 255, alpha: 1)
            : UIColor(red: 0x14 / 255, green: 0x34 / 255, blue: 0x3F / 255, alpha: 1)
    })
    static let gold = Color(red: 0xC8 / 255, green: 0xA9 / 255, blue: 0x69 / 255)
    static let deepGold = Color(red: 0xA8 / 255, green: 0x88 / 255, blue: 0x48 / 255)
    static let green = Color(red: 0x1F / 255, green: 0x9D / 255, blue: 0x6B / 255)
    static let blue = Color(red: 0x2F / 255, green: 0x6F / 255, blue: 0xDB / 255)
    static let purple = Color(red: 0x7A / 255, green: 0x55 / 255, blue: 0xD8 / 255)
    static let amber = Color(red: 0xE0 / 255, green: 0x8E / 255, blue: 0x1B / 255)
    static let red = Color(red: 0xD9 / 255, green: 0x3F / 255, blue: 0x3F / 255)
}
