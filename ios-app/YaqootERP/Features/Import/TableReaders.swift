import Compression
import CryptoKit
import Foundation
import PDFKit
import UIKit
import Vision

/// جدول مقروء من ملف: صفوف من خلايا نصية.
typealias Grid = [[String]]

enum ImportError: LocalizedError {
    case unsupported(String)
    case unreadable(String)
    case empty

    var errorDescription: String? {
        switch self {
        case .unsupported(let m): m
        case .unreadable(let m): "تعذرت قراءة الملف: \(m)"
        case .empty: "لم يُعثر على جدول في الملف."
        }
    }
}

// MARK: - CSV

/// قارئ CSV متوافق مع RFC 4180 (علامات اقتباس، أسطر داخل الخلايا) مع اكتشاف الفاصل (, ; Tab).
nonisolated enum CSVReader {
    static func parse(_ text: String) -> Grid {
        var t = text
        if t.hasPrefix("\u{FEFF}") { t.removeFirst() }
        let delimiter = detectDelimiter(t)
        var rows: Grid = []
        var row: [String] = []
        var field = ""
        var quoted = false
        var i = t.startIndex
        while i < t.endIndex {
            let c = t[i]
            if quoted {
                if c == "\"" {
                    let n = t.index(after: i)
                    if n < t.endIndex && t[n] == "\"" { field.append("\""); i = n } else { quoted = false }
                } else {
                    field.append(c)
                }
            } else if c == "\"" && field.isEmpty {
                quoted = true
            } else if c == delimiter {
                row.append(field); field = ""
            } else if c == "\n" || c == "\r\n" || c == "\r" {
                row.append(field); field = ""
                if !row.allSatisfy({ $0.trimmingCharacters(in: .whitespaces).isEmpty }) { rows.append(row) }
                row = []
            } else {
                field.append(c)
            }
            i = t.index(after: i)
        }
        if !field.isEmpty || !row.isEmpty {
            row.append(field)
            if !row.allSatisfy({ $0.trimmingCharacters(in: .whitespaces).isEmpty }) { rows.append(row) }
        }
        return rows.map { $0.map { $0.trimmingCharacters(in: .whitespaces) } }
    }

    static func detectDelimiter(_ t: String) -> Character {
        let firstLine = t.prefix { $0 != "\n" && $0 != "\r\n" && $0 != "\r" }
        let counts: [(Character, Int)] = [(",", 0), (";", 0), ("\t", 0), ("،", 0)].map { d in (d.0, firstLine.filter { $0 == d.0 }.count) }
        return counts.max { $0.1 < $1.1 }.flatMap { $0.1 > 0 ? $0.0 : nil } ?? ","
    }

    static func decode(_ data: Data) -> String {
        if let s = String(data: data, encoding: .utf8) { return s }
        if let s = String(data: data, encoding: .windowsCP1256) { return s }
        return String(decoding: data, as: UTF8.self)
    }
}

extension String.Encoding {
    /// Windows-1256 (العربية) — شائع في ملفات CSV المصدّرة من برامج قديمة.
    nonisolated static let windowsCP1256 = String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(CFStringEncoding(CFStringEncodings.windowsArabic.rawValue)))
}

// MARK: - XLSX (ZIP + XML) بدون مكتبات خارجية

