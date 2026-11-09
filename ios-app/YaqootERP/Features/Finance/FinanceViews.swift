import SwiftUI

private let vaultKinds: [String: String] = [
    "sale": "بيع", "deposit": "إيداع", "withdraw": "سحب", "expense": "مصروف", "debt_payment": "تسديد دين",
    "return": "مرتجع", "reversal": "عكس قيد", "opening": "رصيد افتتاحي",
]

/// الخزنة: الرصيد، وارد/صادر اليوم، الحركات، إيداع وسحب بتأكيد.
struct VaultView: View {
    @State private var kind: String?

    var body: some View {
        RemoteView(load: { try await API.shared.get("vault", ["limit": "100"]) }) { d, remote in
            List {
                SwiftUI.Section {
                    KPIGrid {
                        KPITile(label: "رصيد الخزنة", value: Fmt.iqd(d["balance"]), icon: "building.columns", color: Yq.purple, hint: "الخزنة الرئيسية")
                        KPITile(label: "وارد اليوم", value: Fmt.iqd(d["today"]["in"]), icon: "arrow.down.left", color: Yq.green)
                        KPITile(label: "صادر اليوم", value: Fmt.iqd(d["today"]["out"]), icon: "arrow.up.right", color: Yq.red)
                    }
                    GlassEffectContainer(spacing: 10) {
                        HStack(spacing: 10) {
                            if AppState.shared.can("vaults.deposit") {
                                Button { kind = "deposit" } label: { Label("إيداع", systemImage: "arrow.down.left").frame(maxWidth: .infinity) }
                                    .buttonStyle(.glassProminent).tint(Yq.green)
                            }
                            if AppState.shared.can("vaults.withdraw") {
                                Button { kind = "withdraw" } label: { Label("سحب", systemImage: "arrow.up.right").frame(maxWidth: .infinity) }
                                    .buttonStyle(.glass)
                            }
                        }
                        .controlSize(.large)
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))

                SwiftUI.Section("الحركات (\(d["entries"].array.count))") {
                    ForEach(d["entries"].array.records) { e in
                        let incoming = e["direction"].text == "in"
                        RowView(icon: incoming ? "arrow.down.left" : "arrow.up.right", color: incoming ? Yq.green : Yq.red,
                                title: vaultKinds[e["kind"].text] ?? e["kind"].text,
                                subtitle: (e["note"].isNull ? "" : "\(e["note"].text)\n") + "\(e["actor"].text) • \(Fmt.when(e["created_at"]))",
                                value: "\(incoming ? "+" : "−")\(Fmt.iqd(e["amount"]))", valueColor: incoming ? Yq.green : Yq.red)
                    }
                }
            }
            .yaqootBackground()
            .refreshable { await remote.reload() }
            .sheet(item: Binding(get: { kind.map { VaultKind(id: $0) } }, set: { kind = $0?.id })) { k in
                VaultTxnSheet(kind: k.id, balance: d["balance"].num)
            }
        }
    }
}

struct VaultKind: Identifiable { let id: String }

struct VaultTxnSheet: View {
    let kind: String
    let balance: Double
    @State private var amount = ""
    @State private var note = ""
    @State private var cid = newClientID()

    var body: some View {
        let v = Fmt.parseMoney(amount)
        let deposit = kind == "deposit"
        OperationSheet(
            title: deposit ? "إيداع في الخزنة" : "سحب من الخزنة",
            subtitle: "الرصيد الحالي \(Fmt.iqd(balance))",
            confirmTitle: "\(deposit ? "إيداع" : "سحب") \(Fmt.iqd(v))؟",
            confirmMessage: { "الرصيد سيصبح \(Fmt.iqd(deposit ? balance + v : balance - v))." },
            destructive: !deposit,
            canSubmit: v > 0 && (deposit || v <= balance),
            submit: {
                _ = try await API.shared.act("vault_txn", ["kind": .string(kind), "amount": .num(v),
                                                           "note": .string(note.trimmingCharacters(in: .whitespaces)), "client_id": .string(cid)])
                return deposit ? "تم الإيداع" : "تم السحب"
            }
        ) {
            SwiftUI.Section {
                MoneyField(label: "المبلغ", text: $amount)
                if !deposit && v > balance { Text("أكبر من رصيد الخزنة").foregroundStyle(Yq.red).font(.footnote) }
                TextField("البيان (يظهر في سجل الخزنة)", text: $note, axis: .vertical)
            }
        }
    }
}

struct ExpensesView: View {
    @State private var model = Paged.erp("expenses", listKey: "expenses", cursor: { last, _ in ["before": last["created_at"].text] })
    @State private var adding = false

    var body: some View {
        PagedList(model: model) { r in
            RowView(icon: "arrow.up.forward", color: Yq.red, title: r["description"].text,
                    subtitle: "\(r["category"].text) • \(r["actor"].text) • \(Fmt.when(r["created_at"]))",
                    value: Fmt.iqd(r["amount"]), pill: r["reversed"].isTrue ? ("معكوس", Yq.red) : nil)
        }
        .toolbar {
            if AppState.shared.can("expenses.create") {
                Button { adding = true } label: { Label("مصروف جديد", systemImage: "plus") }
                    .keyboardShortcut("n", modifiers: .command)
            }
        }
        .sheet(isPresented: $adding) { NewExpenseSheet() }
    }
}

struct NewExpenseSheet: View {
    @State private var amount = ""
    @State private var desc = ""
    @State private var category = "مصاريف تشغيلية"
    @State private var cid = newClientID()
    private let categories = ["مصاريف تشغيلية", "إيجار", "كهرباء ومولدة", "إنترنت واتصالات", "نقل وتوصيل", "صيانة المحل", "ضيافة", "أخرى"]

    var body: some View {
        let v = Fmt.parseMoney(amount)
        OperationSheet(
            title: "مصروف جديد", subtitle: "يُخصم من الخزنة",
            confirmTitle: "تسجيل مصروف \(Fmt.iqd(v))؟",
            confirmMessage: { "\(desc) • \(category)" },
            canSubmit: v > 0 && desc.trimmingCharacters(in: .whitespaces).count >= 2,
            submit: {
                _ = try await API.shared.act("expense_create", ["amount": .num(v), "description": .string(desc.trimmingCharacters(in: .whitespaces)),
                                                                "category": .string(category), "client_id": .string(cid)])
                return "سُجّل المصروف"
            }
        ) {
            SwiftUI.Section {
                MoneyField(label: "المبلغ", text: $amount)
                TextField("الوصف (مثلاً: فاتورة المولدة)", text: $desc)
                Picker("التصنيف", selection: $category) { ForEach(categories, id: \.self) { Text($0) } }
            }
        }
    }
}
