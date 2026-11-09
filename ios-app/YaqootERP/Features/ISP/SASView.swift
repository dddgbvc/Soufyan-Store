import SwiftUI

/// البحث المباشر في SAS4 عبر ربط البرنامج: التطبيق يضع طلب قراءة في طابور البرنامج (sas_remote_commands)،
/// ووكيل SAS4 في برنامج المكتب ينفّذه بحساب الموزع ويعيد النتيجة. لا يحمل الهاتف أي كلمة مرور للمزوّد.
struct SASSearchView: View {
    @State private var status: JSON?
    @State private var account: String?
    @State private var q = ""
    @State private var users: [JSON] = []
    @State private var waiting = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                SwiftUI.Section {
                    if let accounts = status?["accounts"].array, !accounts.isEmpty {
                        Picker("حساب الموزع", selection: Binding(get: { account ?? accounts.first?["id"].string }, set: { account = $0 })) {
                            ForEach(accounts.records) { a in Text(a["name"].text).tag(Optional(a.id)) }
                        }
                        if let a = accounts.first(where: { $0["id"].string == (account ?? accounts.first?["id"].string) }) {
                            agentStatus(a)
                        }
                    } else if status != nil {
                        Text("لا يوجد حساب موزع متاح لك. يمنحه المدير من قسم الإنترنت في البرنامج.").foregroundStyle(.secondary)
                    } else {
                        ProgressView()
                    }
                }
                SwiftUI.Section {
                    HStack {
                        TextField("اسم المستخدم أو الاسم أو الهاتف", text: $q)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .onSubmit { Task { await search() } }
                        Button("بحث") { Task { await search() } }
                            .disabled(waiting || q.trimmingCharacters(in: .whitespaces).count < 2 || account == nil)
                    }
                    if waiting {
                        HStack { ProgressView(); Text("بانتظار برنامج المكتب…").foregroundStyle(.secondary) }
                    }
                    if let error { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Yq.red).font(.footnote) }
                } footer: {
                    Text("الطلب يُنفّذ عبر ربط SAS4 في برنامج المكتب، لذلك يجب أن يكون البرنامج مفتوحاً ومتصلاً.")
                }
                if !users.isEmpty {
                    SwiftUI.Section("النتائج (\(users.count))") {
                        ForEach(users.records) { u in
                            NavigationLink {
                                SASUserView(accountID: account ?? "", user: u.json)
                            } label: {
                                RowView(icon: "person.wave.2", color: u["enabled"].isTrue ? Yq.green : .gray,
                                        title: u["username"].text,
                                        subtitle: [name(u.json), u["phone"].string, u["expiration"].string.map { "ينتهي \($0)" }]
                                            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " • "),
                                        value: u["balance"].string.map { "رصيد \($0)" })
                            }
                        }
                    }
                }
            }
            .yaqootBackground()
            .navigationTitle("بحث في SAS4")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("تم") { dismiss() } } }
            .task { await loadStatus() }
        }
    }

    private func name(_ u: JSON) -> String? {
        let n = "\(u["firstname"].text) \(u["lastname"].text)".trimmingCharacters(in: .whitespaces)
        return n.isEmpty ? nil : n
    }

    private func agentStatus(_ a: JSON) -> some View {
        let last = Fmt.parse(a["agent_last_done"].string)
        let recent = last.map { Date().timeIntervalSince($0) < 30 * 60 } ?? false
        return Label(recent ? "ربط SAS4 في البرنامج يعمل (آخر تنفيذ \(Fmt.when(a["agent_last_done"])))"
                     : "آخر تنفيذ لربط SAS4 في البرنامج: \(Fmt.when(a["agent_last_done"])). افتح البرنامج ليُنفّذ الطلبات.",
                     systemImage: recent ? "checkmark.circle.fill" : "exclamationmark.circle")
            .font(.footnote).foregroundStyle(recent ? Yq.green : Yq.amber)
    }

    private func loadStatus() async {
        do {
            let s = try await API.shared.get("sas_status")
            status = s
            if account == nil { account = s["accounts"][0]["id"].string }
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func search() async {
        guard let account else { return }
        waiting = true
        error = nil
        defer { waiting = false }
        do {
            let r = try await SASCommand.run(account: account, type: "get_users", payload: ["search": .string(q.trimmingCharacters(in: .whitespaces))])
            users = r["users"].array
            if users.isEmpty { error = "لا توجد نتائج." }
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// تفاصيل مشترك من SAS4: البيانات وسعر الباقة الحالي من بيانات التفعيل.
struct SASUserView: View {
    let accountID: String
    let user: JSON
    @State private var detail: JSON?
    @State private var activation: JSON?
    @State private var error: String?
    @State private var loading = false

    var body: some View {
        List {
            SwiftUI.Section("المشترك لدى المزوّد") {
                LabeledContent("اسم المستخدم") { Text(user["username"].text).monospaced() }
                LabeledContent("رقم المشترك لدى SAS4", value: user["id"].text)
                field("الاسم", "\(user["firstname"].text) \(user["lastname"].text)")
                field("الهاتف", user["phone"].string)
                field("الانتهاء", (detail ?? user)["expiration"].string)
                field("الحالة", (detail ?? user)["enabled"].isTrue ? "مفعّل" : "موقوف")
                field("الرصيد لدى المزوّد", (detail ?? user)["balance"].string)
            }
            if let a = activation {
                SwiftUI.Section {
                    field("الباقة", a["profile_name"].string)
                    field("سعر الوحدة", a["unit_price"].string)
                    field("الوحدات", a["units"].string)
                    field("رصيد المشترك", a["user_balance"].string)
                    field("رصيد الموزع", a["manager_balance"].string)
                } header: {
                    Text("بيانات التفعيل (للاطلاع)")
                } footer: {
                    Text("رصيد الموزع لدى الشركة منفصل عن ديون الزبون في المحل. التفعيل والتجديد يتمان من البرنامج.")
                }
            }
            if loading { HStack { ProgressView(); Text("بانتظار برنامج المكتب…").foregroundStyle(.secondary) } }
            if let error { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Yq.red).font(.footnote) }
        }
        .yaqootBackground()
        .navigationTitle(user["username"].text)
        .task { await load() }
    }

    @ViewBuilder private func field(_ label: String, _ value: String?) -> some View {
        if let value, !value.trimmingCharacters(in: .whitespaces).isEmpty { LabeledContent(label, value: value) }
    }

    private func load() async {
        guard let id = user["id"].int else { return }
        loading = true
        defer { loading = false }
        do {
            async let d = SASCommand.run(account: accountID, type: "get_user", payload: ["user_id": .int(id)])
            async let a = SASCommand.run(account: accountID, type: "get_activation_data", payload: ["user_id": .int(id)])
            detail = try await d["data"]
            activation = try await a["data"]
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// تنفيذ أمر قراءة عبر ربط SAS4 في البرنامج وانتظار النتيجة (حتى 60 ثانية).
enum SASCommand {
    static func run(account: String, type: String, payload: [String: JSON]) async throws -> JSON {
        let r = try await API.shared.act("sas_command", ["account_id": .string(account), "command_type": .string(type), "payload": .object(payload)])
        guard let id = r["id"].string else { throw APIError.server(message: "تعذر إرسال الطلب", reason: nil, status: 0) }
        for _ in 0..<40 {
            try await Task.sleep(for: .milliseconds(1500))
            let s = try await API.shared.get("sas_result", ["id": id])
            switch s["status"].text {
            case "success", "done", "completed":
                return s["result"]
            case "failed", "error":
                throw APIError.server(message: s["error"].string ?? "رفض المزوّد الطلب", reason: "sas_failed", status: 0)
            default:
                continue
            }
        }
        throw APIError.server(message: "برنامج المكتب لم يرد خلال دقيقة. تأكد أنه مفتوح وربط SAS4 مفعّل.", reason: "sas_timeout", status: 0)
    }
}
