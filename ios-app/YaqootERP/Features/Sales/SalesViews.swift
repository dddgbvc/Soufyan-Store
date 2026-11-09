import SwiftUI

/// صف جدول الفواتير (آيباد) بقيم قابلة للفرز.
nonisolated struct InvoiceRow: Identifiable, Hashable, Sendable {
    let id: String
    let number: String
    let customer: String
    let total: Double
    let rest: Double
    let date: Date
    let actor: String
    let payment: String

    @MainActor init(_ r: Record) {
        id = r.id
        number = r["invoice_number"].text
        customer = r["customer_name"].string ?? "زبون نقدي"
        total = r["total_amount"].num
        rest = r["total_amount"].num - r["paid_amount"].num
        date = Fmt.parse(r["created_at"].string) ?? .distantPast
        actor = r["actor"].text
        payment = Fmt.payment(r["payment_type"])
    }
}

/// المبيعات والفواتير. آيفون: قائمة. آيباد: جدول قابل للفرز + تفاصيل الفاتورة بجانبه.
struct InvoicesView: View {
    @State private var model = Paged.erp("invoices", listKey: "invoices",
                                         cursor: { last, _ in ["before": last["created_at"].text] })
    @State private var selection: InvoiceRow.ID?
    @State private var sort = [KeyPathComparator(\InvoiceRow.date, order: .reverse)]
    @Environment(\.horizontalSizeClass) private var size
    @Environment(\.openWindow) private var openWindow

    private var tableRows: [InvoiceRow] { model.rows.map(InvoiceRow.init).sorted(using: sort) }

    var body: some View {
        Group {
            if size == .regular { table } else { list }
        }
        .navigationDestination(for: InvoiceRef.self) { InvoiceDetailView(id: $0.id) }
        .toolbar {
            ShareLink(item: CSVFile(name: "الفواتير", header: ["الرقم", "الزبون", "الإجمالي", "المتبقي", "الدفع", "التاريخ", "الموظف"],
                                    rows: model.rows.map(InvoiceRow.init).map {
                                        [$0.number, $0.customer, Fmt.money($0.total), Fmt.money($0.rest), $0.payment, Fmt.when($0.date), $0.actor]
                                    }),
                      preview: SharePreview("الفواتير.csv")) {
                Label("تصدير", systemImage: "square.and.arrow.up")
            }
            .disabled(model.rows.isEmpty)
        }
    }

    private var list: some View {
        PagedList(model: model, searchPrompt: "رقم الفاتورة، اسم الزبون أو هاتفه…",
                  filters: [("", "الكل"), ("debt_only=1", "غير مسددة")]) { r in
            NavigationLink(value: InvoiceRef(id: r.id)) { InvoiceTile(r: r.json) }
                .contextMenu {
                    Button { openWindow(id: "invoice", value: r.id) } label: { Label("فتح في نافذة جديدة", systemImage: "macwindow.badge.plus") }
                }
        }
    }

    private var table: some View {
        HStack(spacing: 0) {
            VStack(spacing: 8) {
                FilterBar(options: [("", "الكل"), ("debt_only=1", "غير مسددة")], selection: $model.filter)
                    .padding(.horizontal)
                Table(tableRows, selection: $selection, sortOrder: $sort) {
                    TableColumn("الرقم", value: \.number)
                    TableColumn("الزبون", value: \.customer)
                    TableColumn("الإجمالي", value: \.total) { Text(Fmt.money($0.total)).monospacedDigit() }
                    TableColumn("المتبقي", value: \.rest) { r in
                        Text(r.rest > 0 ? Fmt.money(r.rest) : "—").foregroundStyle(r.rest > 0 ? Yq.amber : .secondary).monospacedDigit()
                    }
                    TableColumn("التاريخ", value: \.date) { Text(Fmt.shortWhen($0.date)).monospacedDigit() }
                    TableColumn("الموظف", value: \.actor)
                }
                .contextMenu(forSelectionType: InvoiceRow.ID.self) { ids in
                    if let id = ids.first {
                        Button { openWindow(id: "invoice", value: id) } label: { Label("فتح في نافذة جديدة", systemImage: "macwindow.badge.plus") }
                    }
                } primaryAction: { ids in
                    if let id = ids.first { openWindow(id: "invoice", value: id) }
                }
                .searchable(text: $model.query, prompt: "رقم الفاتورة أو الزبون…")
                if model.more {
                    Button("تحميل المزيد") { Task { await model.reload(append: true) } }.padding(.bottom, 8)
                }
            }
            .frame(minWidth: 420)
            Divider()
            Group {
                if let selection {
                    InvoiceDetailView(id: selection).id(selection)
                } else {
                    ContentUnavailableView("اختر فاتورة", systemImage: "doc.text.magnifyingglass")
                }
            }
            .frame(width: 380)
        }
        .background { YaqootBackground() }
        .task { if model.rows.isEmpty { await model.reload() } }
        .onChange(of: model.filter) { Task { await model.reload() } }
        .onChange(of: model.query) { Task { await model.reload() } }
        .onChange(of: AppState.shared.refreshTick) { Task { await model.reload() } }
        .refreshable { await model.reload() }
    }
}

