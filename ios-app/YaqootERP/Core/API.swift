import Foundation
import Security

/// أخطاء الاتصال بخادم ياقوت.
enum APIError: LocalizedError, Equatable {
    case sessionExpired
    case network
    case notConfigured
    case server(message: String, reason: String?, status: Int)

    var errorDescription: String? {
        switch self {
        case .sessionExpired: "انتهت الجلسة. أدخل رمزك من جديد."
        case .network: "تعذر الاتصال بالخادم. تحقق من الإنترنت."
        case .notConfigured: "لم يُضبط عنوان الخادم."
        case .server(let message, _, _): message
        }
    }

    var reason: String? {
        if case .server(_, let r, _) = self { return r }
        return nil
    }
}

/// الاتصال بخادم ياقوت (نفس واجهة تطبيق الويب وتطبيق أندرويد).
/// الدخول: حساب المحل مرة واحدة (كوكي yq_store) ثم PIN يحدد الموظف (كوكي yq_sess).
/// الكوكيز تُحفظ في Keychain. كلمة مرور المالك لا تُحفظ إطلاقاً، ومفتاح Service Role لا يصل للتطبيق.
@Observable
final class API {
    static let shared = API()

    static let reasons: [String: String] = [
        "bad_credentials": "البريد أو كلمة المرور غير صحيحة.",
        "not_owner": "هذا الحساب ليس حساب مالك محل.",
        "email_not_confirmed": "البريد غير مؤكد بعد.",
        "rate_limited": "محاولات كثيرة. انتظر قليلاً.",
        "invalid_input": "أدخل بريداً صحيحاً وكلمة المرور.",
        "not_configured": "الخادم غير مهيأ.",
        "migration_missing": "قاعدة البيانات تحتاج تحديثاً.",
        "upstream_unreachable": "تعذر الوصول إلى الخادم.",
        "wrong": "الرمز غير صحيح.",
        "invalid": "الرمز من 4 إلى 8 أرقام.",
        "locked": "محاولات خاطئة كثيرة. انتظر دقيقتين.",
        "ambiguous": "هذا الرمز مسجّل لأكثر من موظف. غيّر أحدهما.",
        "disabled": "المحل أو الحساب موقوف.",
        "forbidden": "ليست لديك صلاحية لهذا الإجراء.",
        "unpaired": "هذا الجهاز غير مفعّل لمحل.",
        "purchase_unavailable": "قسم المشتريات غير متاح لهذا الموظف.",
    ]

    private static let cookieNames = ["yq_store", "yq_sess", "yq_pur"]

    private(set) var baseURL: String
    private var cookies: [String: String] = [:]
    /// آخر نشاط فعلي (يُستعمل للقفل التلقائي بعد الخمول).
    var lastActivity = Date()

    private let session: URLSession

    private init() {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.httpCookieStorage = nil
        cfg.httpShouldSetCookies = false
        cfg.httpCookieAcceptPolicy = .never
        cfg.urlCache = nil
        cfg.timeoutIntervalForRequest = 25
        cfg.waitsForConnectivity = false
        session = URLSession(configuration: cfg)

        let built = (Bundle.main.object(forInfoDictionaryKey: "YQBaseURL") as? String ?? "").trimmingCharacters(in: .whitespaces)
        baseURL = Keychain.get("base_url") ?? (built.hasPrefix("https://") ? built : "")
        for name in Self.cookieNames { cookies[name] = Keychain.get(name) }
        if !baseURL.isEmpty { SharedStore.baseURL = baseURL }
    }

    var hasBase: Bool { !baseURL.isEmpty }
    var hasStore: Bool { cookies["yq_store"] != nil }

    func setBaseURL(_ raw: String) throws {
        var u = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while u.hasSuffix("/") { u.removeLast() }
        guard u.hasPrefix("https://"), let url = URL(string: u), url.host() != nil else {
            throw APIError.server(message: "العنوان يجب أن يبدأ بـ https://", reason: "invalid_url", status: 0)
        }
        baseURL = u
        Keychain.set(u, for: "base_url")
        SharedStore.baseURL = u
    }

    // MARK: - الإرسال

    private func setCookie(_ name: String, _ value: String?) {
        cookies[name] = value
        Keychain.set(value, for: name)
    }

    private func absorbCookies(_ response: HTTPURLResponse, url: URL) {
        var fields: [String: String] = [:]
        for (k, v) in response.allHeaderFields {
            if let k = k as? String, let v = v as? String { fields[k] = v }
        }
        for c in HTTPCookie.cookies(withResponseHeaderFields: fields, for: url) where Self.cookieNames.contains(c.name) {
            let expired = (c.expiresDate.map { $0 <= Date() } ?? false) || c.value.isEmpty
            setCookie(c.name, expired ? nil : (c.value.removingPercentEncoding ?? c.value))
        }
    }

    struct Response: Sendable {
        let json: JSON
        let status: Int
    }

    func send(_ method: String, _ path: String, query: [String: String] = [:], body: JSON? = nil,
              headers: [String: String] = [:]) async throws -> Response {
        #if DEBUG
        if DemoData.enabled {
            lastActivity = Date()
            return Response(json: DemoData.response(path, query: query), status: 200)
        }
        #endif
        guard hasBase, var comps = URLComponents(string: baseURL + path) else { throw APIError.notConfigured }
        if !query.isEmpty { comps.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }
        guard let url = comps.url else { throw APIError.notConfigured }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("YaqootiOS/1.0 (iPhone; iPad)", forHTTPHeaderField: "User-Agent")
        let jar = Self.cookieNames.compactMap { n in cookies[n].map { "\(n)=\($0)" } }
        if !jar.isEmpty { req.setValue(jar.joined(separator: "; "), forHTTPHeaderField: "Cookie") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.network
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.network }
        absorbCookies(http, url: url)
        lastActivity = Date()

        let json = (try? JSONDecoder().decode(JSON.self, from: data)) ?? ["ok": false, "reason": "server_error"]
        return Response(json: json, status: http.statusCode)
    }

