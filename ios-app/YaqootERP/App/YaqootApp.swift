import BackgroundTasks
import SwiftUI

@main
struct YaqootApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .onChange(of: scenePhase) { _, p in
                    AppState.shared.scenePhaseChanged(p)
                    if p == .background { Notifier.shared.scheduleBackgroundRefresh() }
                }
        }
        .commands { YaqootCommands() }
        .backgroundTask(.appRefresh(Notifier.refreshTaskID)) {
            await Notifier.shared.pollOnce()
            await Notifier.shared.scheduleBackgroundRefresh()
        }

        // نافذة مستقلة لفاتورة (آيباد: عدة نوافذ جنباً إلى جنب).
        WindowGroup("فاتورة", id: "invoice", for: String.self) { $id in
            if let id {
                NavigationStack { InvoiceDetailView(id: id) }
                    .environment(\.layoutDirection, .rightToLeft)
                    .preferredColorScheme(AppState.shared.appearance.scheme)
            }
        }

        // نافذة كشف حساب زبون.
        WindowGroup("كشف حساب", id: "statement", for: String.self) { $id in
            if let id {
                NavigationStack { StatementView(customerID: id) }
                    .environment(\.layoutDirection, .rightToLeft)
                    .preferredColorScheme(AppState.shared.appearance.scheme)
            }
        }
    }
}

/// اختصارات لوحة المفاتيح (آيباد مع لوحة مفاتيح).
struct YaqootCommands: Commands {
    var body: some Commands {
        CommandMenu("انتقال") {
            let quick: [(AppSection, KeyEquivalent)] = [
                (.dashboard, "1"), (.invoices, "2"), (.customers, "3"), (.vault, "4"), (.products, "5"),
                (.isp, "6"), (.network, "7"), (.reports, "8"), (.notifications, "9"),
            ]
            ForEach(quick, id: \.0) { item in
                Button(item.0.title) { AppState.shared.go(item.0) }
                    .keyboardShortcut(item.1, modifiers: .command)
            }
            Divider()
            Button("بحث شامل") { AppState.shared.searchTick += 1 }
                .keyboardShortcut("f", modifiers: .command)
            Button("تحديث") { AppState.shared.refreshTick += 1 }
                .keyboardShortcut("r", modifiers: .command)
            Button("قفل وتبديل الموظف") { Task { await AppState.shared.lock() } }
                .keyboardShortcut("l", modifiers: [.command, .shift])
        }
    }
}

/// يختار الشاشة حسب مرحلة الدخول.
struct RootView: View {
    @State private var app = AppState.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            switch app.phase {
            case .loading:
                ZStack { YaqootBackground(); BrandLockup(size: 96, animated: true) }
            case .setup:
                ServerSetupView()
            case .unpaired:
                StoreLoginView()
            case .locked:
                PinView().id(app.message ?? "pin")
            case .active:
                MainShell().id(app.employee["id"].text)
            case .failed(let message):
                ZStack {
                    YaqootBackground()
                    ErrorState(message: message) { await app.refresh() }
                }
            }
            if app.showWelcome {
                WelcomeView { withAnimation(.smooth) { app.finishWelcome() } }
                    .transition(.opacity)
                    .zIndex(2)
            }
        }
        .animation(.smooth(duration: 0.35), value: app.phase)
        .environment(\.layoutDirection, .rightToLeft)
        .environment(\.locale, Locale(identifier: "ar_IQ@numbers=latn"))
        .preferredColorScheme(app.appearance.scheme)
        .tint(Yq.teal)
        .task {
            QuickAction.install()
            await app.boot()
        }
        .task(id: app.phase) {
            // فحص الخمول والإشعارات كل دقيقة أثناء فتح التطبيق.
            guard app.phase == .active else { return }
            app.consumePendingRoute()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                app.checkIdle()
                if let n = await Notifier.shared.pollOnce() { app.unread = n }
            }
        }
    }
}
