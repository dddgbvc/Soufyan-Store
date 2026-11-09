import CryptoKit
import Foundation
import Security
import Synchronization

/// تكامل شبكة محفوظ على هذا الجهاز فقط. السر (كلمة مرور/رمز API) في Keychain وليس في الملفات أو الشيفرة.
/// الأجهزة داخل شبكة المكتب أو عبر VPN (WireGuard/IPsec) — لا نفتح منافذ الإدارة للإنترنت.
nonisolated struct Integration: Codable, Identifiable, Hashable, Sendable {
    enum Kind: String, Codable, CaseIterable, Sendable {
        case mikrotik, uispNMS, uispCRM
        var label: String {
            switch self {
            case .mikrotik: "MikroTik RouterOS"
            case .uispNMS: "UISP Network"
            case .uispCRM: "UISP CRM"
            }
        }
        var icon: String {
            switch self {
            case .mikrotik: "server.rack"
            case .uispNMS: "antenna.radiowaves.left.and.right"
            case .uispCRM: "person.crop.rectangle.stack"
            }
        }
    }

    var id = UUID()
    var kind: Kind
    var name: String
    var baseURL: String
    var username: String = ""
    /// بصمة SHA-256 لشهادة الجهاز (ثقة عند أول اتصال بعد موافقة المستخدم).
    var pinnedSHA256: String?

    var secretAccount: String { "int-\(id.uuidString)" }
}

@Observable
final class IntegrationStore {
    static let shared = IntegrationStore()
    private let key = "integrations.v1"
    private(set) var items: [Integration] = []

    private init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let list = try? JSONDecoder().decode([Integration].self, from: data) { items = list }
    }

    func save(_ i: Integration, secret: String?) {
        if let idx = items.firstIndex(where: { $0.id == i.id }) { items[idx] = i } else { items.append(i) }
        if let secret, !secret.isEmpty { Keychain.set(secret, for: i.secretAccount) }
        persist()
    }

    func remove(_ i: Integration) {
        items.removeAll { $0.id == i.id }
        Keychain.delete(i.secretAccount)
        persist()
    }

    func secret(_ i: Integration) -> String? { Keychain.get(i.secretAccount) }

    private func persist() {
        if let data = try? JSONEncoder().encode(items) { UserDefaults.standard.set(data, forKey: key) }
    }
}

nonisolated enum NetError: LocalizedError {
    case untrusted(fingerprint: String)
    case http(Int, String)
    case badURL
    case missingSecret
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .untrusted(let fp): "شهادة الجهاز غير موثوقة بعد. البصمة: \(fp)"
        case .http(let code, let msg): code == 401 ? "اسم المستخدم أو كلمة المرور/الرمز غير صحيح." : "خطأ \(code): \(msg)"
        case .badURL: "العنوان غير صحيح. استعمل https://"
        case .missingSecret: "لم يُحفظ السر في Keychain لهذا التكامل."
        case .transport(let m): "تعذر الوصول للجهاز. تأكد أنك على شبكة المكتب أو VPN. (\(m))"
        }
    }
}

/// ثقة الشهادة عند أول اتصال (TOFU) مع تثبيت البصمة: أجهزة MikroTik/UISP غالباً بشهادات ذاتية التوقيع.
/// • إن وُجدت بصمة محفوظة: لا يُقبل إلا تطابقها.
/// • إن لم توجد: تُقبل الشهادة الموثوقة من النظام، وتُرفض غيرها مع إظهار بصمتها للمستخدم ليوافق.
nonisolated final class PinningDelegate: NSObject, URLSessionDelegate, Sendable {
    let pinned: String?
    let seen = Mutex<String?>(nil)

    init(pinned: String?) { self.pinned = pinned }

    static func fingerprint(_ trust: SecTrust) -> String? {
        guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate], let leaf = chain.first else { return nil }
        let der = SecCertificateCopyData(leaf) as Data
        return SHA256.hash(data: der).map { String(format: "%02X", $0) }.joined(separator: ":")
    }

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge)
        async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust, let fp = Self.fingerprint(trust) else {
            return (.performDefaultHandling, nil)
        }
        seen.withLock { $0 = fp }
        if let pinned {
            return pinned == fp ? (.useCredential, URLCredential(trust: trust)) : (.cancelAuthenticationChallenge, nil)
        }
        return SecTrustEvaluateWithError(trust, nil) ? (.performDefaultHandling, nil) : (.cancelAuthenticationChallenge, nil)
    }
}

