import SwiftUI

/// حقل مبلغ: يقبل الأرقام العربية والفواصل، ويعرض القيمة منسقة.
struct MoneyField: View {
    let label: String
    @Binding var text: String
    var hint: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField(label, text: $text)
                .keyboardType(.numberPad)
                .font(.title3.weight(.semibold).monospacedDigit())
            let v = Fmt.parseMoney(text)
            if v > 0 || hint != nil {
                Text(v > 0 ? Fmt.iqd(v) : (hint ?? "")).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

/// إطار نموذج عملية: إلغاء / تنفيذ، مع تأكيد صريح قبل أي تعديل مالي.
/// معرّف العملية (client_id) يُنشأ مرة واحدة لكل نموذج، فإعادة المحاولة بعد انقطاع الشبكة لا تكرر العملية.
struct OperationSheet<Content: View>: View {
    let title: String
    var subtitle: String? = nil
    let confirmTitle: String
    let confirmMessage: () -> String
    var destructive = false
    var canSubmit = true
    let submit: () async throws -> String
    @ViewBuilder var content: Content

    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?
    @State private var confirming = false
    @State private var toast: Toast?

    var body: some View {
        NavigationStack {
            Form {
                if let subtitle { Text(subtitle).foregroundStyle(.secondary) }
                content
                if let error {
                    Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(Yq.red)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        confirming = true
                    } label: {
                        if busy { ProgressView() } else { Text("تنفيذ").bold() }
                    }
                    .disabled(!canSubmit || busy)
                }
            }
            .confirmationDialog(confirmTitle, isPresented: $confirming, titleVisibility: .visible) {
                Button(destructive ? "نعم، نفّذ" : "تأكيد", role: destructive ? .destructive : nil) { run() }
                Button("مراجعة", role: .cancel) {}
            } message: {
                Text(confirmMessage())
            }
            .interactiveDismissDisabled(busy)
            .toast($toast)
        }
    }

    private func run() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                let done = try await submit()
                toast = Toast(text: done)
                AppState.shared.refreshTick += 1
                try? await Task.sleep(for: .milliseconds(700))
                dismiss()
            } catch APIError.sessionExpired {
                dismiss()
                AppState.shared.expire()
            } catch {
                self.error = error.localizedDescription + (error as? APIError == .network ? " يمكنك الضغط على «تنفيذ» مجدداً بأمان: العملية لن تتكرر." : "")
            }
        }
    }
}

/// اختيار زبون بالبحث.
struct CustomerPicker: View {
    @Binding var selected: JSON?
    @State private var q = ""
    @State private var results: [Record] = []
    @State private var searching = false

