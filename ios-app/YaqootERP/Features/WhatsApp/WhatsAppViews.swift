import SwiftUI

/// واتساب المحل: نفس الواتساب المتصل في برنامج المكتب (أو بوابة واتساب ويب).
/// التطبيق يضيف الرسالة إلى طابور البرنامج، والبرنامج يرسلها من رقم المحل.
/// لا تُرسل إلا لزبون وافق على واتساب، ولا تتكرر عند إعادة المحاولة.
struct WhatsAppView: View {
    var body: some View {
        RemoteView(load: { try await API.shared.get("whatsapp", ["limit": "80"]) }) { d, remote in
            List {
                SwiftUI.Section {
                    SenderCard(d: d)
                    KPIGrid {
                        KPITile(label: "بالانتظار", value: d["stats"]["pending"].text, icon: "clock", color: Yq.amber,
                                hint: "تُرسل عند اتصال واتساب المحل")
                        KPITile(label: "أُرسلت", value: d["stats"]["sent"].text, icon: "checkmark.message", color: Yq.green)
                        KPITile(label: "غير مؤكدة", value: d["stats"]["uncertain"].text, icon: "questionmark.bubble", color: Yq.red,
                                hint: "راجع محادثة الزبون قبل الإعادة")
                        KPITile(label: "زبائن موافقون", value: "\(d["consent"]["yes"].text) / \(d["consent"]["total"].text)",
                                icon: "person.crop.circle.badge.checkmark", color: Yq.teal)
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))

                SwiftUI.Section("آخر الرسائل") {
                    if d["items"].array.isEmpty { Text("لا توجد رسائل بعد").foregroundStyle(.secondary) }
                    ForEach(d["items"].array.records) { m in MessageRow(m: m.json, showCustomer: true) }
                }
            }
            .yaqootBackground()
            .refreshable { await remote.reload() }
        }
    }
}

private struct SenderCard: View {
    let d: JSON
    var body: some View {
        let gatewayOnline = d["gateway"]["online"].isTrue
        let desktop = Fmt.parse(d["desktop_last_claim"].string)
        let desktopRecent = desktop.map { Date().timeIntervalSince($0) < 15 * 60 } ?? false
        let online = gatewayOnline || desktopRecent
        GlassPanel(tint: online ? Yq.green : Yq.amber) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Label(online ? "واتساب المحل متصل" : "المرسل غير نشط الآن", systemImage: online ? "checkmark.circle.fill" : "pause.circle.fill")
                        .font(.headline).foregroundStyle(online ? Yq.green : Yq.amber)
                    Spacer()
                }
                Text(gatewayOnline ? "بوابة واتساب ويب تعمل (\(d["gateway"]["location"].text))."
                     : desktopRecent ? "برنامج المكتب يرسل الرسائل."
                     : "الرسائل تبقى بالانتظار حتى يفتح برنامج المكتب أو تُفعَّل بوابة واتساب ويب.")
                    .font(.subheadline).foregroundStyle(.secondary)
                Text("آخر إرسال ناجح: \(Fmt.when(d["last_sent"]))").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct MessageRow: View {
    let m: JSON
    var showCustomer = false

    static func status(_ st: String) -> (String, Color) {
        switch st {
        case "sent": ("أُرسلت", Yq.green)
        case "pending": ("بالانتظار", Yq.amber)
        case "claimed": ("قيد الإرسال", Yq.blue)
        case "uncertain": ("غير مؤكدة", Yq.red)
        default: ("لم تُرسل", .gray)
        }
    }
    var body: some View {
        let info = Self.status(m["status"].text)
        let label = info.0, color = info.1
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                if showCustomer { Text(m["customer_name"].string ?? "زبون").font(.subheadline.weight(.semibold)) }
                Text(m["kind"].text == "receipt" ? "إيصال" : "رسالة").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Pill(label, color: color)
            }
            Text(m["body"].text).font(.callout).lineLimit(4)
            HStack {
                Text(Fmt.when(m["created_at"])).font(.caption2).foregroundStyle(.secondary)
                if !m["reason"].isNull { Text("• \(m["reason"].text)").font(.caption2).foregroundStyle(color) }
            }
        }
        .padding(.vertical, 2)
    }
}

