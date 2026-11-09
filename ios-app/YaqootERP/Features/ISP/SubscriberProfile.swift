import SwiftUI

/// ملف المشترك الموحّد: بيانات المزوّد، الزبون الداخلي وديونه، التجديد، وسجل كل الحركات.
struct SubscriberProfile: View {
    let s: JSON
    @State private var detail: JSON?
    @State private var renewing = false
    @State private var confirming: JSON?
    @State private var toast: Toast?
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    private var sub: JSON { detail?["subscriber"] ?? s }

    var body: some View {
        let st = s["state"].text
        List {
            SwiftUI.Section {
                HStack(spacing: 14) {
                    Avatar(icon: "wifi.router", color: stateColor(st), size: 52)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(s["display_name"].string ?? s["username"].text).font(.title3.bold())
                        HStack {
                            Pill(stateLabel(st), color: stateColor(st))
                            Text(Fmt.relativeDays(s["days_left"].int)).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                if !s["customer_id"].isNull && AppState.shared.can("customers.debt_addition") {
                    Button { renewing = true } label: {
                        Label("تجديد الاشتراك", systemImage: "arrow.clockwise.circle.fill").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent).tint(Yq.navy).controlSize(.large)
                }
            }
            .listRowBackground(Color.clear)

            // تجديد ينتظر التأكيد من المزوّد.
            ForEach(pending.records) { r in
                SwiftUI.Section {
                    LabeledContent("السعر", value: Fmt.iqd(r["sell_price_iqd"]))
                    LabeledContent("الحالة", value: r["state"].text == "PENDING" ? "بانتظار التفعيل لدى المزوّد" : "نتيجة المزوّد غير مؤكدة")
                    Button { confirming = r.json } label: { Label("تأكيد نتيجة التفعيل", systemImage: "checkmark.seal") }
                } header: {
                    Label("تجديد غير مكتمل", systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                }
            }

            SwiftUI.Section {
                LabeledContent("اسم المستخدم لدى المزوّد") { Text(s["username"].text).monospaced() }
                LabeledContent("الباقة", value: s["package_name"].string ?? "—")
                LabeledContent("حالة المزوّد", value: s["provider_status"].string ?? "—")
                LabeledContent("ينتهي", value: Fmt.dateOnly(sub["expires_at"].isNull ? s["expires_at"] : sub["expires_at"]))
                LabeledContent("حساب الموزّع", value: s["reseller_name"].string ?? "—")
                if !s["price"].isNull { LabeledContent("السعر العام للباقة", value: Fmt.iqd(s["price"])) }
                LabeledContent("آخر تحقق من المزوّد", value: Fmt.when(s["last_verified_at"]))
            } header: {
                Label("بيانات المزوّد", systemImage: "server.rack")
            } footer: {
                Text("رقم الاشتراك لدى الشركة ورصيد الموزّع لا يُخلطان مع حساب الزبون في المحل.")
            }

            SwiftUI.Section {
                if s["customer_id"].isNull {
                    Text("غير مربوط بزبون في المحل. الربط من قسم الإنترنت في برنامج المكتب.").foregroundStyle(.secondary)
                } else {
                    let c = detail?["customer"] ?? .null
                    LabeledContent("الزبون", value: c["name"].string ?? s["customer_name"].text)
                    LabeledContent("الهاتف") { Text(c["phone"].string ?? s["customer_phone"].text).monospaced() }
                    LabeledContent("ديون الزبون في المحل") {
                        let b = c.isNull ? s["customer_balance"] : c["balance"]
                        Text(Fmt.iqd(b)).foregroundStyle(b.num > 0 ? Yq.deepGold : .primary).monospacedDigit()
                    }
                    if AppState.shared.can("customers") {
                        NavigationLink("ملف الزبون وكل حركاته") { StatementView(customerID: s["customer_id"].text) }
                    }
                }
            } header: {
                Label("الزبون الداخلي (حساب المحل)", systemImage: "person.text.rectangle")
            }

            SwiftUI.Section("التجديدات") {
                if (detail?["renewals"].array ?? []).isEmpty { Text("لا توجد تجديدات مسجلة").foregroundStyle(.secondary) }
                ForEach((detail?["renewals"].array ?? []).records) { r in
                    let profit = r["provider_cost_iqd"].isNull ? nil : r["sell_price_iqd"].num - r["provider_cost_iqd"].num
                    RowView(icon: "arrow.clockwise", color: r["state"].text == "CONFIRMED" ? Yq.green : Yq.amber,
                            title: "\(Fmt.iqd(r["sell_price_iqd"])) • \(renewalState(r["state"].text))",
                            subtitle: [Fmt.when(r["created_at"]), r["service_until"].isNull ? nil : "حتى \(Fmt.dateOnly(r["service_until"]))",
                                       profit.map { "ربح \(Fmt.money($0))" }].compactMap { $0 }.joined(separator: " • "),
                            value: r["paid_amount_iqd"].num > 0 ? "مدفوع \(Fmt.money(r["paid_amount_iqd"]))" : nil)
                }
            }

            SwiftUI.Section("سجل الحركات") {
                if (detail?["events"].array ?? []).isEmpty { Text("لا توجد حركات").foregroundStyle(.secondary) }
                ForEach(Array((detail?["events"].array ?? []).enumerated()), id: \.offset) { _, e in
                    RowView(icon: "clock", color: .gray, title: e["note"].string ?? e["code"].text,
                            subtitle: "\(e["actor"].text) • \(Fmt.when(e["at"]))")
                }
            }

            SwiftUI.Section {
                if !s["customer_phone"].text.isEmpty {
                    WhatsAppMenu(customerID: s["customer_id"].string, customerName: s["customer_name"].string ?? s["display_name"].text,
                                 phone: s["customer_phone"].text, text: ispReminderText(s),
                                 title: st == "expired" ? "إبلاغ بانتهاء الاشتراك" : "تذكير بالتجديد")
                }
                if let tel = Fmt.tel(s["customer_phone"].text) {
                    Button { openURL(tel) } label: { Label("اتصال", systemImage: "phone.fill") }
                }
            }
        }
        .yaqootBackground()
        .navigationTitle("ملف المشترك")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("تم") { dismiss() } } }
        .task(id: AppState.shared.refreshTick) { await load() }
        .sheet(isPresented: $renewing) { RenewSheet(subscriber: s, detail: detail) }
        .sheet(item: Binding(get: { confirming.map { Record($0) } }, set: { confirming = $0?.json })) { r in
            RenewConfirmSheet(subscriber: s, renewal: r.json, externalID: Int(detail?["subscriber"]["external_subscriber_id"].text ?? ""))
        }
        .toast($toast)
    }

    private var pending: [JSON] {
        (detail?["renewals"].array ?? []).filter { ["PENDING", "PROVIDER_UNKNOWN"].contains($0["state"].text) }
    }

    private func load() async {
        guard let id = s["id"].string else { return }
        do { detail = try await API.shared.get("isp_subscriber", ["id": id]) }
        catch APIError.sessionExpired { AppState.shared.expire() }
        catch { toast = Toast(text: error.localizedDescription, error: true) }
    }
}

func renewalState(_ s: String) -> String {
    ["PENDING": "بانتظار التفعيل", "PROVIDER_UNKNOWN": "غير مؤكد", "CONFIRMED": "مؤكد", "FAILED": "فشل", "CANCELLED": "ملغى"][s] ?? s
}

/// تجديد اشتراك: السعر يظهر تلقائياً (آخر تجديد أو السعر العام، وسعر الشراء من SAS4 عبر البرنامج)،
/// ثم تأكيد صريح «هل تجدد بهذا السعر؟» مع ديون الزبون في المحل، عبر نفس دوال التجديد في البرنامج.
struct RenewSheet: View {
    let subscriber: JSON
    let detail: JSON?

