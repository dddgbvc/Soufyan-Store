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
    @State private var scanning = false
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
        .toolbar { scanButton }
        .sheet(isPresented: $scanning) {
            BarcodeScanner { code in
                scanning = false
                model.query = code
            }
            .ignoresSafeArea()
            .presentationDetents([.medium])
        }
    }

    private var filters: [(String, String)] { [("", "الكل"), ("low_only=1", "تحت الحد")] }

    private var scanButton: some View {
        Button { scanning = true } label: { Label("مسح باركود", systemImage: "barcode.viewfinder") }
            .disabled(!BarcodeScanner.isAvailable)
    }
}

struct ShortagesView: View {
    @State private var adding = false
    @State private var confirmReport = false
    @State private var note = ""
    @State private var toast: Toast?
    @State private var share: ShareItem?

    var body: some View {
        RemoteView(load: { try await API.shared.get("shortages") }) { d, remote in
            List {
                SwiftUI.Section {
                    GlassEffectContainer(spacing: 10) {
                        HStack(spacing: 10) {
                            Button { adding = true } label: { Label("إضافة نقص", systemImage: "plus").frame(maxWidth: .infinity) }
                                .buttonStyle(.glassProminent).tint(Yq.navy)
                            Button { confirmReport = true } label: { Label("إرسال للمدير", systemImage: "paperplane").frame(maxWidth: .infinity) }
                                .buttonStyle(.glass)
                            Button { exportPDF(d) } label: { Label("PDF", systemImage: "doc.richtext").frame(maxWidth: .infinity) }
                                .buttonStyle(.glass)
                        }
                        .controlSize(.large)
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))

                SwiftUI.Section("نواقص مسجلة (\(d["manual"].array.count))") {
                    if d["manual"].array.isEmpty { Text("لا توجد نواقص مسجلة").foregroundStyle(.secondary) }
                    ForEach(d["manual"].array.records) { r in
                        RowView(icon: "exclamationmark.bubble", color: Yq.amber, title: r["name"].text,
                                subtitle: [r["category"].string, Fmt.when(r["created_at"])].compactMap { $0 }.joined(separator: " • "),
                                pill: r["is_manual"].isTrue ? ("يدوي", Yq.amber) : nil)
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
            .sheet(isPresented: $adding) { NewShortageSheet() }
            .alert("إرسال قائمة النواقص للمدير العام؟", isPresented: $confirmReport) {
                TextField("ملاحظة (اختياري)", text: $note)
                Button("إلغاء", role: .cancel) {}
                Button("إرسال") { Task { await report() } }
            } message: {
                Text("تصل كإشعار في صندوق المدير العام على الهاتف والويب، مع كل النواقص الحالية.")
            }
        }
        .toast($toast)
        .sheet(item: $share) { ShareSheet(items: [$0.url]) }
    }

    private func report() async {
        do {
            let r = try await API.shared.act("shortages_report", ["note": .string(note)])
            note = ""
            if r["ok"] == .bool(false) {
                toast = Toast(text: r["message"].string ?? "لا توجد نواقص", error: true)
            } else {
                toast = Toast(text: "أُرسلت القائمة إلى المدير العام")
            }
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            toast = Toast(text: error.localizedDescription, error: true)
        }
    }

    private func exportPDF(_ d: JSON) {
        let doc = ReportDocument(title: "قائمة النواقص", sections: [
            ReportDocument.Part(title: "نواقص مسجلة", rows: d["manual"].array.map { [$0["name"].text, $0["category"].text, Fmt.when($0["created_at"])] },
                                header: ["المادة", "التصنيف", "التاريخ"]),
            ReportDocument.Part(title: "تحت حد التنبيه", rows: d["low_stock"].array.map { [$0["name"].text, $0["stock_quantity"].text, $0["min_stock_alert"].text] },
                                header: ["المنتج", "المتبقي", "الحد"]),
        ])
        if let url = PDFExport.render(doc, name: "النواقص-\(PDFExport.stamp)") { share = ShareItem(url: url) }
        else { toast = Toast(text: "تعذر إنشاء ملف PDF", error: true) }
    }
}

/// تسجيل نقص يدوي: يظهر في برنامج المكتب والويب فوراً، ويصل إشعار «نقص جديد» تلقائياً.
struct NewShortageSheet: View {
    @State private var name = ""
    @State private var category = ""
    @State private var qty = ""
    @State private var cid = newClientID()

    var body: some View {
        OperationSheet(
            title: "إضافة نقص",
            subtitle: "يظهر في قسم النواقص في البرنامج ويصل إشعار للمسؤولين",
            confirmTitle: "تسجيل «\(name)» كنقص؟",
            confirmMessage: { "تُسجّل العملية باسمك." },
            canSubmit: name.trimmingCharacters(in: .whitespaces).count >= 2,
            submit: {
                let r = try await API.shared.act("shortage_add", [
                    "name": .string(name.trimmingCharacters(in: .whitespaces)), "category": .string(category),
                    "current_qty": .int(Int(Fmt.parseMoney(qty))), "client_id": .string(cid),
                ])
                return r["replayed"].isTrue ? "النقص مسجّل مسبقاً" : "سُجّل النقص \(r["shortage"]["operation_number"].text)"
            }
        ) {
            SwiftUI.Section {
                TextField("اسم المادة (مثلاً: شاحن تايب سي 20 واط)", text: $name)
                TextField("التصنيف (اختياري)", text: $category)
                TextField("الكمية المتبقية (اختياري)", text: $qty).keyboardType(.numberPad)
            }
        }
    }
}
