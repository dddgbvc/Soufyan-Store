import SwiftUI

/// شعار ياقوت: جوهرة على زجاج بلون العلامة.
struct BrandMark: View {
    var size: CGFloat = 84
    var body: some View {
        Image(systemName: "diamond.fill")
            .font(.system(size: size * 0.44, weight: .semibold))
            .foregroundStyle(LinearGradient(colors: [Yq.gold, Yq.deepGold], startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: size, height: size)
            .glassEffect(.regular.tint(Yq.teal.opacity(0.55)), in: .rect(cornerRadius: size * 0.28))
            .accessibilityLabel("ياقوت")
    }
}

/// شاشة ترحيب قصيرة وأنيقة تظهر عند أول تشغيل فقط.
struct WelcomeView: View {
    let done: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var step = 0
    @Namespace private var ns

    private let points: [(String, String, String)] = [
        ("chart.line.uptrend.xyaxis", "كل المحل في جيبك", "المبيعات والديون والخزنة والمخزون لحظة بلحظة."),
        ("wifi", "الإنترنت والشبكة", "المشتركون والانتهاء وأجهزة MikroTik وUISP من مكان واحد."),
        ("lock.shield", "آمن بطبيعته", "حساب المحل مرة واحدة، ثم رمز لكل موظف وFace ID."),
    ]

    var body: some View {
        ZStack {
            YaqootBackground()
            VStack(spacing: 28) {
                Spacer()
                BrandMark(size: 96)
                    .scaleEffect(step >= 1 || reduceMotion ? 1 : 0.6)
                    .opacity(step >= 1 || reduceMotion ? 1 : 0)
                VStack(spacing: 6) {
                    Text("ياقوت").font(.system(size: 44, weight: .bold, design: .rounded))
                    Text("كل أعمالك، بتناغم.").font(.title3).foregroundStyle(.secondary)
                }
                .opacity(step >= 2 || reduceMotion ? 1 : 0)
                .offset(y: step >= 2 || reduceMotion ? 0 : 12)

                GlassEffectContainer(spacing: 10) {
                    VStack(spacing: 10) {
                        ForEach(Array(points.enumerated()), id: \.offset) { i, p in
                            HStack(spacing: 14) {
                                Image(systemName: p.0).font(.title3).foregroundStyle(Yq.teal).frame(width: 30)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.1).font(.headline)
                                    Text(p.2).font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(14)
                            .glassEffect(.regular, in: .rect(cornerRadius: 20))
                            .glassEffectID("p\(i)", in: ns)
                            .opacity(step >= 3 + i || reduceMotion ? 1 : 0)
                            .offset(y: step >= 3 + i || reduceMotion ? 0 : 16)
                        }
                    }
                }
                .frame(maxWidth: 460)
                Spacer()
                Button(action: done) {
                    Text("ابدأ").font(.headline).frame(maxWidth: 360).padding(.vertical, 6)
                }
                .buttonStyle(.glassProminent)
                .tint(Yq.teal)
                .controlSize(.large)
                .keyboardShortcut(.defaultAction)
                .opacity(step >= 6 || reduceMotion ? 1 : 0)
            }
            .padding(24)
        }
        .task {
            guard !reduceMotion else { step = 6; return }
            for i in 1...6 {
                try? await Task.sleep(for: .milliseconds(i == 1 ? 150 : 230))
                withAnimation(.spring(duration: 0.6, bounce: 0.25)) { step = i }
            }
        }
    }
}

/// إطار شاشات الدخول.
struct AuthFrame<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ZStack {
            YaqootBackground()
            ScrollView {
                VStack(spacing: 22) {
                    BrandMark()
                    content
                }
                .frame(maxWidth: 440)
                .padding(24)
                .frame(maxWidth: .infinity)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }
}

/// عنوان الخادم (إن لم يُضمَّن وقت البناء).
struct ServerSetupView: View {
    @State private var url = "https://"
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        AuthFrame {
            VStack(alignment: .leading, spacing: 8) {
                Text("عنوان الخادم").font(.title2.bold())
                Text("أدخل رابط موقع ياقوت الخاص بمحلك مرة واحدة. يُحفظ في Keychain.").foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            GlassPanel {
                TextField("https://…", text: $url)
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .environment(\.layoutDirection, .leftToRight)
                    .onSubmit(save)
            }
            if let error { Text(error).foregroundStyle(Yq.red).font(.callout) }
            Button(action: save) {
                Group { if busy { ProgressView() } else { Text("متابعة") } }.frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent).tint(Yq.teal).controlSize(.large).disabled(busy)
        }
    }

