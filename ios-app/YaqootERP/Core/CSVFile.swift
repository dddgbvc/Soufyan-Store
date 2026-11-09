import CoreTransferable
import Foundation
import UniformTypeIdentifiers

/// ملف CSV للتصدير والمشاركة (يفتح في Excel/Numbers مع دعم العربية عبر BOM).
nonisolated struct CSVFile: Transferable, Sendable {
    let name: String
    let header: [String]
    let rows: [[String]]

    var data: Data {
        func esc(_ s: String) -> String {
            s.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" }) ? "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\"" : s
        }
        let text = ([header] + rows).map { $0.map(esc).joined(separator: ",") }.joined(separator: "\r\n")
        return Data([0xEF, 0xBB, 0xBF]) + Data(text.utf8)
    }

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .commaSeparatedText) { $0.data }
            .suggestedFileName("Yaqoot-export.csv")
    }
}
