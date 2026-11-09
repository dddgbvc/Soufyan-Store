import SwiftUI

/// تحميل كائن واحد من الخادم مع حالات: تحميل / خطأ / بيانات.
@Observable
final class Remote {
    var data: JSON?
    var error: String?
    var loading = false
    private let load: () async throws -> JSON

    init(_ load: @escaping () async throws -> JSON) { self.load = load }

    func reload() async {
        loading = true
        defer { loading = false }
        do {
            data = try await load()
            error = nil
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            if data == nil { self.error = error.localizedDescription }
        }
    }
}

/// غلاف عرض يحمّل البيانات ويعرض هيكلاً أثناء التحميل ورسالة خطأ مع إعادة المحاولة.
struct RemoteView<Content: View>: View {
    @State private var remote: Remote
    let content: (JSON, Remote) -> Content

    init(load: @escaping () async throws -> JSON, @ViewBuilder content: @escaping (JSON, Remote) -> Content) {
        _remote = State(initialValue: Remote(load))
        self.content = content
    }

    var body: some View {
        Group {
            if let d = remote.data {
                content(d, remote)
            } else if let e = remote.error {
                ErrorState(message: e) { await remote.reload() }
            } else {
                List { SkeletonRows() }.yaqootBackground()
            }
        }
        .task { if remote.data == nil { await remote.reload() } }
        .onChange(of: AppState.shared.refreshTick) { Task { await remote.reload() } }
    }
}

/// قائمة مُقسّمة إلى صفحات من الخادم مع بحث وفلاتر.
@Observable
final class Paged {
    var rows: [Record] = []
    var meta: JSON = .null
    var loading = false
    var error: String?
    var more = false
    var query = ""
    var filter: String
    private var seq = 0

    let pageSize: Int
    let listKey: String
    private let fetch: ([String: String]) async throws -> JSON
    private let cursor: ((Record, Int) -> [String: String])?
    private let filterParams: (String) -> [String: String]

    init(listKey: String, pageSize: Int = 50, filter: String = "",
         filterParams: @escaping (String) -> [String: String] = Paged.keyValue,
         cursor: ((Record, Int) -> [String: String])? = nil,
         fetch: @escaping ([String: String]) async throws -> JSON) {
        self.listKey = listKey
        self.pageSize = pageSize
        self.filter = filter
        self.filterParams = filterParams
        self.cursor = cursor
        self.fetch = fetch
    }

    /// "debt_only=1" ← ["debt_only": "1"]
    static func keyValue(_ f: String) -> [String: String] {
        let p = f.split(separator: "=", maxSplits: 1).map(String.init)
        return p.count == 2 ? [p[0]: p[1]] : [:]
    }

    /// مورد من /api/erp.
    static func erp(_ resource: String, listKey: String, pageSize: Int = 50, filter: String = "",
                    params: [String: String] = [:], cursor: ((Record, Int) -> [String: String])? = nil) -> Paged {
        Paged(listKey: listKey, pageSize: pageSize, filter: filter, cursor: cursor) { p in
            try await API.shared.get(resource, params.merging(p) { $1 })
        }
    }

    func reload(append: Bool = false) async {
        seq += 1
        let n = seq
        loading = true
        error = nil
        var p = filterParams(filter)
        if !query.isEmpty { p["q"] = query }
        p["limit"] = String(pageSize)
        if append, let last = rows.last, let cursor { p.merge(cursor(last, rows.count)) { $1 } }
        do {
            let d = try await fetch(p)
            guard n == seq else { return }
            let base = append ? rows.count : 0
            let list = d[listKey].array.enumerated().map { Record($1, fallback: base + $0) }
            if append { rows.append(contentsOf: list) } else { rows = list }
            meta = d
            more = cursor != nil && list.count == pageSize
        } catch APIError.sessionExpired {
            AppState.shared.expire()
        } catch {
            if n == seq { self.error = error.localizedDescription }
        }
        if n == seq { loading = false }
    }
}

/// عرض قائمة مقسّمة: بحث، فلاتر، سحب للتحديث، تحميل المزيد، هيكل أثناء التحميل.
struct PagedList<Row: View, Header: View>: View {
    @Bindable var model: Paged
    var searchPrompt: String? = nil
    var filters: [(String, String)]? = nil
    var empty = "لا توجد سجلات"
    @ViewBuilder var header: (JSON) -> Header
    @ViewBuilder var row: (Record) -> Row

    @State private var debounce: Task<Void, Never>?

    var body: some View {
        List {
            if let filters {
                FilterBar(options: filters, selection: $model.filter)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
            }
            header(model.meta)
            if let e = model.error, model.rows.isEmpty {
                ErrorState(message: e) { await model.reload() }.listRowBackground(Color.clear)
            } else if model.rows.isEmpty && model.loading {
                SkeletonRows()
            } else if model.rows.isEmpty {
                EmptyState(text: empty).listRowBackground(Color.clear)
            }
            ForEach(model.rows) { r in row(r) }
            if model.more {
                Button("تحميل المزيد") { Task { await model.reload(append: true) } }
                    .frame(maxWidth: .infinity)
                    .disabled(model.loading)
            }
        }
        .yaqootBackground()
        .refreshable { await model.reload() }
        .modifier(OptionalSearch(prompt: searchPrompt, text: $model.query))
        .onChange(of: model.query) {
            debounce?.cancel()
            debounce = Task {
                try? await Task.sleep(for: .milliseconds(350))
                if !Task.isCancelled { await model.reload() }
            }
        }
        .onChange(of: model.filter) { Task { await model.reload() } }
        .onChange(of: AppState.shared.refreshTick) { Task { await model.reload() } }
        .task { if model.rows.isEmpty { await model.reload() } }
    }
}

extension PagedList where Header == EmptyView {
    init(model: Paged, searchPrompt: String? = nil, filters: [(String, String)]? = nil, empty: String = "لا توجد سجلات",
         @ViewBuilder row: @escaping (Record) -> Row) {
        self.init(model: model, searchPrompt: searchPrompt, filters: filters, empty: empty, header: { _ in EmptyView() }, row: row)
    }
}

private struct OptionalSearch: ViewModifier {
    let prompt: String?
    @Binding var text: String
    func body(content: Content) -> some View {
        if let prompt {
            content.searchable(text: $text, prompt: prompt)
        } else {
            content
        }
    }
}
