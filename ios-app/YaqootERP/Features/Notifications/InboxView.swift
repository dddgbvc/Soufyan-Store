import SwiftUI

struct KindMeta {
    let label: String
    let icon: String
    let color: Color
    let hint: String
    let perms: [String]
}

/// أنواع الإشعارات (مطابقة لـ web_push_dispatch).
let notificationKinds: [(String, KindMeta)] = [
    ("activity", KindMeta(label: "كل حركات المحل", icon: "clock.arrow.circlepath", color: Yq.teal, hint: "للمدير العام: كل عملية من أي جهاز", perms: ["__admin"])),
    ("invoice", KindMeta(label: "فاتورة جديدة", icon: "doc.text", color: Yq.teal, hint: "كل فاتورة بيع • أكثر من 3 بالدقيقة تُجمع", perms: ["pos"])),
    ("debt_added", KindMeta(label: "دين جديد", icon: "creditcard", color: Yq.deepGold, hint: "عند إضافة دين على زبون", perms: ["customers"])),
    ("debt_paid", KindMeta(label: "تسديد دين", icon: "banknote", color: Yq.green, hint: "عند قبض دفعة أو مسامحة", perms: ["customers"])),
    ("shortage", KindMeta(label: "النواقص", icon: "shippingbox", color: Yq.amber, hint: "نقص يدوي أو منتج تحت حد التنبيه", perms: ["shortages", "inventory"])),
    ("repair_ready", KindMeta(label: "صيانة جاهزة", icon: "wrench.and.screwdriver", color: Yq.blue, hint: "عندما تصبح التذكرة جاهزة للاستلام", perms: ["repairs"])),
    ("isp_expiring", KindMeta(label: "اشتراكات الإنترنت", icon: "wifi", color: Yq.blue, hint: "قبل الانتهاء بـ3 أيام وعند الانتهاء", perms: ["customers"])),
    ("report_daily", KindMeta(label: "التقرير اليومي", icon: "calendar", color: Yq.purple, hint: "كل يوم 11:00 مساءً", perms: ["dashboard"])),
    ("report_weekly", KindMeta(label: "التقرير الأسبوعي", icon: "calendar.badge.clock", color: Yq.purple, hint: "الجمعة 11:00 مساءً", perms: ["dashboard"])),
    ("report_monthly", KindMeta(label: "التقرير الشهري", icon: "calendar.circle", color: Yq.purple, hint: "يوم 1 الساعة 9:00 صباحاً", perms: ["dashboard"])),
    ("report_bimonthly", KindMeta(label: "تقرير الشهرين", icon: "calendar.circle", color: Yq.purple, hint: "يوم 1 من الأشهر الفردية", perms: ["dashboard"])),
    ("report_yearly", KindMeta(label: "التقرير السنوي", icon: "calendar.day.timeline.left", color: Yq.purple, hint: "1 كانون الثاني 9:00 صباحاً", perms: ["dashboard"])),
    ("custom", KindMeta(label: "رسالة من الإدارة", icon: "megaphone", color: Yq.red, hint: "", perms: [])),
]

func kindMeta(_ k: String) -> KindMeta {
    notificationKinds.first { $0.0 == k }?.1 ?? notificationKinds.last!.1
}

/// مركز الإشعارات: الصندوق، وللمدير إدارة إشعارات الموظفين والإشعار المخصص.
struct InboxView: View {
    @State private var app = AppState.shared
    @State private var tab = "inbox"

    var body: some View {
        VStack(spacing: 0) {
            if app.isAdmin {
                Picker("", selection: $tab) {
                    Text("صندوقي").tag("inbox")
                    Text("إدارة إشعارات المحل").tag("admin")
                }
                .pickerStyle(.segmented)
                .padding([.horizontal, .top])
            }
            if tab == "admin" && app.isAdmin { AdminNotificationsView() } else { InboxList() }
        }
        .background { YaqootBackground() }
    }
}

struct InboxList: View {
    @State private var model = Paged(listKey: "items", pageSize: 40, filter: "all",
                                     filterParams: { $0 == "all" ? [:] : ["kind": $0] },
                                     cursor: { last, _ in ["before": last["id"].text] }) { p in
        try await API.shared.get("inbox", p)
    }

