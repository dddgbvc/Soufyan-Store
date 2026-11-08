// عناصر الواجهة المشتركة: الألوان، البطاقات، المؤشرات، الحقول، والقوائم.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'format.dart';

class Yq {
  static const teal = Color(0xFF246358);
  static const tealSoft = Color(0xFFEAF3F0);
  static const gold = Color(0xFFB9934F);
  static const red = Color(0xFFC0645A);
  static const green = Color(0xFF4C8C63);
  static const blue = Color(0xFF5E7FA0);
  static const purple = Color(0xFF8E7FA6);
  static const amber = Color(0xFFB9934F);
}

ThemeData buildTheme(Brightness b) {
  final dark = b == Brightness.dark;
  final scheme = ColorScheme.fromSeed(seedColor: Yq.teal, brightness: b, primary: dark ? const Color(0xFF83C4B5) : Yq.teal);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: 'Cairo',
    scaffoldBackgroundColor: dark ? const Color(0xFF131F21) : const Color(0xFFF6F7F9),
    cardTheme: CardThemeData(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: dark ? const Color(0xFF1B292B) : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: dark ? const Color(0xFF2B3B3C) : const Color(0xFFEAEDEF))),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: dark ? const Color(0xFF182628) : Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontFamily: 'Cairo', fontSize: 18, fontWeight: FontWeight.w700, color: dark ? Colors.white : const Color(0xFF263638)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? const Color(0xFF223234) : Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: dark ? const Color(0xFF2B3B3C) : const Color(0xFFE2E6E8))),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: dark ? const Color(0xFF2B3B3C) : const Color(0xFFE2E6E8))),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size(48, 48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), textStyle: const TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.w600)),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), textStyle: const TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.w600)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}

void toast(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(msg), backgroundColor: error ? Yq.red : Yq.teal));
}

/// يحمّل بيانات من الخادم مع حالات التحميل والخطأ وانتهاء الجلسة.
class Loader<T> extends StatefulWidget {
  const Loader({super.key, required this.load, required this.builder, this.onExpired});
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final VoidCallback? onExpired;
  @override
  State<Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<Loader<T>> {
  T? _data;
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() => _loading = true);
    try {
      final d = await widget.load();
      if (!mounted) return;
      setState(() {
        _data = d;
        _error = null;
        _loading = false;
      });
    } on SessionExpired {
      widget.onExpired?.call();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_data == null && _loading) return const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator()));
    if (_data == null) return ErrorView(message: '$_error', onRetry: _reload);
    return RefreshIndicator(onRefresh: _reload, child: widget.builder(context, _data as T, _reload));
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off_rounded, size: 44, color: Yq.red),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (onRetry != null) ...[const SizedBox(height: 16), OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('إعادة المحاولة'))],
          ]),
        ),
      );
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.text, this.icon = Icons.inbox_outlined});
  final String text;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
        child: Column(children: [
          Icon(icon, size: 40, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 10),
          Text(text, textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
        ]),
      );
}

class Kpi extends StatelessWidget {
  const Kpi({super.key, required this.label, required this.value, required this.icon, required this.color, this.hint, this.raw = false, this.onTap});
  final String label;
  final Object? value;
  final IconData icon;
  final Color color;
  final String? hint;
  final bool raw;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.outline;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(label, style: TextStyle(fontSize: 12.5, color: muted), maxLines: 1, overflow: TextOverflow.ellipsis)),
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, size: 18, color: color),
              ),
            ]),
            const SizedBox(height: 8),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Text.rich(TextSpan(children: [
                TextSpan(text: money(value), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                if (!raw) TextSpan(text: '  د.ع', style: TextStyle(fontSize: 11, color: muted)),
              ])),
            ),
            if (hint != null) ...[const SizedBox(height: 4), Text(hint!, style: TextStyle(fontSize: 11, color: muted), maxLines: 2, overflow: TextOverflow.ellipsis)],
          ]),
        ),
      ),
    );
  }
}

class KpiGrid extends StatelessWidget {
  const KpiGrid({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, c) {
        final cols = c.maxWidth > 700 ? 4 : 2;
        final w = (c.maxWidth - (cols - 1) * 10) / cols;
        return Wrap(spacing: 10, runSpacing: 10, children: [for (final k in children) SizedBox(width: w, child: k)]);
      });
}

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.color = Yq.teal});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
        child: Text(text, style: TextStyle(fontSize: 11.5, color: color, fontWeight: FontWeight.w600)),
      );
}

class Section extends StatelessWidget {
  const Section({super.key, required this.title, this.subtitle, required this.children, this.trailing});
  final String title;
  final String? subtitle;
  final List<Widget> children;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700)),
                    if (subtitle != null) Text(subtitle!, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline)),
                  ]),
                ),
                ?trailing,
              ]),
            ),
            ...children,
          ]),
        ),
      );
}

class Avatar extends StatelessWidget {
  const Avatar(this.text, {super.key, this.icon, this.color = Yq.teal});
  final String text;
  final IconData? icon;
  final Color color;
  @override
  Widget build(BuildContext context) => CircleAvatar(
        radius: 20,
        backgroundColor: color.withValues(alpha: 0.12),
        child: icon != null ? Icon(icon, size: 19, color: color) : Text(text.isEmpty ? '؟' : text.characters.first, style: TextStyle(color: color, fontWeight: FontWeight.w700)),
      );
}

/// حقل مبلغ بالدينار مع فواصل الآلاف أثناء الكتابة.
class MoneyField extends StatelessWidget {
  const MoneyField({super.key, required this.controller, required this.label, this.autofocus = false, this.onChanged, this.helper});
  final TextEditingController controller;
  final String label;
  final bool autofocus;
  final String? helper;
  final ValueChanged<int>? onChanged;
  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        autofocus: autofocus,
        keyboardType: TextInputType.number,
        textDirection: TextDirection.ltr,
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(13), _ThousandsFormatter()],
        decoration: InputDecoration(labelText: label, suffixText: 'د.ع', helperText: helper),
        onChanged: (_) => onChanged?.call(moneyValue(controller)),
      );
}

int moneyValue(TextEditingController c) => int.tryParse(c.text.replaceAll(',', '')) ?? 0;

class _ThousandsFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = newValue.text.replaceAll(',', '');
    if (digits.isEmpty) return newValue.copyWith(text: '');
    final t = money(int.parse(digits));
    return TextEditingValue(text: t, selection: TextSelection.collapsed(offset: t.length));
  }
}

Future<bool> confirm(BuildContext context, String title, String body, {String ok = 'تأكيد', bool danger = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')),
        FilledButton(style: danger ? FilledButton.styleFrom(backgroundColor: Yq.red) : null, onPressed: () => Navigator.pop(c, true), child: Text(ok)),
      ],
    ),
  );
  return r == true;
}

/// لوح سفلي لنموذج إدخال.
Future<T?> sheet<T>(BuildContext context, Widget child) => showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (c) => Padding(padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom), child: child),
    );

class SheetBody extends StatelessWidget {
  const SheetBody({super.key, required this.title, required this.children, this.subtitle});
  final String title;
  final String? subtitle;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
          if (subtitle != null) Text(subtitle!, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
          const SizedBox(height: 16),
          ...children,
        ]),
      );
}

class Busy extends StatelessWidget {
  const Busy({super.key});
  @override
  Widget build(BuildContext context) => const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white));
}