    private func save() {
        busy = true
        Task {
            defer { busy = false }
            do {
                try API.shared.setBaseURL(url)
                await AppState.shared.refresh()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// دخول المحل: حساب المالك مرة واحدة على الجهاز. كلمة المرور لا تُحفظ.
struct StoreLoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?
    enum Field { case email, password }

    var body: some View {
        AuthFrame {
            StepHeader(step: 1)
            VStack(alignment: .leading, spacing: 6) {
                Text("دخول المحل").font(.title.bold())
                Text("سجّل بحساب مالك المحل مرة واحدة على هذا الجهاز. بعدها يدخل كل موظف برمزه فقط.")
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            GlassEffectContainer(spacing: 10) {
                VStack(spacing: 10) {
                    field(icon: "at", content: AnyView(
                        TextField("البريد الإلكتروني", text: $email)
                            .textContentType(.username).keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .focused($focus, equals: .email).submitLabel(.next)
                            .onSubmit { focus = .password }))
                    field(icon: "lock", content: AnyView(
                        SecureField("كلمة المرور", text: $password)
                            .textContentType(.password)
                            .focused($focus, equals: .password).submitLabel(.go)
                            .onSubmit(submit)))
                }
            }
            if let error {
                Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Yq.red).font(.callout)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button(action: submit) {
                Label(busy ? "جارٍ التحقق…" : "تفعيل هذا الجهاز للمحل", systemImage: "storefront")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent).tint(Yq.teal).controlSize(.large)
            .disabled(busy || email.isEmpty || password.isEmpty)
            Text("كلمة المرور لا تُحفظ. يُحفظ مفتاح تفعيل في Keychain الخاص بهذا الجهاز فقط.")
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .onAppear { focus = .email }
    }

    private func field(icon: String, content: AnyView) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(.secondary).frame(width: 22)
            content
        }
        .padding(14)
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 16))
    }

    private func submit() {
        guard !busy, !email.isEmpty, !password.isEmpty else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                let r = try await API.shared.storeLogin(email: email.trimmingCharacters(in: .whitespaces).lowercased(), password: password)
                password = ""
                AppState.shared.storeName = r["store_name"].text
                AppState.shared.message = nil
                AppState.shared.phase = .locked
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

struct StepHeader: View {
    let step: Int
    var body: some View {
        HStack(spacing: 8) {
            badge(1, "حساب المحل")
            Rectangle().fill(.quaternary).frame(height: 1)
            badge(2, "رمز الموظف")
        }
        .font(.subheadline)
    }

    private func badge(_ n: Int, _ label: String) -> some View {
        HStack(spacing: 6) {
            Text("\(n)").font(.caption.bold()).frame(width: 22, height: 22)
                .foregroundStyle(n <= step ? .white : .secondary)
                .background(n <= step ? Yq.teal : Color.secondary.opacity(0.2), in: .circle)
            Text(label).foregroundStyle(n <= step ? .primary : .secondary)
        }
    }
}

/// شاشة رمز PIN: لوحة أرقام زجاجية، اهتزاز عند الخطأ، وفتح بـ Face ID إن فُعّل.
struct PinView: View {
    @State private var pin = ""
    @State private var busy = false
    @State private var error: String?
    @State private var shake = 0
    @State private var confirmSignOut = false
    @Environment(\.horizontalSizeClass) private var size

    private let keys = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]]

    var body: some View {
        AuthFrame {
            Label(AppState.shared.storeName, systemImage: "storefront")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14).padding(.vertical, 7)
                .glassEffect(.regular, in: .capsule)
            VStack(spacing: 4) {
                Text("أدخل رمزك").font(.title.bold())
                Text("رمز PIN يحدد هويتك وصلاحياتك في المحل.").foregroundStyle(.secondary)
            }
            dots
            Text(error ?? " ").font(.callout).foregroundStyle(Yq.red).frame(minHeight: 22)
                .accessibilityHidden(error == nil)
            pad
            if Biometrics.isEnabled {
                Button {
                    Task { await biometric() }
                } label: {
                    Label("فتح بـ \(Biometrics.label) • \(Biometrics.owner ?? "")", systemImage: Biometrics.symbol)
                }
                .buttonStyle(.glass)
            }
            Button(role: .destructive) { confirmSignOut = true } label: {
                Label("الخروج من حساب المحل", systemImage: "rectangle.portrait.and.arrow.right")
            }
            .font(.subheadline)
            .confirmationDialog("الخروج من حساب المحل؟", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("خروج", role: .destructive) { Task { await AppState.shared.signOutStore() } }
            } message: {
                Text("سيُلغى تفعيل هذا الجهاز ويحتاج حساب المالك من جديد.")
            }
        }
        .onAppear {
            error = AppState.shared.message
            if Biometrics.isEnabled && AppState.shared.message == nil { Task { await biometric() } }
        }
        .onKeyPress(phases: .down) { press in
            if let c = press.characters.first, c.isNumber {
                type(String(c)); return .handled
            }
            if press.key == .delete { backspace(); return .handled }
            if press.key == .return { submit(); return .handled }
            return .ignored
        }
        .sensoryFeedback(.error, trigger: shake)
    }

