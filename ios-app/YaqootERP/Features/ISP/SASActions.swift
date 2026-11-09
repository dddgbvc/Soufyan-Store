import SwiftUI

/// عمليات SAS4 المباشرة عبر الخادم (‎/api/sas4‎). كل عملية:
/// • تُراجع وتُؤكد صراحة قبل الإرسال.
/// • تحمل مرجعاً ثابتاً (client_ref) فلا تتكرر عند إعادة الضغط أو انقطاع الشبكة.
/// • إن لم تتأكد نتيجتها (انقطاع أثناء التنفيذ) لا يُسمح بإعادتها حتى يُتحقق من المشترك.
enum SASOp {
    static func newRef(_ prefix: String) -> String { prefix + "-" + newClientID() }

    /// النتيجة غير مؤكدة لدى SAS4: يجب ألا يُعاد الإرسال تلقائياً.
    static func isUncertain(_ e: Error) -> Bool { (e as? APIError)?.reason == "sas_uncertain" }
}

/// ملف مشترك SAS4 في الوضع المباشر: البيانات، كلفة التجديد، وكل العمليات.
struct SASDirectUserView: View {
    let userID: Int
    let initial: JSON
    @State private var user: JSON = .null
    @State private var activation: JSON = .null
    @State private var ops: [JSON] = []
    @State private var loading = false
    @State private var error: String?
    @State private var sheet: Sheet?
    @State private var toast: Toast?

    enum Sheet: String, Identifiable {
        case renew, card, extend, profile, edit, rename
        var id: String { rawValue }
    }

    private var u: JSON { user.isNull ? initial : user }

