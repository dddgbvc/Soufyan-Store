import Foundation

/// قيمة JSON مرنة: واجهات ياقوت تعيد كائنات jsonb متغيرة الحقول من دوال Postgres.
nonisolated enum JSON: Sendable, Hashable, Codable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let d = try? c.decode(Double.self) { self = .number(d) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSON].self) { self = .array(a) }
        else if let o = try? c.decode([String: JSON].self) { self = .object(o) }
        else { self = .null }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let d):
            if d.rounded() == d, abs(d) < 9e15 { try c.encode(Int64(d)) } else { try c.encode(d) }
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    subscript(key: String) -> JSON {
        if case .object(let o) = self { return o[key] ?? .null }
        return .null
    }

    subscript(index: Int) -> JSON {
        if case .array(let a) = self, a.indices.contains(index) { return a[index] }
        return .null
    }

    var isNull: Bool { if case .null = self { return true }; return false }
    var isObject: Bool { if case .object = self { return true }; return false }

    var string: String? {
        switch self {
        case .string(let s): return s
        case .number(let d): return d.rounded() == d ? String(Int64(d)) : String(d)
        case .bool(let b): return b ? "true" : "false"
        default: return nil
        }
    }

    /// النص للعرض: فارغ إن لم توجد قيمة.
    var text: String { string ?? "" }

    var double: Double? {
        switch self {
        case .number(let d): return d
        case .string(let s): return Double(s)
        default: return nil
        }
    }

    var num: Double { double ?? 0 }
    var int: Int? { double.map { Int($0) } }

    var bool: Bool? {
        switch self {
        case .bool(let b): return b
        case .string(let s): return s == "true"
        case .number(let d): return d != 0
        default: return nil
        }
    }

    var isTrue: Bool { bool == true }
    var array: [JSON] { if case .array(let a) = self { return a }; return [] }
    var object: [String: JSON] { if case .object(let o) = self { return o }; return [:] }

    /// معرّف ثابت لاستعماله في القوائم.
    var id: String { self["id"].text }
}

extension JSON: ExpressibleByStringLiteral, ExpressibleByIntegerLiteral, ExpressibleByFloatLiteral,
                ExpressibleByBooleanLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral, ExpressibleByNilLiteral {
    nonisolated init(stringLiteral value: String) { self = .string(value) }
    nonisolated init(integerLiteral value: Int) { self = .number(Double(value)) }
    nonisolated init(floatLiteral value: Double) { self = .number(value) }
    nonisolated init(booleanLiteral value: Bool) { self = .bool(value) }
    nonisolated init(arrayLiteral elements: JSON...) { self = .array(elements) }
    nonisolated init(dictionaryLiteral elements: (String, JSON)...) {
        self = .object(Dictionary(elements, uniquingKeysWith: { $1 }))
    }
    nonisolated init(nilLiteral: ()) { self = .null }
}

extension JSON {
    nonisolated static func str(_ s: String?) -> JSON { s.map { .string($0) } ?? .null }
    nonisolated static func num(_ d: Double) -> JSON { .number(d) }
    nonisolated static func int(_ i: Int) -> JSON { .number(Double(i)) }
}

/// صف قابل للتعريف لعرض كائن JSON في List/Table.
struct Record: Identifiable, Hashable, Sendable {
    let json: JSON
    let id: String
    init(_ json: JSON, idKey: String = "id", fallback: Int = 0) {
        self.json = json
        let v = json[idKey].text
        self.id = v.isEmpty ? "row-\(fallback)" : v
    }
    subscript(key: String) -> JSON { json[key] }
}

extension Array where Element == JSON {
    var records: [Record] { enumerated().map { Record($1, fallback: $0) } }
}
