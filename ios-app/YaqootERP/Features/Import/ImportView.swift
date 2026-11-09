import CoreTransferable
import SwiftUI
import UniformTypeIdentifiers
import UIKit
import VisionKit

/// ملف مُسقط بالسحب والإفلات (آيباد) — يُنسخ لمجلد مؤقت مع اسمه الأصلي.
nonisolated struct DroppedFile: Transferable, Sendable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .item) { received in
            let dest = FileManager.default.temporaryDirectory.appendingPathComponent(received.file.lastPathComponent)
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.copyItem(at: received.file, to: dest)
            return DroppedFile(url: dest)
        }
    }
}

/// حالة الاستيراد: قراءة ← ربط الأعمدة ← معاينة وكشف التكرار ← تأكيد ← تنفيذ آمن ضد التكرار.
@Observable
final class ImportModel {
    enum Stage { case pick, preview, running, done }
    enum Outcome: Equatable { case created, linked, debtAdded, replayed, skipped, failed(String) }

    var stage: Stage = .pick
    var grid: Grid = []
    var source = ""
    var headerIndex: Int?
    var mapping: [ImportField] = []
    var rows: [ImportRow] = []
    var error: String?
    var reading = false
    var checking = false
    var checked = 0
    var progress = 0
    var outcomes: [Int: Outcome] = [:]

    var included: [ImportRow] { rows.filter(\.include) }
    var totalDebt: Double { included.reduce(0) { $0 + $1.debt } }
    var columns: Int { grid.map(\.count).max() ?? 0 }
    var header: [String] {
        guard let h = headerIndex, grid.indices.contains(h) else { return (0..<columns).map { "عمود \($0 + 1)" } }
        return (0..<columns).map { $0 < grid[h].count && !grid[h][$0].isEmpty ? grid[h][$0] : "عمود \($0 + 1)" }
    }

    func load(url: URL) async {
        reading = true
        error = nil
        defer { reading = false }
        do {
            let (g, note) = try await TableFile.read(url: url)
            set(grid: g, source: "\(url.lastPathComponent) • \(note)")
        } catch {
            self.error = error.localizedDescription
        }
    }