/// قارئ ZIP بسيط (deflate/stored) يكفي لملفات Office Open XML.
nonisolated enum ZipReader {
    nonisolated struct Entry: Sendable { let name: String; let method: UInt16; let compressedSize: Int; let size: Int; let localOffset: Int }

    static func entries(_ d: Data) throws -> [Entry] {
        let b = [UInt8](d)
        guard b.count > 22 else { throw ImportError.unreadable("ملف مضغوط تالف") }
        var eocd = -1
        var i = b.count - 22
        while i >= max(0, b.count - 65_557) {
            if b[i] == 0x50 && b[i + 1] == 0x4B && b[i + 2] == 0x05 && b[i + 3] == 0x06 { eocd = i; break }
            i -= 1
        }
        guard eocd >= 0 else { throw ImportError.unreadable("ليس ملف xlsx صالحاً") }
        let count = Int(u16(b, eocd + 10))
        var p = Int(u32(b, eocd + 16))
        var out: [Entry] = []
        for _ in 0..<count {
            guard p + 46 <= b.count, u32(b, p) == 0x02014B50 else { break }
            let method = u16(b, p + 10)
            let csize = Int(u32(b, p + 20)), size = Int(u32(b, p + 24))
            let nlen = Int(u16(b, p + 28)), elen = Int(u16(b, p + 30)), clen = Int(u16(b, p + 32))
            let offset = Int(u32(b, p + 42))
            let name = String(decoding: b[(p + 46)..<(p + 46 + nlen)], as: UTF8.self)
            out.append(Entry(name: name, method: method, compressedSize: csize, size: size, localOffset: offset))
            p += 46 + nlen + elen + clen
        }
        return out
    }

    static func extract(_ d: Data, _ e: Entry) throws -> Data {
        let b = [UInt8](d)
        let p = e.localOffset
        guard p + 30 <= b.count, u32(b, p) == 0x04034B50 else { throw ImportError.unreadable("ترويسة ملف داخلي تالفة") }
        let start = p + 30 + Int(u16(b, p + 26)) + Int(u16(b, p + 28))
        guard start + e.compressedSize <= b.count else { throw ImportError.unreadable("ملف داخلي مقطوع") }
        let raw = Data(b[start..<(start + e.compressedSize)])
        switch e.method {
        case 0: return raw
        case 8: return try inflate(raw, expected: e.size)
        default: throw ImportError.unsupported("طريقة ضغط غير مدعومة (\(e.method)).")
        }
    }

    /// فك DEFLATE الخام عبر إطار Compression من Apple (COMPRESSION_ZLIB = RFC 1951 بلا ترويسة).
    static func inflate(_ src: Data, expected: Int) throws -> Data {
        let capacity = max(expected, src.count * 4, 1024)
        var dst = Data(count: capacity)
        let n = dst.withUnsafeMutableBytes { (d: UnsafeMutableRawBufferPointer) -> Int in
            src.withUnsafeBytes { (s: UnsafeRawBufferPointer) -> Int in
                compression_decode_buffer(d.bindMemory(to: UInt8.self).baseAddress!, capacity,
                                          s.bindMemory(to: UInt8.self).baseAddress!, src.count, nil, COMPRESSION_ZLIB)
            }
        }
        guard n > 0 else { throw ImportError.unreadable("فشل فك الضغط") }
        return dst.prefix(n)
    }

    private static func u16(_ b: [UInt8], _ i: Int) -> UInt16 { UInt16(b[i]) | UInt16(b[i + 1]) << 8 }
    private static func u32(_ b: [UInt8], _ i: Int) -> UInt32 {
        UInt32(b[i]) | UInt32(b[i + 1]) << 8 | UInt32(b[i + 2]) << 16 | UInt32(b[i + 3]) << 24
    }
}

/// يقرأ أول ورقة عمل من ملف xlsx (السلاسل المشتركة والقيم المباشرة والنصوص المضمنة).
nonisolated enum XLSXReader {
    static func read(_ data: Data) throws -> Grid {
        let entries = try ZipReader.entries(data)
        func file(_ name: String) throws -> Data? {
            guard let e = entries.first(where: { $0.name == name }) else { return nil }
            return try ZipReader.extract(data, e)
        }
        let shared = try file("xl/sharedStrings.xml").map(SharedStringsParser.parse) ?? []
        let sheetPath = try firstSheetPath(entries: entries, file: file)
        guard let sheet = try file(sheetPath) else { throw ImportError.unreadable("لا توجد ورقة عمل") }
        let grid = SheetParser.parse(sheet, shared: shared)
        guard !grid.isEmpty else { throw ImportError.empty }
        return grid
    }

    private static func firstSheetPath(entries: [ZipReader.Entry], file: (String) throws -> Data?) throws -> String {
        if let wb = try file("xl/workbook.xml"), let rels = try file("xl/_rels/workbook.xml.rels"),
           let rid = XMLAttr.first(in: wb, element: "sheet", attribute: "r:id"),
           let target = XMLAttr.target(in: rels, id: rid) {
            return target.hasPrefix("/") ? String(target.dropFirst()) : "xl/" + target
        }
        return entries.map(\.name).filter { $0.hasPrefix("xl/worksheets/sheet") }.sorted().first ?? "xl/worksheets/sheet1.xml"
    }

    /// "C12" ← 2 (عمود يبدأ من 0)
    static func column(_ ref: String) -> Int {
        var n = 0
        for ch in ref.uppercased() {
            guard let a = ch.asciiValue, a >= 65, a <= 90 else { break }
            n = n * 26 + Int(a - 64)
        }
        return max(0, n - 1)
    }
}

