#if DEBUG
import Foundation

/// وضع العرض التجريبي للقطات الشاشة في CI فقط (نسخة Debug).
/// يُفعَّل بمعامل التشغيل ‎-YQDemo YES ولا يوجد في نسخة Release أو IPA.
/// البيانات أدناه أمثلة وهمية للعرض، لا تمثل أي محل حقيقي.
enum DemoData {
    static var enabled: Bool { UserDefaults.standard.bool(forKey: "YQDemo") }

    static func response(_ path: String, query: [String: String]) -> JSON {
        let r = query["r"] ?? ""
        switch path {
        case "/api/auth/status", "/api/auth/pin":
            return ["ok": true, "state": "active", "store_name": "محل تجريبي",
                    "employee": ["id": "demo-emp", "name": "مدير العرض", "role": "ADMIN"],
                    "permissions": .array(allPermissions.map { .string($0) })]
        case "/api/push/prefs":
            return ["prefs": ["invoice": true, "debt_added": true, "quiet": true, "quiet_from": "23:30", "quiet_to": "08:00", "invoice_min": 0]]
        case "/api/erp/purchases":
            return ["ok": true, "rows": .array((1...6).map { i in
                ["id": .string("s\(i)"), "name": .string(["مورد الأجهزة", "شركة الإكسسوارات", "موزع الشواحن"][i % 3]), "phone": "07700000000",
                 "balance": .num(Double(i) * 125_000), "purchases_count": .int(i * 2), "purchase_number": .string("P-10\(i)"),
                 "supplier_name": "مورد الأجهزة", "status": "posted", "total_amount": .num(Double(i) * 300_000), "remaining": .num(Double(i % 2) * 50_000),
                 "items_count": .int(i + 2), "created_at": "2026-11-08T09:00:00Z", "actor": "مدير العرض"]
            })]
        default:
            break
        }
        switch r {
        case "dashboard":
            return ["ok": true, "today": "2026-11-09",
                    "sales": ["today_total": 1_845_000, "today_count": 23, "today_paid": 1_610_000, "month_total": 31_420_000, "month_count": 402],
                    "profit": ["today_revenue": 1_845_000, "today_cost": 1_402_000, "month_revenue": 31_420_000, "month_cost": 24_180_000],
                    "debts": ["total": 6_735_000, "debtors": 41], "collected": ["today": 420_000, "month": 3_910_000],
                    "vault_balance": 4_250_000, "expenses": ["today": 65_000, "month": 1_120_000],
                    "repairs": ["open": 12, "ready": 4], "stock": ["low": 7, "out": 2],
                    "series": .array(zip(["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"],
                                         [1_210_000, 980_000, 1_640_000, 1_330_000, 2_050_000, 1_720_000, 1_845_000]).map { d, t in ["day": .string(d), "total": .int(t)] })]
        case "invoices":
            return ["ok": true, "invoices": .array((1...12).map { i in
                ["id": .string("inv\(i)"), "invoice_number": .string("INV-24\(30 + i)"), "customer_name": i % 3 == 0 ? .null : .string(names[i % names.count]),
                 "total_amount": .num(Double(75_000 + i * 18_500)), "paid_amount": .num(i % 4 == 0 ? 50_000 : Double(75_000 + i * 18_500)),
                 "payment_type": i % 4 == 0 ? "DEBT" : "CASH", "created_at": .string("2026-11-09T0\(i % 9):1\(i % 6):00Z"), "actor": "مدير العرض"]
            })]
        case "invoice":
            return ["ok": true, "invoice": ["invoice_number": "INV-2431", "customer_name": "علي حسين", "total_amount": 935_000, "paid_amount": 735_000,
                                             "payment_type": "MIXED", "created_at": "2026-11-09T08:12:00Z", "actor": "مدير العرض"],
                    "items": [["id": "1", "product_name": "Samsung Galaxy A56 256GB", "quantity": 1, "unit_price": 890_000, "discount": 0, "total": 890_000, "serials": ["356789104455221"]],
                              ["id": "2", "product_name": "كفر شفاف + لاصقة", "quantity": 1, "unit_price": 45_000, "discount": 0, "total": 45_000]]]
        case "customers":
            return ["ok": true, "customers": .array(names.enumerated().map { i, n in
                ["id": .string("c\(i)"), "name": .string(n), "phone": .string("0770\(1_000_000 + i * 13_579)"),
                 "balance": .num(Double((names.count - i) * 85_000)), "credit_limit": .num(i % 3 == 0 ? 500_000 : 0)]
            })]
        case "statement":
            return ["ok": true, "customer": ["id": "c0", "name": "علي حسين", "phone": "07701234567", "balance": 425_000, "credit_limit": 500_000],
                    "movements": [["id": "m1", "kind": "invoice", "ref": "INV-2431", "total": 935_000, "paid": 735_000, "at": "2026-11-09T08:12:00Z", "actor": "مدير العرض"],
                                  ["id": "m2", "kind": "payment", "amount": 150_000, "remaining": 225_000, "at": "2026-11-05T12:00:00Z", "actor": "مدير العرض"],
                                  ["id": "m3", "kind": "debt", "amount": 375_000, "remaining": 375_000, "at": "2026-11-01T10:30:00Z", "actor": "مدير العرض", "notes": "اشتراك إنترنت شهرين"]]]
        case "isp":
            return ["ok": true, "summary": ["total": 186, "expired": 9, "soon": 14, "active": 163, "unlinked": 11], "unresolved": 2,
                    "accounts": [["id": "a1", "name": "البرج الرئيسي", "provider": "sas4", "active": true, "subscribers": 186, "last_login_at": "2026-11-09T06:00:00Z"]],
                    "subscribers": .array(names.enumerated().map { i, n in
                        let days = [-3, 0, 2, 5, 12, 21, 27, -10, 1, 30][i % 10]
                        return ["id": .string("s\(i)"), "username": .string("user\(100 + i)"), "display_name": .string(n), "package_name": .string(i % 2 == 0 ? "Fiber 50" : "Fiber 25"),
                                "expires_at": "2026-11-20T00:00:00Z", "days_left": .int(days), "state": .string(days < 0 ? "expired" : days <= 3 ? "soon" : "active"),
                                "price": 35_000, "customer_id": i % 4 == 3 ? .null : .string("c\(i)"), "customer_name": .string(n), "customer_phone": "07701234567",
                                "customer_balance": .num(Double(i % 3) * 35_000), "reseller_name": "البرج الرئيسي",
                                "last_renewal": ["state": "CONFIRMED", "price": 40_000, "paid": 40_000, "until": "2026-11-20", "at": "2026-10-20T10:00:00Z"]]
                    })]
        case "vault":
            return ["ok": true, "balance": 4_250_000, "today": ["in": 1_610_000, "out": 65_000],
                    "entries": .array((1...8).map { i in ["id": .string("e\(i)"), "kind": .string(i % 3 == 0 ? "expense" : "sale"), "direction": .string(i % 3 == 0 ? "out" : "in"),
                                                          "amount": .num(Double(i) * 45_000), "actor": "مدير العرض", "created_at": "2026-11-09T08:00:00Z"] })]
        case "inbox":
            return ["ok": true, "unread": 3, "items": [
                ["id": 3, "kind": "invoice", "title": "فاتورة جديدة INV-2442", "body": "علي حسين • 935,000 د.ع", "created_at": "2026-11-09T08:12:00Z", "read": false, "url": "/#invoices"],
                ["id": 2, "kind": "isp_expiring", "title": "اشتراكات تنتهي خلال 3 أيام", "body": "14 مشتركاً", "created_at": "2026-11-09T06:00:00Z", "read": false, "url": "/#isp"],
                ["id": 1, "kind": "report_daily", "title": "التقرير اليومي", "body": "مبيعات 1,720,000 • ربح 410,000", "created_at": "2026-11-08T20:00:00Z", "read": true, "url": "/#reports"]]]
        default:
            return ["ok": true]
        }
    }

    private static let names = ["علي حسين", "زينب كاظم", "مصطفى عبد الله", "فاطمة جاسم", "حسن علي", "مريم صادق", "كرار محمد", "نور الهدى", "عباس فاضل", "سجاد كريم"]

    private static let allPermissions = [
        "dashboard", "dashboard.profit", "pos", "customers", "customers.edit", "customers.debt_addition", "customers.payment", "customers.waiver",
        "inventory", "shortages", "vaults", "vaults.deposit", "vaults.withdraw", "expenses", "expenses.create", "purchase.view", "repairs", "repairs.status",
        "returns", "shipping", "employees", "employees.permissions", "network", "network.devices",
    ]
}
#endif