    private var dots: some View {
        HStack(spacing: 14) {
            ForEach(0..<max(4, pin.count), id: \.self) { i in
                Circle()
                    .strokeBorder(i < pin.count ? Yq.teal : Color.secondary.opacity(0.4), lineWidth: 2)
                    .background(Circle().fill(i < pin.count ? Yq.teal : Color.clear))
                    .frame(width: 16, height: 16)
            }
        }
        .environment(\.layoutDirection, .leftToRight)
        .modifier(Shake(animatableData: CGFloat(shake)))
        .animation(.snappy, value: pin)
        .accessibilityElement()
        .accessibilityLabel("أُدخل \(pin.count) أرقام")
    }

    private var pad: some View {
        let side: CGFloat = size == .regular ? 82 : 74
        return GlassEffectContainer(spacing: 14) {
            VStack(spacing: 14) {
                ForEach(keys, id: \.self) { row in
                    HStack(spacing: 14) { ForEach(row, id: \.self) { d in digit(d, side) } }
                }
                HStack(spacing: 14) {
                    Button(action: backspace) {
                        Image(systemName: "delete.left").font(.title2).frame(width: side, height: side)
                    }
                    .buttonStyle(.glass).buttonBorderShape(.circle)
                    .disabled(pin.isEmpty)
                    .accessibilityLabel("حذف")
                    digit("0", side)
                    Button(action: submit) {
                        Group {
                            if busy { ProgressView().tint(.white) } else { Image(systemName: "arrow.left").font(.title2.bold()) }
                        }
                        .frame(width: side, height: side)
                    }
                    .buttonStyle(.glassProminent).buttonBorderShape(.circle).tint(Yq.teal)
                    .disabled(pin.count < 4 || busy)
                    .accessibilityLabel("دخول")
                }
            }
        }
        .environment(\.layoutDirection, .leftToRight)
    }

    private func digit(_ d: String, _ side: CGFloat) -> some View {
        Button { type(d) } label: {
            Text(d).font(.system(size: 30, weight: .medium, design: .rounded)).frame(width: side, height: side)
        }
        .buttonStyle(.glass).buttonBorderShape(.circle)
        .sensoryFeedback(.selection, trigger: pin)
    }

    private func type(_ d: String) {
        guard !busy, pin.count < 8 else { return }
        pin += d
        error = nil
    }

    private func backspace() { if !pin.isEmpty { pin.removeLast() } }

    private func submit() {
        guard !busy, pin.count >= 4 else { return }
        let value = pin
        Task { await login(value) }
    }

    private func login(_ value: String, fromBiometric: Bool = false) async {
        busy = true
        defer { busy = false }
        do {
            let r = try await API.shared.pin(value)
            AppState.shared.apply(r, forceActive: true)
            UserDefaults.standard.set(r["employee"]["id"].text, forKey: "last_employee")
            pin = ""
        } catch let e as APIError {
            withAnimation(.default) { shake += 1 }
            if e.reason == "unpaired" { await AppState.shared.signOutStore(); return }
            // تغيّر رمز الموظف بعد تفعيل الفتح السريع: نلغي الرمز المحفوظ ليُدخل يدوياً.
            if e.reason == "wrong", fromBiometric { Biometrics.disable() }
            error = e.localizedDescription
            pin = ""
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func biometric() async {
        guard let stored = await Biometrics.unlock() else { return }
        await login(stored, fromBiometric: true)
    }
}

/// اهتزاز أفقي عند الرمز الخاطئ.
nonisolated struct Shake: GeometryEffect {
    var animatableData: CGFloat
    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 10 * sin(animatableData * .pi * 4), y: 0))
    }
}
