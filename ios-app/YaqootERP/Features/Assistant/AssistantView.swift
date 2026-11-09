import SwiftUI

/// المساعد الذكي: أسئلة عن المحل بلغة طبيعية. يقرأ البيانات بصلاحياتك فقط ولا ينفّذ عمليات.
struct AssistantView: View {
    struct Bubble: Identifiable, Equatable {
        let id = UUID()
        let role: String
        let text: String
    }

    @State private var bubbles: [Bubble] = []
    @State private var input = ""
    @State private var thinking = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private let suggestions = [
        "شنو ملخص اليوم؟",
        "منو أكثر 5 زبائن عليهم ديون؟",
        "شنو الاشتراكات اللي تنتهي هالأسبوع؟",
        "شنو النواقص المهمة؟",
        "قارن مبيعات اليوم بأمس",
    ]

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        if bubbles.isEmpty { intro }
                        ForEach(bubbles) { b in bubble(b).id(b.id) }
                        if thinking {
                            HStack(spacing: 8) {
                                ProgressView()
                                Text("يجمع البيانات ويحلّلها…").font(.subheadline).foregroundStyle(.secondary)
                                Spacer()
                            }
                            .padding(.horizontal)
                            .id("thinking")
                        }
                        if let error {
                            Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Yq.red).font(.footnote)
                        }
                    }
                    .padding()
                }
                .onChange(of: bubbles) { if let id = bubbles.last?.id { withAnimation { proxy.scrollTo(id, anchor: .bottom) } } }
                .onChange(of: thinking) { if thinking { withAnimation { proxy.scrollTo("thinking", anchor: .bottom) } } }
            }
            composer
        }
        .background { YaqootBackground() }
        .toolbar {
            if !bubbles.isEmpty {
                Button { bubbles = []; error = nil } label: { Label("محادثة جديدة", systemImage: "square.and.pencil") }
            }
        }
    }

    private var intro: some View {
        VStack(spacing: 14) {
            Image(systemName: "sparkles").font(.system(size: 40)).foregroundStyle(Yq.gold)
                .symbolEffect(.pulse)
            Text("مساعد مكتب سفيان").font(.title2.bold())
            Text("اسأل عن المبيعات والديون والمخزون والإنترنت. يقرأ البيانات بصلاحياتك فقط، ولا ينفّذ أي عملية.")
                .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            GlassEffectContainer(spacing: 8) {
                VStack(spacing: 8) {
                    ForEach(suggestions, id: \.self) { s in
                        Button { send(s) } label: {
                            Text(s).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 14).padding(.vertical, 10)
                        }
                        .buttonStyle(.plain)
                        .glassEffect(.regular.interactive(), in: .capsule)
                    }
                }
            }
        }
        .padding(.top, 30)
    }

    private func bubble(_ b: Bubble) -> some View {
        let mine = b.role == "user"
        return HStack {
            if mine { Spacer(minLength: 40) }
            Text((try? AttributedString(markdown: b.text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(b.text))
                .textSelection(.enabled)
                .padding(12)
                .foregroundStyle(mine ? .white : .primary)
                .background(mine ? AnyShapeStyle(Yq.navy) : AnyShapeStyle(.thinMaterial), in: .rect(cornerRadius: 18))
            if !mine { Spacer(minLength: 40) }
        }
    }

    private var composer: some View {
        HStack(spacing: 10) {
            TextField("اكتب سؤالك…", text: $input, axis: .vertical)
                .lineLimit(1...4)
                .focused($focused)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 20))
                .onSubmit { send(input) }
            Button { send(input) } label: {
                Image(systemName: "arrow.up").font(.headline).frame(width: 40, height: 40)
            }
            .buttonStyle(.glassProminent).buttonBorderShape(.circle).tint(Yq.navy)
            .disabled(thinking || input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel("إرسال")
        }
        .padding(.horizontal).padding(.vertical, 8)
    }

    private func send(_ text: String) {
        let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !thinking else { return }
        input = ""
        error = nil
        bubbles.append(Bubble(role: "user", text: q))
        thinking = true
        let turns = bubbles.suffix(12).map { API.ChatTurn(role: $0.role, content: $0.text) }
        Task {
            defer { thinking = false }
            do {
                let reply = try await API.shared.assistant(Array(turns))
                bubbles.append(Bubble(role: "assistant", text: reply))
            } catch APIError.sessionExpired {
                AppState.shared.expire()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