    func load(images: [UIImage]) async {
        reading = true
        error = nil
        defer { reading = false }
        do {
            var all: Grid = []
            for img in images { all += try await OCR.grid(from: img) }
            set(grid: all, source: "مسح بالكاميرا • \(images.count) صفحة (OCR)")
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func set(grid g: Grid, source s: String) {
        guard !g.isEmpty else { error = ImportError.empty.localizedDescription; return }
        grid = g
        source = s
        headerIndex = Normalizer.headerRow(g)
        let base = headerIndex.map { g[$0] } ?? []
        var m = Normalizer.guessMapping(base)
        if m.count < columns { m += Array(repeating: .ignore, count: columns - m.count) }
        mapping = m
        remap()
        stage = .preview
    }

    func remap() {
        rows = Normalizer.rows(grid, mapping: mapping, headerIndex: headerIndex)
        checked = 0
        Task { await checkExisting() }
    }

    /// يبحث عن كل شخص في زبائن ياقوت (بالهاتف ثم بالاسم المطابق) لعرض التكرار قبل التنفيذ.
    func checkExisting() async {
        guard !checking else { return }
        checking = true
        defer { checking = false }
        var cache: [String: JSON?] = [:]
        for idx in rows.indices {
            let r = rows[idx]
            guard r.duplicateOfRow == nil, r.isValid else { checked += 1; continue }
            let key = r.personKey
            if cache[key] == nil {
                let term = r.phone.isEmpty ? r.name : r.phone
                let found = try? await API.shared.get("customers", ["q": term, "limit": "5"])
                let match = found?["customers"].array.first { c in
                    if !r.phone.isEmpty {
                        let p = Normalizer.phone(c["phone"].text) ?? ""
                        return p.suffix(10) == r.phone.suffix(10)
                    }
                    return Normalizer.normalizeName(c["name"].text) == Normalizer.normalizeName(r.name)
                }
                cache[key] = .some(match)
            }
            if case .some(.some(let c)) = cache[key], idx < rows.count {
                rows[idx].existingID = c["id"].text
                rows[idx].existingName = c["name"].text
                rows[idx].existingBalance = c["balance"].num
            }
            checked += 1
        }
    }

    /// تنفيذ متسلسل. كل عملية بمعرّف مشتق من المحتوى، فإعادة التشغيل أو رفع الملف مرة ثانية آمنة.
    func commit() async {
        stage = .running
        progress = 0
        let canCreate = AppState.shared.can("customers.edit")
        let canDebt = AppState.shared.can("customers.debt_addition")
        for r in included {
            // إعادة التشغيل: نتجاوز ما نجح سابقاً ونعيد الفاشل فقط (والمعرّفات الثابتة تمنع التكرار في كل الأحوال).
            if let o = outcomes[r.id] {
                if case .failed = o {} else { progress += 1; continue }
            }
            do {
                var customerID = r.existingID
                var outcome: Outcome = .linked
                if customerID == nil {
                    guard canCreate else { outcomes[r.id] = .failed("لا تملك صلاحية إضافة زبائن"); progress += 1; continue }
                    let res = try await API.shared.act("customer_create", [
                        "name": .string(r.name), "phone": .string(r.phone), "address": "", "credit_limit": 0, "opening_debt": 0,
                        "notes": .string(Normalizer.customerNote(r, source: source)), "allow_duplicate": false,
                        "client_id": .string(Normalizer.customerClientID(r)),
                    ])
                    if res["reason"].string == "duplicate" {
                        customerID = res["existing"]["id"].string
                        outcome = .linked
                    } else {
                        customerID = res["customer"]["id"].string
                        outcome = res["replayed"].isTrue ? .replayed : .created
                    }
                }
                if r.debt > 0, let id = customerID {
                    guard canDebt else { outcomes[r.id] = .failed("لا تملك صلاحية إضافة دين"); progress += 1; continue }
                    let d = try await API.shared.act("debt_add", [
                        "customer_id": .string(id), "amount": .num(r.debt),
                        "notes": .string(["استيراد كشف", r.reference, r.expiry.isEmpty ? "" : "انتهاء \(r.expiry)"].filter { !$0.isEmpty }.joined(separator: " • ")),
                        "client_id": .string(Normalizer.debtClientID(r)),
                    ])
                    outcome = (d["replayed"].isTrue || d["reason"].string == "duplicate") ? .replayed : .debtAdded
                }
                outcomes[r.id] = outcome
            } catch APIError.sessionExpired {
                AppState.shared.expire()
                return
            } catch {
                outcomes[r.id] = .failed(error.localizedDescription)
            }
            progress += 1
        }
        stage = .done
        AppState.shared.refreshTick += 1
    }

    func reset() {
        self.grid = []
        rows = []
        mapping = []
        outcomes = [:]
        error = nil
        stage = .pick
    }
}

/// استيراد كشوفات المشتركين والديون: PDF نصي أو ممسوح، Excel (xlsx)، CSV، صور، أو مسح بالكاميرا.
struct ImportView: View {
    @State private var model = ImportModel()
    @State private var picking = false
    @State private var scanning = false
    @State private var confirming = false
    @State private var dropTargeted = false

    private var types: [UTType] {
        [.pdf, .commaSeparatedText, .tabSeparatedText, .plainText, .image,
         UTType(filenameExtension: "xlsx") ?? .data, UTType(filenameExtension: "xls") ?? .data]
    }

    var body: some View {
        Group {
            switch model.stage {
            case .pick: pick
            case .preview: preview
            case .running, .done: results
            }
        }
        .background { YaqootBackground() }
        .fileImporter(isPresented: $picking, allowedContentTypes: types) { result in
            if case .success(let url) = result { Task { await model.load(url: url) } }
        }
        .fullScreenCover(isPresented: $scanning) {
            DocumentScanner { images in
                scanning = false
                if !images.isEmpty { Task { await model.load(images: images) } }
            }
            .ignoresSafeArea()
        }
    }

    // MARK: اختيار المصدر

    private var pick: some View {
        ScrollView {
            VStack(spacing: 18) {
                GlassPanel(tint: dropTargeted ? Yq.teal : nil, radius: 28, padding: 28) {
                    VStack(spacing: 14) {
                        Image(systemName: "doc.viewfinder").font(.system(size: 54)).foregroundStyle(Yq.teal)
                            .symbolEffect(.bounce, value: dropTargeted)
                        Text("استيراد كشف مشتركين أو ديون").font(.title2.bold())
                        Text("PDF نصي أو ممسوح، Excel ‏(xlsx)، CSV، أو صورة. معاينة كاملة قبل أي حفظ، ولا يتكرر زبون أو دين عند رفع نفس الملف مرة ثانية.")
                            .multilineTextAlignment(.center).foregroundStyle(.secondary)
                        if model.reading { ProgressView("جارٍ القراءة…") }
                        if let e = model.error { Label(e, systemImage: "exclamationmark.triangle").foregroundStyle(Yq.red) }
                    }
                    .frame(maxWidth: .infinity)
                }
                .dropDestination(for: DroppedFile.self) { files, _ in
                    guard let f = files.first else { return false }
                    Task { await model.load(url: f.url) }
                    return true
                } isTargeted: { dropTargeted = $0 }

                GlassEffectContainer(spacing: 12) {
                    HStack(spacing: 12) {
                        Button { picking = true } label: { Label("اختيار ملف", systemImage: "folder").frame(maxWidth: .infinity) }
                            .buttonStyle(.glassProminent).tint(Yq.teal)
                        if VNDocumentCameraViewController.isSupported {
                            Button { scanning = true } label: { Label("مسح بالكاميرا", systemImage: "camera.viewfinder").frame(maxWidth: .infinity) }
                                .buttonStyle(.glass)
                        }
                    }
                    .controlSize(.large)
                }
                .disabled(model.reading)

                GlassPanel {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("ما الذي يُحفظ؟", systemImage: "info.circle").font(.headline)
                        Text("• زبون جديد لمن لا يوجد في ياقوت (يُطابق بالهاتف ثم بالاسم).")
                        Text("• الدين المستحق يُضاف عبر نفس خدمة «إضافة دين» بصلاحياتك وسقف الدين.")
                        Text("• اسم المستخدم والباقة والانتهاء تُحفظ كملاحظة للمرجعية فقط، ولا تُخلط برقم الزبون.")
                        Text("• لا تُغيَّر أي أسعار ولا يُجدَّد أي اشتراك.")
                    }
                    .font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .padding()
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: المعاينة

    private var preview: some View {
        List {
            SwiftUI.Section {
                LabeledContent("المصدر", value: model.source)
                LabeledContent("الصفوف", value: "\(model.rows.count) • المحدد \(model.included.count)")
                LabeledContent("مجموع الديون المحددة", value: Fmt.iqd(model.totalDebt))
                if model.checking {
                    ProgressView(value: Double(model.checked), total: Double(max(1, model.rows.count))) {
                        Text("مطابقة مع زبائن ياقوت…")
                    }
                }
            }
            SwiftUI.Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(0..<model.columns, id: \.self) { c in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(model.header[c]).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                Menu {
                                    Picker("", selection: Binding(get: { c < model.mapping.count ? model.mapping[c] : .ignore },
                                                                  set: { model.mapping[c] = $0; model.remap() })) {
                                        ForEach(ImportField.allCases) { Text($0.label).tag($0) }
                                    }
                                } label: {
                                    Text((c < model.mapping.count ? model.mapping[c] : .ignore).label)
                                        .font(.subheadline.weight(.semibold))
                                        .padding(.horizontal, 10).padding(.vertical, 6)
                                }
                                .glassEffect(.regular.tint((c < model.mapping.count && model.mapping[c] != .ignore) ? Yq.teal.opacity(0.3) : .clear).interactive(),
                                             in: .capsule)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                Toggle("الصف الأول عناوين", isOn: Binding(get: { model.headerIndex != nil },
                                                         set: { model.headerIndex = $0 ? 0 : nil; model.remap() }))
            } header: {
                Text("ربط الأعمدة")
            } footer: {
                Text("خمّن التطبيق الأعمدة من العناوين. صحّح أي عمود قبل المتابعة.")
            }
            SwiftUI.Section("المعاينة") {
                ForEach($model.rows) { $r in
                    Toggle(isOn: $r.include) { ImportRowView(r: r) }
                        .disabled(!r.isValid)
                }
            }
        }
        .yaqootBackground()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { model.reset() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("استيراد \(model.included.count)") { confirming = true }
                    .disabled(model.included.isEmpty || model.checking)
            }
        }
        .confirmationDialog("تأكيد الاستيراد", isPresented: $confirming, titleVisibility: .visible) {
            Button("استيراد \(model.included.count) صف") { Task { await model.commit() } }
            Button("مراجعة", role: .cancel) {}
        } message: {
            let newCount = model.included.filter { $0.existingID == nil }.count
            Text("زبائن جدد: \(newCount) • على زبائن موجودين: \(model.included.count - newCount)\nديون بمجموع \(Fmt.iqd(model.totalDebt)). تُسجّل كل العمليات باسمك، ويمكن إعادة التنفيذ بأمان دون تكرار.")
        }
    }

    // MARK: النتائج

    private var results: some View {
        List {
            SwiftUI.Section {
                ProgressView(value: Double(model.progress), total: Double(max(1, model.included.count))) {
                    Text(model.stage == .done ? "اكتمل الاستيراد" : "جارٍ التنفيذ… \(model.progress) من \(model.included.count)")
                }
                if model.stage == .done {
                    let failed = model.outcomes.values.filter { if case .failed = $0 { return true }; return false }.count
                    LabeledContent("ناجح", value: "\(model.outcomes.count - failed)")
                    LabeledContent("فشل", value: "\(failed)")
                    HStack {
                        if failed > 0 {
                            Button("إعادة المحاولة للفاشل") { Task { await model.commit() } }.buttonStyle(.glassProminent).tint(Yq.teal)
                        }
                        Button("استيراد ملف آخر") { model.reset() }.buttonStyle(.glass)
                    }
                }
            }
            SwiftUI.Section("التفاصيل") {
                ForEach(model.included) { r in
                    HStack {
                        ImportRowView(r: r)
                        Spacer()
                        outcomeBadge(model.outcomes[r.id])
                    }
                }
            }
        }
        .yaqootBackground()
    }

    @ViewBuilder private func outcomeBadge(_ o: ImportModel.Outcome?) -> some View {
        switch o {
        case .none: ProgressView()
        case .created: Pill("زبون جديد", color: Yq.green)
        case .linked: Pill("زبون موجود", color: Yq.blue)
        case .debtAdded: Pill("أُضيف الدين", color: Yq.green)
        case .replayed: Pill("سبق استيراده", color: .gray)
        case .skipped: Pill("تُخطّي", color: .gray)
        case .failed(let m): Pill(m, color: Yq.red)
        }
    }
}

struct ImportRowView: View {
    let r: ImportRow
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(r.name.isEmpty ? "—" : r.name).font(.body.weight(.semibold))
                if r.debt > 0 { Text(Fmt.iqd(r.debt)).font(.callout.monospacedDigit()).foregroundStyle(Yq.deepGold) }
            }
            Text([r.phone, r.username, r.package, r.expiry.isEmpty ? "" : "ينتهي \(r.expiry)"].filter { !$0.isEmpty }.joined(separator: " • "))
                .font(.caption).foregroundStyle(.secondary)
            if let n = r.existingName {
                Label("موجود: \(n) • رصيده \(Fmt.money(r.existingBalance ?? 0))", systemImage: "person.crop.circle.badge.checkmark")
                    .font(.caption).foregroundStyle(Yq.blue)
            }
            if let d = r.duplicateOfRow { Label("مكرر في الملف (الصف \(d + 1))", systemImage: "doc.on.doc").font(.caption).foregroundStyle(Yq.amber) }
            ForEach(r.issues, id: \.self) { Label($0, systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(Yq.red) }
        }
    }
}

/// ماسح المستندات من VisionKit (تصحيح المنظور تلقائياً).
struct DocumentScanner: UIViewControllerRepresentable {
    let done: ([UIImage]) -> Void

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: VNDocumentCameraViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let done: ([UIImage]) -> Void
        init(done: @escaping ([UIImage]) -> Void) { self.done = done }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            done((0..<scan.pageCount).map { scan.imageOfPage(at: $0) })
        }
        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { done([]) }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) { done([]) }
    }
}