struct InvoiceRef: Hashable { let id: String }

struct InvoiceTile: View {
    let r: JSON
    var body: some View {
        let rest = r["total_amount"].num - r["paid_amount"].num
        RowView(icon: "doc.text", color: Yq.teal, title: r["customer_name"].string ?? "زبون نقدي",
                subtitle: "\(r["invoice_number"].text) • \(Fmt.when(r["created_at"]))\(r["actor"].isNull ? "" : " • \(r["actor"].text)")",
                value: Fmt.iqd(r["total_amount"]),
                pill: rest > 0 ? ("آجل \(Fmt.money(rest))", Yq.amber) : (Fmt.payment(r["payment_type"]), Yq.green))
    }
}

struct InvoiceDetailView: View {
    let id: String
    var body: some View {
        RemoteView(load: { try await API.shared.get("invoice", ["id": id]) }) { d, _ in
            let inv = d["invoice"]
            let rest = inv["total_amount"].num - inv["paid_amount"].num
            List {
                SwiftUI.Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("فاتورة \(inv["invoice_number"].text)").font(.title2.bold())
                        Text("\(inv["customer_name"].string ?? "زبون نقدي") • \(Fmt.when(inv["created_at"])) • \(inv["actor"].text)")
                            .foregroundStyle(.secondary)
                    }
                    KPIGrid {
                        KPITile(label: "الإجمالي", value: Fmt.iqd(inv["total_amount"]), icon: "sum", color: Yq.teal)
                        KPITile(label: rest > 0 ? "المتبقي (آجل)" : "الدفع", value: rest > 0 ? Fmt.iqd(rest) : Fmt.payment(inv["payment_type"]),
                                icon: rest > 0 ? "hourglass" : "checkmark.seal", color: rest > 0 ? Yq.amber : Yq.green)
                    }
                }
                .listRowBackground(Color.clear)
                SwiftUI.Section("الأصناف") {
                    ForEach(d["items"].array.records) { it in
                        let serials = it["serials"].array.compactMap(\.string)
                        RowView(icon: "shippingbox", color: Yq.blue, title: it["product_name"].text,
                                subtitle: "\(it["quantity"].text) × \(Fmt.money(it["unit_price"]))"
                                    + (it["discount"].num > 0 ? " • خصم \(Fmt.money(it["discount"]))" : "")
                                    + (serials.isEmpty ? "" : "\n\(serials.joined(separator: ", "))"),
                                value: Fmt.iqd(it["total"]))
                    }
                }
                if !inv["notes"].text.isEmpty {
                    SwiftUI.Section("ملاحظات") { Text(inv["notes"].text) }
                }
            }
            .yaqootBackground()
            .navigationTitle(inv["invoice_number"].text)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct ReturnsView: View {
    @State private var model = Paged.erp("returns", listKey: "returns")
    var body: some View {
        PagedList(model: model, searchPrompt: "رقم المرتجع أو الفاتورة أو الزبون…") { r in
            RowView(icon: "arrow.uturn.backward", color: Yq.amber, title: r["customer_name"].string ?? "—",
                    subtitle: "\(r["return_number"].text) • فاتورة \(r["invoice_number"].string ?? "—") • \(Fmt.when(r["created_at"]))"
                        + (r["reason"].isNull ? "" : "\n\(r["reason"].text)"),
                    value: Fmt.iqd(r["total_amount"]))
        }
    }
}

struct ShippingView: View {
    @State private var model = Paged.erp("shipping", listKey: "orders")
    var body: some View {
        PagedList(model: model, empty: "لا توجد شحنات بعد") { r in
            RowView(icon: "shippingbox.and.arrow.backward", color: Yq.blue, title: r["recipient"].string ?? "—",
                    subtitle: [r["governorate"].string, r["city"].string].compactMap { $0 }.joined(separator: " • ")
                        + "\n\(r["provider_status_text"].string ?? r["status"].text) • \(Fmt.when(r["created_at"]))",
                    value: Fmt.iqd(r["cod_amount"]))
        }
    }
}

struct RepairsView: View {
    @State private var model = Paged.erp("repairs", listKey: "repairs", filter: "status=OPEN")
    var body: some View {
        PagedList(model: model, searchPrompt: "رقم التذكرة، الجهاز أو الزبون…",
                  filters: [("status=OPEN", "المفتوحة"), ("status=READY", "الجاهزة"), ("mine=1", "تذاكري"), ("status=ALL", "الكل")]) { r in
            let ready = r["status"].text == "READY"
            NavigationLink(value: RepairRef(id: r.id)) {
                RowView(icon: "wrench.and.screwdriver", color: ready ? Yq.green : Yq.blue,
                        title: "\(r["device"].string ?? "جهاز") • \(r["customer_name"].text)",
                        subtitle: "\(r["ticket_no"].text) • \(r["fault"].text)" + (r["technician_name"].isNull ? "" : "\nالفني: \(r["technician_name"].text)"),
                        pill: (r["status_label"].string ?? r["status"].text, ready ? Yq.green : r["status"].text == "CANCELLED" ? Yq.red : Yq.amber))
            }
        }
        .navigationDestination(for: RepairRef.self) { RepairDetailView(id: $0.id) }
    }
}

struct RepairRef: Hashable { let id: String }

struct RepairDetailView: View {
    let id: String
    @State private var move: (code: String, label: String)?
    @State private var reason = ""
    @State private var toast: Toast?
    @Environment(\.openURL) private var openURL

