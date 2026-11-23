import SwiftUI
import Foundation

// Experimental read-only client. Use only with an Earthlink account permitted
// to access these endpoints. No passwords or tokens are committed to GitHub.
@main
struct YaqootEarthlinkTestApp: App {
    var body: some Scene {
        WindowGroup { EarthlinkRootView() }
    }
}

struct Subscriber: Identifiable {
    let id: Int
    let username: String
    let name: String
    let status: String
    let expiry: String
    let package: String

    init?(_ json: [String: Any]) {
        guard let value = json["userIndex"],
              let id = Int(String(describing: value)), id > 0 else { return nil }
        self.id = id
        username = Self.read(json, "userID")
        name = Self.read(json, "displayName", "fullName", "arName", "userID")
        status = Self.read(json, "accountStatus")
        expiry = Self.read(json, "accountExpirationDate")
        package = Self.read(json, "accountName")
    }

    static func read(_ json: [String: Any], _ keys: String...) -> String {
        for key in keys {
            if let value = json[key], !(value is NSNull) { return String(describing: value) }
        }
        return "—"
    }
}

@MainActor
final class EarthlinkModel: ObservableObject {
    @Published var token: String?
    @Published var affiliate = "Earthlink"
    @Published var balance = "—"
    @Published var users: [Subscriber] = []
    @Published var selected: Subscriber?
    @Published var busy = false
    @Published var errorMessage: String?

    private let endpoint = URL(string: "https://rapi.earthlink.iq/api/reseller/")!
    private let session = URLSession(configuration: .ephemeral)
    private var affiliateIndex: Int?

    func login(_ username: String, _ password: String) async {
        guard !username.isEmpty && !password.isEmpty else { return }
        await run {
            let data = try await request("token", method: "POST", form: [
                "username": username, "password": password,
                "loginType": "1", "grant_type": "password"
            ], secured: false)
            guard let root = data as? [String: Any],
                  let token = root["access_token"] as? String, !token.isEmpty else {
                throw EarthlinkError.message("رد تسجيل الدخول ما يحتوي access_token")
            }
            self.token = token
            await refreshOverview()
            await search("")
        }
    }

    func refreshOverview() async {
        guard token != nil else { return }
        do {
            if let value = try await request("affiliate") as? [String: Any],
               let body = try unwrap(value) as? [String: Any] {
                affiliate = Subscriber.read(body, "affiliateName")
                if let index = body["affiliateIndex"] { affiliateIndex = Int(String(describing: index)) }
            }
        } catch { /* Optional overview does not block subscriber search. */ }
        do {
            if let response = try await request("affiliate/deposit/balance") as? [String: Any] {
                let value = try unwrap(response)
                balance = String(describing: value)
            }
        } catch { balance = "غير متاح" }
    }

    func search(_ text: String) async {
        guard token != nil else { return }
        await run {
            let result = try await request("user/all", method: "POST", form: [
                "Query": text, "StartIndex": "0", "RowCount": "30"
            ])
            guard let root = result as? [String: Any],
                  let value = try unwrap(root) as? [String: Any],
                  let rows = value["itemsList"] as? [[String: Any]] else {
                throw EarthlinkError.message("صيغة قائمة المشتركين غير متوقعة")
            }
            users = rows.compactMap(Subscriber.init)
        }
    }

    func load(_ id: Int) async {
        await run {
            guard let root = try await request("user/\(id)") as? [String: Any],
                  let value = try unwrap(root) as? [String: Any],
                  let user = Subscriber(value) else {
                throw EarthlinkError.message("تعذر قراءة تفاصيل المشترك")
            }
            selected = user
        }
    }

    func logout() {
        token = nil
        affiliateIndex = nil
        users = []
        selected = nil
        balance = "—"
    }

    private func run(_ task: () async throws -> Void) async {
        busy = true
        defer { busy = false }
        do { try await task() }
        catch { errorMessage = error.localizedDescription }
    }

    private func unwrap(_ root: [String: Any]) throws -> Any {
        if root["isSuccessful"] as? Bool == false {
            throw EarthlinkError.message(Subscriber.read(root, "responseMessage"))
        }
        guard let value = root["value"], !(value is NSNull) else {
            throw EarthlinkError.message("لا يوجد value في الاستجابة")
        }
        return value
    }

