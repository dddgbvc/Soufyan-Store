import SwiftUI

// نظام التصميم: Liquid Glass الأصلي من Apple (glassEffect / GlassEffectContainer / GlassButtonStyle)
// فوق خلفية MeshGradient هادئة. لا يوجد أي blur أو glassmorphism مصطنع.

/// خلفية التطبيق: تدرّج شبكي بألوان ياقوت، يتحرك ببطء شديد ويتوقف مع «تقليل الحركة».
struct YaqootBackground: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground)
            if reduceMotion {
                mesh(phase: 0)
            } else {
                TimelineView(.animation(minimumInterval: 1 / 15)) { ctx in
                    mesh(phase: ctx.date.timeIntervalSinceReferenceDate)
                }
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    private func mesh(phase t: Double) -> some View {
        let dx = Float(sin(t / 9) * 0.06)
        let dy = Float(cos(t / 11) * 0.05)
        let dark = scheme == .dark
        let base = dark ? Color(red: 0.04, green: 0.08, blue: 0.08) : Color(red: 0.96, green: 0.97, blue: 0.96)
        let teal = dark ? Yq.teal.opacity(0.85) : Yq.teal.opacity(0.28)
        let gold = dark ? Yq.deepGold.opacity(0.45) : Yq.gold.opacity(0.55)
        let blue = dark ? Yq.blue.opacity(0.25) : Yq.blue.opacity(0.10)
        return MeshGradient(
            width: 3, height: 3,
            points: [
                [0, 0], [0.5, 0], [1, 0],
                [0, 0.5], [0.5 + dx, 0.45 + dy], [1, 0.5],
                [0, 1], [0.5, 1], [1, 1],
            ],
            colors: [
                teal, base, gold,
                base, base, blue,
                gold.opacity(0.6), base, teal.opacity(0.7),
            ]
        )
    }
}

/// بطاقة زجاجية للمحتوى العائم (مؤشرات، أزرار، ملخصات).
struct GlassPanel<Content: View>: View {
    var tint: Color? = nil
    var radius: CGFloat = 22
    var padding: CGFloat = 16
    var interactive = false
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassEffect(glass, in: .rect(cornerRadius: radius))
    }

    private var glass: Glass {
        var g = Glass.regular
        if let tint { g = g.tint(tint.opacity(0.16)) }
        if interactive { g = g.interactive() }
        return g
    }
}

/// مؤشر رئيسي (KPI) على الزجاج.
struct KPITile: View {
    let label: String
    let value: String
    let icon: String
    var color: Color = Yq.teal
    var hint: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        let content = VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .font(.headline)
                    .foregroundStyle(color)
                    .frame(width: 34, height: 34)
                    .background(color.opacity(0.14), in: .circle)
                Spacer()
                if action != nil {
                    Image(systemName: "chevron.left").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                        .flipsForRightToLeftLayoutDirection(true)
                }
            }
            Text(label).font(.subheadline).foregroundStyle(.secondary)
            Text(value)
                .font(.title2.weight(.bold))
                .monospacedDigit()
                .contentTransition(.numericText())
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if let hint {
                Text(hint).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
        .contentShape(.rect(cornerRadius: 22))

        if let action {
            Button(action: action) { content }
                .buttonStyle(.plain)
                .glassEffect(.regular.tint(color.opacity(0.10)).interactive(), in: .rect(cornerRadius: 22))
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
        } else {
            content
                .glassEffect(.regular.tint(color.opacity(0.10)), in: .rect(cornerRadius: 22))
                .accessibilityElement(children: .combine)
        }
    }
}

/// شبكة مؤشرات تتكيف مع العرض (عمودان للآيفون، حتى أربعة للآيباد).
struct KPIGrid<Content: View>: View {
    @ViewBuilder var content: Content
    @Environment(\.horizontalSizeClass) private var size
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let minWidth: CGFloat = typeSize.isAccessibilitySize ? 280 : (size == .regular ? 200 : 150)
        GlassEffectContainer(spacing: 14) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: minWidth), spacing: 12)], spacing: 12) { content }
        }
    }
}

/// شارة حالة صغيرة.
struct Pill: View {
    let text: String
    var color: Color = Yq.teal
    init(_ text: String, color: Color = Yq.teal) { self.text = text; self.color = color }
    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .foregroundStyle(color)
            .background(color.opacity(0.14), in: .capsule)
    }
}

/// أيقونة دائرية ملونة أو أحرف أولى.
struct Avatar: View {
    var text: String = ""
    var icon: String? = nil
    var color: Color = Yq.teal
    var size: CGFloat = 40

