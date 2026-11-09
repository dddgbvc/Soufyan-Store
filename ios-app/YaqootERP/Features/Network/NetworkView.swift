import SwiftUI

/// أجهزة الشبكة: MikroTik وUISP عبر شبكة المكتب أو VPN. الأسرار في Keychain هذا الجهاز فقط.
struct NetworkView: View {
    @State private var store = IntegrationStore.shared
    @State private var editing: Integration?

    var body: some View {
        List {
            if store.items.isEmpty {
                ContentUnavailableView {
                    Label("لا توجد أجهزة بعد", systemImage: "point.3.connected.trianglepath.dotted")
                } description: {
                    Text("أضف راوتر MikroTik (REST API) أو خادم UISP برمز API. يتصل الهاتف بها مباشرة داخل شبكة المكتب أو عبر VPN — لا تفتح منافذ الإدارة للإنترنت.")
                } actions: {
                    Button("إضافة جهاز") { editing = Integration(kind: .mikrotik, name: "", baseURL: "https://") }
                        .buttonStyle(.glassProminent).tint(Yq.teal)
                }
                .listRowBackground(Color.clear)
            }
            ForEach(Integration.Kind.allCases, id: \.self) { kind in
                let items = store.items.filter { $0.kind == kind }
                if !items.isEmpty {
                    SwiftUI.Section(kind.label) {
                        ForEach(items) { i in
                            NavigationLink(value: i) {
                                RowView(icon: kind.icon, color: Yq.blue, title: i.name,
                                        subtitle: URL(string: i.baseURL)?.host() ?? i.baseURL,
                                        pill: i.pinnedSHA256 == nil ? nil : ("شهادة مثبّتة", Yq.green))
                            }
                            .swipeActions {
                                Button(role: .destructive) { store.remove(i) } label: { Label("حذف", systemImage: "trash") }
                                Button { editing = i } label: { Label("تعديل", systemImage: "pencil") }.tint(Yq.blue)
                            }
                        }
                    }
                }
            }
        }
        .yaqootBackground()
        .navigationDestination(for: Integration.self) { i in
            switch i.kind {
            case .mikrotik: RouterDetailView(integration: i)
            case .uispNMS: UISPDevicesView(integration: i)
            case .uispCRM: UISPClientsView(integration: i)
            }
        }
        .toolbar {
            Button { editing = Integration(kind: .mikrotik, name: "", baseURL: "https://") } label: { Label("إضافة", systemImage: "plus") }
        }
        .sheet(item: $editing) { IntegrationForm(integration: $0) }
    }
}

