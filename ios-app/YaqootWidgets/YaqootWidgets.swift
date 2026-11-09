import ActivityKit
import SwiftUI
import WidgetKit

// ودجت «متابعة مكتب سفيان للموبايل»: الشاشة الرئيسية، شاشة القفل، والجزيرة الديناميكية.
// البيانات من الخادم بالرمز السري للجهاز (نفس صلاحيات الموظف)، ومع انقطاع الشبكة تُعرض آخر نسخة محفوظة.

private let navy = Color(red: 0.078, green: 0.204, blue: 0.247)
private let gold = Color(red: 0.784, green: 0.663, blue: 0.412)
private let cream = Color(red: 0.945, green: 0.929, blue: 0.894)

@main
struct YaqootWidgetsBundle: WidgetBundle {
    var body: some Widget {
        ShopSummaryWidget()
        ISPWidget()
        ShopLiveActivity()
    }
}

// MARK: - البيانات

struct SummaryEntry: TimelineEntry {
    let date: Date
    let summary: ShopSummary?
    let fresh: Bool
}

struct SummaryProvider: TimelineProvider {
    func placeholder(in context: Context) -> SummaryEntry {
        SummaryEntry(date: Date(), summary: .placeholder, fresh: true)
    }

    func getSnapshot(in context: Context, completion: @escaping @Sendable (SummaryEntry) -> Void) {
        if context.isPreview {
            completion(SummaryEntry(date: Date(), summary: SharedStore.loadSummary() ?? .placeholder, fresh: true))
        } else {
            completion(SummaryEntry(date: Date(), summary: SharedStore.loadSummary(), fresh: false))
        }
    }

    func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<SummaryEntry>) -> Void) {
        Task {
            let live = await SummaryLoader.fetch()
            let entry = SummaryEntry(date: Date(), summary: live ?? SharedStore.loadSummary(), fresh: live != nil)
            // iOS يحدد التوقيت الفعلي؛ نطلب تحديثاً كل 15 دقيقة تقريباً.
            completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(10 * 60))))
        }
    }
}

// MARK: - ودجت ملخص المحل