    var body: some View {
        List {
            SwiftUI.Section {
                LabeledContent("اسم المستخدم") { Text(u["username"].text).monospaced() }
                LabeledContent("رقم المشترك لدى SAS4", value: String(userID))
                field("الاسم", "\(u["firstname"].text) \(u["lastname"].text)")
                field("الهاتف", u["phone"].string)
                field("الباقة", u["profile_name"].string)
                field("الانتهاء", u["expiration"].string)
                LabeledContent("الحالة") {
                    Pill(u["enabled"].isTrue ? "مفعّل" : "موقوف", color: u["enabled"].isTrue ? Yq.green : .gray)
                }
                field("الموزع", u["parent_username"].string)
                field("آخر اتصال", u["last_online"].string)
                if u["profileChange"].isTrue { Text("يوجد تغيير باقة مجدول عند الانتهاء القادم.").font(.footnote).foregroundStyle(Yq.amber) }
            } header: {
                Label("المشترك لدى المزوّد", systemImage: "server.rack")
            }

            if !activation.isNull {
                SwiftUI.Section {
                    field("الباقة", activation["profile_name"].string)
                    field("المدة", activation["profile_duration"].string)
                    field("كلفة التجديد على الموزع", activation["required_amount"].string)
                    field("رصيد الموزع لدى الشركة", activation["manager_balance"].string)
                    field("رصيد المشترك لدى الشركة", activation["user_balance"].string)
                } header: {
                    Text("التجديد")
                } footer: {
                    Text("رصيد الموزع لدى الشركة منفصل عن ديون الزبون في المحل. التجديد من هنا لا يضيف ديناً على الزبون؛ للتجديد مع الدين استعمل «تجديد الاشتراك» من ملف المشترك في قسم الإنترنت.")
                }
            }

            SwiftUI.Section("العمليات") {
                Button { sheet = .renew } label: { Label("تجديد من رصيد الموزع", systemImage: "arrow.clockwise.circle") }
                    .disabled(activation.isNull)
                Button { sheet = .card } label: { Label("تجديد بكارت", systemImage: "creditcard") }
                Button { sheet = .extend } label: { Label("تمديد", systemImage: "calendar.badge.plus") }
                Button { sheet = .profile } label: { Label("تغيير الباقة", systemImage: "speedometer") }
                Button { sheet = .edit } label: { Label("تعديل البيانات", systemImage: "square.and.pencil") }
                Button { sheet = .rename } label: { Label("تغيير اسم المستخدم", systemImage: "character.cursor.ibeam") }
            }

            SwiftUI.Section {
                NavigationLink { SASHistoryView(userID: userID) } label: { Label("سجل المشترك في SAS4", systemImage: "clock.arrow.circlepath") }
                if ops.isEmpty {
                    Text("لا توجد عمليات من التطبيق على هذا المشترك.").foregroundStyle(.secondary)
                }
                ForEach(ops.records) { o in
                    RowView(icon: opIcon(o["op"].text), color: opColor(o["status"].text),
                            title: "\(opLabel(o["op"].text)) • \(statusLabel(o["status"].text))",
                            subtitle: [o["employee"].string, Fmt.when(o["created_at"]), o["error"].string].compactMap { $0 }
                                .filter { !$0.isEmpty }.joined(separator: " • "))
                }
            } header: {
                Text("السجل")
            }

            if loading { HStack { ProgressView(); Text("جارِ التحميل من SAS4…").foregroundStyle(.secondary) } }
            if let error { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Yq.red).font(.footnote) }
        }
        .yaqootBackground()
        .navigationTitle(u["username"].text)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $sheet) { s in
            NavigationStack {
                switch s {
                case .renew: SASRenewForm(userID: userID, user: u, activation: activation, card: false) { done($0) }
                case .card: SASRenewForm(userID: userID, user: u, activation: activation, card: true) { done($0) }
                case .extend: SASExtendForm(userID: userID, user: u) { done($0) }
                case .profile: SASProfileForm(userID: userID, user: u) { done($0) }
                case .edit: SASEditForm(userID: userID, user: u) { done($0) }
                case .rename: SASRenameForm(userID: userID, user: u) { done($0) }
                }
            }
        }
        .toast($toast)
    }

    private func done(_ message: String) {
        sheet = nil
        toast = Toast(text: message)
        Task { await load() }
    }

    @ViewBuilder private func field(_ label: String, _ value: String?) -> some View {
        if let value, !value.trimmingCharacters(in: .whitespaces).isEmpty { LabeledContent(label, value: value) }
    }

    private func load() async {
        loading = true
        error = nil
        defer { loading = false }
        do {
            let r = try await API.shared.sas4("user", ["id": String(userID)])
            user = r["user"]
            activation = r["activation"]
            ops = r["ops"].array
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

func opLabel(_ op: String) -> String {
    ["renew": "تجديد", "extend": "تمديد", "change_profile": "تغيير باقة", "edit": "تعديل بيانات", "rename": "تغيير اسم", "create": "إنشاء مشترك"][op] ?? op
}

private func opIcon(_ op: String) -> String {
    ["renew": "arrow.clockwise", "extend": "calendar.badge.plus", "change_profile": "speedometer", "edit": "square.and.pencil",
     "rename": "character.cursor.ibeam", "create": "person.badge.plus"][op] ?? "circle"
}

private func statusLabel(_ s: String) -> String {
    ["success": "تم", "failed": "رُفض", "unknown": "غير مؤكد", "pending": "قيد التنفيذ"][s] ?? s
}

private func opColor(_ s: String) -> Color {
    switch s { case "success": Yq.green; case "failed": Yq.red; default: Yq.amber }
}

// MARK: - نموذج عام للعمليات

/// حالة إرسال مشتركة: مرجع ثابت، انشغال، خطأ، وإعادة توليد المرجع بعد رفض صريح فقط.
@Observable
final class SASSubmit {
    var ref: String
    var busy = false
    var error: String?
    var uncertain = false

    init(_ prefix: String) { ref = SASOp.newRef(prefix) }

    func run(_ op: String, _ body: [String: JSON], prefix: String) async -> JSON? {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let r = try await API.shared.sas4Do(op, ref: ref, body)
            return r
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            self.error = error.localizedDescription
            if SASOp.isUncertain(error) { uncertain = true } else { ref = SASOp.newRef(prefix) }
        }
        return nil
    }
}

private struct SubmitStatus: View {
    let s: SASSubmit
    var body: some View {
        if let e = s.error {
            Label(e, systemImage: s.uncertain ? "questionmark.diamond" : "exclamationmark.triangle")
                .foregroundStyle(s.uncertain ? Yq.amber : Yq.red).font(.footnote)
        }
    }
}

// MARK: - تجديد

struct SASRenewForm: View {
    let userID: Int
    let user: JSON
    let activation: JSON
    let card: Bool
    let done: (String) -> Void
    @State private var submit = SASSubmit("rn")
    @State private var pin = ""
    @State private var comments = ""
    @State private var asking = false
    @Environment(\.dismiss) private var dismiss

    private var amount: Double { activation["n_required_amount"].double ?? Fmt.parseMoney(activation["required_amount"].text) }

    var body: some View {
        Form {
            SwiftUI.Section {
                LabeledContent("المشترك") { Text(user["username"].text).monospaced() }
                LabeledContent("الباقة", value: activation["profile_name"].string ?? user["profile_name"].text)
                LabeledContent("ينتهي حالياً", value: user["expiration"].text)
                if !card {
                    LabeledContent("الكلفة من رصيد الموزع", value: activation["required_amount"].string ?? Fmt.money(amount))
                    LabeledContent("رصيد الموزع", value: activation["manager_balance"].text)
                }
            }
            if card {
                SwiftUI.Section("الكارت") {
                    TextField("رقم الكارت (PIN)", text: $pin).keyboardType(.asciiCapable).monospaced()
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                }
            }
            SwiftUI.Section("ملاحظة (اختياري)") { TextField("ملاحظة تظهر في SAS4", text: $comments) }
            SubmitStatus(s: submit)
        }
        .navigationTitle(card ? "تجديد بكارت" : "تجديد من الرصيد")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() }.disabled(submit.busy) }
            ToolbarItem(placement: .confirmationAction) {
                if submit.busy { ProgressView() } else {
                    Button("تجديد") { asking = true }.bold()
                        .disabled(submit.uncertain || (card ? pin.trimmingCharacters(in: .whitespaces).isEmpty : amount.isNaN))
                }
            }
        }
        .alert("تأكيد التجديد في SAS4", isPresented: $asking) {
            Button("إلغاء", role: .cancel) {}
            Button("نعم، جدّد") { Task { await go() } }
        } message: {
            Text(card ? "تجديد \(user["username"].text) بالكارت المدخل."
                 : "تجديد \(user["username"].text) وخصم \(activation["required_amount"].string ?? Fmt.money(amount)) من رصيد الموزع.\nلا يُضاف دين على الزبون من هنا.")
        }
        .interactiveDismissDisabled(submit.busy)
    }

    private func go() async {
        var body: [String: JSON] = ["user_id": .int(userID), "username": .string(user["username"].text),
                                    "method": .string(card ? "card" : "credit"), "comments": .string(comments)]
        if card { body["pin"] = .string(pin.trimmingCharacters(in: .whitespaces)) } else { body["expected_amount"] = .num(amount) }
        if let r = await submit.run("renew", body, prefix: "rn") {
            let exp = r["result"]["expiration"].string
            done(exp.map { "تم التجديد. ينتهي \($0)" } ?? "تم التجديد")
        }
    }
}

