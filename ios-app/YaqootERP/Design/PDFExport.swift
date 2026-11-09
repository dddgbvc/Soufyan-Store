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

/// تقرير PDF بشعار المحل وجداول بسيطة (يُرسم من SwiftUI بنص متجهي قابل للنسخ والبحث).
struct ReportDocument: View {
    nonisolated struct Part: Identifiable, Sendable {
        let id = UUID()
        let title: String
        let rows: [[String]]
        let header: [String]
    }

    let title: String
    let sections: [Part]
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 14) {
                BrandMark(size: 56)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 24, weight: .bold))
                    Text("\(AppState.shared.storeName.isEmpty ? "مكتب سفيان للموبايل" : AppState.shared.storeName) • \(Fmt.when(Date()))")
                        .font(.system(size: 12)).foregroundStyle(.gray)
                    if let subtitle { Text(subtitle).font(.system(size: 12)).foregroundStyle(.gray) }
                }
                Spacer()
            }
            ForEach(sections) { part in
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(part.title) (\(part.rows.count))").font(.system(size: 16, weight: .semibold)).foregroundStyle(Yq.navy)
                    Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 6) {
                        GridRow {
                            ForEach(Array(part.header.enumerated()), id: \.offset) { _, h in
                                Text(h).font(.system(size: 11, weight: .bold)).foregroundStyle(.gray)
                            }
                        }
                        Divider()
                        if part.rows.isEmpty {
                            GridRow { Text("لا يوجد").font(.system(size: 11)).foregroundStyle(.gray) }
                        }
                        ForEach(Array(part.rows.enumerated()), id: \.offset) { _, row in
                            GridRow {
                                ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                                    Text(cell).font(.system(size: 11)).lineLimit(2)
                                }
                            }
                        }
                    }
                }
            }
            Spacer(minLength: 0)
            Text("أُنشئ من تطبيق متابعة مكتب سفيان للموبايل").font(.system(size: 9)).foregroundStyle(.gray)
        }
        .padding(32)
        .frame(width: 595, alignment: .topLeading)
        .background(Color.white)
        .foregroundStyle(Color.black)
        .environment(\.layoutDirection, .rightToLeft)
        .environment(\.colorScheme, .light)
    }
}

enum PDFExport {
    /// تاريخ مختصر لأسماء الملفات: 2026-11-09.
    static var stamp: String {
        let c = Fmt.calendar.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", c.year ?? 2026, c.month ?? 1, c.day ?? 1)
    }

    /// يرسم العرض إلى ملف PDF بعرض A4 (صفحة واحدة بطول المحتوى).
    static func render<V: View>(_ view: V, name: String) -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(name).pdf")
        let renderer = ImageRenderer(content: view)
        renderer.proposedSize = ProposedViewSize(width: 595, height: nil)
        var ok = false
        renderer.render { size, draw in
            var box = CGRect(origin: .zero, size: CGSize(width: max(size.width, 595), height: max(size.height, 200)))
            guard let ctx = CGContext(url as CFURL, mediaBox: &box, nil) else { return }
            ctx.beginPDFPage(nil)
            draw(ctx)
            ctx.endPDFPage()
            ctx.closePDF()
            ok = true
        }
        return ok ? url : nil
    }
}