    func error(_ r: Response, fallback: String = "تعذر إكمال الطلب. حاول مجدداً.") -> APIError {
        let reason = r.json["reason"].string ?? r.json["error"].string
        let msg = r.json["message"].string.flatMap { $0.isEmpty ? nil : $0 } ?? reason.flatMap { Self.reasons[$0] } ?? fallback
        return .server(message: msg, reason: reason, status: r.status)
    }

    // MARK: - الدخول

    func status() async throws -> JSON {
        let r = try await send("GET", "/api/auth/status")
        guard r.json["ok"].isTrue else { throw error(r, fallback: "تعذر الاتصال بالخادم.") }
        return r.json
    }

    func storeLogin(email: String, password: String) async throws -> JSON {
        let r = try await send("POST", "/api/auth/store", body: ["email": .string(email), "password": .string(password)])
        guard r.json["ok"].isTrue else { throw error(r, fallback: "تعذر تسجيل الدخول.") }
        return r.json
    }

    func pin(_ pin: String) async throws -> JSON {
        let r = try await send("POST", "/api/auth/pin", body: ["pin": .string(pin)])
        guard r.json["ok"].isTrue else { throw error(r, fallback: "تعذر الدخول.") }
        return r.json
    }

    func lock() async {
        _ = try? await send("DELETE", "/api/auth/pin")
        setCookie("yq_sess", nil)
        setCookie("yq_pur", nil)
    }

    func forgetStore() async {
        _ = try? await send("DELETE", "/api/auth/store")
        for n in Self.cookieNames { setCookie(n, nil) }
    }

    // MARK: - البيانات

    /// قراءة مورد من /api/erp. الصلاحيات تُفحص في قاعدة البيانات.
    func get(_ resource: String, _ params: [String: String] = [:]) async throws -> JSON {
        var q = params.filter { !$0.value.isEmpty }
        q["r"] = resource
        let r = try await send("GET", "/api/erp", query: q)
        if r.status == 401 { throw APIError.sessionExpired }
        guard r.json["ok"].isTrue else { throw error(r, fallback: "تعذر تحميل البيانات.") }
        return r.json
    }

    /// الموردون والمشتريات عبر دوال قسم الشراء.
    func purchases(_ kind: String, _ params: [String: String] = [:]) async throws -> JSON {
        var q = params.filter { !$0.value.isEmpty }
        q["r"] = kind
        let r = try await send("GET", "/api/erp/purchases", query: q)
        if r.status == 401 { throw APIError.sessionExpired }
        guard r.json["ok"].isTrue else { throw error(r, fallback: "تعذر تحميل المشتريات.") }
        return r.json
    }

    /// عملية كتابة. client_id ثابت لكل محاولة حتى لا تتكرر العملية المالية عند إعادة الإرسال.
    func act(_ action: String, _ payload: [String: JSON]) async throws -> JSON {
        let r = try await send("POST", "/api/erp/action", body: ["action": .string(action), "payload": .object(payload)])
        if r.status == 401 { throw APIError.sessionExpired }
        if r.json["ok"] == .bool(false) && r.json["reason"].string != "duplicate" { throw error(r, fallback: "تعذر حفظ العملية.") }
        return r.json
    }

    func prefs() async throws -> JSON {
        let r = try await send("GET", "/api/push/prefs")
        if r.status == 401 { throw APIError.sessionExpired }
        guard case .object = r.json["prefs"] else { throw error(r, fallback: "تعذر تحميل إعدادات الإشعارات.") }
        return r.json["prefs"]
    }

    func setPrefs(_ patch: [String: JSON]) async throws -> JSON {
        let r = try await send("PUT", "/api/push/prefs", body: ["prefs": .object(patch)])
        if r.status == 401 { throw APIError.sessionExpired }
        guard case .object = r.json["prefs"] else { throw error(r, fallback: "تعذر حفظ الإعداد.") }
        return r.json["prefs"]
    }

    // MARK: - إشعارات الجهاز (استطلاع بدون APNs)

    func nativeRegister(token: String, deviceName: String) async throws -> Int {
        let r = try await send("POST", "/api/native/register", body: ["token": .string(token), "device_name": .string(deviceName)])
        if r.status == 401 { throw APIError.sessionExpired }
        guard r.json["ok"].isTrue else { throw error(r, fallback: "تعذر تفعيل إشعارات الجهاز.") }
        return r.json["last_id"].int ?? 0
    }

    func nativeUnregister(token: String) async {
        _ = try? await send("DELETE", "/api/native/register", headers: ["X-Yaqoot-Device": token])
    }

    func nativePoll(token: String, since: Int) async throws -> Response {
        try await send("POST", "/api/native/poll", body: ["since": .int(since)], headers: ["X-Yaqoot-Device": token])
    }
}

/// معرّف عملية عشوائي (يُنشأ مرة لكل نموذج ويُعاد استعماله عند إعادة المحاولة).
nonisolated func newClientID() -> String {
    var bytes = [UInt8](repeating: 0, count: 12)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    return bytes.map { String(format: "%02x", $0) }.joined()
}

nonisolated func randomToken() -> String {
    var bytes = [UInt8](repeating: 0, count: 32)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    return bytes.map { String(format: "%02x", $0) }.joined()
}