// MARK: - تمديد

struct SASExtendForm: View {
    let userID: Int
    let user: JSON
    let done: (String) -> Void
    @State private var submit = SASSubmit("ex")
    @State private var options: [JSON] = []
    @State private var info: JSON = .null
    @State private var selected: Int?
    @State private var loadError: String?
    @State private var asking = false
    @Environment(\.dismiss) private var dismiss

    private var selectedName: String { options.first { $0["id"].int == selected }?["name"].text ?? "" }

    var body: some View {
        Form {
            SwiftUI.Section {
                LabeledContent("المشترك") { Text(user["username"].text).monospaced() }
                LabeledContent("ينتهي", value: info["expiration"].string ?? user["expiration"].text)
                if !info["balance"].isNull { LabeledContent("رصيد الموزع", value: info["balance"].text) }
            }
            SwiftUI.Section("باقة التمديد") {
                if options.isEmpty && loadError == nil { ProgressView() }
                if let loadError { Text(loadError).foregroundStyle(Yq.red).font(.footnote) }
                if !options.isEmpty {
                    Picker("التمديد", selection: $selected) {
                        Text("اختر").tag(Int?.none)
                        ForEach(options.records) { o in Text(o["name"].text).tag(o["id"].int) }
                    }
                    .pickerStyle(.inline).labelsHidden()
                }
                if loadError == nil && options.isEmpty && !info.isNull { Text("لا توجد تمديدات مسموحة لهذه الباقة.").foregroundStyle(.secondary) }
            }
            SubmitStatus(s: submit)
        }
        .navigationTitle("تمديد")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() }.disabled(submit.busy) }
            ToolbarItem(placement: .confirmationAction) {
                if submit.busy { ProgressView() } else {
                    Button("تمديد") { asking = true }.bold().disabled(selected == nil || submit.uncertain)
                }
            }
        }
        .alert("تأكيد التمديد", isPresented: $asking) {
            Button("إلغاء", role: .cancel) {}
            Button("نعم، مدّد") { Task { await go() } }
        } message: { Text("تمديد \(user["username"].text) بـ «\(selectedName)» من رصيد الموزع.") }
        .task { await load() }
        .interactiveDismissDisabled(submit.busy)
    }

    private func load() async {
        do {
            let r = try await API.shared.sas4("extensions", ["id": String(userID)])
            info = r["info"]
            options = r["options"].array
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func go() async {
        guard let selected else { return }
        if let r = await submit.run("extend", ["user_id": .int(userID), "profile_id": .int(selected), "profile_name": .string(selectedName),
                                               "username": .string(user["username"].text)], prefix: "ex") {
            done(r["result"]["expiration"].string.map { "تم التمديد. ينتهي \($0)" } ?? "تم التمديد")
        }
    }
}

// MARK: - تغيير الباقة

struct SASProfileForm: View {
    let userID: Int
    let user: JSON
    let done: (String) -> Void
    @State private var submit = SASSubmit("cp")
    @State private var profiles: [JSON] = []
    @State private var selected: Int?
    @State private var loadError: String?
    @State private var asking = false
    @Environment(\.dismiss) private var dismiss

    private var selectedName: String { profiles.first { $0["id"].int == selected }?["name"].text ?? "" }

    var body: some View {
        Form {
            SwiftUI.Section {
                LabeledContent("الباقة الحالية", value: user["profile_name"].text)
            } footer: {
                Text("إذا كان الاشتراك فعّالاً، يطبّق SAS4 الباقة الجديدة عند الانتهاء القادم.")
            }
            SwiftUI.Section("الباقة الجديدة") {
                if profiles.isEmpty && loadError == nil { ProgressView() }
                if let loadError { Text(loadError).foregroundStyle(Yq.red).font(.footnote) }
                if !profiles.isEmpty {
                    Picker("الباقة", selection: $selected) {
                        Text("اختر").tag(Int?.none)
                        ForEach(profiles.records) { p in Text(p["name"].text).tag(p["id"].int) }
                    }
                    .pickerStyle(.inline).labelsHidden()
                }
            }
            SubmitStatus(s: submit)
        }
        .navigationTitle("تغيير الباقة")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() }.disabled(submit.busy) }
            ToolbarItem(placement: .confirmationAction) {
                if submit.busy { ProgressView() } else {
                    Button("حفظ") { asking = true }.bold()
                        .disabled(selected == nil || selected == user["profile_id"].int || submit.uncertain)
                }
            }
        }
        .alert("تأكيد تغيير الباقة", isPresented: $asking) {
            Button("إلغاء", role: .cancel) {}
            Button("نعم، غيّر") { Task { await go() } }
        } message: { Text("\(user["username"].text): من «\(user["profile_name"].text)» إلى «\(selectedName)».") }
        .task { await load() }
        .interactiveDismissDisabled(submit.busy)
    }

    private func load() async {
        do { profiles = try await API.shared.sas4("profiles")["profiles"].array }
        catch APIError.sessionExpired { AppState.shared.expire() }
        catch { loadError = error.localizedDescription }
    }

    private func go() async {
        guard let selected else { return }
        if await submit.run("change_profile", ["user_id": .int(userID), "profile_id": .int(selected), "profile_name": .string(selectedName),
                                               "username": .string(user["username"].text)], prefix: "cp") != nil {
            done("تم طلب تغيير الباقة إلى \(selectedName)")
        }
    }
}

