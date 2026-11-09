import SwiftUI
import UIKit

/// ملف للمشاركة (PDF/CSV).
nonisolated struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
}

/// نافذة المشاركة الأصلية (واتساب، الملفات، الطباعة، AirDrop…).
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

/// بيانات تقرير PDF: عنوان، سطر فرعي، وأقسام كل منها جدول نصي.
/// بيانات فقط (لا واجهة): الرسم يتم بأداة PDF الرسمية في UIKit (UIGraphicsPDFRenderer).
nonisolated struct ReportDocument: Sendable {
    nonisolated struct Part: Sendable {
        let title: String
        let rows: [[String]]
        let header: [String]
    }

    let title: String
    let sections: [Part]
    var subtitle: String? = nil
}

/// إنشاء ملفات PDF بأداة Apple الرسمية UIGraphicsPDFRenderer:
/// صفحات A4 حقيقية متعددة، نص عربي متجهي قابل للنسخ والبحث، من اليمين لليسار، وتكرار رأس الجدول في كل صفحة.
enum PDFExport {
    /// تاريخ مختصر لأسماء الملفات: 2026-11-09.
    static var stamp: String {
        let c = Fmt.calendar.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", c.year ?? 2026, c.month ?? 1, c.day ?? 1)
    }

    // A4 بالنقاط.
    private static let page = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)
    private static let margin: CGFloat = 36
    private static let footerSpace: CGFloat = 28
    private static let cellPad: CGFloat = 5

    private static let navy = UIColor(red: 0x14 / 255, green: 0x34 / 255, blue: 0x3F / 255, alpha: 1)
    private static let gold = UIColor(red: 0xC8 / 255, green: 0xA9 / 255, blue: 0x69 / 255, alpha: 1)
    private static let gray = UIColor(white: 0.42, alpha: 1)
    private static let line = UIColor(white: 0.82, alpha: 1)
    private static let stripe = UIColor(white: 0.965, alpha: 1)

    /// يكتب التقرير إلى ملف PDF مؤقت ويعيد رابطه، أو nil عند الفشل.
    static func render(_ doc: ReportDocument, name: String) -> URL? {
        let safeName = name.replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(safeName).pdf")
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [
            kCGPDFContextTitle as String: doc.title,
            kCGPDFContextCreator as String: "متابعة مكتب سفيان للموبايل",
        ]
        let renderer = UIGraphicsPDFRenderer(bounds: page, format: format)
        do {
            try renderer.writePDF(to: url) { ctx in
                var w = Writer(ctx: ctx, doc: doc)
                w.run()
            }
            return url
        } catch {
            return nil
        }
    }

    // MARK: - الرسم

    private struct Writer {
        let ctx: UIGraphicsPDFRendererContext
        let doc: ReportDocument
        var y: CGFloat = 0
        var pageNumber = 0

        private var contentWidth: CGFloat { PDFExport.page.width - PDFExport.margin * 2 }
        private var bottom: CGFloat { PDFExport.page.height - PDFExport.margin - PDFExport.footerSpace }

        mutating func run() {
            newPage()
            drawHeader()
            for part in doc.sections { drawPart(part) }
            y += 14
            ensure(16)
            _ = drawText("أُنشئ من تطبيق متابعة مكتب سفيان للموبايل", size: 8, color: PDFExport.gray,
                         in: CGRect(x: PDFExport.margin, y: y, width: contentWidth, height: 14))
        }

        // MARK: صفحات

        mutating func newPage() {
            ctx.beginPage()
            pageNumber += 1
            y = PDFExport.margin
            drawFooter()
        }

        /// صفحة جديدة إذا لم تتسع المساحة المطلوبة.
        mutating func ensure(_ height: CGFloat) {
            if y + height > bottom { newPage() }
        }

        func drawFooter() {
            let text = "صفحة \(pageNumber)"
            _ = drawText(text, size: 8, color: PDFExport.gray, alignment: .center,
                         in: CGRect(x: PDFExport.margin, y: PDFExport.page.height - PDFExport.margin - 10, width: contentWidth, height: 12))
        }

        // MARK: رأس التقرير

        mutating func drawHeader() {
            let logo: CGFloat = 46
            let logoRect = CGRect(x: PDFExport.page.width - PDFExport.margin - logo, y: y, width: logo, height: logo)
            drawLogo(in: logoRect)
            let textWidth = contentWidth - logo - 12
            let store = AppState.shared.storeName.isEmpty ? "مكتب سفيان للموبايل" : AppState.shared.storeName
            var ty = y + 2
            ty += drawText(doc.title, size: 20, weight: .bold, color: PDFExport.navy,
                           in: CGRect(x: PDFExport.margin, y: ty, width: textWidth, height: 30))
            ty += drawText("\(store) • \(Fmt.when(Date()))", size: 10, color: PDFExport.gray,
                           in: CGRect(x: PDFExport.margin, y: ty + 2, width: textWidth, height: 16)) + 2
            if let sub = doc.subtitle, !sub.isEmpty {
                ty += drawText(sub, size: 10, color: PDFExport.gray, in: CGRect(x: PDFExport.margin, y: ty, width: textWidth, height: 16))
            }
            y = max(ty, y + logo) + 12
            PDFExport.navy.setFill()
            UIRectFill(CGRect(x: PDFExport.margin, y: y, width: contentWidth, height: 1.5))
            y += 14
        }

        /// شعار المحل مرسوماً (مربع كحلي وثلاثة أعمدة ذهبية) بدون الاعتماد على صور.
        func drawLogo(in r: CGRect) {
            PDFExport.navy.setFill()
            UIBezierPath(roundedRect: r, cornerRadius: r.width * 0.27).fill()
            let barW = r.width * 0.101
            let gap = r.width * 0.155
            let heights: [CGFloat] = [0.185, 0.272, 0.36]
            let total = barW * 3 + (gap - barW) * 2
            var x = r.midX - total / 2
            let base = r.midY + r.height * 0.18
            PDFExport.gold.setFill()
            for h in heights {
                let bh = h * r.height
                UIBezierPath(roundedRect: CGRect(x: x, y: base - bh, width: barW, height: bh), cornerRadius: barW / 2).fill()
                x += gap
            }
        }

        // MARK: الجداول

        mutating func drawPart(_ part: ReportDocument.Part) {
            let cols = max(part.header.count, part.rows.map { $0.count }.max() ?? 0, 1)
            let colW = contentWidth / CGFloat(cols)

            ensure(24 + rowHeight(part.header, cols: cols, colW: colW, size: 9, weight: .semibold) + 22)
            y += drawText("\(part.title) (\(part.rows.count))", size: 13, weight: .semibold, color: PDFExport.navy,
                          in: CGRect(x: PDFExport.margin, y: y, width: contentWidth, height: 20)) + 6
            drawHeaderRow(part.header, cols: cols, colW: colW)

            if part.rows.isEmpty {
                ensure(20)
                y += drawText("لا يوجد", size: 9, color: PDFExport.gray, in: CGRect(x: PDFExport.margin, y: y + 4, width: contentWidth, height: 14)) + 8
            }
            for (i, row) in part.rows.enumerated() {
                let h = rowHeight(row, cols: cols, colW: colW, size: 9, weight: .regular)
                if y + h > bottom {
                    newPage()
                    drawHeaderRow(part.header, cols: cols, colW: colW)
                }
                if i % 2 == 1 {
                    PDFExport.stripe.setFill()
                    UIRectFill(CGRect(x: PDFExport.margin, y: y, width: contentWidth, height: h))
                }
                drawCells(row, cols: cols, colW: colW, height: h, size: 9, weight: .regular, color: .black)
                PDFExport.line.setFill()
                UIRectFill(CGRect(x: PDFExport.margin, y: y + h - 0.5, width: contentWidth, height: 0.5))
                y += h
            }
            y += 18
        }

        mutating func drawHeaderRow(_ header: [String], cols: Int, colW: CGFloat) {
            guard !header.isEmpty else { return }
            let h = rowHeight(header, cols: cols, colW: colW, size: 9, weight: .semibold)
            PDFExport.navy.withAlphaComponent(0.08).setFill()
            UIRectFill(CGRect(x: PDFExport.margin, y: y, width: contentWidth, height: h))
            drawCells(header, cols: cols, colW: colW, height: h, size: 9, weight: .semibold, color: PDFExport.navy)
            PDFExport.navy.setFill()
            UIRectFill(CGRect(x: PDFExport.margin, y: y + h - 0.8, width: contentWidth, height: 0.8))
            y += h
        }

        /// الخلايا من اليمين لليسار: العمود الأول في أقصى اليمين.
        func drawCells(_ cells: [String], cols: Int, colW: CGFloat, height: CGFloat, size: CGFloat, weight: UIFont.Weight, color: UIColor) {
            for c in 0..<cols {
                let text = c < cells.count ? cells[c] : ""
                let x = PDFExport.margin + contentWidth - colW * CGFloat(c + 1)
                let rect = CGRect(x: x + PDFExport.cellPad, y: y + PDFExport.cellPad, width: colW - PDFExport.cellPad * 2, height: height - PDFExport.cellPad * 2)
                _ = drawText(text, size: size, weight: weight, color: color, in: rect)
            }
        }

        func rowHeight(_ cells: [String], cols: Int, colW: CGFloat, size: CGFloat, weight: UIFont.Weight) -> CGFloat {
            var h: CGFloat = 0
            for c in 0..<min(cols, cells.count) {
                h = max(h, measure(cells[c], size: size, weight: weight, width: colW - PDFExport.cellPad * 2))
            }
            return max(h, size + 4) + PDFExport.cellPad * 2
        }

        // MARK: نص

        static func attributes(size: CGFloat, weight: UIFont.Weight, color: UIColor, alignment: NSTextAlignment) -> [NSAttributedString.Key: Any] {
            let p = NSMutableParagraphStyle()
            p.alignment = alignment
            p.baseWritingDirection = .rightToLeft
            p.lineBreakMode = .byWordWrapping
            return [.font: UIFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color, .paragraphStyle: p]
        }

        func measure(_ text: String, size: CGFloat, weight: UIFont.Weight, width: CGFloat) -> CGFloat {
            let s = NSAttributedString(string: text, attributes: Self.attributes(size: size, weight: weight, color: .black, alignment: .right))
            let r = s.boundingRect(with: CGSize(width: max(width, 1), height: .greatestFiniteMagnitude),
                                   options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
            return ceil(r.height)
        }

        /// يرسم النص داخل المستطيل ويعيد ارتفاعه الفعلي.
        @discardableResult
        func drawText(_ text: String, size: CGFloat, weight: UIFont.Weight = .regular, color: UIColor,
                      alignment: NSTextAlignment = .right, in rect: CGRect) -> CGFloat {
            let s = NSAttributedString(string: text, attributes: Self.attributes(size: size, weight: weight, color: color, alignment: alignment))
            let h = measure(text, size: size, weight: weight, width: rect.width)
            s.draw(with: CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: max(rect.height, h)),
                   options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
            return h
        }
    }
}
