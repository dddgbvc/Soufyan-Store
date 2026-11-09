import SwiftUI

/// أبراج SAS4: كل برج حساب موزع بدخول محفوظ دائماً في الخادم (كلمة المرور مشفّرة هناك ولا تصل للهاتف).
/// الهاتف يحفظ فقط رقم البرج المختار (ليس سراً) للتبديل السريع.
@Observable
final class SASTowers {
    static let shared = SASTowers()

    var towers: [JSON] = []
    var canManage = false
    var defaultHost = "reseller.nbtel.iq"
    var loaded = false
    var error: String?
    var selectedID: String? = UserDefaults.standard.string(forKey: "sas_tower") {
        didSet { UserDefaults.standard.set(selectedID, forKey: "sas_tower") }
    }

    var current: JSON? { towers.first { $0["id"].string == selectedID } }
    var hasTowers: Bool { !towers.isEmpty }

    func load() async {
        do {
            let r = try await API.shared.sas4("towers")
            towers = r["towers"].array
            canManage = r["can_manage"].isTrue
            if let h = r["default_host"].string { defaultHost = h }
            if current == nil { selectedID = towers.first?["id"].string }
            error = nil
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    func select(_ id: String?) {
        guard id != selectedID else { return }
        selectedID = id
    }

    /// التسمية الافتراضية للبرج الجديد: «برج N».
    var nextDefaultName: String {
        var n = towers.count + 1
        let names = Set(towers.map { $0["name"].text })
        while names.contains("برج \(n)") { n += 1 }
        return "برج \(n)"
    }
}

/// زر التبديل السريع بين الأبراج (في شريط الأدوات).
struct TowerSwitcher: View {
    @State private var store = SASTowers.shared
    @State private var adding = false
    @State private var managing = false

    var body: some View {
        Menu {
            ForEach(store.towers.records) { t in
                Button {
                    store.select(t.id)
                } label: {
                    if store.selectedID == t.id { Label(t["name"].text, systemImage: "checkmark") } else { Text(t["name"].text) }
                }
            }
            if store.canManage {
                Divider()
                Button { adding = true } label: { Label("إضافة برج", systemImage: "plus") }
                Button { managing = true } label: { Label("إدارة الأبراج", systemImage: "list.bullet") }
            }
        } label: {
            Label(store.current?["name"].string ?? "الأبراج", systemImage: "antenna.radiowaves.left.and.right")
                .labelStyle(.titleAndIcon)
        }
        .accessibilityLabel("البرج الحالي: \(store.current?["name"].string ?? "لا يوجد"). اضغط للتبديل")
        .sheet(isPresented: $adding) { TowerLoginSheet(tower: nil) }
        .sheet(isPresented: $managing) { NavigationStack { TowersManageView() } }
    }
}

/// إضافة برج أو إعادة تسجيل دخوله. الدخول يُختبر في SAS4 قبل الحفظ.
struct TowerLoginSheet: View {
    let tower: JSON?
    @State private var name = ""
    @State private var host = ""
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?
    @Environment(\.dismiss) private var dismiss

    enum Field { case name, username, password }

    private var isNew: Bool { tower == nil }
    private var valid: Bool {
        let u = username.trimmingCharacters(in: .whitespaces)
        if isNew { return !u.isEmpty && !password.isEmpty }
        // تعديل: تغيير الاسم فقط، أو إعادة الدخول بكلمة مرور جديدة.
        return !password.isEmpty ? !u.isEmpty : !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                SwiftUI.Section {
                    TextField("اسم البرج", text: $name).focused($focus, equals: .name)
                } header: {
                    Text("التسمية")
                } footer: {
                    Text("تسمية تظهر في التبديل السريع. تقدر تغيّرها بأي وقت.")
                }
                SwiftUI.Section {
                    TextField("اسم المستخدم في SAS4", text: $username)
                        .textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focus, equals: .username).submitLabel(.next).onSubmit { focus = .password }
                    SecureField(isNew ? "كلمة المرور" : "كلمة مرور جديدة (اتركها فارغة للإبقاء)", text: $password)
                        .textContentType(.password).focused($focus, equals: .password).submitLabel(.go)
                        .onSubmit { if valid { Task { await save() } } }
                    DisclosureGroup("خادم SAS4") {
                        TextField("العنوان", text: $host)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().monospaced()
                    }
                } header: {
                    Text("الدخول")
                } footer: {
                    Text("يُحفظ الدخول دائماً على خادم المحل مشفّراً، ويتجدد تلقائياً. كلمة المرور لا تُحفظ على الهاتف.")
                }
                if let error { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Yq.red).font(.footnote) }
            }
            .navigationTitle(isNew ? "إضافة برج" : "تعديل البرج")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() } else { Button(isNew ? "دخول وحفظ" : "حفظ") { Task { await save() } }.bold().disabled(!valid) }
                }
            }
            .interactiveDismissDisabled(busy)
            .onAppear {
                let s = SASTowers.shared
                name = tower?["name"].string ?? s.nextDefaultName
                host = tower?["host"].string ?? s.defaultHost
                username = tower?["username"].text ?? ""
                focus = isNew ? .username : .password
            }
        }
    }

    private func save() async {
        busy = true
        error = nil
        defer { busy = false }
        var body: [String: JSON] = ["name": .string(name.trimmingCharacters(in: .whitespaces))]
        if let id = tower?["id"].string { body["id"] = .string(id) }
        if !password.isEmpty {
            body["username"] = .string(username.trimmingCharacters(in: .whitespaces))
            body["password"] = .string(password)
            body["host"] = .string(host.trimmingCharacters(in: .whitespaces))
        }
        do {
            let r = try await API.shared.sas4Do("tower_save", ref: SASOp.newRef("tw"), body)
            password = ""
            await SASTowers.shared.load()
            if isNew, let id = r["id"].string { SASTowers.shared.select(id) }
            dismiss()
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// إدارة الأبراج (للمدير): الحالة، التسمية، إعادة الدخول، الحذف.
struct TowersManageView: View {
    @State private var store = SASTowers.shared
    @State private var editing: JSON?
    @State private var adding = false
    @State private var deleting: JSON?
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            SwiftUI.Section {
                if store.towers.isEmpty { Text("لا توجد أبراج بعد.").foregroundStyle(.secondary) }
                ForEach(store.towers.records) { t in
                    Button { editing = t.json } label: {
                        RowView(icon: "antenna.radiowaves.left.and.right",
                                color: t["last_error"].isNull ? Yq.green : Yq.red,
                                title: t["name"].text,
                                subtitle: [t["username"].text, t["host"].text].joined(separator: " • "),
                                value: t["last_error"].isNull ? (store.selectedID == t.id ? "الحالي" : nil) : "يحتاج دخول")
                    }
                    .tint(.primary)
                    .swipeActions {
                        Button("حذف", role: .destructive) { deleting = t.json }
                    }
                }
            } footer: {
                Text("اضغط على البرج لتغيير تسميته أو إعادة تسجيل دخوله.")
            }
            if let error { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Yq.red).font(.footnote) }
        }
        .yaqootBackground()
        .navigationTitle("الأبراج")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) { Button("تم") { dismiss() } }
            ToolbarItem(placement: .primaryAction) { Button { adding = true } label: { Label("إضافة برج", systemImage: "plus") } }
        }
        .sheet(isPresented: $adding) { TowerLoginSheet(tower: nil) }
        .sheet(item: Binding(get: { editing.map { Record($0) } }, set: { editing = $0?.json })) { r in TowerLoginSheet(tower: r.json) }
        .confirmationDialog("حذف البرج «\(deleting?["name"].text ?? "")»؟", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible) {
            Button("حذف", role: .destructive) { Task { await delete() } }
        } message: {
            Text("يُحذف الدخول المحفوظ. لا يتأثر أي مشترك في SAS4.")
        }
        .task { await store.load() }
        .refreshable { await store.load() }
    }

    private func delete() async {
        guard let id = deleting?["id"].string else { return }
        deleting = nil
        do {
            _ = try await API.shared.sas4Do("tower_delete", ref: SASOp.newRef("td"), ["id": .string(id)])
            if store.selectedID == id { store.selectedID = nil }
            await store.load()
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
