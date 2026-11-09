import SwiftUI

/// الزبائن والديون: قائمة مع بحث وفلتر المدينين، وكشف حساب.
/// آيباد: عمودان (القائمة | كشف الحساب). آيفون: انتقال للكشف.
struct CustomersView: View {
    @State private var model = Paged.erp("customers", listKey: "customers", filter: "debtors_only=1",
                                         cursor: { _, n in ["offset": String(n)] })
    @State private var selection: String?
    @State private var sheet: Sheet?
    @Environment(\.horizontalSizeClass) private var size
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openURL) private var openURL

    enum Sheet: Identifiable {
        case add(JSON?), pay(JSON?), new
        var id: String {
            switch self {
            case .add(let c): "add\(c?["id"].text ?? "")"
            case .pay(let c): "pay\(c?["id"].text ?? "")"
            case .new: "new"
            }
        }
    }

    var body: some View {
        Group {
            if size == .regular {
                HStack(spacing: 0) {
                    list.frame(maxWidth: 420)
                    Divider()
                    Group {
                        if let selection {
                            StatementView(customerID: selection).id(selection)
                        } else {
                            ContentUnavailableView("اختر زبوناً", systemImage: "person.crop.rectangle.stack",
                                                   description: Text("يظهر كشف الحساب والحركات هنا."))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .background { YaqootBackground() }
                }
            } else {
                list
            }
        }
        .navigationDestination(for: CustomerRef.self) { StatementView(customerID: $0.id) }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                ShareLink(item: CSVFile(name: "الزبائن", header: ["الاسم", "الهاتف", "الرصيد", "سقف الدين"],
                                        rows: model.rows.map { [$0["name"].text, $0["phone"].text, Fmt.money($0["balance"]), Fmt.money($0["credit_limit"])] }),
                          preview: SharePreview("الزبائن.csv")) {
                    Label("تصدير", systemImage: "square.and.arrow.up")
                }
                .disabled(model.rows.isEmpty)
                Menu {
                    if AppState.shared.can("customers.edit") {
                        Button { sheet = .new } label: { Label("زبون جديد", systemImage: "person.badge.plus") }
                    }
                    if AppState.shared.can("customers.debt_addition") {
                        Button { sheet = .add(nil) } label: { Label("إضافة دين", systemImage: "plus.circle") }
                    }
                    if AppState.shared.can("customers.payment") {
                        Button { sheet = .pay(nil) } label: { Label("تسديد", systemImage: "banknote") }
                    }
                } label: {
                    Label("عملية", systemImage: "plus")
                }
                .keyboardShortcut("n", modifiers: .command)
            }
        }
        .sheet(item: $sheet) { s in
            switch s {
            case .add(let c): AddDebtSheet(customer: c)
            case .pay(let c): PayDebtSheet(customer: c)
            case .new: NewCustomerSheet()
            }
        }
    }

    private var list: some View {
        PagedList(model: model, searchPrompt: "اسم الزبون أو هاتفه…",
                  filters: [("debtors_only=1", "المدينون"), ("", "الكل")],
                  empty: "لا يوجد زبائن هنا",
                  header: { _ in DebtSummary() }) { r in
            row(r)
        }
    }

    @ViewBuilder private func row(_ r: Record) -> some View {
        let bal = r["balance"].num
        let limit = r["credit_limit"].num
        let tile = RowView(avatarText: r["name"].text, color: bal > 0 ? Yq.deepGold : Yq.teal, title: r["name"].text,
                           subtitle: [r["phone"].string ?? "بدون هاتف", limit > 0 ? "السقف \(Fmt.money(limit))" : nil].compactMap { $0 }.joined(separator: " • "),
                           value: Fmt.iqd(bal), valueColor: bal > 0 ? Yq.deepGold : nil,
                           pill: limit > 0 && bal > limit ? ("فوق السقف", Yq.red) : nil)
        Group {
            if size == .regular {
                Button { selection = r.id } label: { tile }
                    .buttonStyle(.plain)
                    .listRowBackground(selection == r.id ? Yq.teal.opacity(0.15) : nil)
            } else {
                NavigationLink(value: CustomerRef(id: r.id)) { tile }
            }
        }
        .draggable(r["phone"].text.isEmpty ? r["name"].text : "\(r["name"].text) — \(r["phone"].text)")
        .swipeActions(edge: .leading) {
            if bal > 0 && AppState.shared.can("customers.payment") {
                Button { sheet = .pay(r.json) } label: { Label("تسديد", systemImage: "banknote") }.tint(Yq.green)
            }
        }
        .swipeActions(edge: .trailing) {
            if AppState.shared.can("customers.debt_addition") {
                Button { sheet = .add(r.json) } label: { Label("دين", systemImage: "plus") }.tint(Yq.deepGold)
            }
        }
        .contextMenu {
            Button { openWindow(id: "statement", value: r.id) } label: { Label("فتح في نافذة جديدة", systemImage: "macwindow.badge.plus") }
            if bal > 0, let url = debtReminder(r.json) {
                Button { openURL(url) } label: { Label("تذكير واتساب", systemImage: "message") }
            }
            if let tel = Fmt.tel(r["phone"].text) {
                Button { openURL(tel) } label: { Label("اتصال", systemImage: "phone") }
            }
        }
    }
}