    @State private var sell = ""
    @State private var cost = ""
    @State private var paid = ""
    @State private var key = "m-" + newClientID()
    @State private var asking = false
    @State private var busy = false
    @State private var fetchingCost = false
    @State private var costNote: String?
    @State private var error: String?
    @State private var started: JSON?
    @Environment(\.dismiss) private var dismiss

    private var balance: Double { detail?["customer"]["balance"].num ?? subscriber["customer_balance"].num }

    var body: some View {
        let sv = Fmt.parseMoney(sell), cv = Fmt.parseMoney(cost), pv = Fmt.parseMoney(paid)
        NavigationStack {
            Form {
                if let started {
                    RenewConfirmForm(subscriber: subscriber, renewal: started,
                                     externalID: Int(detail?["subscriber"]["external_subscriber_id"].text ?? "")) { dismiss() }
                } else {
                    SwiftUI.Section {
                        LabeledContent("المشترك") { Text(subscriber["username"].text).monospaced() }
                        LabeledContent("الباقة", value: subscriber["package_name"].string ?? "—")
                        LabeledContent("ديون الزبون في المحل") {
                            Text(Fmt.iqd(balance)).foregroundStyle(balance > 0 ? Yq.deepGold : .primary).monospacedDigit()
                        }
                    }
                    SwiftUI.Section {
                        MoneyField(label: "سعر البيع للزبون", text: $sell)
                        HStack {
                            MoneyField(label: "سعر الشراء من المزوّد", text: $cost)
                            Button { Task { await fetchCost() } } label: {
                                if fetchingCost { ProgressView() } else { Label("من SAS4", systemImage: "arrow.down.circle") }
                            }
                            .buttonStyle(.bordered).disabled(fetchingCost)
                        }
                        if let costNote { Text(costNote).font(.caption).foregroundStyle(.secondary) }
                        if sv > 0 && cv > 0 {
                            LabeledContent("الربح") {
                                Text(Fmt.iqd(sv - cv)).foregroundStyle(sv >= cv ? Yq.green : Yq.red).monospacedDigit()
                            }
                        }
                    } header: {
                        Text("السعر")
                    } footer: {
                        Text(detail?["suggested"]["source"].text == "last_renewal" ? "السعر من آخر تجديد لهذا المشترك." : "السعر العام للباقة. لا يُغيَّر أي سعر تلقائياً.")
                    }
                    SwiftUI.Section("المقبوض الآن") {
                        MoneyField(label: "المبلغ المقبوض (0 = يُضاف كاملاً للدين)", text: $paid)
                        if sv > 0 { Button("قبض كامل \(Fmt.iqd(sv))") { paid = String(Int(sv)) } }
                        if pv > sv { Text("المقبوض أكبر من السعر").foregroundStyle(Yq.red).font(.footnote) }
                    }
                    if let error { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Yq.red) }
                }
            }
            .navigationTitle("تجديد الاشتراك")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() } }
                if started == nil {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("تجديد") { asking = true }.bold()
                            .disabled(busy || sv <= 0 || pv > sv)
                    }
                }
            }
            .alert("هل تجدد بهذا السعر؟", isPresented: $asking) {
                Button("لا", role: .cancel) {}
                Button("نعم، جدّد") { Task { await begin(sv, cv, pv) } }
            } message: {
                Text("\(subscriber["username"].text) بسعر \(Fmt.iqd(sv))"
                     + (cv > 0 ? "\nسعر الشراء \(Fmt.iqd(cv)) • الربح \(Fmt.iqd(sv - cv))" : "")
                     + (balance > 0 ? "\n⚠️ على الزبون ديون في المكتب: \(Fmt.iqd(balance))" : "\nلا ديون على الزبون في المكتب")
                     + "\nبعد التجديد يصبح دينه: \(Fmt.iqd(balance + sv - pv))")
            }
            .interactiveDismissDisabled(busy)
        }
        .onAppear {
            if sell.isEmpty, let p = detail?["suggested"]["sell_price"], !p.isNull { sell = String(Int(p.num)) }
            if cost.isEmpty, let c = detail?["suggested"]["provider_cost"], !c.isNull { cost = String(Int(c.num)) }
        }
    }

    /// سعر الشراء الحالي من SAS4 (بيانات التفعيل) عبر ربط البرنامج.
    private func fetchCost() async {
        guard let account = subscriber["reseller_account_id"].string ?? detail?["subscriber"]["reseller_account_id"].string,
              let ext = Int(detail?["subscriber"]["external_subscriber_id"].text ?? "") else {
            costNote = "رقم المشترك لدى المزوّد غير معروف لهذا الاشتراك."
            return
        }
        fetchingCost = true
        defer { fetchingCost = false }
        do {
            // الربط المباشر أولاً (فوري)، وإلا عبر برنامج المكتب.
            let direct = (try? await API.shared.sas4("status"))?["direct"].isTrue ?? false
            let d: JSON
            if direct {
                d = try await API.shared.sas4("user", ["id": String(ext)])["activation"]
                let need = d["n_required_amount"].double ?? Fmt.parseMoney(d["required_amount"].text)
                if need > 0 {
                    cost = String(Int(need))
                    costNote = "من SAS4: \(d["profile_name"].text) • الكلفة \(d["required_amount"].text) • رصيد الموزع \(d["manager_balance"].text)"
                    return
                }
            } else {
                d = try await SASCommand.run(account: account, type: "get_activation_data", payload: ["user_id": .int(ext)])["data"]
            }
            let unit = Fmt.parseMoney(d["unit_price"].text)
            let units = max(d["units"].num, 1)
            if unit > 0 { cost = String(Int(unit * units)) }
            costNote = "من SAS4: \(d["profile_name"].text) • \(d["unit_price"].text) × \(Int(units)) • رصيد الموزع \(d["manager_balance"].text)"
        } catch {
            costNote = error.localizedDescription
        }
    }

    private func begin(_ sv: Double, _ cv: Double, _ pv: Double) async {
        busy = true
        error = nil
        defer { busy = false }
        var payload: [String: JSON] = [
            "operation_key": .string(key), "subscriber_id": subscriber["id"], "sell_price_iqd": .num(sv),
            "paid_amount_iqd": .num(pv), "package_name": .string(subscriber["package_name"].text),
            "service_from": .string(ISO8601DateFormatter().string(from: Date())),
        ]
        if cv > 0 { payload["provider_cost_iqd"] = .num(cv) }
        do {
            started = try await API.shared.act("isp_renew_begin", payload)
            AppState.shared.refreshTick += 1
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// تأكيد نتيجة التفعيل لتجديد معلّق (من ملف المشترك).
struct RenewConfirmSheet: View {
    let subscriber: JSON
    let renewal: JSON
    var externalID: Int? = nil
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form { RenewConfirmForm(subscriber: subscriber, renewal: renewal, externalID: externalID) { dismiss() } }
                .navigationTitle("تأكيد التفعيل")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() } } }
        }
    }
}

