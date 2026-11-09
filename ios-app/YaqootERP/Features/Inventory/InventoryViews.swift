import SwiftUI

nonisolated struct ProductRow: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let detail: String
    let price: Double
    let stock: Double
    let min: Double
    let low: Bool
    let service: Bool

    @MainActor init(_ r: Record) {
        id = r.id
        name = r["name"].text
        detail = [r["brand"].string, r["model"].string, r["category"].string].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " • ")
        price = r["selling_price"].num
        stock = r["stock_quantity"].num
        min = r["min_stock_alert"].num
        low = r["low"].isTrue
        service = r["is_service"].isTrue
    }
}

/// المخزون: قائمة على الآيفون، وجدول قابل للفرز على الآيباد.
struct ProductsView: View {
    @State private var model = Paged.erp("products", listKey: "products", cursor: { _, n in ["offset": String(n)] })
    @State private var sort = [KeyPathComparator(\ProductRow.name)]
    @Environment(\.horizontalSizeClass) private var size

    var body: some View {
        Group {
            if size == .regular {
                VStack(spacing: 8) {
                    FilterBar(options: filters, selection: $model.filter).padding(.horizontal)
                    Table(model.rows.map(ProductRow.init).sorted(using: sort), sortOrder: $sort) {
                        TableColumn("المنتج", value: \.name) { p in
                            VStack(alignment: .leading) {
                                Text(p.name).bold()
                                if !p.detail.isEmpty { Text(p.detail).font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                        TableColumn("السعر", value: \.price) { Text(Fmt.money($0.price)).monospacedDigit() }
                        TableColumn("المخزون", value: \.stock) { p in
                            if p.service { Pill("خدمة") } else { Pill("\(Fmt.money(p.stock)) قطعة", color: p.low ? Yq.amber : Yq.green) }
                        }
                        TableColumn("حد التنبيه", value: \.min) { Text(Fmt.money($0.min)).foregroundStyle(.secondary) }
                    }
                    .searchable(text: $model.query, prompt: "اسم المنتج، الماركة أو الباركود…")
                    if model.more { Button("تحميل المزيد") { Task { await model.reload(append: true) } }.padding(.bottom, 8) }
                }
                .background { YaqootBackground() }
                .task { if model.rows.isEmpty { await model.reload() } }
                .onChange(of: model.filter) { Task { await model.reload() } }
                .onChange(of: model.query) { Task { await model.reload() } }
                .refreshable { await model.reload() }
            } else {
                PagedList(model: model, searchPrompt: "اسم المنتج، الماركة، الموديل أو الباركود…", filters: filters) { r in
                    let p = ProductRow(r)
                    RowView(icon: "shippingbox", color: p.low ? Yq.amber : Yq.teal, title: p.name, subtitle: p.detail,
                            value: Fmt.iqd(p.price), pill: p.service ? ("خدمة", Yq.teal) : ("\(Fmt.money(p.stock)) قطعة", p.low ? Yq.amber : Yq.green))
                }
            }
        }
    }

    private var filters: [(String, String)] { [("", "الكل"), ("low_only=1", "تحت الحد")] }
}

struct ShortagesView: View {
    var body: some View {
        RemoteView(load: { try await API.shared.get("shortages") }) { d, remote in
            List {
                SwiftUI.Section("نواقص مسجلة يدوياً (\(d["manual"].array.count))") {
                    if d["manual"].array.isEmpty { Text("لا توجد نواقص يدوية").foregroundStyle(.secondary) }
                    ForEach(d["manual"].array.records) { r in
                        RowView(icon: "exclamationmark.bubble", color: Yq.amber, title: r["name"].text,
                                subtitle: "\(r["category"].text) • \(Fmt.when(r["created_at"]))")
                    }
                }
                SwiftUI.Section("تحت حد التنبيه (\(d["low_stock"].array.count))") {
                    if d["low_stock"].array.isEmpty { Text("كل المنتجات فوق الحد").foregroundStyle(.secondary) }
                    ForEach(d["low_stock"].array.records) { r in
                        RowView(icon: "shippingbox", color: Yq.red, title: r["name"].text,
                                pill: ("\(r["stock_quantity"].text) / \(r["min_stock_alert"].text)", Yq.red))
                    }
                }
            }
            .yaqootBackground()
            .refreshable { await remote.reload() }
        }
    }
}