/// طلب HTTP مشترك للتكاملات مع TOFU ومهلة قصيرة.
nonisolated func integrationRequest(_ i: Integration, path: String, method: String = "GET", headers: [String: String],
                                    body: Data? = nil) async throws -> Data {
    guard i.baseURL.hasPrefix("https://"), let url = URL(string: i.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) else {
        throw NetError.badURL
    }
    var req = URLRequest(url: url, timeoutInterval: 12)
    req.httpMethod = method
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
    if let body { req.httpBody = body; req.setValue("application/json", forHTTPHeaderField: "Content-Type") }

    let delegate = PinningDelegate(pinned: i.pinnedSHA256)
    let cfg = URLSessionConfiguration.ephemeral
    cfg.timeoutIntervalForRequest = 12
    let session = URLSession(configuration: cfg, delegate: delegate, delegateQueue: nil)
    defer { session.finishTasksAndInvalidate() }
    do {
        let (data, resp) = try await session.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            let msg = (try? JSONDecoder().decode(JSON.self, from: data))?["message"].string ?? String(decoding: data.prefix(200), as: UTF8.self)
            throw NetError.http(code, msg)
        }
        return data
    } catch let e as NetError {
        throw e
    } catch {
        if let fp = delegate.seen.withLock({ $0 }), i.pinnedSHA256 != fp, (error as? URLError)?.code == .cancelled
            || (error as? URLError)?.code == .serverCertificateUntrusted || (error as? URLError)?.code == .secureConnectionFailed {
            throw NetError.untrusted(fingerprint: fp)
        }
        throw NetError.transport((error as? URLError)?.localizedDescription ?? error.localizedDescription)
    }
}

/// MikroTik RouterOS v7 REST API (/rest) — الخدمة www-ssl على الجهاز، بمستخدم صلاحياته قراءة فقط (group=read) يُنصح به.
/// المرجع: https://help.mikrotik.com/docs/spaces/ROS/pages/47579162/REST+API
nonisolated struct RouterOS: Sendable {
    let integration: Integration
    let password: String

    private var auth: [String: String] {
        let token = Data("\(integration.username):\(password)".utf8).base64EncodedString()
        return ["Authorization": "Basic \(token)"]
    }

    func get(_ path: String) async throws -> JSON {
        let data = try await integrationRequest(integration, path: "/rest" + path, headers: auth)
        return (try? JSONDecoder().decode(JSON.self, from: data)) ?? .null
    }

    func post(_ path: String, _ body: JSON) async throws -> JSON {
        let data = try await integrationRequest(integration, path: "/rest" + path, method: "POST", headers: auth,
                                                body: try JSONEncoder().encode(body))
        return (try? JSONDecoder().decode(JSON.self, from: data)) ?? .null
    }

    func resource() async throws -> JSON { try await get("/system/resource") }
    func identity() async throws -> JSON { try await get("/system/identity") }
    func interfaces() async throws -> JSON { try await get("/interface") }
    func logs() async throws -> JSON { try await get("/log") }
    func dhcpLeases() async throws -> JSON { try await get("/ip/dhcp-server/lease") }
    func pppActive() async throws -> JSON { try await get("/ppp/active") }
    func hotspotActive() async throws -> JSON { try await get("/ip/hotspot/active") }
    func queues() async throws -> JSON { try await get("/queue/simple") }
    /// اكتشاف الأجهزة المجاورة (MNDP/CDP/LLDP): قطاعات وNanoStation وCPE وغيرها.
    func neighbors() async throws -> JSON { try await get("/ip/neighbor") }
    func ping(_ address: String, count: Int = 4) async throws -> JSON {
        try await post("/ping", ["address": .string(address), "count": .string(String(count))])
    }
    func traffic(_ interface: String) async throws -> JSON {
        try await post("/interface/monitor-traffic", ["interface": .string(interface), "once": .string("")])
    }
}

/// UISP Network (NMS) API v2.1 — رأس x-auth-token.
/// المرجع: https://<uisp>/nms/api-docs
nonisolated struct UISPNetwork: Sendable {
    let integration: Integration
    let token: String
    private var headers: [String: String] { ["x-auth-token": token] }

    func get(_ path: String) async throws -> JSON {
        let data = try await integrationRequest(integration, path: "/nms/api/v2.1" + path, headers: headers)
        return (try? JSONDecoder().decode(JSON.self, from: data)) ?? .null
    }

    func devices() async throws -> JSON { try await get("/devices") }
    func sites() async throws -> JSON { try await get("/sites") }
    func outages() async throws -> JSON { try await get("/outages?count=50&page=1") }
}

/// UISP CRM API v1.0 — رأس X-Auth-App-Key (مفتاح تطبيق بصلاحية قراءة).
/// المرجع: https://<uisp>/crm/api-docs
nonisolated struct UISPCRM: Sendable {
    let integration: Integration
    let key: String
    private var headers: [String: String] { ["X-Auth-App-Key": key] }

    func get(_ path: String) async throws -> JSON {
        let data = try await integrationRequest(integration, path: "/crm/api/v1.0" + path, headers: headers)
        return (try? JSONDecoder().decode(JSON.self, from: data)) ?? .null
    }

    func clients(query: String = "") async throws -> JSON {
        try await get("/clients?limit=100" + (query.isEmpty ? "" : "&query=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"))
    }
    func services() async throws -> JSON { try await get("/clients/services?limit=200") }
}
