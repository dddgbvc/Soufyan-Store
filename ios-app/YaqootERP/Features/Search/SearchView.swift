import SwiftUI

/// بحث شامل: الزبائن، الفواتير، المنتجات، مشتركي الإنترنت، والأقسام — حسب الصلاحيات.
struct SearchView: View {
    @State private var app = AppState.shared
    @State private var q = ""
    @State private var results: [String: [Record]] = [:]
    @State private var loading = false

    private var sectionHits: [AppSection] {
        let t = q.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return [] }
        return app.sections.filter { $0.title.localizedStandardContains(t) }
    }

    var body: some View {
        List {
            if q.trimmingCharacters(in: .whitespaces).count < 2 {
                SwiftUI.Section("اقتراحات") {
                    ForEach(app.sections.prefix(8)) { s in
                        Button { app.go(s) } label: { Label(s.title, systemImage: s.icon) }
                    }
                }
            }
            if !sectionHits.isEmpty {
                SwiftUI.Section("الأقسام") {
                    ForEach(sectionHits) { s in Button { app.go(s) } label: { Label(s.title, systemImage: s.icon) } }
                }
            }
            group("customers", "الزبائن") { r in
                NavigationLink(value: CustomerRef(id: r.id)) {
                    RowView(avatarText: r["name"].text, color: Yq.deepGold, title: r["name"].text, subtitle: r["phone"].string, value: Fmt.iqd(r["balance"]))
                }
            }
            group("invoices", "الفواتير") { r in
                NavigationLink(value: InvoiceRef(id: r.id)) { InvoiceTile(r: r.json) }
            }
            group("products", "المنتجات") { r in
                RowView(icon: "shippingbox", color: Yq.amber, title: r["name"].text, subtitle: "\(r["stock_quantity"].text) قطعة", value: Fmt.iqd(r["selling_price"]))
            }
            group("isp", "مشتركو الإنترنت") { r in
                ISPRow(r: r.json)
            }
            if loading { HStack { Spacer(); ProgressView(); Spacer() } }
            if !loading && q.count >= 2 && results.values.allSatisfy(\.isEmpty) && sectionHits.isEmpty {
                ContentUnavailableView.search(text: q)
            }
        }
        .yaqootBackground()
        .navigationTitle("بحث")
        .searchable(text: $q, placement: .automatic, prompt: "زبون، فاتورة، منتج، مشترك…")
        .navigationDestination(for: CustomerRef.self) { StatementView(customerID: $0.id) }
        .navigationDestination(for: InvoiceRef.self) { InvoiceDetailView(id: $0.id) }
        .task(id: q) { await search() }
    }

    @ViewBuilder
    private func group<Row: View>(_ key: String, _ title: String, @ViewBuilder row: @escaping (Record) -> Row) -> some View {
        if let rows = results[key], !rows.isEmpty {
            SwiftUI.Section(title) { ForEach(rows) { row($0) } }
        }
    }

    private func search() async {
        let term = q.trimmingCharacters(in: .whitespaces)
        guard term.count >= 2 else { results = [:]; return }
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        loading = true
        defer { loading = false }
        var sources: [(String, String, String)] = []
        if app.can("customers") { sources.append(("customers", "customers", "customers")) }
        if app.can("pos") { sources.append(("invoices", "invoices", "invoices")) }
        if app.can("inventory") { sources.append(("products", "products", "products")) }
        if app.can("customers") { sources.append(("isp", "isp", "subscribers")) }
        var out: [String: [Record]] = [:]
        for (key, resource, listKey) in sources {
            guard !Task.isCancelled else { return }
            if let d = try? await API.shared.get(resource, ["q": term, "limit": "6"]) {
                out[key] = Array(d[listKey].array.records.prefix(6))
            }
        }
        if !Task.isCancelled { results = out }
    }
}
