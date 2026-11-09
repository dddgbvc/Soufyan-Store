import SwiftUI

/// إدارة الإنترنت: المشتركون من قاعدة ياقوت (isp_subscribers) التي يزامنها وكيل المكتب مع لوحة المزوّد.
/// فصل صارم بين:
///  • بيانات المزوّد: اسم المستخدم لدى الشركة، الباقة، الانتهاء، السعر العام.
///  • بيانات الزبون الداخلي: رقمه في ياقوت وهاتفه وديونه في المحل.
/// لا يُغيّر التطبيق أي سعر تلقائياً، ولا يجدد اشتراكاً من الهاتف (التجديد يحرّك رصيد المزوّد والمال).
struct ISPView: View {
    @State private var model = Paged.erp("isp", listKey: "subscribers", pageSize: 300, filter: "status=all")
    @State private var profile: JSON?

    var body: some View {
        PagedList(model: model, searchPrompt: "اسم المشترك، اسم المستخدم، أو الزبون…",
                  filters: [("status=all", "الكل"), ("status=expired", "منتهية"), ("status=soon", "قريبة"), ("status=active", "فعّالة"), ("status=unlinked", "غير مربوط")],
                  empty: "لا يوجد مشتركون هنا. يُضافون عند ربطهم من قسم الإنترنت في برنامج المكتب.",
                  header: { m in ISPHeader(meta: m) }) { r in
            Button { profile = r.json } label: { ISPRow(r: r.json) }
                .buttonStyle(.plain)
                .swipeActions(edge: .leading) {
                    if let url = ispReminder(r.json) {
                        Link(destination: url) { Label("تذكير", systemImage: "message") }.tint(Yq.green)
                    }
                }
        }
        .sheet(item: Binding(get: { profile.map { Record($0) } }, set: { profile = $0?.json })) { r in
            NavigationStack { SubscriberProfile(s: r.json) }
                .presentationDetents([.medium, .large])
        }
        .toolbar {
            ShareLink(item: CSVFile(name: "مشتركو الإنترنت", header: ["المشترك", "اسم المستخدم", "الباقة", "الانتهاء", "الحالة", "الزبون", "دين الزبون"],
                                    rows: model.rows.map { r in
                                        [r["display_name"].text, r["username"].text, r["package_name"].text, Fmt.dateOnly(r["expires_at"]),
                                         stateLabel(r["state"].text), r["customer_name"].text, Fmt.money(r["customer_balance"])]
                                    }),
                      preview: SharePreview("مشتركو الإنترنت.csv")) {
                Label("تصدير", systemImage: "square.and.arrow.up")
            }
        }
    }
}

func stateLabel(_ s: String) -> String {
    ["expired": "منتهي", "soon": "قريب", "active": "فعّال"][s] ?? "غير معروف"
}

func stateColor(_ s: String) -> Color {
    s == "expired" ? Yq.red : s == "soon" ? Yq.amber : s == "active" ? Yq.green : .gray
}

func ispReminder(_ s: JSON) -> URL? {
    let name = s["customer_name"].string ?? s["display_name"].text
    let date = Fmt.dateOnly(s["expires_at"])
    let store = AppState.shared.storeName
    return Fmt.whatsapp(s["customer_phone"].text, s["state"].text == "expired"
        ? "مرحباً \(name)،\nانتهى اشتراك الإنترنت (\(s["username"].text)) بتاريخ \(date).\nللتجديد تواصل معنا — \(store) 🌐"
        : "مرحباً \(name)،\nاشتراك الإنترنت (\(s["username"].text)) ينتهي بتاريخ \(date).\nجدّد مبكراً حتى لا ينقطع الخط — \(store) 🌐")
}

struct ISPRow: View {
    let r: JSON
    var body: some View {
        let st = r["state"].text
        RowView(icon: "wifi.router", color: stateColor(st), title: r["display_name"].string ?? r["username"].text,
                subtitle: "\(r["username"].text) • \(r["package_name"].text)\n"
                    + (r["customer_id"].isNull ? "غير مربوط بزبون"
                       : "\(r["customer_name"].text)\(r["customer_balance"].num > 0 ? " • عليه \(Fmt.money(r["customer_balance"]))" : "")"),
                value: Fmt.relativeDays(r["days_left"].int), pill: (stateLabel(st), stateColor(st)))
    }
}

struct ISPHeader: View {
    let meta: JSON
    @Environment(\.openURL) private var openURL

    var body: some View {
        let s = meta["summary"]
        VStack(spacing: 12) {
            KPIGrid {
                KPITile(label: "المشتركون", value: s["total"].text.isEmpty ? "0" : s["total"].text, icon: "wifi", color: Yq.teal,
                        hint: "\(s["unlinked"].int ?? 0) غير مربوطين")
                KPITile(label: "منتهية", value: s["expired"].text.isEmpty ? "0" : s["expired"].text, icon: "wifi.slash", color: Yq.red)
                KPITile(label: "تنتهي خلال 3 أيام", value: s["soon"].text.isEmpty ? "0" : s["soon"].text, icon: "clock.badge.exclamationmark", color: Yq.amber)
                KPITile(label: "تجديدات معلّقة", value: meta["unresolved"].text.isEmpty ? "0" : meta["unresolved"].text,
                        icon: "exclamationmark.arrow.triangle.2.circlepath", color: Yq.purple, hint: "مراجعة مالية في برنامج المكتب")
            }
            ForEach(meta["accounts"].array.records) { a in
                GlassPanel(tint: a["active"].isTrue ? Yq.blue : Yq.red) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Label("\(a["name"].text) • \(a["provider"].text.uppercased())", systemImage: "server.rack").font(.headline)
                            Spacer()
                            Pill(a["active"].isTrue ? "مفعّل" : "موقوف", color: a["active"].isTrue ? Yq.green : Yq.red)
                        }
                        Text("\(a["subscribers"].text) مشترك محفوظ • آخر دخول للمزوّد \(Fmt.when(a["last_login_at"]))")
                            .font(.subheadline).foregroundStyle(.secondary)
                        if !a["last_error"].isNull {
                            Text("آخر خطأ: \(a["last_error"].text)").font(.caption).foregroundStyle(Yq.red)
                        }
                    }
                }
            }
            ProviderPortals()
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
    }
}