nonisolated final class SharedStringsParser: NSObject, XMLParserDelegate {
    private var out: [String] = []
    private var current = ""
    private var inSI = false, inT = false

    static func parse(_ d: Data) -> [String] {
        let p = SharedStringsParser()
        let x = XMLParser(data: d)
        x.delegate = p
        x.parse()
        return p.out
    }

    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String] = [:]) {
        if name == "si" { inSI = true; current = "" }
        if name == "t" && inSI { inT = true }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) { if inT { current += string } }

    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
        if name == "t" { inT = false }
        if name == "si" { out.append(current); inSI = false }
    }
}

nonisolated final class SheetParser: NSObject, XMLParserDelegate {
    private let shared: [String]
    private var rows: [Int: [Int: String]] = [:]
    private var rowIndex = 0
    private var col = 0
    private var type = ""
    private var value = ""
    private var inV = false, inIs = false

    init(shared: [String]) { self.shared = shared }

    static func parse(_ d: Data, shared: [String]) -> Grid {
        let p = SheetParser(shared: shared)
        let x = XMLParser(data: d)
        x.delegate = p
        x.parse()
        guard let maxRow = p.rows.keys.max() else { return [] }
        let width = (p.rows.values.flatMap(\.keys).max() ?? 0) + 1
        var grid: Grid = []
        for r in 0...maxRow {
            guard let cells = p.rows[r] else { continue }
            let line = (0..<width).map { cells[$0] ?? "" }
            if line.contains(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) { grid.append(line) }
        }
        return grid
    }

    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes a: [String: String] = [:]) {
        switch name {
        case "row":
            rowIndex = (Int(a["r"] ?? "") ?? (rowIndex + 1)) - 1
            col = 0
        case "c":
            if let r = a["r"] { col = XLSXReader.column(r) }
            type = a["t"] ?? ""
            value = ""
        case "v": inV = true
        case "is": inIs = true
        case "t": if inIs { inV = true }
        default: break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) { if inV { value += string } }

    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
        switch name {
        case "v", "t": inV = false
        case "is": inIs = false
        case "c":
            var text = value
            if type == "s", let i = Int(value), shared.indices.contains(i) { text = shared[i] }
            else if type == "b" { text = value == "1" ? "TRUE" : "FALSE" }
            else if type.isEmpty || type == "n", let d = Double(value), d.rounded() == d, abs(d) < 1e15 { text = String(Int64(d)) }
            rows[rowIndex, default: [:]][col] = text.trimmingCharacters(in: .whitespacesAndNewlines)
            col += 1
        default: break
        }
    }
}

/// استخراج سمات XML بسيطة دون محلل كامل.
nonisolated enum XMLAttr {
    static func first(in d: Data, element: String, attribute: String) -> String? {
        let s = String(decoding: d, as: UTF8.self)
        guard let r = s.range(of: "<\(element) ") else { return nil }
        let tag = s[r.lowerBound...].prefix { $0 != ">" }
        guard let a = tag.range(of: "\(attribute)=\"") else { return nil }
        return String(tag[a.upperBound...].prefix { $0 != "\"" })
    }

    static func target(in d: Data, id: String) -> String? {
        let s = String(decoding: d, as: UTF8.self)
        guard let r = s.range(of: "Id=\"\(id)\"") else { return nil }
        let start = s[..<r.lowerBound].lastIndex(of: "<") ?? r.lowerBound
        let tag = s[start...].prefix { $0 != ">" }
        guard let a = tag.range(of: "Target=\"") else { return nil }
        return String(tag[a.upperBound...].prefix { $0 != "\"" })
    }
}

// MARK: - PDF (نص) و OCR (صور/مسح ضوئي)

