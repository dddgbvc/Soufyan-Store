import ContactsUI
import SwiftUI

/// أقسام إضافية في ملف الزبون: اشتراكات الإنترنت، تقسيم الديون، ورسائل واتساب.
struct CustomerExtras: View {
    let isp: JSON?
    let wa: JSON?

    var body: some View {
        if let subs = isp?["subscriptions"].array, !subs.isEmpty {
            SwiftUI.Section("اشتراكات الإنترنت") {
                ForEach(subs.records) { s in
                    let st = (Fmt.parse(s["expires_at"].string).map { $0 < Date() } ?? false) ? "expired" : "active"
                    RowView(icon: "wifi.router", color: stateColor(st), title: s["username"].text,
                            subtitle: "\(s["package_name"].text) • ينتهي \(Fmt.dateOnly(s["expires_at"]))",
                            pill: (stateLabel(st), stateColor(st)))
                }
                let debts = isp?["debts"] ?? .null
                if !debts.isNull {
                    LabeledContent("ديون الإنترنت", value: Fmt.iqd(debts["isp_outstanding"]))
                    LabeledContent("ديون أخرى", value: Fmt.iqd(debts["other_outstanding"]))
                }
            }
        }
        if let items = wa?["items"].array, !items.isEmpty {
            SwiftUI.Section("رسائل واتساب") {
                ForEach(items.records.prefix(10)) { m in MessageRow(m: m.json) }
            }
        }
    }
}

/// تعديل هاتف الزبون: من جهات الاتصال أو يدوياً.
struct PhoneEditSheet: View {
    let customer: JSON
    @State private var phone = ""
    @State private var picking = false

    var body: some View {
        OperationSheet(
            title: customer["phone"].text.isEmpty ? "إضافة هاتف" : "تعديل الهاتف",
            subtitle: customer["name"].text,
            confirmTitle: "حفظ الرقم \(phone)؟",
            confirmMessage: { "يُستعمل للاتصال وواتساب والتذكيرات." },
            canSubmit: phone.filter(\.isNumber).count >= 10,
            submit: {
                let r = try await API.shared.act("customer_phone", ["customer_id": customer["id"], "phone": .string(phone)])
                return "حُفظ الرقم \(r["phone"].text)"
            }
        ) {
            SwiftUI.Section {
                TextField("07XXXXXXXXX", text: $phone)
                    .keyboardType(.phonePad).textContentType(.telephoneNumber)
                    .environment(\.layoutDirection, .leftToRight)
                Button { picking = true } label: { Label("اختيار من جهات الاتصال", systemImage: "person.crop.circle") }
            }
        }
        .onAppear { if phone.isEmpty { phone = customer["phone"].text } }
        .sheet(isPresented: $picking) {
            ContactPhonePicker { picked in
                picking = false
                if let picked { phone = picked }
            }
            .ignoresSafeArea()
        }
    }
}

/// منتقي جهات الاتصال من النظام (لا يحتاج إذناً للوصول لكل جهات الاتصال).
struct ContactPhonePicker: UIViewControllerRepresentable {
    let done: (String?) -> Void

    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let vc = CNContactPickerViewController()
        vc.delegate = context.coordinator
        vc.displayedPropertyKeys = [CNContactPhoneNumbersKey]
        vc.predicateForEnablingContact = NSPredicate(format: "phoneNumbers.@count > 0")
        return vc
    }

    func updateUIViewController(_ vc: CNContactPickerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    final class Coordinator: NSObject, CNContactPickerDelegate {
        let done: (String?) -> Void
        init(done: @escaping (String?) -> Void) { self.done = done }

        func contactPicker(_ picker: CNContactPickerViewController, didSelect contactProperty: CNContactProperty) {
            done((contactProperty.value as? CNPhoneNumber)?.stringValue)
        }
        func contactPickerDidCancel(_ picker: CNContactPickerViewController) { done(nil) }
    }
}