/// لوحات المزوّدين: تُفتح في Safari بحساب الموظف نفسه. لا تُحفظ كلمات مرور الشركات في التطبيق.
struct ProviderPortals: View {
    @Environment(\.openURL) private var openURL
    private let portals: [(String, String, String)] = [
        ("NBTEL • SAS4", "https://reseller.nbtel.iq/index.html", "لوحة الموزّع"),
        ("Earthlink", "https://admin.earthlink.iq/Login.aspx?returnUrl=~/Home.aspx", "لوحة الإدارة"),
    ]

    var body: some View {
        GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) {
                ForEach(portals, id: \.0) { p in
                    Button {
                        if let u = URL(string: p.1) { openURL(u) }
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Label(p.0, systemImage: "safari").font(.subheadline.weight(.semibold))
                            Text(p.2).font(.caption).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 16))
                }
            }
        }
    }
}

/// ملف المشترك الموحّد: قسم المزوّد وقسم الزبون الداخلي منفصلان بوضوح.
struct SubscriberProfile: View {
    let s: JSON
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let st = s["state"].text
        let renewal = s["last_renewal"]
        List {
            SwiftUI.Section {
                HStack(spacing: 14) {
                    Avatar(icon: "wifi.router", color: stateColor(st), size: 56)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(s["display_name"].string ?? s["username"].text).font(.title3.bold())
                        HStack {
                            Pill(stateLabel(st), color: stateColor(st))
                            Text(Fmt.relativeDays(s["days_left"].int)).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                .listRowBackground(Color.clear)
            }

            SwiftUI.Section {
                LabeledContent("اسم المستخدم لدى المزوّد") { Text(s["username"].text).monospaced() }
                LabeledContent("الباقة", value: s["package_name"].string ?? "—")
                LabeledContent("حالة المزوّد", value: s["provider_status"].string ?? "—")
                LabeledContent("ينتهي", value: Fmt.dateOnly(s["expires_at"]))
                LabeledContent("حساب الموزّع", value: s["reseller_name"].string ?? "—")
                if !s["price"].isNull { LabeledContent("السعر العام للباقة", value: Fmt.iqd(s["price"])) }
                LabeledContent("آخر تحقق من المزوّد", value: Fmt.when(s["last_verified_at"]))
            } header: {
                Label("بيانات المزوّد", systemImage: "server.rack")
            } footer: {
                Text("رقم الاشتراك لدى الشركة ورصيد الموزّع لا يُخلطان مع حساب الزبون في المحل.")
            }

            if renewal.isObject {
                SwiftUI.Section("آخر تجديد") {
                    LabeledContent("الحالة", value: renewal["state"].text)
                    LabeledContent("سعر البيع للزبون", value: Fmt.iqd(renewal["price"]))
                    LabeledContent("المدفوع", value: Fmt.iqd(renewal["paid"]))
                    if !s["price"].isNull && renewal["price"].num > 0 {
                        let diff = renewal["price"].num - s["price"].num
                        LabeledContent("الفرق عن السعر العام") {
                            Text((diff >= 0 ? "+" : "") + Fmt.money(diff)).foregroundStyle(diff >= 0 ? Yq.green : Yq.red).monospacedDigit()
                        }
                    }
                    LabeledContent("حتى", value: Fmt.dateOnly(renewal["until"]))
                    LabeledContent("بتاريخ", value: Fmt.when(renewal["at"]))
                }
            }

            SwiftUI.Section {
                if s["customer_id"].isNull {
                    Text("غير مربوط بزبون في المحل. الربط من قسم الإنترنت في برنامج المكتب.").foregroundStyle(.secondary)
                } else {
                    LabeledContent("الزبون", value: s["customer_name"].text)
                    LabeledContent("الهاتف") { Text(s["customer_phone"].text).monospaced() }
                    LabeledContent("دين الزبون في المحل") {
                        Text(Fmt.iqd(s["customer_balance"])).foregroundStyle(s["customer_balance"].num > 0 ? Yq.deepGold : .primary).monospacedDigit()
                    }
                    if AppState.shared.can("customers") {
                        NavigationLink("كشف حساب الزبون") { StatementView(customerID: s["customer_id"].text) }
                    }
                }
            } header: {
                Label("الزبون الداخلي (حساب المحل)", systemImage: "person.text.rectangle")
            }

            SwiftUI.Section {
                if let url = ispReminder(s) {
                    Button { openURL(url) } label: { Label(st == "expired" ? "إبلاغ بانتهاء الاشتراك" : "تذكير بالتجديد", systemImage: "message.fill") }
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
    }
}