// MARK: - تعديل البيانات

struct SASEditForm: View {
    let userID: Int
    let user: JSON
    let done: (String) -> Void
    @State private var submit = SASSubmit("ed")
    @State private var firstname = ""
    @State private var lastname = ""
    @State private var phone = ""
    @State private var address = ""
    @State private var city = ""
    @State private var notes = ""
    @State private var enabled = true
    @State private var picking = false
    @State private var asking = false
    @Environment(\.dismiss) private var dismiss

    private var changes: [String: JSON] {
        var c: [String: JSON] = [:]
        func put(_ k: String, _ v: String) { if v.trimmingCharacters(in: .whitespaces) != user[k].text { c[k] = .string(v.trimmingCharacters(in: .whitespaces)) } }
        put("firstname", firstname); put("lastname", lastname); put("phone", phone)
        put("address", address); put("city", city); put("notes", notes)
        if enabled != user["enabled"].isTrue { c["enabled"] = .bool(enabled) }
        return c
    }

    var body: some View {
        Form {
            SwiftUI.Section("الاسم") {
                TextField("الاسم الأول", text: $firstname)
                TextField("اسم العائلة", text: $lastname)
            }
            SwiftUI.Section("التواصل") {
                HStack {
                    TextField("الهاتف", text: $phone).keyboardType(.phonePad).monospaced()
                    Button { picking = true } label: { Image(systemName: "person.crop.circle.badge.plus") }
                        .accessibilityLabel("اختيار من جهات الاتصال")
                }
                TextField("العنوان", text: $address)
                TextField("المدينة", text: $city)
            }
            SwiftUI.Section("ملاحظات") { TextField("ملاحظات", text: $notes, axis: .vertical).lineLimit(2...5) }
            SwiftUI.Section {
                Toggle("الحساب مفعّل", isOn: $enabled)
            } footer: {
                Text("إيقاف الحساب يمنع المشترك من الاتصال حتى تعيد تفعيله.")
            }
            SubmitStatus(s: submit)
        }
        .navigationTitle("تعديل البيانات")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() }.disabled(submit.busy) }
            ToolbarItem(placement: .confirmationAction) {
                if submit.busy { ProgressView() } else {
                    Button("حفظ") { asking = true }.bold().disabled(changes.isEmpty || submit.uncertain)
                }
            }
        }
        .alert("حفظ التعديلات في SAS4؟", isPresented: $asking) {
            Button("إلغاء", role: .cancel) {}
            Button("حفظ") { Task { await go() } }
        } message: {
            Text("سيتغير: " + changes.keys.map(fieldName).sorted().joined(separator: "، "))
        }
        .sheet(isPresented: $picking) { ContactPhonePicker { picked in picking = false; if let picked { phone = picked } }.ignoresSafeArea() }
        .onAppear {
            firstname = user["firstname"].text; lastname = user["lastname"].text; phone = user["phone"].text
            address = user["address"].text; city = user["city"].text; notes = user["notes"].text
            enabled = user["enabled"].isTrue
        }
        .interactiveDismissDisabled(submit.busy)
    }

    private func fieldName(_ k: String) -> String {
        ["firstname": "الاسم الأول", "lastname": "اسم العائلة", "phone": "الهاتف", "address": "العنوان", "city": "المدينة",
         "notes": "الملاحظات", "enabled": "حالة الحساب"][k] ?? k
    }

    private func go() async {
        if await submit.run("edit", ["user_id": .int(userID), "username": .string(user["username"].text), "changes": .object(changes)], prefix: "ed") != nil {
            done("تم حفظ التعديلات")
        }
    }
}