struct ShopSummaryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ShopSummary", provider: SummaryProvider()) { entry in
            ShopSummaryView(entry: entry)
                .containerBackground(for: .widget) { WidgetBackground() }
                .widgetURL(URL(string: "sufyan://section/dashboard"))
                .environment(\.layoutDirection, .rightToLeft)
        }
        .configurationDisplayName("ملخص المحل")
        .description("مبيعات اليوم، المحصّل، الديون، الخزنة، واشتراكات الإنترنت.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}

struct WidgetBackground: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        LinearGradient(colors: scheme == .dark ? [navy, Color(red: 0.05, green: 0.12, blue: 0.15)] : [cream, Color.white],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

struct ShopSummaryView: View {
    let entry: SummaryEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme

    private var accent: Color { scheme == .dark ? cream : navy }

    var body: some View {
        if let s = entry.summary {
            switch family {
            case .accessoryInline:
                Label("مبيعات \(Compact.money(s.salesToday ?? s.mySales)) • ديون \(Compact.money(s.debts))", systemImage: "chart.bar.fill")
            case .accessoryCircular:
                circular(s)
            case .accessoryRectangular:
                rectangular(s)
            case .systemSmall:
                small(s)
            case .systemMedium:
                medium(s)
            default:
                large(s)
            }
        } else {
            empty
        }
    }

    private var empty: some View {
        VStack(spacing: 6) {
            BrandGlyph(height: 22, onDark: scheme == .dark)
            Text(SharedStore.isAvailable ? "افتح التطبيق مرة واحدة ليبدأ التحديث"
                 : "أداة التثبيت لم تفعّل مشاركة البيانات (App Groups) لهذا التطبيق")
                .font(.caption2).multilineTextAlignment(.center).foregroundStyle(.secondary)
        }
    }

    private func header(_ s: ShopSummary) -> some View {
        HStack(spacing: 6) {
            BrandGlyph(height: 13, onDark: scheme == .dark)
            Text(s.storeName ?? "مكتب سفيان").font(.caption2.weight(.semibold)).lineLimit(1)
            Spacer(minLength: 0)
            if s.unread > 0 {
                Text("\(s.unread)").font(.caption2.bold()).padding(.horizontal, 5).padding(.vertical, 1)
                    .background(Color.red, in: .capsule).foregroundStyle(.white)
            }
        }
        .foregroundStyle(accent)
    }

    private func metric(_ label: String, _ value: String, _ icon: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(label, systemImage: icon).font(.caption2).foregroundStyle(.secondary).labelStyle(.titleAndIcon)
            Text(value).font(.headline.monospacedDigit()).foregroundStyle(tint).lineLimit(1).minimumScaleFactor(0.6)
                .contentTransition(.numericText())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func updated(_ s: ShopSummary) -> some View {
        Text(entry.fresh ? "محدّث \(s.at.formatted(date: .omitted, time: .shortened))" : "آخر تحديث \(s.at.formatted(date: .omitted, time: .shortened))")
            .font(.system(size: 9)).foregroundStyle(.tertiary)
    }

    private func small(_ s: ShopSummary) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            header(s)
            Spacer(minLength: 0)
            Text("مبيعات اليوم").font(.caption2).foregroundStyle(.secondary)
            Text(Compact.full(s.salesToday ?? s.mySales)).font(.title2.bold().monospacedDigit()).foregroundStyle(accent)
                .minimumScaleFactor(0.5).lineLimit(1)
            if let c = s.collectedToday {
                Label("محصّل \(Compact.money(c))", systemImage: "arrow.down.left").font(.caption2).foregroundStyle(gold)
            }
            updated(s)
        }
    }

    private func medium(_ s: ShopSummary) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            header(s)
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
                GridRow {
                    metric("مبيعات اليوم", Compact.full(s.salesToday ?? s.mySales), "doc.text", accent)
                    metric("المحصّل", Compact.full(s.collectedToday), "arrow.down.left", .green)
                }
                GridRow {
                    metric("ديون الزبائن", Compact.full(s.debts), "creditcard", gold)
                    if s.ispExpired != nil {
                        metric("إنترنت منتهي/قريب", "\(s.ispExpired ?? 0) / \(s.ispSoon ?? 0)", "wifi.exclamationmark", .orange)
                    } else {
                        metric("الخزنة", Compact.full(s.vault), "building.columns", .purple)
                    }
                }
            }
            updated(s)
        }
    }

    private func large(_ s: ShopSummary) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            header(s)
            Text("مبيعات اليوم").font(.caption).foregroundStyle(.secondary)
            Text("\(Compact.full(s.salesToday ?? s.mySales)) د.ع").font(.largeTitle.bold().monospacedDigit()).foregroundStyle(accent)
                .minimumScaleFactor(0.5).lineLimit(1)
            if let n = s.invoicesToday { Text("\(n) فاتورة").font(.caption).foregroundStyle(.secondary) }
            Divider()
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 10) {
                GridRow {
                    metric("المحصّل اليوم", Compact.full(s.collectedToday), "arrow.down.left", .green)
                    metric("الخزنة", Compact.full(s.vault), "building.columns", .purple)
                }
                GridRow {
                    metric("ديون الزبائن", Compact.full(s.debts), "creditcard", gold)
                    metric("مدينون", s.debtors.map(String.init) ?? "—", "person.2", accent)
                }
                GridRow {
                    metric("إنترنت منتهي", s.ispExpired.map(String.init) ?? "—", "wifi.slash", .red)
                    metric("ينتهي خلال 3 أيام", s.ispSoon.map(String.init) ?? "—", "clock.badge.exclamationmark", .orange)
                }
                GridRow {
                    metric("صيانة جاهزة", s.repairsReady.map(String.init) ?? "—", "wrench.and.screwdriver", .blue)
                    metric("إشعارات", "\(s.unread)", "bell.badge", .red)
                }
            }
            Spacer(minLength: 0)
            updated(s)
        }
    }

    private func rectangular(_ s: ShopSummary) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                BrandGlyph(height: 10)
                Text("مبيعات اليوم").font(.caption2)
            }
            Text("\(Compact.full(s.salesToday ?? s.mySales)) د.ع").font(.headline.monospacedDigit()).widgetAccentable()
            Text("محصّل \(Compact.money(s.collectedToday)) • ديون \(Compact.money(s.debts))").font(.caption2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func circular(_ s: ShopSummary) -> some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Image(systemName: "chart.bar.fill").font(.caption2)
                Text(Compact.money(s.salesToday ?? s.mySales)).font(.caption.bold().monospacedDigit()).minimumScaleFactor(0.6)
                    .widgetAccentable()
            }
        }
    }
}

// MARK: - ودجت الإنترنت

