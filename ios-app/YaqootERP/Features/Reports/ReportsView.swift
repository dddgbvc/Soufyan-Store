import Charts
import SwiftUI

/// التقارير: ملخص المبيعات والربح والديون والمصروفات مع مخططات، وتصدير CSV.
/// الأرقام من web_dashboard نفسها التي يعتمدها الويب والتقارير التلقائية (لا حسابات موازية في التطبيق).
struct ReportsView: View {
    @State private var app = AppState.shared

    var body: some View {
        RemoteView(load: { try await API.shared.get("dashboard") }) { d, remote in
            let s = d["sales"], p = d["profit"]
            let series = d["series"].array
            let monthProfit = p["month_revenue"].num - p["month_cost"].num
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    KPIGrid {
                        KPITile(label: "مبيعات الشهر", value: Fmt.iqd(s["month_total"]), icon: "calendar", color: Yq.teal,
                                hint: "\(s["month_count"].text) فاتورة")
                        if !p.isNull {
                            KPITile(label: "ربح الشهر", value: Fmt.iqd(monthProfit), icon: "leaf", color: Yq.green,
                                    hint: p["month_revenue"].num > 0 ? "الهامش \(Int((monthProfit / p["month_revenue"].num * 100).rounded()))٪" : nil)
                        }
                        if d["expenses"].isObject {
                            KPITile(label: "مصروفات الشهر", value: Fmt.iqd(d["expenses"]["month"]), icon: "arrow.up.forward", color: Yq.red)
                        }
                        if d["debts"].isObject {
                            KPITile(label: "ديون قائمة", value: Fmt.iqd(d["debts"]["total"]), icon: "creditcard", color: Yq.deepGold,
                                    hint: "المحصّل هذا الشهر \(Fmt.money(d["collected"]["month"]))")
                        }
                    }

                    if !series.isEmpty {
                        GlassPanel {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("اتجاه المبيعات (7 أيام)").font(.headline)
                                Chart(series.records) { x in
                                    AreaMark(x: .value("اليوم", Fmt.shortDay(x["day"].text)), y: .value("المبيعات", x["total"].num))
                                        .foregroundStyle(LinearGradient(colors: [Yq.teal.opacity(0.4), Yq.teal.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                                        .interpolationMethod(.catmullRom)
                                    LineMark(x: .value("اليوم", Fmt.shortDay(x["day"].text)), y: .value("المبيعات", x["total"].num))
                                        .foregroundStyle(Yq.teal)
                                        .interpolationMethod(.catmullRom)
                                        .symbol(.circle)
                                }
                                .chartYAxis {
                                    AxisMarks { v in
                                        AxisGridLine()
                                        AxisValueLabel { if let n = v.as(Double.self) { Text("\(Fmt.money(n / 1000))k") } }
                                    }
                                }
                                .frame(height: 220)
                            }
                        }
                    }

                    if !p.isNull && p["month_revenue"].num > 0 {
                        GlassPanel {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("تكوين إيراد الشهر").font(.headline)
                                Chart {
                                    SectorMark(angle: .value("الكلفة", p["month_cost"].num), innerRadius: .ratio(0.62), angularInset: 2)
                                        .foregroundStyle(Yq.blue).annotation(position: .overlay) { Text("الكلفة").font(.caption2).foregroundStyle(.white) }
                                    SectorMark(angle: .value("الربح", max(0, monthProfit)), innerRadius: .ratio(0.62), angularInset: 2)
                                        .foregroundStyle(Yq.green).annotation(position: .overlay) { Text("الربح").font(.caption2).foregroundStyle(.white) }
                                }
                                .frame(height: 200)
                            }
                        }
                    }

                    GlassPanel {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("التقارير التلقائية").font(.headline)
                            Text("يصل التقرير اليومي والأسبوعي والشهري وتقرير الشهرين والسنوي إلى صندوق الإشعارات حسب تفضيلاتك.")
                                .foregroundStyle(.secondary)
                            Button { app.go(.notifications) } label: { Label("فتح صندوق التقارير", systemImage: "tray.full") }
                                .buttonStyle(.glass)
                        }
                    }
                }
                .padding()
            }
            .refreshable { await remote.reload() }
            .toolbar {
                ShareLink(item: CSVFile(name: "تقرير المبيعات", header: ["اليوم", "التاريخ", "المبيعات"],
                                        rows: series.map { [Fmt.weekday($0["day"].text), $0["day"].text, Fmt.money($0["total"])] }),
                          preview: SharePreview("تقرير المبيعات.csv")) {
                    Label("تصدير", systemImage: "square.and.arrow.up")
                }
            }
        }
        .background { YaqootBackground() }
    }
}