// MARK: - تغيير اسم المستخدم

struct SASRenameForm: View {
    let userID: Int
    let user: JSON
    let done: (String) -> Void
    @State private var submit = SASSubmit("rnm")
    @State private var name = ""
    @State private var asking = false
    @Environment(\.dismiss) private var dismiss

    private var valid: Bool { name.range(of: "^[a-zA-Z0-9.@_:-]{3,64}$", options: .regularExpression) != nil && name != user["username"].text }

    var body: some View {
        Form {
            SwiftUI.Section {
                LabeledContent("الحالي") { Text(user["username"].text).monospaced() }
                TextField("اسم المستخدم الجديد", text: $name).monospaced()
                    .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.asciiCapable)
            } footer: {
                Text("حروف إنجليزية وأرقام و . @ _ - فقط. المشترك يدخل بالاسم الجديد بعد الحفظ.")
            }
            SubmitStatus(s: submit)
        }
        .navigationTitle("تغيير اسم المستخدم")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() }.disabled(submit.busy) }
            ToolbarItem(placement: .confirmationAction) {
                if submit.busy { ProgressView() } else { Button("حفظ") { asking = true }.bold().disabled(!valid || submit.uncertain) }
            }
        }
        .alert("تغيير اسم المستخدم؟", isPresented: $asking) {
            Button("إلغاء", role: .cancel) {}
            Button("تغيير") { Task { await go() } }
        } message: { Text("\(user["username"].text) ← \(name)") }
        .interactiveDismissDisabled(submit.busy)
    }

    private func go() async {
        if await submit.run("rename", ["user_id": .int(userID), "username": .string(user["username"].text), "new_username": .string(name)], prefix: "rnm") != nil {
            done("تم تغيير اسم المستخدم إلى \(name)")
        }
    }
}

// MARK: - إنشاء مشترك

struct SASCreateSheet: View {
    @State private var submit = SASSubmit("cr")
    @State private var profiles: [JSON] = []
    @State private var profile: Int?
    @State private var username = ""
    @State private var password = ""
    @State private var firstname = ""
    @State private var lastname = ""
    @State private var phone = ""
    @State private var picking = false
    @State private var asking = false
    @State private var loadError: String?
    @State private var created: JSON?
    @Environment(\.dismiss) private var dismiss