struct CustomerRef: Hashable { let id: String }

/// ملخص الديون أعلى القائمة.
struct DebtSummary: View {
    @State private var d: JSON?
    var body: some View {
        KPIGrid {
            KPITile(label: "إجمالي الديون", value: Fmt.iqd(d?["debts"]["total"] ?? 0), icon: "creditcard",
                    color: Yq.deepGold, hint: "\(d?["debts"]["debtors"].int ?? 0) زبون عليهم رصيد")
            KPITile(label: "المحصّل اليوم", value: Fmt.iqd(d?["collected"]["today"] ?? 0), icon: "arrow.down.left",
                    color: Yq.green, hint: "الشهر \(Fmt.money(d?["collected"]["month"] ?? 0))")
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
        .redacted(reason: d == nil ? .placeholder : [])
        .task(id: AppState.shared.refreshTick) { d = try? await API.shared.get("dashboard") }
    }
}

/// كشف حساب زبون: الرصيد والسقف والحركات مع الأزرار.
struct StatementView: View {
    let customerID: String
    @State private var sheet: CustomersView.Sheet?
    @Environment(\.openURL) private var openURL

    var body: some View {
        RemoteView(load: { try await API.shared.get("statement", ["id": customerID]) }) { d, _ in
            let c = d["customer"]
            let bal = c["balance"].num
            List {
                SwiftUI.Section {
                    KPIGrid {
                        KPITile(label: "الرصيد المستحق", value: Fmt.iqd(bal), icon: "creditcard", color: bal > 0 ? Yq.deepGold : Yq.green)
                        KPITile(label: "سقف الدين", value: c["credit_limit"].num == 0 ? "بلا سقف" : Fmt.iqd(c["credit_limit"]),
                                icon: "gauge.with.dots.needle.33percent", color: Yq.blue)
                    }
                    actions(c, bal)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))

                SwiftUI.Section("الحركات (\(d["movements"].array.count))") {
                    if d["movements"].array.isEmpty { Text("لا توجد حركات بعد").foregroundStyle(.secondary) }
                    ForEach(d["movements"].array.records) { m in MovementRow(m: m.json) }
                }
            }
            .yaqootBackground()
            .navigationTitle(c["name"].text)
            .refreshable { AppState.shared.refreshTick += 1 }
        }
        .sheet(item: $sheet) { s in
            switch s {
            case .add(let c): AddDebtSheet(customer: c)
            case .pay(let c): PayDebtSheet(customer: c)
            case .new: NewCustomerSheet()
            }
        }
    }

    private func actions(_ c: JSON, _ bal: Double) -> some View {
        GlassEffectContainer(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    if AppState.shared.can("customers.payment") && bal > 0 {
                        Button { sheet = .pay(c) } label: { Label("تسديد", systemImage: "banknote") }
                            .buttonStyle(.glassProminent).tint(Yq.green)
                    }
                    if AppState.shared.can("customers.debt_addition") {
                        Button { sheet = .add(c) } label: { Label("إضافة دين", systemImage: "plus") }
                            .buttonStyle(.glass)
                    }
                    if !c["phone"].text.isEmpty {
                        WhatsAppMenu(customerID: c["id"].string, customerName: c["name"].text, phone: c["phone"].text,
                                     text: bal > 0 ? debtReminderText(c) : "مرحباً \(c["name"].text)، ",
                                     title: bal > 0 ? "تذكير واتساب" : "واتساب")
                            .buttonStyle(.glass)
                    }
                    if let tel = Fmt.tel(c["phone"].text) {
                        Button { openURL(tel) } label: { Label("اتصال", systemImage: "phone.fill") }
                            .buttonStyle(.glass)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }
}

struct MovementRow: View {
    let m: JSON
    var body: some View {
        let kind = m["kind"].text
        let isInv = kind == "invoice", isPay = kind == "payment"
        let color = isInv ? Yq.teal : isPay ? Yq.green : Yq.deepGold
        var details = [Fmt.when(m["at"])]
        if !m["actor"].isNull { details.append(m["actor"].text) }
        if isInv && m["total"].num > m["paid"].num { details.append("آجل \(Fmt.money(m["total"].num - m["paid"].num))") }
        if !isInv && !m["remaining"].isNull { details.append("الرصيد بعدها \(Fmt.money(m["remaining"]))") }
        if m["waived"].num > 0 { details.append("مسامحة \(Fmt.money(m["waived"]))") }
        let notes = m["notes"].text
        return RowView(icon: isInv ? "doc.text" : isPay ? "arrow.down.left" : "arrow.up.right", color: color,
                       title: isInv ? "فاتورة \(m["ref"].text)" : isPay ? "تسديد" : "إضافة دين",
                       subtitle: details.joined(separator: " • ") + (notes.isEmpty ? "" : "\n\(notes)"),
                       value: isInv ? Fmt.iqd(m["total"]) : "\(isPay ? "−" : "+")\(Fmt.iqd(m["amount"]))", valueColor: color)
    }
}