/// إرسال رسالة لزبون من واتساب المحل، مع إدارة موافقته.
struct WhatsAppComposeSheet: View {
    let customerID: String
    let customerName: String
    @State var text: String
    @State private var cid = newClientID()
    @State private var info: JSON?
    @State private var consentBusy = false
    @State private var error: String?

    var body: some View {
        let consent = info?["consent"].isTrue ?? false
        OperationSheet(
            title: "واتساب المحل",
            subtitle: "إلى \(customerName)",
            confirmTitle: "إرسال الرسالة من واتساب المحل؟",
            confirmMessage: { "تُضاف إلى طابور البرنامج وتُرسل من رقم المحل." },
            canSubmit: consent && text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 5,
            submit: {
                let r = try await API.shared.act("whatsapp_send", ["customer_id": .string(customerID), "body": .string(text), "client_id": .string(cid)])
                if r["ok"] == .bool(false) {
                    throw APIError.server(message: r["message"].string ?? "تعذر الإرسال", reason: r["reason"].string, status: 0)
                }
                return r["replayed"].isTrue ? "الرسالة مُضافة مسبقاً" : "أُضيفت الرسالة لطابور واتساب المحل"
            }
        ) {
            SwiftUI.Section {
                if info == nil {
                    ProgressView()
                } else if consent {
                    Label("الزبون موافق على رسائل واتساب • \(info?["phone"].string ?? "")", systemImage: "checkmark.seal.fill")
                        .foregroundStyle(Yq.green).font(.footnote)
                } else {
                    Label(info?["phone"].isNull ?? true ? "رقم هاتف الزبون غير صالح لواتساب" : "الزبون لم يوافق على رسائل واتساب بعد",
                          systemImage: "exclamationmark.bubble").foregroundStyle(Yq.amber).font(.footnote)
                    if AppState.shared.can("customers.edit") && !(info?["phone"].isNull ?? true) {
                        Button {
                            Task { await setConsent(true) }
                        } label: {
                            Label("تسجيل موافقة الزبون (بعد سؤاله)", systemImage: "person.crop.circle.badge.checkmark")
                        }
                        .disabled(consentBusy)
                    }
                }
                if let error { Text(error).foregroundStyle(Yq.red).font(.footnote) }
            }
            SwiftUI.Section("نص الرسالة") {
                TextField("الرسالة", text: $text, axis: .vertical).lineLimit(4...10)
            }
            if let items = info?["items"].array, !items.isEmpty {
                SwiftUI.Section("رسائل سابقة لهذا الزبون") {
                    ForEach(items.records.prefix(5)) { m in MessageRow(m: m.json) }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        info = try? await API.shared.get("whatsapp_customer", ["id": customerID])
    }

    private func setConsent(_ on: Bool) async {
        consentBusy = true
        defer { consentBusy = false }
        do {
            _ = try await API.shared.act("whatsapp_consent", ["customer_id": .string(customerID), "consent": .bool(on)])
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// زر واتساب: من رقم المحل (عبر البرنامج) أو من واتساب هذا الهاتف.
struct WhatsAppMenu: View {
    let customerID: String?
    let customerName: String
    let phone: String
    let text: String
    var title = "واتساب"
    @State private var composing = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        Menu {
            if let customerID, !customerID.isEmpty, AppState.shared.can("customers") {
                Button { composing = true } label: { Label("إرسال من واتساب المحل", systemImage: "building.2") }
            }
            if let url = Fmt.whatsapp(phone, text) {
                Button { openURL(url) } label: { Label("فتح واتساب على هذا الهاتف", systemImage: "iphone") }
            }
        } label: {
            Label(title, systemImage: "message.fill")
        }
        .sheet(isPresented: $composing) {
            WhatsAppComposeSheet(customerID: customerID ?? "", customerName: customerName, text: text)
        }
    }
}

/// إيصال واتساب بعد عملية دين أو تسديد (لا يُفشل العملية المالية إن تعذر).
func sendWhatsAppReceipt(customerID: String, operationID: String) async -> String? {
    do {
        let r = try await API.shared.act("whatsapp_send", ["kind": "receipt", "customer_id": .string(customerID), "operation_id": .string(operationID)])
        if r["ok"] == .bool(false) { return r["message"].string }
        return nil
    } catch {
        return error.localizedDescription
    }
}