/// الخطوة الثانية: التفعيل لدى المزوّد ثم تسجيل النتيجة وترحيلها للدفتر (دين + قبض) بدوال البرنامج.
struct RenewConfirmForm: View {
    let subscriber: JSON
    let renewal: JSON
    var externalID: Int? = nil
    let done: () -> Void

    @State private var direct = false
    @State private var activation: JSON = .null
    @State private var sasError: String?
    @State private var askSAS = false
    @State private var sas = SASSubmit("rn")
    @State private var sasDone = false

    @State private var receipt = ""
    @State private var until = Date()
    @State private var busy = false
    @State private var error: String?
    @State private var confirmFail = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        SwiftUI.Section {
            Label("سُجّل طلب التجديد بسعر \(Fmt.iqd(renewal["sell_price_iqd"]))", systemImage: "checkmark.circle.fill").foregroundStyle(Yq.green)
        }
        if direct, externalID != nil {
            SwiftUI.Section {
                if activation.isNull {
                    if let sasError { Text(sasError).font(.footnote).foregroundStyle(Yq.red) } else { ProgressView() }
                } else {
                    LabeledContent("الباقة", value: activation["profile_name"].text)
                    LabeledContent("الكلفة من رصيد الموزع", value: activation["required_amount"].text)
                    LabeledContent("رصيد الموزع لدى الشركة", value: activation["manager_balance"].text)
                    Button { askSAS = true } label: {
                        HStack { Label("فعّل في SAS4 ورحّل للدفتر", systemImage: "bolt.circle.fill"); Spacer(); if sas.busy || busy { ProgressView() } }
                    }
                    .disabled(sas.busy || busy || sas.uncertain || sasDone)
                }
                if let e = sas.error {
                    Label(e, systemImage: sas.uncertain ? "questionmark.diamond" : "exclamationmark.triangle")
                        .foregroundStyle(sas.uncertain ? Yq.amber : Yq.red).font(.footnote)
                }
            } header: {
                Text("التفعيل المباشر")
            } footer: {
                Text("يجدد في SAS4 من رصيد الموزع، ثم يسجل النتيجة ويضيف الدين ويقيد المقبوض في المحل بخطوة واحدة.")
            }
        }
        SwiftUI.Section {
            Text(direct && externalID != nil ? "أو فعّل يدوياً من البرنامج أو لوحة الموزع، ثم سجّل النتيجة أدناه."
                 : "فعّل الاشتراك لدى المزوّد (من برنامج المكتب أو لوحة الموزع)، ثم سجّل النتيجة هنا ليُضاف الدين ويُقيَّد المقبوض.")
                .font(.footnote).foregroundStyle(.secondary)
            Button { if let u = URL(string: "https://reseller.nbtel.iq/index.html") { openURL(u) } } label: {
                Label("فتح لوحة الموزع", systemImage: "safari")
            }
        }
        SwiftUI.Section("نتيجة التفعيل") {
            TextField("رقم الإيصال/العملية لدى المزوّد (اختياري)", text: $receipt)
            DatePicker("ينتهي الاشتراك في", selection: $until, displayedComponents: .date)
            Button {
                Task { await confirm() }
            } label: {
                HStack { Text("تم التفعيل — رحّل للدفتر"); Spacer(); if busy { ProgressView() } }
            }
            .disabled(busy)
            Button("لم يتم التفعيل", role: .destructive) { confirmFail = true }.disabled(busy)
            if let error { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Yq.red).font(.footnote) }
        }
        .onAppear {
            let base = Fmt.parse(subscriber["expires_at"].string).map { max($0, Date()) } ?? Date()
            until = Calendar.current.date(byAdding: .day, value: 30, to: base) ?? base
        }
        .confirmationDialog("تسجيل أن التفعيل لم يتم؟", isPresented: $confirmFail, titleVisibility: .visible) {
            Button("نعم، لم يتم", role: .destructive) { Task { await fail() } }
        } message: { Text("لن يُضاف أي دين على الزبون.") }
        .alert("تفعيل في SAS4؟", isPresented: $askSAS) {
            Button("إلغاء", role: .cancel) {}
            Button("نعم، فعّل") { Task { await activateInSAS() } }
        } message: {
            Text("تجديد \(subscriber["username"].text) وخصم \(activation["required_amount"].text) من رصيد الموزع، ثم إضافة \(Fmt.iqd(renewal["sell_price_iqd"])) على حساب الزبون في المحل.")
        }
        .task { await loadSAS() }
    }

    private func loadSAS() async {
        guard let externalID else { return }
        direct = (try? await API.shared.sas4("status"))?["direct"].isTrue ?? false
        guard direct else { return }
        do { activation = try await API.shared.sas4("user", ["id": String(externalID)])["activation"] }
        catch APIError.sessionExpired { AppState.shared.expire() }
        catch { sasError = error.localizedDescription }
        if activation.isNull && sasError == nil { sasError = "بيانات التفعيل غير متاحة من SAS4." }
    }

    /// تفعيل في SAS4 ثم ترحيل التجديد للدفتر. إن لم تتأكد نتيجة SAS4 لا يُرحَّل شيء.
    private func activateInSAS() async {
        guard let externalID else { return }
        let amount = activation["n_required_amount"].double ?? Fmt.parseMoney(activation["required_amount"].text)
        guard let r = await sas.run("renew", [
            "user_id": .int(externalID), "username": .string(subscriber["username"].text), "method": "credit",
            "expected_amount": .num(amount), "comments": .string("تجديد من تطبيق المحل"),
        ], prefix: "rn") else {
            if !sas.uncertain { await loadSAS() }
            return
        }
        sasDone = true
        if let d = Fmt.parse(r["result"]["expiration"].string) { until = d }
        receipt = "SAS4 " + (r["transaction_id"].string ?? sas.ref)
        await confirm()
    }

    private var renewalID: JSON { renewal["id"].isNull ? renewal["renewal_id"] : renewal["id"] }

    private func confirm() async {
        busy = true
        error = nil
        defer { busy = false }
        let r = receipt.trimmingCharacters(in: .whitespaces)
        do {
            _ = try await API.shared.act("isp_renew_outcome", [
                "renewal_id": renewalID, "outcome": "CONFIRMED",
                "provider_receipt": .string(r.isEmpty ? "تأكيد من الهاتف — \(AppState.shared.employeeName) \(Fmt.when(Date()))" : r),
                "service_until": .string(ISO8601DateFormatter().string(from: until)),
            ])
            _ = try await API.shared.act("isp_renew_post", ["renewal_id": renewalID])
            AppState.shared.refreshTick += 1
            done()
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func fail() async {
        busy = true
        defer { busy = false }
        do {
            _ = try await API.shared.act("isp_renew_outcome", ["renewal_id": renewalID, "outcome": "FAILED", "failure_code": "لم يتم التفعيل"])
            AppState.shared.refreshTick += 1
            done()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
