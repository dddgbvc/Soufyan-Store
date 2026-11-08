import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../main.dart';
import '../ui.dart';

class Brand extends StatelessWidget {
  const Brand({super.key});
  @override
  Widget build(BuildContext context) => Column(children: [
        Container(
          width: 72, height: 72,
          decoration: BoxDecoration(color: const Color(0xFF19574E), borderRadius: BorderRadius.circular(22),
              boxShadow: const [BoxShadow(color: Color(0x2211443E), blurRadius: 18, offset: Offset(0, 8))]),
          child: const Icon(Icons.diamond_outlined, color: Color(0xFFE7CC95), size: 38),
        ),
        const SizedBox(height: 12),
        const Text('ياقوت', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, height: 1.1)),
        Text('كل أعمالك، بتناغم.', style: TextStyle(color: Theme.of(context).colorScheme.outline)),
      ]);
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Brand()));
}

class _AuthFrame extends StatelessWidget {
  const _AuthFrame({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const Brand(), const SizedBox(height: 28), ...children]),
              ),
            ),
          ),
        ),
      );
}

// ------------------------------------------------------------------ عنوان الخادم (إن لم يُضمَّن وقت البناء)
class ServerSetupScreen extends StatefulWidget {
  const ServerSetupScreen({super.key});
  @override
  State<ServerSetupScreen> createState() => _ServerSetupScreenState();
}

class _ServerSetupScreenState extends State<ServerSetupScreen> {
  final _url = TextEditingController(text: 'https://');
  String? _error;
  @override
  Widget build(BuildContext context) => _AuthFrame(children: [
        const Text('عنوان الخادم', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const Text('أدخل رابط موقع ياقوت الخاص بمحلك مرة واحدة.'),
        const SizedBox(height: 16),
        TextField(controller: _url, keyboardType: TextInputType.url, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: 'https://…', errorText: _error)),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () async {
            try {
              await Api.I.setBaseUrl(_url.text);
              await app.refresh();
            } catch (e) {
              setState(() => _error = '$e');
            }
          },
          child: const Text('متابعة'),
        ),
      ]);
}

// ------------------------------------------------------------------ دخول المحل
class StoreLoginScreen extends StatefulWidget {
  const StoreLoginScreen({super.key});
  @override
  State<StoreLoginScreen> createState() => _StoreLoginScreenState();
}

class _StoreLoginScreenState extends State<StoreLoginScreen> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _busy = false, _hide = true;
  String? _error;

  Future<void> _submit() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await Api.I.storeLogin(_email.text.trim().toLowerCase(), _pass.text);
      _pass.clear();
      app.storeName = '${r['store_name'] ?? ''}';
      app.state = 'locked';
      app.message = null;
      app.changed();
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _AuthFrame(children: [
        Row(children: [
          const CircleAvatar(radius: 11, backgroundColor: Yq.teal, child: Text('1', style: TextStyle(color: Colors.white, fontSize: 11))),
          const SizedBox(width: 6), const Text('حساب المحل'), const SizedBox(width: 10),
          Expanded(child: Divider(color: Theme.of(context).colorScheme.outlineVariant)),
          const SizedBox(width: 10), Text('2  رمز الموظف', style: TextStyle(color: Theme.of(context).colorScheme.outline)),
        ]),
        const SizedBox(height: 18),
        const Text('دخول المحل', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        Text('سجّل بحساب مالك المحل مرة واحدة على هذا الهاتف. بعدها يدخل كل موظف برمزه فقط.', style: TextStyle(color: Theme.of(context).colorScheme.outline)),
        const SizedBox(height: 20),
        TextField(controller: _email, keyboardType: TextInputType.emailAddress, textDirection: TextDirection.ltr, autofillHints: const [AutofillHints.username], decoration: const InputDecoration(labelText: 'البريد الإلكتروني', prefixIcon: Icon(Icons.alternate_email))),
        const SizedBox(height: 12),
        TextField(
          controller: _pass, obscureText: _hide, textDirection: TextDirection.ltr, autofillHints: const [AutofillHints.password],
          onSubmitted: (_) => _submit(),
          decoration: InputDecoration(labelText: 'كلمة المرور', prefixIcon: const Icon(Icons.lock_outline),
              suffixIcon: IconButton(icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: () => setState(() => _hide = !_hide))),
        ),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Yq.red))),
        const SizedBox(height: 18),
        FilledButton.icon(onPressed: _busy ? null : _submit, icon: _busy ? const Busy() : const Icon(Icons.storefront_outlined), label: Text(_busy ? 'جارٍ التحقق…' : 'تفعيل هذا الهاتف للمحل')),
        const SizedBox(height: 14),
        Text('كلمة المرور لا تُحفظ. يُحفظ مفتاح تفعيل مشفّر في مخزن الهاتف الآمن.', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline)),
      ]);
}