enum PDFReader {
    /// PDF نصي: نص الصفحات ثم تقسيم الأسطر لخلايا. PDF ممسوح: OCR عبر Vision.
    static func read(_ data: Data) async throws -> (Grid, usedOCR: Bool) {
        guard let doc = PDFDocument(data: data) else { throw ImportError.unreadable("PDF غير صالح") }
        var text = ""
        for i in 0..<doc.pageCount { text += (doc.page(at: i)?.string ?? "") + "\n" }
        let grid = TextTable.split(text)
        if grid.count >= 2 && text.count > 40 { return (grid, false) }

        var images: [CGImage] = []
        for i in 0..<min(doc.pageCount, 20) {
            guard let page = doc.page(at: i) else { continue }
            let box = page.bounds(for: .mediaBox)
            let scale = 2200 / max(box.width, box.height)
            if let cg = page.thumbnail(of: CGSize(width: box.width * scale, height: box.height * scale), for: .mediaBox).cgImage {
                images.append(cg)
            }
        }
        var all: Grid = []
        for img in images { all += try await OCR.grid(img) }
        guard !all.isEmpty else { throw ImportError.empty }
        return (all, true)
    }
}

nonisolated enum TextTable {
    /// يقسم النص إلى صفوف وخلايا: Tab أو مسافتان فأكثر أو | تفصل الخلايا.
    static func split(_ text: String) -> Grid {
        text.split(whereSeparator: \.isNewline).compactMap { line -> [String]? in
            let l = String(line).replacingOccurrences(of: "|", with: "\t")
            let cells = l.components(separatedBy: "\t").flatMap { $0.components(separatedBy: "  ") }
                .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            return cells.isEmpty ? nil : cells
        }
    }
}

/// التعرف على النص (Vision) وإعادة بناء الجدول من مواضع الكلمات: تجميع حسب السطر ثم ترتيب أفقي.
enum OCR {
    static func grid(_ image: CGImage) async throws -> Grid {
        var request = RecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        let supported = request.supportedRecognitionLanguages
        let wanted = supported.filter { $0.languageCode?.identifier == "ar" || $0.languageCode?.identifier == "en" }
        if !wanted.isEmpty { request.recognitionLanguages = wanted }
        let observations = try await request.perform(on: image)

        struct Word { let text: String; let x: CGFloat; let y: CGFloat; let h: CGFloat }
        let words: [Word] = observations.compactMap { o in
            guard let t = o.topCandidates(1).first?.string else { return nil }
            let b = o.boundingBox.cgRect
            return Word(text: t, x: b.midX, y: b.midY, h: b.height)
        }
        let sorted = words.sorted { $0.y > $1.y }
        var lines: [[Word]] = []
        for w in sorted {
            if let last = lines.last?.last, abs(last.y - w.y) < max(last.h, w.h) * 0.6 {
                lines[lines.count - 1].append(w)
            } else {
                lines.append([w])
            }
        }
        // العربية من اليمين لليسار: ترتيب تنازلي حسب x حتى تبقى أول خلية هي الأقرب للبداية.
        return lines.map { $0.sorted { $0.x > $1.x }.map(\.text) }
    }

    static func grid(from uiImage: UIImage) async throws -> Grid {
        guard let cg = uiImage.cgImage else { throw ImportError.unreadable("صورة غير صالحة") }
        return try await grid(cg)
    }
}

// MARK: - اختيار القارئ حسب نوع الملف

enum TableFile {
    static func read(url: URL) async throws -> (Grid, note: String) {
        let ext = url.pathExtension.lowercased()
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: url)
        switch ext {
        case "csv", "txt", "tsv":
            return (CSVReader.parse(CSVReader.decode(data)), "CSV")
        case "xlsx":
            return (try XLSXReader.read(data), "Excel (xlsx)")
        case "xls":
            throw ImportError.unsupported("صيغة xls القديمة غير مدعومة مباشرة. افتح الملف في Excel أو Numbers واحفظه بصيغة xlsx أو csv.")
        case "pdf":
            let (g, ocr) = try await PDFReader.read(data)
            return (g, ocr ? "PDF ممسوح (OCR)" : "PDF نصي")
        case "jpg", "jpeg", "png", "heic":
            guard let img = UIImage(data: data) else { throw ImportError.unreadable("صورة غير صالحة") }
            return (try await OCR.grid(from: img), "صورة (OCR)")
        default:
            throw ImportError.unsupported("نوع الملف غير مدعوم: .\(ext)")
        }
    }
}