/// نموذج إضافة/تعديل تكامل مع اختبار الاتصال والموافقة على بصمة الشهادة.
struct IntegrationForm: View {
    @State var integration: Integration
    @State private var secret = ""
    @State private var testing = false
    @State private var result: String?
    @State private var untrusted: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                SwiftUI.Section {
                    Picker("النوع", selection: $integration.kind) {
                        ForEach(Integration.Kind.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    TextField("الاسم (مثلاً: البرج الرئيسي)", text: $integration.name)
                    TextField("https://10.0.0.1 أو https://uisp.local", text: $integration.baseURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .environment(\.layoutDirection, .leftToRight)
                }
                SwiftUI.Section {
                    if integration.kind == .mikrotik {
                        TextField("اسم المستخدم", text: $integration.username)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        SecureField(IntegrationStore.shared.secret(integration) == nil ? "كلمة المرور" : "كلمة المرور (محفوظة — اتركها فارغة للإبقاء)", text: $secret)
                    } else {
                        SecureField(IntegrationStore.shared.secret(integration) == nil ? "رمز API" : "رمز API (محفوظ — اتركه فارغاً للإبقاء)", text: $secret)
                    }
                } header: {
                    Text("الدخول")
                } footer: {
                    Text(integration.kind == .mikrotik
                         ? "فعّل خدمة www-ssl على الراوتر وأنشئ مستخدماً بمجموعة read. RouterOS 7.1 أو أحدث."
                         : integration.kind == .uispNMS ? "UISP ← Settings ← Users ← App Tokens (صلاحية قراءة)." : "UISP CRM ← System ← Security ← App keys (Read).")
                }
                SwiftUI.Section {
                    Button {
                        Task { await test() }
                    } label: {
                        HStack { Text("اختبار الاتصال"); Spacer(); if testing { ProgressView() } }
                    }
                    .disabled(testing)
                    if let result { Text(result).font(.callout) }
                    if let fp = untrusted {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("شهادة ذاتية التوقيع. طابق البصمة مع الجهاز قبل الوثوق:").font(.callout)
                            Text(fp).font(.caption.monospaced()).textSelection(.enabled)
                            Button("أثق بهذه الشهادة") {
                                integration.pinnedSHA256 = fp
                                untrusted = nil
                                Task { await test() }
                            }
                            .buttonStyle(.glassProminent).tint(Yq.teal)
                        }
                    }
                    if integration.pinnedSHA256 != nil {
                        Button("إلغاء تثبيت الشهادة", role: .destructive) { integration.pinnedSHA256 = nil }
                    }
                }
            }
            .navigationTitle(integration.name.isEmpty ? "جهاز جديد" : integration.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("حفظ") {
                        IntegrationStore.shared.save(integration, secret: secret.isEmpty ? nil : secret)
                        dismiss()
                    }
                    .disabled(integration.name.isEmpty || !integration.baseURL.hasPrefix("https://"))
                }
            }
        }
    }

    private func test() async {
        testing = true
        result = nil
        defer { testing = false }
        let pass = secret.isEmpty ? (IntegrationStore.shared.secret(integration) ?? "") : secret
        let i = integration
        do {
            switch i.kind {
            case .mikrotik:
                let r = try await RouterOS(integration: i, password: pass).resource()
                result = "✓ متصل: \(r["board-name"].text) • RouterOS \(r["version"].text)"
            case .uispNMS:
                let d = try await UISPNetwork(integration: i, token: pass).devices()
                result = "✓ متصل: \(d.array.count) جهاز"
            case .uispCRM:
                let c = try await UISPCRM(integration: i, key: pass).clients()
                result = "✓ متصل: \(c.array.count) عميل"
            }
        } catch NetError.untrusted(let fp) {
            untrusted = fp
        } catch {
            result = error.localizedDescription
        }
    }
}

/// تفاصيل راوتر MikroTik: الموارد، الواجهات، المشتركون النشطون، الأجهزة المجاورة، السجل، وأدوات.
struct RouterDetailView: View {
    let integration: Integration
    @State private var tab = "overview"
    @State private var data: [String: JSON] = [:]
    @State private var error: String?
    @State private var loading = false
    @State private var pingTarget = ""
    @State private var pingResult: [JSON] = []

    private var client: RouterOS? {
        IntegrationStore.shared.secret(integration).map { RouterOS(integration: integration, password: $0) }
    }