    var body: some View {
        PagedList(model: model,
                  filters: [("all", "الكل"), ("activity", "الحركات"), ("invoice", "الفواتير"), ("debt", "الديون"), ("shortage", "النواقص"),
                            ("repair_ready", "الصيانة"), ("isp_expiring", "الإنترنت"), ("report", "التقارير"), ("custom", "الإدارة")],
                  empty: "لا توجد إشعارات",
                  header: { m in
                      HStack {
                          Text("\(m["unread"].int ?? 0) غير مقروء").foregroundStyle(.secondary)
                          Spacer()
                          Button { Task { await mark(all: true, ids: []) } } label: { Label("تعليم الكل كمقروء", systemImage: "checkmark.circle") }
                              .disabled((m["unread"].int ?? 0) == 0)
                      }
                      .listRowBackground(Color.clear)
                      .onAppear { AppState.shared.unread = m["unread"].int ?? AppState.shared.unread }
                  }) { n in
            let meta = kindMeta(n["kind"].text)
            let read = n["read"].isTrue
            Button {
                if !read, let id = n["id"].int { Task { await mark(all: false, ids: [id]) } }
                AppState.shared.route(fromURL: n["url"].string)
            } label: {
                RowView(icon: meta.icon, color: meta.color, title: n["title"].text,
                        subtitle: "\(n["body"].text)\n\(meta.label) • \(Fmt.when(n["created_at"]))",
                        pill: read ? nil : ("جديد", Yq.red))
                    .fontWeight(read ? .regular : .semibold)
            }
            .buttonStyle(.plain)
            .listRowBackground(read ? nil : Yq.teal.opacity(0.08))
        }
    }

    private func mark(all: Bool, ids: [Int]) async {
        if let d = try? await API.shared.act("notify_mark", ["all": .bool(all), "ids": .array(ids.map { .int($0) })]) {
            AppState.shared.unread = d["unread"].int ?? 0
            await model.reload()
        }
    }
}

/// إدارة إشعارات المحل (المدير العام): تفضيلات كل موظف، والإرسال المخصص.
struct AdminNotificationsView: View {
    @State private var broadcasting = false

    var body: some View {
        RemoteView(load: { try await API.shared.get("notify_admin") }) { d, remote in
            List {
                SwiftUI.Section {
                    Button { broadcasting = true } label: { Label("إرسال إشعار مخصص", systemImage: "megaphone.fill") }
                        .buttonStyle(.glassProminent).tint(Yq.teal)
                        .listRowBackground(Color.clear)
                }
                SwiftUI.Section("الموظفون") {
                    ForEach(d["employees"].array.records) { e in
                        NavigationLink {
                            EmployeePrefsView(employee: e.json)
                        } label: {
                            RowView(avatarText: e["name"].text, title: e["name"].text,
                                    subtitle: "\(Fmt.role(e["role"])) • \(e["devices"].num > 0 ? e["device_names"].array.map(\.text).joined(separator: "، ") : "بلا جهاز")",
                                    pill: e["unread"].num > 0 ? (e["unread"].text, Yq.amber) : nil)
                        }
                    }
                }
                SwiftUI.Section("آخر الإشعارات المرسلة") {
                    ForEach(d["recent"].array.records) { n in
                        let meta = kindMeta(n["kind"].text)
                        RowView(icon: meta.icon, color: meta.color, title: n["title"].text,
                                subtitle: "\(n["body"].text)\n\(Fmt.when(n["created_at"]))")
                    }
                }
            }
            .yaqootBackground()
            .refreshable { await remote.reload() }
            .sheet(isPresented: $broadcasting) { BroadcastSheet(employees: d["employees"].array) }
        }
    }
}

struct EmployeePrefsView: View {
    let employee: JSON
    var body: some View {
        RemoteView(load: { try await API.shared.get("notify_admin") }) { d, _ in
            let e = d["employees"].array.first { $0["id"].text == employee["id"].text } ?? employee
            PrefsEditor(initial: e["prefs"], permissions: Set(e["permissions"].array.compactMap(\.string)),
                        admin: e["role"].text.uppercased() == "ADMIN") { patch in
                let r = try await API.shared.act("notify_admin_set", ["employee_id": employee["id"], "prefs": .object(patch)])
                return r["prefs"]
            }
            .navigationTitle(employee["name"].text)
        }
    }
}

struct BroadcastSheet: View {
    let employees: [JSON]
    @State private var title = ""
    @State private var body_ = ""
    @State private var urgent = false
    @State private var all = true
    @State private var picked: Set<String> = []

