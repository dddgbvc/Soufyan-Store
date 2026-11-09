import Charts
import SwiftUI
import UIKit

/// الرئيسية: مؤشرات اليوم والشهر على الزجاج، مخطط 7 أيام، ما يحتاج انتباهك، وآخر الفواتير.
/// زر إجراءات سريعة زجاجي يتحول (morph) إلى قائمة إجراءات عبر GlassEffectContainer.
struct DashboardView: View {
    @State private var app = AppState.shared
    @State private var sheet: QuickSheet?
    @State private var live = LiveShop.isRunning
    @State private var liveError: Toast?

    enum QuickSheet: String, Identifiable {
        case debt, pay, customer, expense
        var id: String { rawValue }
    }

    var body: some View {
        RemoteView(load: load) { d, remote in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 14) {
                        BrandMark(size: 52)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("أهلاً \(app.employeeName)").font(.title.bold())
                            Text("\(Fmt.todayLong()) • \(app.storeName)").foregroundStyle(.secondary)
                        }
                    }
                    KPIGrid { tiles(d) }
                    chart(d)
                    attention(d)
                    latest(d)
                }
                .padding()
                .padding(.bottom, 80)
            }
            .refreshable { await remote.reload() }
        }
        .background { YaqootBackground() }
        .navigationDestination(for: InvoiceRef.self) { InvoiceDetailView(id: $0.id) }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    Task { await toggleLive() }
                } label: {
                    Image(systemName: live ? "capsule.inset.filled" : "capsule")
                        .symbolEffect(.bounce, value: live)
                }
                .accessibilityLabel(live ? "إيقاف المتابعة في الجزيرة الديناميكية" : "متابعة أرقام اليوم في الجزيرة الديناميكية")
            }
        }
        .toast($liveError)
        .overlay(alignment: .bottomLeading) {
            QuickActionsButton(actions: quickActions) { sheet = $0 }
                .padding(20)
        }
        .sheet(item: $sheet) { s in
            switch s {
            case .debt: AddDebtSheet(customer: nil)
            case .pay: PayDebtSheet(customer: nil)
            case .customer: NewCustomerSheet()
            case .expense: NewExpenseSheet()
            }
        }
    }

    private func toggleLive() async {
        do {
            if live {
                await LiveShop.stop()
            } else {
                if !Notifier.shared.widgetsEnabled {
                    try await Notifier.shared.enableWidgets(deviceName: "\(UIDevice.current.model) • \(app.employeeName)")
                }
                try await LiveShop.start(store: app.storeName)
                liveError = Toast(text: "أرقام اليوم الآن في الجزيرة الديناميكية وشاشة القفل")
            }
        } catch APIError.sessionExpired {
            app.expire()
        } catch {
            liveError = Toast(text: error.localizedDescription, error: true)
        }
        live = LiveShop.isRunning
    }

    private var quickActions: [(QuickSheet, String, String)] {
        var a: [(QuickSheet, String, String)] = []
        if app.can("customers.debt_addition") { a.append((.debt, "إضافة دين", "plus.circle.fill")) }
        if app.can("customers.payment") { a.append((.pay, "تسديد", "banknote.fill")) }
        if app.can("customers.edit") { a.append((.customer, "زبون جديد", "person.badge.plus")) }
        if app.can("expenses.create") { a.append((.expense, "مصروف", "arrow.up.forward.circle.fill")) }
        return a
    }

    private func load() async throws -> JSON {
        let app = AppState.shared
        let pos = app.can("pos"), inventory = app.can("inventory"), customers = app.can("customers")
        async let dash = API.shared.get("dashboard")
        async let inv = optional(pos, "invoices", ["limit": "5"])
        async let low = optional(inventory, "products", ["low_only": "1", "limit": "4"])
        async let debtors = optional(customers, "customers", ["debtors_only": "1", "limit": "4"])
        var d = try await dash.object
        d["latest"] = try await inv["invoices"]
        d["low"] = try await low["products"]
        d["debtors"] = try await debtors["customers"]
        return .object(d)
    }

    private func optional(_ allowed: Bool, _ resource: String, _ params: [String: String]) async throws -> JSON {
        guard allowed else { return [:] }
        return try await API.shared.get(resource, params)
    }

    @ViewBuilder private func tiles(_ d: JSON) -> some View {
        let s = d["sales"], p = d["profit"]
        if !s.isNull {
            KPITile(label: "مبيعات اليوم", value: Fmt.iqd(s["today_total"]), icon: "doc.text", color: Yq.teal,
                    hint: "\(s["today_count"].text) فاتورة • المقبوض \(Fmt.money(s["today_paid"]))") { app.go(.invoices) }
            KPITile(label: "مبيعات الشهر", value: Fmt.iqd(s["month_total"]), icon: "chart.line.uptrend.xyaxis", color: Yq.blue,
                    hint: "\(s["month_count"].text) فاتورة") { app.go(.reports) }
        }
        if !p.isNull {
            KPITile(label: "ربح اليوم", value: Fmt.iqd(p["today_revenue"].num - p["today_cost"].num), icon: "leaf", color: Yq.green,
                    hint: "الشهر \(Fmt.money(p["month_revenue"].num - p["month_cost"].num))")
        }
        if d["debts"].isObject {
            KPITile(label: "ديون الزبائن", value: Fmt.iqd(d["debts"]["total"]), icon: "creditcard", color: Yq.deepGold,
                    hint: "\(d["debts"]["debtors"].text) زبون • المحصّل اليوم \(Fmt.money(d["collected"]["today"]))") { app.go(.customers) }
        }
        if !d["vault_balance"].isNull {
            KPITile(label: "رصيد الخزنة", value: Fmt.iqd(d["vault_balance"]), icon: "building.columns", color: Yq.purple) { app.go(.vault) }
        }
        if d["expenses"].isObject {
            KPITile(label: "مصروفات اليوم", value: Fmt.iqd(d["expenses"]["today"]), icon: "arrow.up.forward", color: Yq.red,
                    hint: "الشهر \(Fmt.money(d["expenses"]["month"]))") { app.go(.expenses) }
        }
        if d["my_sales"].isObject && s.isNull {
            KPITile(label: "مبيعاتي اليوم", value: Fmt.iqd(d["my_sales"]["total"]), icon: "doc.text", color: Yq.teal,
                    hint: "\(d["my_sales"]["count"].text) فاتورة")
        }
        if d["repairs"].isObject {
            KPITile(label: "صيانة مفتوحة", value: d["repairs"]["open"].text, icon: "wrench.and.screwdriver", color: Yq.blue,
                    hint: "\(d["repairs"]["ready"].text) جاهزة") { app.go(.repairs) }
        }
        if d["stock"].isObject {
            KPITile(label: "تحت حد التنبيه", value: d["stock"]["low"].text, icon: "shippingbox", color: Yq.amber,
                    hint: "\(d["stock"]["out"].text) نفدت") { app.go(app.can("shortages") ? .shortages : .products) }
        }
    }

    @ViewBuilder private func chart(_ d: JSON) -> some View {
        let series = d["series"].array
        if !series.isEmpty {
            GlassPanel {
                VStack(alignment: .leading, spacing: 10) {
                    Text("مبيعات آخر 7 أيام").font(.headline)
                    Chart(series.records) { x in
                        BarMark(x: .value("اليوم", Fmt.weekday(x["day"].text)), y: .value("المبيعات", x["total"].num))
                            .foregroundStyle(x["day"].text == d["today"].text ? Yq.deepGold.gradient : Yq.teal.gradient)
                            .cornerRadius(6)
                            .annotation(position: .top) {
                                if x["total"].num > 0 {
                                    Text("\(Fmt.money(x["total"].num / 1000))k").font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                    }
                    .chartYAxis(.hidden)
                    .frame(height: 190)
                    .accessibilityLabel("مخطط مبيعات آخر سبعة أيام")
                }
            }
        }
    }

    @ViewBuilder private func attention(_ d: JSON) -> some View {
        let low = d["low"].array, debtors = d["debtors"].array
        if !low.isEmpty || !debtors.isEmpty {
            GlassPanel {
                VStack(alignment: .leading, spacing: 10) {
                    Text("تحتاج انتباهك").font(.headline)
                    ForEach(low.records) { r in
                        Button { app.go(app.can("shortages") ? .shortages : .products) } label: {
                            RowView(icon: "shippingbox", color: Yq.amber, title: r["name"].text,
                                    subtitle: "\(r["stock_quantity"].text) متبقية • الحد \(r["min_stock_alert"].text)")
                        }.buttonStyle(.plain)
                    }
                    ForEach(debtors.records) { r in
                        Button { app.go(.customers) } label: {
                            RowView(icon: "creditcard", color: Yq.red, title: r["name"].text, subtitle: "عليه \(Fmt.iqd(r["balance"]))")
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    @ViewBuilder private func latest(_ d: JSON) -> some View {
        let rows = d["latest"].array
        if !rows.isEmpty {
            GlassPanel {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("آخر الفواتير").font(.headline)
                        Spacer()
                        Button("عرض الكل") { app.go(.invoices) }.font(.subheadline)
                    }
                    ForEach(rows.records) { r in
                        NavigationLink(value: InvoiceRef(id: r.id)) { InvoiceTile(r: r.json) }.buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

/// زر الإجراءات السريعة: دائرة زجاجية تتحول إلى أزرار منفصلة بانسيابية (glassEffectID + GlassEffectContainer).
struct QuickActionsButton<Key: Hashable>: View {
    let actions: [(Key, String, String)]
    let run: (Key) -> Void
    @State private var open = false
    @Namespace private var ns

    var body: some View {
        if !actions.isEmpty {
            GlassEffectContainer(spacing: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    if open {
                        ForEach(actions, id: \.0) { a in
                            Button {
                                withAnimation(.bouncy) { open = false }
                                run(a.0)
                            } label: {
                                Label(a.1, systemImage: a.2).font(.headline).padding(.horizontal, 16).padding(.vertical, 12)
                            }
                            .buttonStyle(.plain)
                            .glassEffect(.regular.tint(Yq.teal.opacity(0.25)).interactive(), in: .capsule)
                            .glassEffectID(a.1, in: ns)
                            .glassEffectTransition(.matchedGeometry)
                        }
                    }
                    Button {
                        withAnimation(.bouncy(duration: 0.45)) { open.toggle() }
                    } label: {
                        Image(systemName: open ? "xmark" : "bolt.fill")
                            .font(.title2.weight(.semibold))
                            .contentTransition(.symbolEffect(.replace))
                            .frame(width: 60, height: 60)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.tint(Yq.teal.opacity(0.6)).interactive(), in: .circle)
                    .glassEffectID("toggle", in: ns)
                    .foregroundStyle(.white)
                    .accessibilityLabel(open ? "إغلاق الإجراءات السريعة" : "إجراءات سريعة")
                    .sensoryFeedback(.impact(weight: .light), trigger: open)
                }
            }
        }
    }
}
