import SwiftUI

/// الموظفون وأدوارهم. تعديل الصلاحيات والرموز يبقى في برنامج المكتب (employees.permissions).
struct EmployeesView: View {
    @State private var model = Paged.erp("employees", listKey: "employees")
    var body: some View {
        PagedList(model: model) { r in
            let name = r["display_name"].string ?? r["name"].text
            let active = r["status"].text == "active"
            RowView(avatarText: name, color: active ? Yq.teal : .gray, title: name,
                    subtitle: "\(Fmt.role(r["role"])) • آخر ظهور \(Fmt.when(r["last_seen_at"]))\n\(r["has_pin"].isTrue ? "رمز PIN مضبوط" : "بدون رمز")",
                    pill: (active ? "نشط" : "موقوف", active ? Yq.green : Yq.red))
        }
    }
}

struct SessionsView: View {
    @State private var model = Paged.erp("sessions", listKey: "sessions")
    var body: some View {
        PagedList(model: model) { r in
            let open = r["closed_at"].isNull
            RowView(icon: r["kind"].text == "web" ? "iphone.gen3" : "desktopcomputer", color: open ? Yq.green : Yq.blue,
                    title: r["employee_name"].string ?? "—",
                    subtitle: "\(r["kind"].text == "web" ? "ويب/تطبيق" : "برنامج المكتب") • \(r["device_name"].string ?? r["os"].text)\nآخر نشاط \(Fmt.when(r["last_seen_at"]))",
                    pill: r["is_current"].isTrue ? ("جلستك", Yq.green) : open ? ("نشطة", Yq.amber) : ("مغلقة", Yq.blue))
        }
    }
}

/// سجل العمليات: كل حركة في المحل من أي جهاز، بصياغة عربية (web_activity_feed).
/// للمدير العام ومن لديه صلاحية employees.permissions فقط — الخادم يفرض ذلك.
struct ActivityView: View {
    @State private var model = Paged(listKey: "items", pageSize: 60, cursor: { last, _ in ["before": last["id"].text] }) { p in
        var q = p
        q["actor"] = q.removeValue(forKey: "q")
        return try await API.shared.get("activity", q)
    }

    var body: some View {
        PagedList(model: model, searchPrompt: "اسم الموظف…") { r in
            let meta = sectionMeta(r["section"].text)
            RowView(icon: meta.0, color: meta.1, title: r["title"].text,
                    subtitle: "\(r["body"].text)\n\(r["actor"].text) • \(Fmt.when(r["at"]))\(r["device"].isNull ? "" : " • \(r["device"].text)")")
        }
    }

    private func sectionMeta(_ s: String) -> (String, Color) {
        switch s {
        case "invoices", "pos": ("doc.text", Yq.teal)
        case "customers", "debts": ("person.2.wave.2", Yq.deepGold)
        case "vault", "expenses": ("building.columns", Yq.purple)
        case "products", "inventory", "shortages": ("shippingbox", Yq.amber)
        case "repairs": ("wrench.and.screwdriver", Yq.blue)
        case "isp", "internet": ("wifi", Yq.blue)
        case "employees": ("person.badge.key", Yq.red)
        default: ("clock", .gray)
        }
    }
}