    var body: some View {
        ZStack {
            Circle().fill(color.opacity(0.15))
            if let icon {
                Image(systemName: icon).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(color)
            } else {
                Text(initials).font(.system(size: size * 0.38, weight: .bold)).foregroundStyle(color)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var initials: String {
        let parts = text.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first.map(String.init) }.joined(separator: "\u{200C}")
    }
}

/// صف قائمة موحّد: أيقونة، عنوان، تفاصيل، قيمة وشارة.
struct RowView: View {
    var icon: String? = nil
    var avatarText: String = ""
    var color: Color = Yq.teal
    let title: String
    var subtitle: String? = nil
    var value: String? = nil
    var valueColor: Color? = nil
    var pill: (String, Color)? = nil

    var body: some View {
        HStack(spacing: 12) {
            Avatar(text: avatarText, icon: icon, color: color)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.body.weight(.semibold)).lineLimit(1)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                if let value {
                    Text(value).font(.callout.weight(.bold)).monospacedDigit().foregroundStyle(valueColor ?? .primary)
                }
                if let pill { Pill(pill.0, color: pill.1) }
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

/// حالة فارغة.
struct EmptyState: View {
    let text: String
    var icon: String = "tray"
    var body: some View {
        ContentUnavailableView(text, systemImage: icon)
    }
}

/// حالة خطأ مع إعادة المحاولة (القراءة فقط — العمليات المالية لها معرّف ثابت يمنع التكرار).
struct ErrorState: View {
    let message: String
    let retry: () async -> Void
    var body: some View {
        ContentUnavailableView {
            Label("تعذر التحميل", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("إعادة المحاولة") { Task { await retry() } }
                .buttonStyle(.glassProminent)
                .tint(Yq.teal)
        }
    }
}

/// صفوف هيكلية أثناء التحميل.
struct SkeletonRows: View {
    var count = 6
    var body: some View {
        ForEach(0..<count, id: \.self) { _ in
            RowView(icon: "circle", color: .gray, title: "تحميل البيانات الآن", subtitle: "تفاصيل السطر الثاني هنا", value: "000,000")
                .redacted(reason: .placeholder)
        }
        .accessibilityHidden(true)
    }
}

/// رسالة عابرة أعلى الشاشة.
struct Toast: Equatable {
    var text: String
    var error = false
}

struct ToastModifier: ViewModifier {
    @Binding var toast: Toast?
    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let toast {
                Label(toast.text, systemImage: toast.error ? "exclamationmark.octagon" : "checkmark.circle")
                    .font(.callout.weight(.semibold))
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .glassEffect(.regular.tint((toast.error ? Yq.red : Yq.green).opacity(0.2)), in: .capsule)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task(id: toast) {
                        try? await Task.sleep(for: .seconds(2.6))
                        withAnimation { self.toast = nil }
                    }
                    .accessibilityAddTraits(.isStaticText)
            }
        }
        .animation(.spring(duration: 0.35), value: toast)
        .sensoryFeedback(trigger: toast) { _, new in
            guard let new else { return nil }
            return new.error ? .error : .success
        }
    }
}

extension View {
    func toast(_ t: Binding<Toast?>) -> some View { modifier(ToastModifier(toast: t)) }

    /// خلفية ياقوت خلف القوائم.
    func yaqootBackground() -> some View {
        scrollContentBackground(.hidden).background { YaqootBackground() }
    }
}

/// شريط فلاتر أفقي على الزجاج.
struct FilterBar: View {
    let options: [(String, String)]
    @Binding var selection: String
    @Namespace private var ns

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            GlassEffectContainer(spacing: 8) {
                HStack(spacing: 8) {
                    ForEach(options, id: \.0) { option in
                        let key = option.0
                        let label = option.1
                        Button {
                            withAnimation(.snappy) { selection = key }
                        } label: {
                            Text(label).font(.subheadline.weight(selection == key ? .bold : .regular))
                                .padding(.horizontal, 12).padding(.vertical, 7)
                        }
                        .buttonStyle(.plain)
                        .glassEffect(selection == key ? .regular.tint(Yq.teal.opacity(0.35)).interactive() : .regular.interactive(), in: .capsule)
                        .glassEffectID(key, in: ns)
                        .accessibilityAddTraits(selection == key ? .isSelected : [])
                    }
                }
                .padding(.horizontal, 2)
            }
        }
        .scrollClipDisabled()
    }
}