    var body: some View {
        List {
            SwiftUI.Section {
                FilterBar(options: [("overview", "نظرة عامة"), ("interfaces", "الواجهات"), ("ppp", "PPPoE"), ("hotspot", "Hotspot"),
                                    ("dhcp", "DHCP"), ("queues", "Queues"), ("neighbors", "الأجهزة المجاورة"), ("log", "السجل"), ("ping", "Ping")],
                          selection: $tab)
            }
            .listRowBackground(Color.clear)
            if let error {
                Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Yq.red)
            }
            content
            if loading { HStack { Spacer(); ProgressView(); Spacer() } }
        }
        .yaqootBackground()
        .navigationTitle(integration.name)
        .refreshable { await load(force: true) }
        .task(id: tab) { await load(force: false) }
    }

    @ViewBuilder private var content: some View {
        switch tab {
        case "overview":
            let r = data["overview"] ?? .null
            if !r.isNull {
                let total = r["total-memory"].num, free = r["free-memory"].num
                SwiftUI.Section {
                    KPIGrid {
                        KPITile(label: "المعالج", value: "\(r["cpu-load"].text)٪", icon: "cpu", color: r["cpu-load"].num > 80 ? Yq.red : Yq.teal,
                                hint: "\(r["cpu-count"].text) نواة • \(r["cpu-frequency"].text) MHz")
                        KPITile(label: "الذاكرة", value: total > 0 ? "\(Int(((total - free) / total * 100).rounded()))٪" : "—", icon: "memorychip",
                                color: Yq.blue, hint: "\(Fmt.money((total - free) / 1_048_576)) / \(Fmt.money(total / 1_048_576)) MB")
                        KPITile(label: "مدة التشغيل", value: r["uptime"].text, icon: "clock", color: Yq.green)
                        KPITile(label: "الإصدار", value: r["version"].text, icon: "server.rack", color: Yq.purple, hint: r["board-name"].text)
                    }
                }
                .listRowBackground(Color.clear)
            }
        case "interfaces":
            ForEach(list("interfaces").records) { i in
                let running = i["running"].text == "true"
                let disabled = i["disabled"].text == "true"
                NavigationLink {
                    TrafficView(client: client, name: i["name"].text)
                } label: {
                    RowView(icon: "cable.connector", color: disabled ? .gray : running ? Yq.green : Yq.red, title: i["name"].text,
                            subtitle: "\(i["type"].text) • ↓ \(bytes(i["rx-byte"])) ↑ \(bytes(i["tx-byte"]))",
                            pill: (disabled ? "معطّلة" : running ? "تعمل" : "متوقفة", disabled ? .gray : running ? Yq.green : Yq.red))
                }
            }
        case "ppp":
            rows("ppp") { p in RowView(icon: "person.wave.2", color: Yq.teal, title: p["name"].text, subtitle: "\(p["address"].text) • \(p["caller-id"].text) • \(p["uptime"].text)") }
        case "hotspot":
            rows("hotspot") { h in RowView(icon: "wifi", color: Yq.blue, title: h["user"].text, subtitle: "\(h["address"].text) • \(h["mac-address"].text) • \(h["uptime"].text)") }
        case "dhcp":
            rows("dhcp") { l in
                RowView(icon: "network", color: l["status"].text == "bound" ? Yq.green : .gray, title: l["host-name"].string ?? l["mac-address"].text,
                        subtitle: "\(l["address"].text) • \(l["mac-address"].text) • \(l["status"].text)")
            }
        case "queues":
            rows("queues") { q in RowView(icon: "speedometer", color: Yq.purple, title: q["name"].text, subtitle: "\(q["target"].text) • الحد \(q["max-limit"].text)") }
        case "neighbors":
            rows("neighbors") { n in
                RowView(icon: "antenna.radiowaves.left.and.right", color: Yq.blue, title: n["identity"].string ?? n["mac-address"].text,
                        subtitle: "\(n["platform"].text) \(n["board"].text) • \(n["address"].text) • \(n["interface"].text)\(n["version"].isNull ? "" : " • \(n["version"].text)")")
            }
        case "log":
            rows("log") { l in
                RowView(icon: "text.alignright", color: l["topics"].text.contains("error") ? Yq.red : .gray, title: l["message"].text,
                        subtitle: "\(l["time"].text) • \(l["topics"].text)")
            }
        default:
            SwiftUI.Section("Ping من الراوتر") {
                TextField("عنوان IP أو اسم", text: $pingTarget)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("تشغيل Ping") {
                    Task {
                        guard let client, !pingTarget.isEmpty else { return }
                        loading = true
                        defer { loading = false }
                        do { pingResult = try await client.ping(pingTarget).array } catch { self.error = error.localizedDescription }
                    }
                }
                ForEach(Array(pingResult.enumerated()), id: \.offset) { _, p in
                    Text("seq \(p["seq"].text) • \(p["time"].string ?? p["status"].text) • ttl \(p["ttl"].text)").font(.callout.monospaced())
                }
            }
        }
    }

    private func list(_ key: String) -> [JSON] { (data[key] ?? .null).array }

    @ViewBuilder private func rows<R: View>(_ key: String, @ViewBuilder _ row: @escaping (JSON) -> R) -> some View {
        let items = list(key)
        SwiftUI.Section("\(items.count) عنصر") {
            ForEach(Array(items.prefix(500).enumerated()), id: \.offset) { _, x in row(x) }
        }
    }

    private func bytes(_ j: JSON) -> String {
        let b = j.num
        if b > 1_073_741_824 { return String(format: "%.1f GB", b / 1_073_741_824) }
        if b > 1_048_576 { return String(format: "%.1f MB", b / 1_048_576) }
        return String(format: "%.0f KB", b / 1024)
    }

    private func load(force: Bool) async {
        guard tab != "ping" else { return }
        guard let client else { error = NetError.missingSecret.localizedDescription; return }
        if !force, data[tab] != nil { return }
        loading = true
        defer { loading = false }
        do {
            let r: JSON
            switch tab {
            case "interfaces": r = try await client.interfaces()
            case "ppp": r = try await client.pppActive()
            case "hotspot": r = try await client.hotspotActive()
            case "dhcp": r = try await client.dhcpLeases()
            case "queues": r = try await client.queues()
            case "neighbors": r = try await client.neighbors()
            case "log": r = .array(Array(try await client.logs().array.suffix(200).reversed()))
            default: r = try await client.resource()
            }
            data[tab] = r
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// حركة واجهة لحظياً (monitor-traffic once كل ثانيتين).
struct TrafficView: View {
    let client: RouterOS?
    let name: String
    @State private var samples: [(Date, Double, Double)] = []
    @State private var error: String?

    var body: some View {
        List {
            if let last = samples.last {
                KPIGrid {
                    KPITile(label: "تنزيل", value: rate(last.1), icon: "arrow.down", color: Yq.green)
                    KPITile(label: "رفع", value: rate(last.2), icon: "arrow.up", color: Yq.blue)
                }
                .listRowBackground(Color.clear)
            }
            if let error { Text(error).foregroundStyle(Yq.red) }
        }
        .yaqootBackground()
        .navigationTitle(name)
        .task {
            guard let client else { return }
            while !Task.isCancelled {
                do {
                    let r = try await client.traffic(name)
                    let x = r.array.first ?? r
                    samples.append((Date(), x["rx-bits-per-second"].num, x["tx-bits-per-second"].num))
                    if samples.count > 60 { samples.removeFirst() }
                    error = nil
                } catch {
                    self.error = error.localizedDescription
                }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    private func rate(_ bps: Double) -> String {
        bps > 1_000_000 ? String(format: "%.1f Mbps", bps / 1_000_000) : String(format: "%.0f kbps", bps / 1000)
    }
}

/// أجهزة UISP: الحالة، الإشارة، المعالج والذاكرة.
struct UISPDevicesView: View {
    let integration: Integration
    @State private var q = ""

    var body: some View {
        RemoteView(load: {
            guard let t = IntegrationStore.shared.secret(integration) else { throw NetError.missingSecret }
            return try await UISPNetwork(integration: integration, token: t).devices()
        }) { d, remote in
            let all = d.array
            let shown = q.isEmpty ? all : all.filter { $0["identification"]["name"].text.localizedCaseInsensitiveContains(q) || $0["ipAddress"].text.contains(q) }
            List {
                SwiftUI.Section {
                    KPIGrid {
                        KPITile(label: "الأجهزة", value: "\(all.count)", icon: "antenna.radiowaves.left.and.right", color: Yq.teal)
                        KPITile(label: "غير متصلة", value: "\(all.filter { $0["overview"]["status"].text != "active" }.count)", icon: "wifi.slash", color: Yq.red)
                    }
                }
                .listRowBackground(Color.clear)
                ForEach(Array(shown.enumerated()), id: \.offset) { _, x in
                    let id = x["identification"], o = x["overview"]
                    let ok = o["status"].text == "active"
                    RowView(icon: "antenna.radiowaves.left.and.right", color: ok ? Yq.green : Yq.red, title: id["name"].text,
                            subtitle: "\(id["model"].text) • \(id["role"].text) • \(x["ipAddress"].text)\nCPU \(o["cpu"].text)٪ • RAM \(o["ram"].text)٪\(o["signal"].isNull ? "" : " • إشارة \(o["signal"].text) dBm")",
                            pill: (ok ? "متصل" : o["status"].text, ok ? Yq.green : Yq.red))
                }
            }
            .yaqootBackground()
            .searchable(text: $q, prompt: "اسم الجهاز أو IP")
            .refreshable { await remote.reload() }
        }
        .navigationTitle(integration.name)
    }
}

/// عملاء UISP CRM (قراءة فقط) — للمطابقة مع زبائن ياقوت دون خلط الأرقام.
struct UISPClientsView: View {
    let integration: Integration
    var body: some View {
        RemoteView(load: {
            guard let k = IntegrationStore.shared.secret(integration) else { throw NetError.missingSecret }
            return try await UISPCRM(integration: integration, key: k).clients()
        }) { d, remote in
            List {
                ForEach(Array(d.array.enumerated()), id: \.offset) { _, c in
                    let name = c["clientType"].int == 2 ? c["companyName"].text : "\(c["firstName"].text) \(c["lastName"].text)"
                    RowView(avatarText: name, color: Yq.blue, title: name,
                            subtitle: "رقم UISP \(c["id"].text)\(c["userIdent"].isNull ? "" : " • \(c["userIdent"].text)")",
                            value: c["accountBalance"].isNull ? nil : "\(Fmt.money(c["accountBalance"])) \(c["currencyCode"].text)")
                }
            }
            .yaqootBackground()
            .refreshable { await remote.reload() }
        }
        .navigationTitle(integration.name)
    }
}
