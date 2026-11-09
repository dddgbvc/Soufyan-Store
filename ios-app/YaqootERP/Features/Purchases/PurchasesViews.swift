import SwiftUI

/// المشتريات: قراءة فقط عبر دوال قسم الشراء (purchase_list) بصلاحية purchase.view.
/// إنشاء فاتورة شراء أو تسديد مورد يبقى في برنامج المكتب لأنه يحرّك المخزون والخزنة.
struct PurchasesView: View {
    @State private var model = Paged(listKey: "rows", filter: "",
                                     cursor: { _, n in ["offset": String(n)] }) { p in try await API.shared.purchases("purchases", p) }

    var body: some View {
        PagedList(model: model, searchPrompt: "رقم الفاتورة أو المورد…",
                  filters: [("", "الكل"), ("status=posted", "مُرحّلة"), ("status=cancelled", "ملغاة")],
                  empty: "لا توجد مشتريات") { r in
            let rest = r["remaining"].num
            RowView(icon: "cart", color: Yq.deepGold, title: r["supplier_name"].string ?? "مورد",
                    subtitle: "\(r["purchase_number"].text) • \(r["items_count"].text) صنف • \(Fmt.when(r["created_at"]))\(r["actor"].isNull ? "" : " • \(r["actor"].text)")",
                    value: Fmt.iqd(r["total_amount"]),
                    pill: r["status"].text == "cancelled" ? ("ملغاة", Yq.red) : rest > 0 ? ("متبقي \(Fmt.money(rest))", Yq.amber) : ("مسددة", Yq.green))
        }
    }
}

struct SuppliersView: View {
    @State private var model = Paged(listKey: "rows", filter: "") { p in
        var q = p
        if q["only_debt"] != nil { q["only_debt"] = "1" }
        return try await API.shared.purchases("suppliers", q)
    }

    var body: some View {
        PagedList(model: model, searchPrompt: "اسم المورد أو الشركة أو الهاتف…",
                  filters: [("", "الكل"), ("only_debt=1", "لهم رصيد")], empty: "لا يوجد موردون",
                  header: { m in
                      let rows = m["rows"].array
                      KPIGrid {
                          KPITile(label: "المستحق للموردين", value: Fmt.iqd(rows.reduce(0) { $0 + max(0, $1["balance"].num) }),
                                  icon: "truck.box", color: Yq.deepGold, hint: "\(rows.filter { $0["balance"].num > 0 }.count) مورد")
                      }
                      .listRowBackground(Color.clear)
                  }) { r in
            NavigationLink(value: SupplierRef(id: r.id, name: r["name"].text)) {
                RowView(avatarText: r["name"].text, color: Yq.deepGold, title: r["name"].text,
                        subtitle: [r["company"].string, r["phone"].string, "\(r["purchases_count"].text) فاتورة شراء"].compactMap { $0 }.joined(separator: " • "),
                        value: Fmt.iqd(r["balance"]), valueColor: r["balance"].num > 0 ? Yq.deepGold : nil)
            }
        }
        .navigationDestination(for: SupplierRef.self) { SupplierPaymentsView(ref: $0) }
    }
}

struct SupplierRef: Hashable { let id: String; let name: String }

struct SupplierPaymentsView: View {
    let ref: SupplierRef
    var body: some View {
        RemoteView(load: { try await API.shared.purchases("supplier_payments", ["supplier_id": ref.id, "limit": "100"]) }) { d, _ in
            List {
                if d["rows"].array.isEmpty { Text("لا توجد دفعات مسجلة").foregroundStyle(.secondary) }
                ForEach(d["rows"].array.records) { p in
                    RowView(icon: "arrow.up.right", color: Yq.green, title: "دفعة \(Fmt.iqd(p["amount_paid"]))",
                            subtitle: "\(Fmt.when(p["created_at"])) • \(p["actor"].text)"
                                + (p["waived_amount"].num > 0 ? " • خصم \(Fmt.money(p["waived_amount"]))" : "")
                                + (p["notes"].isNull ? "" : "\n\(p["notes"].text)"),
                            value: "الباقي \(Fmt.money(p["remaining_balance"]))")
                }
            }
            .yaqootBackground()
            .navigationTitle(ref.name)
        }
    }
}