    private func request(_ path: String, method: String = "GET",
                         form: [String: String]? = nil,
                         secured: Bool = true) async throws -> Any {
        guard let url = URL(string: path, relativeTo: endpoint)?.absoluteURL,
              url.scheme == "https", url.host == endpoint.host else {
            throw EarthlinkError.message("عنوان API غير صالح")
        }
        if secured && token == nil { throw EarthlinkError.message("يلزم تسجيل الدخول") }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if secured, let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let affiliateIndex { req.setValue(String(affiliateIndex), forHTTPHeaderField: "AffiliateIndex") }
        if let form {
            var body = URLComponents()
            body.queryItems = form.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
            req.httpBody = Data((body.percentEncodedQuery ?? "").utf8)
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw EarthlinkError.message("استجابة غير صالحة") }
        guard (200...299).contains(http.statusCode) else {
            throw EarthlinkError.message("HTTP \(http.statusCode) — تحقق من صلاحيات API")
        }
        return try JSONSerialization.jsonObject(with: data)
    }
}

enum EarthlinkError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let text): return text }
    }
}

private enum Theme {
    static let petrol = Color(red: 0.06, green: 0.32, blue: 0.35)
    static let gold = Color(red: 0.78, green: 0.60, blue: 0.31)
}

struct EarthlinkRootView: View {
    @StateObject private var model = EarthlinkModel()
    @State private var username = ""
    @State private var password = ""
    @State private var query = ""

    var body: some View {
        NavigationStack {
            Group { model.token == nil ? AnyView(login) : AnyView(dashboard) }
                .navigationTitle("Yaqoot · Earthlink")
                .toolbar {
                    if model.token != nil {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("خروج") { model.logout() }
                        }
                    }
                }
                .alert("فشل الطلب", isPresented: Binding(
                    get: { model.errorMessage != nil },
                    set: { if !$0 { model.errorMessage = nil } }
                )) {
                    Button("موافق") { model.errorMessage = nil }
                } message: {
                    Text(model.errorMessage ?? "")
                }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .tint(Theme.petrol)
    }

    private var login: some View {
        Form {
            Section {
                Text("تطبيق اختبار للقراءة فقط. لا يحتوي على تجديد أو فصل أو دفعات.")
                    .foregroundStyle(.secondary)
                TextField("اسم الوكيل", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("كلمة المرور", text: $password)
                Button("تسجيل الدخول") {
                    Task { await model.login(username, password) }
                }
                .disabled(model.busy || username.isEmpty || password.isEmpty)
            } header: { Text("Earthlink Reseller API") }
            if model.busy { ProgressView("جاري التحقق من الحساب...") }
            Section { Text("بيانات الدخول تُستخدم داخل جلسة التطبيق ولا تُخزّن في المستودع أو في التطبيق بشكل دائم.") }
        }
    }

    private var dashboard: some View {
        List {
            Section("الوكيل") {
                LabeledContent("الحساب", value: model.affiliate)
                LabeledContent("الرصيد", value: model.balance)
                Button("تحديث") { Task { await model.refreshOverview() } }
            }
            Section("البحث في المشتركين") {
                TextField("اسم المشترك أو رقمه", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit { Task { await model.search(query) } }
                Button("بحث") { Task { await model.search(query) } }
                if model.busy { ProgressView() }
                ForEach(model.users) { user in
                    NavigationLink {
                        SubscriberDetail(userID: user.id, model: model)
                    } label: {
                        VStack(alignment: .leading) {
                            Text(user.name).font(.headline)
                            Text("\(user.username) · \(user.status)").font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Section {
                Label("كل عمليات التعديل والتجديد والفصل معطّلة", systemImage: "lock.shield")
                    .foregroundStyle(Theme.gold)
            }
        }
    }
}

private struct SubscriberDetail: View {
    let userID: Int
    @ObservedObject var model: EarthlinkModel

    var body: some View {
        Group {
            if let user = model.selected, user.id == userID {
                Form {
                    LabeledContent("الاسم", value: user.name)
                    LabeledContent("المستخدم", value: user.username)
                    LabeledContent("الحالة", value: user.status)
                    LabeledContent("الباقة", value: user.package)
                    LabeledContent("انتهاء الاشتراك", value: user.expiry)
                }
            } else { ProgressView("جاري القراءة...") }
        }
        .navigationTitle("تفاصيل المشترك")
        .task { await model.load(userID) }
    }
}