    private var profileName: String { profiles.first { $0["id"].int == profile }?["name"].text ?? "" }
    private var valid: Bool {
        username.range(of: "^[a-zA-Z0-9.@_:-]{3,64}$", options: .regularExpression) != nil && (4...64).contains(password.count) && profile != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                if let created {
                    SwiftUI.Section {
                        Label("أُنشئ المشترك \(created["username"].text)", systemImage: "checkmark.circle.fill").foregroundStyle(Yq.green)
                        Text("لتفعيله: افتحه من البحث واختر «تجديد». لربطه بزبون في المحل استعمل قسم الإنترنت في البرنامج.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                } else {
                    SwiftUI.Section("الدخول") {
                        TextField("اسم المستخدم", text: $username).monospaced()
                            .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.asciiCapable)
                        SecureField("كلمة المرور", text: $password).textContentType(.newPassword)
                    }
                    SwiftUI.Section("الباقة") {
                        if profiles.isEmpty && loadError == nil { ProgressView() }
                        if let loadError { Text(loadError).foregroundStyle(Yq.red).font(.footnote) }
                        if !profiles.isEmpty {
                            Picker("الباقة", selection: $profile) {
                                Text("اختر").tag(Int?.none)
                                ForEach(profiles.records) { p in Text(p["name"].text).tag(p["id"].int) }
                            }
                        }
                    }
                    SwiftUI.Section("بيانات المشترك") {
                        TextField("الاسم الأول", text: $firstname)
                        TextField("اسم العائلة", text: $lastname)
                        HStack {
                            TextField("الهاتف", text: $phone).keyboardType(.phonePad).monospaced()
                            Button { picking = true } label: { Image(systemName: "person.crop.circle.badge.plus") }
                                .accessibilityLabel("اختيار من جهات الاتصال")
                        }
                    }
                    SubmitStatus(s: submit)
                }
            }
            .navigationTitle("مشترك جديد في SAS4")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(created == nil ? "إلغاء" : "تم") { dismiss() }.disabled(submit.busy) }
                if created == nil {
                    ToolbarItem(placement: .confirmationAction) {
                        if submit.busy { ProgressView() } else { Button("إنشاء") { asking = true }.bold().disabled(!valid || submit.uncertain) }
                    }
                }
            }
            .alert("إنشاء مشترك حقيقي في SAS4؟", isPresented: $asking) {
                Button("إلغاء", role: .cancel) {}
                Button("إنشاء") { Task { await go() } }
            } message: { Text("\(username) • \(profileName)") }
            .sheet(isPresented: $picking) { ContactPhonePicker { picked in picking = false; if let picked { phone = picked } }.ignoresSafeArea() }
            .task { await load() }
            .interactiveDismissDisabled(submit.busy)
        }
    }

    private func load() async {
        do { profiles = try await API.shared.sas4("profiles")["profiles"].array }
        catch APIError.sessionExpired { AppState.shared.expire() }
        catch { loadError = error.localizedDescription }
    }

    private func go() async {
        guard let profile else { return }
        if let r = await submit.run("create", [
            "username": .string(username), "password": .string(password), "profile_id": .int(profile), "profile_name": .string(profileName),
            "firstname": .string(firstname), "lastname": .string(lastname), "phone": .string(phone),
        ], prefix: "cr") {
            password = ""
            created = r["result"].isNull ? ["username": .string(username)] : r["result"]
        }
    }
}

// MARK: - سجل SAS4

struct SASHistoryView: View {
    let userID: Int
    @State private var rows: [JSON] = []
    @State private var error: String?
    @State private var loaded = false

    var body: some View {
        List {
            if loaded && rows.isEmpty && error == nil { Text("لا يوجد سجل").foregroundStyle(.secondary) }
            ForEach(rows.records) { r in
                RowView(icon: "clock", color: .gray, title: r["description"].string ?? r["event"].text,
                        subtitle: [r["by"].string, r["created_at"].string].compactMap { $0 }.joined(separator: " • "))
            }
            if let error { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Yq.red).font(.footnote) }
        }
        .yaqootBackground()
        .navigationTitle("سجل SAS4")
        .overlay { if !loaded { ProgressView() } }
        .task {
            defer { loaded = true }
            do { rows = try await API.shared.sas4("history", ["id": String(userID)])["history"].array }
            catch APIError.sessionExpired { AppState.shared.expire() }
            catch { self.error = error.localizedDescription }
        }
    }
}