    var body: some View {
        OperationSheet(
            title: "إشعار مخصص",
            confirmTitle: "إرسال «\(title)»؟",
            confirmMessage: { all ? "إلى كل الموظفين." : "إلى \(picked.count) موظف." },
            canSubmit: !title.trimmingCharacters(in: .whitespaces).isEmpty && (all || !picked.isEmpty),
            submit: {
                let r = try await API.shared.act("notify_broadcast", [
                    "title": .string(title.trimmingCharacters(in: .whitespaces)), "body": .string(body_.trimmingCharacters(in: .whitespaces)),
                    "urgent": .bool(urgent), "employee_ids": .array(all ? [] : picked.map { .string($0) }),
                ])
                return "وصل إلى \(r["recipients"].text) موظف"
            }
        ) {
            SwiftUI.Section {
                TextField("العنوان", text: $title)
                TextField("النص", text: $body_, axis: .vertical).lineLimit(3...6)
                Toggle("عاجل (يتجاوز ساعات الهدوء)", isOn: $urgent)
            }
            SwiftUI.Section("المستلمون") {
                Toggle("كل الموظفين", isOn: $all)
                if !all {
                    ForEach(employees.records) { e in
                        Toggle(e["name"].text, isOn: Binding(get: { picked.contains(e.id) },
                                                             set: { if $0 { picked.insert(e.id) } else { picked.remove(e.id) } }))
                    }
                }
            }
        }
    }
}

/// محرر تفضيلات الإشعارات (لي أو لموظف).
struct PrefsEditor: View {
    let initial: JSON
    let permissions: Set<String>
    let admin: Bool
    let save: ([String: JSON]) async throws -> JSON

    @State private var prefs: [String: JSON] = [:]
    @State private var busy: String?
    @State private var minText = ""
    @State private var toast: Toast?

    var body: some View {
        Form {
            SwiftUI.Section {
                ForEach(visible, id: \.0) { item in
                    let key = item.0, meta = item.1
                    Toggle(isOn: Binding(get: { prefs[key] != .bool(false) }, set: { v in change([key: .bool(v)]) })) {
                        Label {
                            VStack(alignment: .leading) {
                                Text(meta.label)
                                Text(meta.hint).font(.caption).foregroundStyle(.secondary)
                            }
                        } icon: { Image(systemName: meta.icon).foregroundStyle(meta.color) }
                    }
                    .disabled(busy == key)
                }
                if visible.contains(where: { $0.0 == "invoice" }) && prefs["invoice"] != .bool(false) {
                    HStack {
                        TextField("أقل مبلغ لإشعار الفاتورة (0 = الكل)", text: $minText).keyboardType(.numberPad)
                        Button("حفظ") { change(["invoice_min": .num(Fmt.parseMoney(minText))]) }
                    }
                }
            } header: {
                Text("الإشعارات التلقائية")
            } footer: {
                Text("تصل للصندوق دائماً، وللجهاز إذا فعّلت إشعارات الجهاز من الإعدادات.")
            }
            SwiftUI.Section("ساعات الهدوء") {
                Toggle("تفعيل ساعات الهدوء", isOn: Binding(get: { prefs["quiet"]?.isTrue ?? false }, set: { change(["quiet": .bool($0)]) }))
                if prefs["quiet"]?.isTrue ?? false {
                    timeRow("من", key: "quiet_from", fallback: "23:30")
                    timeRow("إلى", key: "quiet_to", fallback: "08:00")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .onAppear {
            prefs = initial.object
            minText = Fmt.money(initial["invoice_min"])
        }
        .toast($toast)
    }

    private var visible: [(String, KindMeta)] {
        let perms = admin ? permissions.union(["__admin"]) : permissions
        return notificationKinds.filter { $0.0 != "custom" && $0.1.perms.contains(where: perms.contains) }
    }

    private func timeRow(_ label: String, key: String, fallback: String) -> some View {
        let parts = (prefs[key]?.string ?? fallback).split(separator: ":").compactMap { Int($0) }
        var comps = DateComponents()
        comps.hour = parts.first ?? 0
        comps.minute = parts.count > 1 ? parts[1] : 0
        let date = Calendar.current.date(from: comps) ?? Date()
        return DatePicker(label, selection: Binding(get: { date }, set: { d in
            let c = Calendar.current.dateComponents([.hour, .minute], from: d)
            change([key: .string(String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0))])
        }), displayedComponents: .hourAndMinute)
    }

    private func change(_ patch: [String: JSON]) {
        let before = prefs
        prefs.merge(patch) { $1 }
        busy = patch.keys.first
        Task {
            defer { busy = nil }
            do {
                let r = try await save(patch)
                if case .object(let o) = r { prefs = o }
            } catch {
                prefs = before
                toast = Toast(text: error.localizedDescription, error: true)
            }
        }
    }
}