    var body: some View {
        if let c = selected {
            HStack {
                RowView(avatarText: c["name"].text, color: Yq.deepGold, title: c["name"].text, subtitle: c["phone"].string,
                        value: Fmt.iqd(c["balance"]))
                Button { selected = nil } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .buttonStyle(.plain).accessibilityLabel("تغيير الزبون")
            }
        } else {
            TextField("ابحث باسم الزبون أو هاتفه…", text: $q)
                .task(id: q) {
                    let term = q.trimmingCharacters(in: .whitespaces)
                    guard term.count >= 2 else { results = []; return }
                    try? await Task.sleep(for: .milliseconds(300))
                    guard !Task.isCancelled else { return }
                    searching = true
                    defer { searching = false }
                    if let d = try? await API.shared.get("customers", ["q": term, "limit": "8"]) {
                        results = d["customers"].array.records
                    }
                }
            if searching { ProgressView() }
            ForEach(results) { r in
                Button { selected = r.json } label: {
                    RowView(avatarText: r["name"].text, color: Yq.deepGold, title: r["name"].text, subtitle: r["phone"].string,
                            value: Fmt.iqd(r["balance"]))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// إضافة دين على زبون (web_debt_addition: يفحص الصلاحية وسقف الدين في قاعدة البيانات).
struct AddDebtSheet: View {
    @State var customer: JSON?
    @State private var amount = ""
    @State private var notes = ""
    @State private var cid = newClientID()

    var body: some View {
        let v = Fmt.parseMoney(amount)
        let bal = customer?["balance"].num ?? 0
        let limit = customer?["credit_limit"].num ?? 0
        OperationSheet(
            title: "إضافة دين",
            subtitle: customer.map { "الرصيد الحالي \(Fmt.iqd($0["balance"]))" },
            confirmTitle: "إضافة \(Fmt.iqd(v)) على \(customer?["name"].text ?? "")؟",
            confirmMessage: { "الرصيد سيصبح \(Fmt.iqd(bal + v)). تُسجَّل العملية باسمك." },
            canSubmit: customer != nil && v > 0,
            submit: {
                let r = try await API.shared.act("debt_add", [
                    "customer_id": customer!["id"], "amount": .num(v), "notes": .string(notes.trimmingCharacters(in: .whitespaces)),
                    "client_id": .string(cid),
                ])
                return "أُضيف الدين • الرصيد \(Fmt.iqd(r["remaining_debt"].isNull ? .num(bal + v) : r["remaining_debt"]))"
            }
        ) {
            SwiftUI.Section("الزبون") { CustomerPicker(selected: $customer) }
            SwiftUI.Section("المبلغ") {
                MoneyField(label: "مبلغ الدين", text: $amount)
                if limit > 0 && bal + v > limit {
                    Label("يتجاوز سقف الدين (\(Fmt.iqd(limit))). سيرفضه الخادم ما لم تملك الصلاحية.", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(Yq.amber).font(.footnote)
                }
                TextField("ملاحظة (اختياري)", text: $notes, axis: .vertical)
            }
        }
    }
}

/// تسديد دين أو مسامحة (web_debt_payment).
struct PayDebtSheet: View {
    @State var customer: JSON?
    @State private var paid = ""
    @State private var waived = ""
    @State private var reason = ""
    @State private var notes = ""
    @State private var cid = newClientID()
    private var canWaive: Bool { AppState.shared.can("customers.waiver") }

    var body: some View {
        let p = Fmt.parseMoney(paid)
        let w = Fmt.parseMoney(waived)
        let bal = customer?["balance"].num ?? 0
        let rest = max(0, bal - p - w)
        OperationSheet(
            title: "تسديد",
            subtitle: customer.map { "المستحق \(Fmt.iqd($0["balance"]))" },
            confirmTitle: "قبض \(Fmt.iqd(p))\(w > 0 ? " ومسامحة \(Fmt.iqd(w))" : "")؟",
            confirmMessage: { "المتبقي بعد العملية \(Fmt.iqd(rest)). يدخل المبلغ المقبوض إلى الخزنة." },
            canSubmit: customer != nil && (p > 0 || w > 0) && p + w <= bal && (w == 0 || !reason.isEmpty),
            submit: {
                let r = try await API.shared.act("debt_pay", [
                    "customer_id": customer!["id"], "amount_paid": .num(p), "waived_amount": .num(w),
                    "waiver_reason": .string(reason), "notes": .string(notes), "client_id": .string(cid),
                ])
                return "قُبض \(Fmt.iqd(p)) • المتبقي \(Fmt.iqd(r["remaining_debt"].isNull ? .num(rest) : r["remaining_debt"]))"
            }
        ) {
            SwiftUI.Section("الزبون") { CustomerPicker(selected: $customer) }
            SwiftUI.Section("المبلغ") {
                MoneyField(label: "المبلغ المقبوض", text: $paid)
                if bal > 0 {
                    Button("تسديد كامل \(Fmt.iqd(bal - w))") { paid = String(Int(bal - w)) }
                }
                if p + w > bal { Text("المبلغ أكبر من المستحق").foregroundStyle(Yq.red).font(.footnote) }
            }
            if canWaive {
                SwiftUI.Section("مسامحة (اختياري)") {
                    MoneyField(label: "مبلغ المسامحة", text: $waived)
                    if w > 0 { TextField("سبب المسامحة (إلزامي)", text: $reason) }
                }
            }
            SwiftUI.Section { TextField("ملاحظة", text: $notes, axis: .vertical) }
        }
    }
}

/// زبون جديد مع دين افتتاحي اختياري. الخادم يكتشف تكرار الهاتف ويطلب التأكيد.
struct NewCustomerSheet: View {
    @State private var name = ""
    @State private var phone = ""
    @State private var address = ""
    @State private var limit = ""
    @State private var debt = ""
    @State private var notes = ""
    @State private var cid = newClientID()
    @State private var duplicate: JSON?
    @State private var allowDuplicate = false

    var body: some View {
        let d = Fmt.parseMoney(debt)
        OperationSheet(
            title: "زبون جديد",
            confirmTitle: "إضافة الزبون «\(name)»؟",
            confirmMessage: { d > 0 ? "مع دين افتتاحي \(Fmt.iqd(d))." : "بدون دين افتتاحي." },
            canSubmit: name.trimmingCharacters(in: .whitespaces).count >= 2,
            submit: {
                let r = try await API.shared.act("customer_create", [
                    "name": .string(name.trimmingCharacters(in: .whitespaces)), "phone": .string(Fmt.normalizeDigits(phone)),
                    "address": .string(address), "credit_limit": .num(Fmt.parseMoney(limit)),
                    "opening_debt": .num(AppState.shared.can("customers.debt_addition") ? d : 0),
                    "notes": .string(notes), "allow_duplicate": .bool(allowDuplicate), "client_id": .string(cid),
                ])
                if r["reason"].string == "duplicate" {
                    duplicate = r["existing"]
                    throw APIError.server(message: "يوجد زبون بنفس الهاتف: \(r["existing"]["name"].text). فعّل «إضافة رغم التشابه» إن كان شخصاً آخر.",
                                          reason: "duplicate", status: 409)
                }
                return "أُضيف الزبون \(r["customer"]["name"].text)"
            }
        ) {
            SwiftUI.Section("البيانات") {
                TextField("الاسم", text: $name).textContentType(.name)
                TextField("الهاتف", text: $phone).keyboardType(.phonePad).textContentType(.telephoneNumber)
                TextField("العنوان", text: $address)
            }
            SwiftUI.Section("الحساب") {
                MoneyField(label: "سقف الدين (0 = بلا سقف)", text: $limit)
                if AppState.shared.can("customers.debt_addition") {
                    MoneyField(label: "دين افتتاحي (اختياري)", text: $debt)
                }
                TextField("ملاحظات", text: $notes, axis: .vertical)
            }
            if duplicate != nil {
                SwiftUI.Section("تشابه") {
                    Toggle("إضافة رغم التشابه", isOn: $allowDuplicate)
                }
            }
        }
    }
}

/// رسالة تذكير بالدين عبر واتساب.
func debtReminder(_ c: JSON) -> URL? {
    Fmt.whatsapp(c["phone"].text,
                 "مرحباً \(c["name"].text)،\nنود تذكيرك بأن رصيدك المستحق لدى \(AppState.shared.storeName) هو \(Fmt.money(c["balance"])) د.ع.\nشكراً لتعاملك معنا 🌷")
}
