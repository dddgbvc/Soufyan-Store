import SwiftUI

/// الواجهة الرئيسية:
/// • آيفون: شريط تبويب زجاجي (الرئيسية، المبيعات، الديون، الإنترنت، المزيد) + تبويب بحث، ويصغر عند التمرير.
/// • آيباد: شريط جانبي بمجموعات الأقسام (sidebarAdaptable) مع أعمدة متعددة داخل الأقسام.
struct MainShell: View {
    @State private var app = AppState.shared
    @State private var tab = AppSection.dashboard.rawValue
    @State private var morePath: [AppSection] = []
    @Environment(\.horizontalSizeClass) private var size

    private var primary: [AppSection] { AppSection.phoneTabs.filter(app.allowed) }
    private var groups: [String] { AppSection.groups.filter { !secondary(in: $0).isEmpty } }
    private func secondary(in group: String) -> [AppSection] {
        app.sections.filter { $0.group == group && !AppSection.phoneTabs.contains($0) }
    }

    var body: some View {
        TabView(selection: $tab) {
            ForEach(primary) { s in
                Tab(s.short, systemImage: s.icon, value: s.rawValue) {
                    NavigationStack { SectionScreen(section: s) }
                }
            }

            ForEach(groups, id: \.self) { group in
                TabSection(group) {
                    ForEach(secondary(in: group)) { s in
                        Tab(s.title, systemImage: s.icon, value: s.rawValue) {
                            NavigationStack { SectionScreen(section: s) }
                        }
                        .badge(s == .notifications ? app.unread : 0)
                        .defaultVisibility(.hidden, for: .tabBar)
                    }
                }
            }

            Tab("المزيد", systemImage: "square.grid.3x3.fill", value: "more") {
                NavigationStack(path: $morePath) {
                    MoreView()
                        .navigationDestination(for: AppSection.self) { s in SectionScreen(section: s) }
                }
            }
            .badge(app.unread)
            .defaultVisibility(.hidden, for: .sidebar)

            Tab(value: "search", role: .search) {
                NavigationStack { SearchView() }
            }
        }
        .tabViewStyle(.sidebarAdaptable)
        .tabBarMinimizeBehavior(.onScrollDown)
        .onAppear { sync(app.selected) }
        .onChange(of: app.selected) { _, s in sync(s) }
        .onChange(of: tab) { _, t in
            app.touch()
            if let s = AppSection(rawValue: t), s != app.selected { app.selected = s }
        }
        .onChange(of: app.searchTick) { tab = "search" }
        .onChange(of: size) { sync(app.selected) }
    }

    /// يفتح القسم: تبويب مباشر، أو عبر «المزيد» على الآيفون.
    private func sync(_ s: AppSection) {
        if size == .compact && !AppSection.phoneTabs.contains(s) {
            tab = "more"
            if morePath.last != s { morePath = [s] }
        } else if tab != s.rawValue {
            tab = s.rawValue
        }
    }
}

/// قائمة كل الأقسام على الآيفون، مجمّعة وبأيقونات ملونة.
struct MoreView: View {
    @State private var app = AppState.shared

    var body: some View {
        List {
            AccountHeader()
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            ForEach(AppSection.groups, id: \.self) { group in
                let items = app.sections.filter { $0.group == group && !AppSection.phoneTabs.contains($0) }
                if !items.isEmpty {
                    SwiftUI.Section(group) {
                        ForEach(items) { s in
                            NavigationLink(value: s) {
                                Label {
                                    HStack {
                                        Text(s.title)
                                        Spacer()
                                        if s == .notifications && app.unread > 0 { Pill("\(app.unread)", color: Yq.red) }
                                    }
                                } icon: {
                                    Image(systemName: s.icon).foregroundStyle(.white)
                                        .frame(width: 30, height: 30)
                                        .background(s.tint.gradient, in: .rect(cornerRadius: 8))
                                }
                            }
                        }
                    }
                }
            }
        }
        .yaqootBackground()
        .navigationTitle("المزيد")
    }
}

/// بطاقة الموظف الحالي مع القفل.
struct AccountHeader: View {
    @State private var app = AppState.shared
    var body: some View {
        GlassPanel(tint: Yq.teal) {
            HStack(spacing: 12) {
                Avatar(text: app.employeeName, color: Yq.teal, size: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(app.employeeName).font(.headline)
                    Text("\(Fmt.role(app.employee["role"])) • \(app.storeName)").font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    Task { await app.lock() }
                } label: {
                    Image(systemName: "lock.fill").frame(width: 22, height: 22)
                }
                .buttonStyle(.glass)
                .accessibilityLabel("قفل وتبديل الموظف")
            }
        }
        .padding(.vertical, 6)
    }
}

/// يعرض شاشة القسم مع شريط أدوات موحد (الإشعارات والقفل).
struct SectionScreen: View {
    let section: AppSection
    @State private var app = AppState.shared

    var body: some View {
        content
            .navigationTitle(section.title)
            .toolbar {
                if section != .notifications && section != .settings {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { app.go(.notifications) } label: {
                            Image(systemName: app.unread > 0 ? "bell.badge.fill" : "bell")
                                .symbolRenderingMode(.multicolor)
                        }
                        .accessibilityLabel(app.unread > 0 ? "الإشعارات: \(app.unread) غير مقروء" : "الإشعارات")
                    }
                }
            }
    }

    @ViewBuilder private var content: some View {
        switch section {
        case .dashboard: DashboardView()
        case .invoices: InvoicesView()
        case .products: ProductsView()
        case .shortages: ShortagesView()
        case .customers: CustomersView()
        case .vault: VaultView()
        case .expenses: ExpensesView()
        case .purchases: PurchasesView()
        case .suppliers: SuppliersView()
        case .repairs: RepairsView()
        case .returns: ReturnsView()
        case .shipping: ShippingView()
        case .isp: ISPView()
        case .network: NetworkView()
        case .importer: ImportView()
        case .employees: EmployeesView()
        case .sessions: SessionsView()
        case .activity: ActivityView()
        case .reports: ReportsView()
        case .notifications: InboxView()
        case .settings: SettingsView()
        }
    }
}