// ------------------------------------------------------------------ PIN
class PinScreen extends StatefulWidget {
  const PinScreen({super.key, this.message});
  final String? message;
  @override
  State<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends State<PinScreen> with SingleTickerProviderStateMixin {
  String _pin = '';
  bool _busy = false;
  String? _error;
  late final AnimationController _shake = AnimationController(vsync: this, duration: const Duration(milliseconds: 380));

  @override
  void initState() {
    super.initState();
    _error = widget.message;
  }

  @override
  void dispose() {
    _shake.dispose();
    super.dispose();
  }

  void _press(String d) {
    if (_busy || _pin.length >= 8) return;
    HapticFeedback.selectionClick();
    setState(() {
      _pin += d;
      _error = null;
    });
  }

  Future<void> _submit() async {
    if (_busy || _pin.length < 4) return;
    setState(() => _busy = true);
    try {
      final r = await Api.I.pin(_pin);
      app.apply({...r, 'state': 'active'});
    } on ApiException catch (e) {
      HapticFeedback.heavyImpact();
      _shake.forward(from: 0);
      if (e.reason == 'unpaired') {
        await app.signOutStore();
        return;
      }
      setState(() {
        _error = e.message;
        _pin = '';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _key(String label, {VoidCallback? onTap, Widget? child, bool primary = false}) => Expanded(
        child: Padding(
          padding: const EdgeInsets.all(5),
          child: SizedBox(
            height: 62,
            child: primary
                ? FilledButton(onPressed: onTap, style: FilledButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))), child: child)
                : OutlinedButton(
                    onPressed: onTap,
                    style: OutlinedButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)), backgroundColor: Theme.of(context).colorScheme.surfaceContainerLowest),
                    child: child ?? Text(label, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600)),
                  ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']];
    return _AuthFrame(children: [
      Center(child: Chip(avatar: const Icon(Icons.storefront_outlined, size: 18), label: Text(app.storeName))),
      const SizedBox(height: 8),
      const Text('أدخل رمزك', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
      Text('رمز PIN يحدد هويتك وصلاحياتك في المحل.', textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
      const SizedBox(height: 18),
      AnimatedBuilder(
        animation: _shake,
        builder: (context, child) => Transform.translate(offset: Offset(_shake.isAnimating ? 8 * (1 - _shake.value) * ((_shake.value * 10).round().isEven ? 1 : -1) : 0, 0), child: child),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          textDirection: TextDirection.ltr,
          children: [
            for (var i = 0; i < (_pin.length < 4 ? 4 : _pin.length); i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                margin: const EdgeInsets.symmetric(horizontal: 7),
                width: 15, height: 15,
                decoration: BoxDecoration(shape: BoxShape.circle, color: i < _pin.length ? Yq.teal : Colors.transparent, border: Border.all(color: i < _pin.length ? Yq.teal : Theme.of(context).colorScheme.outlineVariant, width: 2)),
              ),
          ],
        ),
      ),
      SizedBox(height: 34, child: Center(child: _error == null ? null : Text(_error!, style: const TextStyle(color: Yq.red)))),
      Directionality(
        textDirection: TextDirection.ltr,
        child: Column(children: [
          for (final r in rows) Row(children: [for (final d in r) _key(d, onTap: () => _press(d))]),
          Row(children: [
            _key('', onTap: _pin.isEmpty ? null : () => setState(() => _pin = _pin.substring(0, _pin.length - 1)), child: const Icon(Icons.backspace_outlined)),
            _key('0', onTap: () => _press('0')),
            _key('', primary: true, onTap: _pin.length < 4 || _busy ? null : _submit, child: _busy ? const Busy() : const Icon(Icons.arrow_forward_rounded, size: 28)),
          ]),
        ]),
      ),
      const SizedBox(height: 18),
      TextButton.icon(
        onPressed: () async {
          if (await confirm(context, 'الخروج من حساب المحل؟', 'سيُلغى تفعيل هذا الهاتف ويحتاج حساب المالك من جديد.', ok: 'خروج', danger: true)) {
            await app.signOutStore();
          }
        },
        icon: const Icon(Icons.logout, size: 18),
        label: const Text('الخروج من حساب المحل'),
      ),
    ]);
  }
}