struct ISPWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ISPSubscribers", provider: SummaryProvider()) { entry in
            ISPWidgetView(entry: entry)
                .containerBackground(for: .widget) { WidgetBackground() }
                .widgetURL(URL(string: "sufyan://section/isp"))
                .environment(\.layoutDirection, .rightToLeft)
        }
        .configurationDisplayName("اشتراكات الإنترنت")
        .description("المنتهية والتي تنتهي خلال 3 أيام.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

struct ISPWidgetView: View {
    let entry: SummaryEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let expired = entry.summary?.ispExpired, soon = entry.summary?.ispSoon
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: "wifi.exclamationmark").font(.caption2)
                    Text("\((expired ?? 0) + (soon ?? 0))").font(.title3.bold()).widgetAccentable()
                }
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Label("الإنترنت", systemImage: "wifi").font(.caption2)
                Text("منتهية \(expired ?? 0)").font(.headline).widgetAccentable()
                Text("تنتهي قريباً \(soon ?? 0)").font(.caption2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 6) {
                Label("اشتراكات الإنترنت", systemImage: "wifi").font(.caption.weight(.semibold))
                Spacer(minLength: 0)
                HStack(alignment: .firstTextBaseline) {
                    Text("\(expired ?? 0)").font(.largeTitle.bold()).foregroundStyle(.red)
                    Text("منتهية").font(.caption).foregroundStyle(.secondary)
                }
                HStack(alignment: .firstTextBaseline) {
                    Text("\(soon ?? 0)").font(.title2.bold()).foregroundStyle(.orange)
                    Text("خلال 3 أيام").font(.caption).foregroundStyle(.secondary)
                }
                if entry.summary == nil {
                    Text("فعّل «تحديث الودجت» من التطبيق").font(.system(size: 9)).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - الجزيرة الديناميكية وشاشة القفل (Live Activity)

struct ShopLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ShopActivityAttributes.self) { context in
            LockScreenLiveView(context: context)
                .activityBackgroundTint(navy.opacity(0.92))
                .activitySystemActionForegroundColor(cream)
                .widgetURL(URL(string: "sufyan://section/dashboard"))
                .environment(\.layoutDirection, .rightToLeft)
        } dynamicIsland: { context in
            let st = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        BrandGlyph(height: 18)
                        Text("مبيعات اليوم").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(Compact.money(st.collectedToday)).font(.headline.monospacedDigit()).foregroundStyle(.green)
                        Text("محصّل").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text("\(Compact.full(st.salesToday)) د.ع").font(.title3.bold().monospacedDigit())
                        .contentTransition(.numericText()).lineLimit(1).minimumScaleFactor(0.6)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 14) {
                        if let n = st.invoicesToday { Label("\(n) فاتورة", systemImage: "doc.text") }
                        if st.unread > 0 { Label("\(st.unread)", systemImage: "bell.badge.fill").foregroundStyle(.red) }
                        if let e = st.ispExpired, let s = st.ispSoon, e + s > 0 {
                            Label("\(e)/\(s)", systemImage: "wifi.exclamationmark").foregroundStyle(.orange)
                        }
                        Spacer()
                        Text(st.updatedAt, style: .relative).foregroundStyle(.secondary)
                    }
                    .font(.caption2)
                    .environment(\.layoutDirection, .rightToLeft)
                }
            } compactLeading: {
                BrandGlyph(height: 14)
            } compactTrailing: {
                Text(Compact.money(st.salesToday)).font(.caption.bold().monospacedDigit()).foregroundStyle(gold)
                    .contentTransition(.numericText())
            } minimal: {
                BrandGlyph(height: 13)
            }
            .keylineTint(gold)
            .widgetURL(URL(string: "sufyan://section/dashboard"))
        }
    }
}

struct LockScreenLiveView: View {
    let context: ActivityViewContext<ShopActivityAttributes>
    var body: some View {
        let st = context.state
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(navy)
                BrandGlyph(height: 22)
            }
            .frame(width: 46, height: 46)
            VStack(alignment: .leading, spacing: 2) {
                Text(context.attributes.storeName).font(.caption.weight(.semibold)).foregroundStyle(cream.opacity(0.8))
                Text("\(Compact.full(st.salesToday)) د.ع").font(.title2.bold().monospacedDigit()).foregroundStyle(cream)
                    .contentTransition(.numericText())
                HStack(spacing: 10) {
                    Text("محصّل \(Compact.money(st.collectedToday))").foregroundStyle(.green)
                    if let n = st.invoicesToday { Text("\(n) فاتورة") }
                    if let e = st.ispExpired, e > 0 { Text("إنترنت منتهي \(e)").foregroundStyle(.orange) }
                }
                .font(.caption2)
                .foregroundStyle(cream.opacity(0.8))
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing) {
                if st.unread > 0 {
                    Label("\(st.unread)", systemImage: "bell.badge.fill").font(.caption.bold()).foregroundStyle(.red)
                }
                Spacer(minLength: 0)
                Text(st.updatedAt, style: .time).font(.caption2).foregroundStyle(cream.opacity(0.6))
            }
        }
        .padding(16)
    }
}
