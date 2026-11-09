import Charts
import SwiftUI

/// التحليلات: أداء المحل عبر الزمن مع مقارنة بالفترة السابقة.
/// المبيعات والربح (مع منحنى الفترة السابقة)، التدفق النقدي، أكثر المنتجات مبيعاً، طرق الدفع، الإنترنت، وأعلى الديون.
struct AnalyticsView: View {
    @State private var days = 30
    @State private var data: JSON?
    @State private var error: String?
    @State private var selected: Date?

    struct Point: Identifiable {
        let date: Date
        var sales = 0.0, profit = 0.0, revenue = 0.0, cost = 0.0, collected = 0.0, paid = 0.0, expenses = 0.0, added = 0.0, invoices = 0.0
        var id: Date { date }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Picker("الفترة", selection: $days) {
                    Text("7 أيام").tag(7)
                    Text("30 يوم").tag(30)
                    Text("90 يوم").tag(90)
                    Text("سنة").tag(365)
                }
                .pickerStyle(.segmented)

                if let d = data {
                    content(d)
                } else if let error {
                    ErrorState(message: error) { await load() }
                } else {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 300)
                }
            }
            .padding()
        }
        .background { YaqootBackground() }
        .task(id: days) { await load() }
        .refreshable { await load() }
    }

    // MARK: - المحتوى

    @ViewBuilder private func content(_ d: JSON) -> some View {
        let all = d["series"].array
        let half = max(all.count - days, 0)
        let prev = Array(all.prefix(half)), cur = Array(all.suffix(days))
        let profitVisible = d["profit_visible"].isTrue
        let c = totals(cur), p = totals(prev)

        KPIGrid {
            metric("المبيعات", c.sales, p.sales, "chart.line.uptrend.xyaxis", Yq.teal)
            if profitVisible {
                metric("الربح الإجمالي", c.profit, p.profit, "leaf", Yq.green,
                       hint: c.revenue > 0 ? "الهامش \(Int((c.profit / c.revenue * 100).rounded()))٪" : nil)
            }
            metric("صافي النقد", c.paid + c.collected - c.expenses, p.paid + p.collected - p.expenses, "banknote", Yq.purple,
                   hint: "مقبوض + تحصيل − مصروفات")
            metric("تحصيل الديون", c.collected, p.collected, "arrow.down.left", Yq.green)
            metric("ديون جديدة", c.added, p.added, "arrow.up.right", Yq.deepGold, inverse: true)
            metric("المصروفات", c.expenses, p.expenses, "arrow.up.forward", Yq.red, inverse: true)
            metric("متوسط الفاتورة", c.invoices > 0 ? c.sales / c.invoices : 0, p.invoices > 0 ? p.sales / p.invoices : 0, "doc.text", Yq.blue,
                   hint: "\(Int(c.invoices)) فاتورة")
        }

        salesChart(cur, prev, profitVisible)
        cashChart(cur)
        HStack(alignment: .top, spacing: 16) {
            topProducts(d["top_products"].array)
            paymentMix(d["payment_mix"].array)
        }
        .frame(maxWidth: .infinity)
        if d["isp"].isObject { ispCard(d["isp"], profitVisible) }
        if let debtors = d["top_debtors"].array.nilIfEmpty { debtorsCard(debtors) }
    }

    // MARK: - المؤشرات

    private func metric(_ label: String, _ v: Double, _ prev: Double, _ icon: String, _ color: Color,
                        hint: String? = nil, inverse: Bool = false) -> some View {
        let delta = prev != 0 ? (v - prev) / abs(prev) * 100 : nil
        let good = delta.map { inverse ? $0 <= 0 : $0 >= 0 } ?? true
        let deltaText = delta.map { "\($0 >= 0 ? "▲" : "▼") \(Int(abs($0).rounded()))٪ عن الفترة السابقة" }
        return KPITile(label: label, value: Fmt.iqd(v), icon: icon, color: color,
                       hint: [deltaText, hint].compactMap { $0 }.joined(separator: "\n"))
            .overlay(alignment: .bottomLeading) {
                if delta != nil {
                    Circle().fill(good ? Yq.green : Yq.red).frame(width: 6, height: 6).padding(10)
                }
            }
    }

    // MARK: - المبيعات والربح

    private func salesChart(_ cur: [JSON], _ prev: [JSON], _ profitVisible: Bool) -> some View {
        let points = bucket(cur)
        let prevPoints = bucket(prev)
        // الفترة السابقة مُزاحة لتقابل الحالية في نفس المحور.
        let shift = TimeInterval(days * 86400)
        let sel = selected.flatMap { s in points.min { abs($0.date.timeIntervalSince(s)) < abs($1.date.timeIntervalSince(s)) } }
        return GlassPanel {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("المبيعات والربح").font(.headline)
                    Spacer()
                    legend(Yq.teal, "المبيعات")
                    if profitVisible { legend(Yq.green, "الربح") }
                    legend(.gray, "الفترة السابقة")
                }
                Chart {
                    ForEach(points) { p in
                        AreaMark(x: .value("التاريخ", p.date), y: .value("المبيعات", p.sales), series: .value("نوع", "مبيعات"))
                            .foregroundStyle(LinearGradient(colors: [Yq.teal.opacity(0.35), Yq.teal.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                            .interpolationMethod(.monotone)
                        LineMark(x: .value("التاريخ", p.date), y: .value("المبيعات", p.sales), series: .value("نوع", "مبيعات"))
                            .foregroundStyle(Yq.teal).lineStyle(StrokeStyle(lineWidth: 2.2)).interpolationMethod(.monotone)
                        if profitVisible {
                            LineMark(x: .value("التاريخ", p.date), y: .value("الربح", p.profit), series: .value("نوع", "ربح"))
                                .foregroundStyle(Yq.green).lineStyle(StrokeStyle(lineWidth: 2)).interpolationMethod(.monotone)
                        }
                    }
                    ForEach(prevPoints) { p in
                        LineMark(x: .value("التاريخ", p.date.addingTimeInterval(shift)), y: .value("المبيعات", p.sales), series: .value("نوع", "سابق"))
                            .foregroundStyle(.gray.opacity(0.6)).lineStyle(StrokeStyle(lineWidth: 1.2, dash: [4, 4])).interpolationMethod(.monotone)
                    }
                    if let sel {
                        RuleMark(x: .value("التاريخ", sel.date))
                            .foregroundStyle(.secondary.opacity(0.4))
                            .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(Fmt.dateOnly(.string(sel.date.ISO8601Format()))).font(.caption2.bold())
                                    Text("مبيعات \(Fmt.money(sel.sales))").font(.caption2)
                                    if profitVisible { Text("ربح \(Fmt.money(sel.profit))").font(.caption2).foregroundStyle(Yq.green) }
                                    Text("\(Int(sel.invoices)) فاتورة").font(.caption2).foregroundStyle(.secondary)
                                }
                                .padding(6)
                                .background(.regularMaterial, in: .rect(cornerRadius: 8))
                            }
                    }
                }
                .chartXSelection(value: $selected)
                .chartYAxis { AxisMarks { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(Compact.money(n)) } } } }
                .frame(height: 240)
                .accessibilityLabel("مخطط المبيعات والربح")
            }
        }
    }

    private func legend(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(text).font(.caption2).foregroundStyle(.secondary)
        }
    }

    // MARK: - التدفق النقدي

    private func cashChart(_ cur: [JSON]) -> some View {
        let points = bucket(cur)
        return GlassPanel {
            VStack(alignment: .leading, spacing: 10) {
                Text("التدفق النقدي").font(.headline)
                Chart {
                    ForEach(points) { p in
                        BarMark(x: .value("التاريخ", p.date, unit: unit), y: .value("المبلغ", p.paid))
                            .foregroundStyle(by: .value("البند", "مقبوض المبيعات"))
                            .position(by: .value("البند", "مقبوض المبيعات"))
                        BarMark(x: .value("التاريخ", p.date, unit: unit), y: .value("المبلغ", p.collected))
                            .foregroundStyle(by: .value("البند", "تحصيل الديون"))
                            .position(by: .value("البند", "تحصيل الديون"))
                        BarMark(x: .value("التاريخ", p.date, unit: unit), y: .value("المبلغ", -p.expenses))
                            .foregroundStyle(by: .value("البند", "مصروفات"))
                            .position(by: .value("البند", "مصروفات"))
                    }
                    RuleMark(y: .value("صفر", 0)).foregroundStyle(.secondary.opacity(0.4))
                }
                .chartForegroundStyleScale(["مقبوض المبيعات": Yq.teal, "تحصيل الديون": Yq.green, "مصروفات": Yq.red])
                .chartYAxis { AxisMarks { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(Compact.money(n)) } } } }
                .chartLegend(position: .top, alignment: .leading)
                .frame(height: 220)
            }
        }
    }

    // MARK: - المنتجات وطرق الدفع

    private func topProducts(_ items: [JSON]) -> some View {
        GlassPanel {
            VStack(alignment: .leading, spacing: 10) {
                Text("أكثر المنتجات مبيعاً").font(.headline)
                if items.isEmpty { Text("لا توجد مبيعات").foregroundStyle(.secondary) }
                Chart(Array(items.enumerated()), id: \.offset) { _, x in
                    BarMark(x: .value("المبيعات", x["total"].num), y: .value("المنتج", x["name"].text))
                        .foregroundStyle(Yq.teal.gradient)
                        .cornerRadius(4)
                        .annotation(position: .trailing) { Text(Compact.money(x["total"].num)).font(.caption2).foregroundStyle(.secondary) }
                }
                .chartXAxis(.hidden)
                .frame(height: CGFloat(max(items.count, 1)) * 30)
            }
        }
    }

    private func paymentMix(_ items: [JSON]) -> some View {
        let labels = ["CASH": "نقدي", "DEBT": "آجل", "CREDIT": "آجل", "CARD": "بطاقة", "MIXED": "مختلط", "PARTIAL": "جزئي"]
        let total = items.reduce(0) { $0 + $1["total"].num }
        return GlassPanel {
            VStack(alignment: .leading, spacing: 10) {
                Text("طرق الدفع").font(.headline)
                Chart(Array(items.enumerated()), id: \.offset) { _, x in
                    SectorMark(angle: .value("المبلغ", x["total"].num), innerRadius: .ratio(0.6), angularInset: 1.5)
                        .foregroundStyle(by: .value("النوع", labels[x["type"].text] ?? x["type"].text))
                        .cornerRadius(3)
                }
                .chartLegend(position: .bottom)
                .frame(height: 180)
                .overlay {
                    VStack(spacing: 0) {
                        Text(Compact.money(total)).font(.headline.monospacedDigit())
                        Text("إجمالي").font(.caption2).foregroundStyle(.secondary)
                    }
                    .offset(y: -14)
                }
            }
        }
    }

    // MARK: - الإنترنت والديون

    private func ispCard(_ isp: JSON, _ profitVisible: Bool) -> some View {
        GlassPanel(tint: Yq.blue) {
            VStack(alignment: .leading, spacing: 8) {
                Label("تجديدات الإنترنت", systemImage: "wifi").font(.headline)
                HStack {
                    stat("التجديدات", isp["renewals"].text)
                    stat("الإيراد", Fmt.money(isp["sell"]))
                    if profitVisible && !isp["cost"].isNull {
                        stat("الكلفة", Fmt.money(isp["cost"]))
                        stat("الربح", Fmt.money(isp["sell"].num - isp["cost"].num))
                    }
                }
            }
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.headline.monospacedDigit())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func debtorsCard(_ debtors: [JSON]) -> some View {
        let maxB = debtors.map { $0["balance"].num }.max() ?? 1
        return GlassPanel {
            VStack(alignment: .leading, spacing: 10) {
                Text("أعلى الديون").font(.headline)
                ForEach(debtors.records) { r in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(r["name"].text).font(.subheadline)
                            Spacer()
                            Text(Fmt.iqd(r["balance"])).font(.subheadline.monospacedDigit()).foregroundStyle(Yq.deepGold)
                        }
                        GeometryReader { g in
                            Capsule().fill(Yq.deepGold.opacity(0.25))
                                .overlay(alignment: .leading) {
                                    Capsule().fill(Yq.deepGold).frame(width: g.size.width * r["balance"].num / maxB)
                                }
                        }
                        .frame(height: 6)
                    }
                }
            }
        }
    }

    // MARK: - البيانات

    private var unit: Calendar.Component { days <= 31 ? .day : days <= 120 ? .weekOfYear : .month }

    private func bucket(_ rows: [JSON]) -> [Point] {
        var map: [Date: Point] = [:]
        let cal = Fmt.calendar
        for r in rows {
            guard let d = Fmt.parse(r["day"].text) else { continue }
            let key = cal.dateInterval(of: unit, for: d)?.start ?? d
            var p = map[key] ?? Point(date: key)
            p.sales += r["sales"].num
            p.revenue += r["revenue"].num
            p.cost += r["cost"].num
            p.profit = p.revenue - p.cost
            p.collected += r["collected"].num
            p.paid += r["paid"].num
            p.expenses += r["expenses"].num
            p.added += r["debt_added"].num
            p.invoices += r["invoices"].num
            map[key] = p
        }
        return map.values.sorted { $0.date < $1.date }
    }

    private func totals(_ rows: [JSON]) -> Point {
        var p = Point(date: Date())
        for r in rows {
            p.sales += r["sales"].num; p.revenue += r["revenue"].num; p.cost += r["cost"].num
            p.collected += r["collected"].num; p.paid += r["paid"].num; p.expenses += r["expenses"].num
            p.added += r["debt_added"].num; p.invoices += r["invoices"].num
        }
        p.profit = p.revenue - p.cost
        return p
    }

    private func load() async {
        error = nil
        do {
            data = try await API.shared.get("analytics", ["days": String(days)])
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            if data == nil { self.error = error.localizedDescription }
        }
    }
}

extension Array {
    var nilIfEmpty: [Element]? { isEmpty ? nil : self }
}