    var body: some View {
        RemoteView(load: { try await API.shared.get("repair", ["id": id]) }) { d, remote in
            let r = d["repair"]
            let rest = r["cost"].num + r["labour"].num - r["prepaid"].num
            let phone = r["customer_phone"].text
            List {
                SwiftUI.Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(r["ticket_no"].text) • \(r["device"].text)").font(.title2.bold())
                        Text("\(r["customer_name"].text) • \(phone)").foregroundStyle(.secondary)
                        HStack {
                            Pill(r["status_label"].string ?? r["status"].text, color: r["status"].text == "READY" ? Yq.green : Yq.amber)
                            if !r["promised_at"].isNull { Pill("التسليم \(Fmt.when(r["promised_at"]))", color: Yq.blue) }
                        }
                    }
                    KPIGrid {
                        KPITile(label: "الكلفة الكلية", value: Fmt.iqd(r["cost"].num + r["labour"].num), icon: "sum", color: Yq.teal)
                        KPITile(label: "المتبقي على الزبون", value: Fmt.iqd(rest), icon: "creditcard", color: rest > 0 ? Yq.deepGold : Yq.green,
                                hint: "مدفوع مقدماً \(Fmt.money(r["prepaid"]))")
                    }
                }
                .listRowBackground(Color.clear)
                SwiftUI.Section("التفاصيل") {
                    LabeledContent("العطل", value: r["fault"].string ?? "—")
                    if !r["diagnosis"].isNull { LabeledContent("التشخيص", value: r["diagnosis"].text) }
                    LabeledContent("الفني", value: r["technician_name"].string ?? "—")
                    if !r["imei"].isNull { LabeledContent("IMEI", value: r["imei"].text) }
                    if !r["accessories"].isNull { LabeledContent("الملحقات", value: r["accessories"].text) }
                }
                if !phone.isEmpty {
                    SwiftUI.Section {
                        Button {
                            let text = r["status"].text == "READY"
                                ? "مرحباً \(r["customer_name"].text)، جهازك (\(r["device"].text)) جاهز للاستلام في \(AppState.shared.storeName)\(rest > 0 ? ". المبلغ المتبقي \(Fmt.money(rest)) د.ع" : "") 🌷"
                                : "مرحباً \(r["customer_name"].text)، بخصوص جهازك (\(r["device"].text)) لدى \(AppState.shared.storeName): "
                            if let url = Fmt.whatsapp(phone, text) { openURL(url) }
                        } label: {
                            Label(r["status"].text == "READY" ? "أبلغه أنه جاهز" : "واتساب", systemImage: "message.fill")
                        }
                    }
                }
                if !d["next_statuses"].array.isEmpty {
                    SwiftUI.Section {
                        ForEach(d["next_statuses"].array.records) { s in
                            Button(s["label"].text) { move = (s["code"].text, s["label"].text) }
                        }
                    } header: {
                        Text("نقل الحالة")
                    } footer: {
                        Text("التسليم والإلغاء من برنامج المكتب لأنهما يحرّكان المال.")
                    }
                }
                SwiftUI.Section("السجل") {
                    ForEach(d["history"].array.records) { h in
                        RowView(icon: "clock", color: .gray, title: h["to_label"].string ?? h["to"].text,
                                subtitle: "\(h["actor"].text) • \(Fmt.when(h["at"]))" + (h["reason"].isNull ? "" : "\n\(h["reason"].text)"))
                    }
                }
            }
            .yaqootBackground()
            .navigationTitle(r["ticket_no"].text)
            .alert(move.map { "نقل إلى «\($0.label)»؟" } ?? "", isPresented: Binding(get: { move != nil }, set: { if !$0 { move = nil } })) {
                if move?.code == "UNREPAIRABLE" { TextField("سبب عدم إمكانية الإصلاح", text: $reason) }
                Button("إلغاء", role: .cancel) { move = nil }
                Button("نقل") {
                    guard let m = move else { return }
                    Task {
                        do {
                            _ = try await API.shared.act("repair_status", ["repair_id": .string(id), "to_status": .string(m.code),
                                                                           "reason": m.code == "UNREPAIRABLE" ? .string(reason) : .null])
                            toast = Toast(text: "نُقلت إلى «\(m.label)»")
                            await remote.reload()
                        } catch {
                            toast = Toast(text: error.localizedDescription, error: true)
                        }
                    }
                }
                .disabled(move?.code == "UNREPAIRABLE" && reason.trimmingCharacters(in: .whitespaces).isEmpty)
            } message: {
                Text("سيُسجّل التغيير باسمك.")
            }
        }
        .toast($toast)
    }
}
