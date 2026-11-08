import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../main.dart';
import '../notify.dart';
import '../ui.dart';
import 'inbox.dart';

/// محرر تفضيلات الإشعارات: لكل نوع تشغيل/إيقاف، حد الفاتورة، ساعات الهدوء.
class PrefsEditor extends StatefulWidget {
  const PrefsEditor({super.key, required this.initial, required this.permissions, required this.save});
  final Map<String, dynamic> initial;
  final List<String> permissions;
  final Future<Map<String, dynamic>> Function(Map<String, Object?> patch) save;
  @override
  State<PrefsEditor> createState() => _PrefsEditorState();
}

class _PrefsEditorState extends State<PrefsEditor> {
  late Map<String, dynamic> _p = Map.of(widget.initial);
  String? _busy;
  late final _min = TextEditingController(text: money(_p['invoice_min'] ?? 0));

  Future<void> _change(Map<String, Object?> patch) async {
    final before = Map<String, dynamic>.of(_p);
    setState(() {
      _p.addAll(patch);
      _busy = patch.keys.first;
    });
    try {
      final r = await widget.save(patch);
      if (mounted) setState(() => _p = r);
    } catch (e) {
      if (mounted) {
        setState(() => _p = before);
        toast(context, '$e', error: true);
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _pickTime(String key) async {
    final cur = '${_p[key] ?? '23:30'}'.split(':');
    final t = await showTimePicker(context: context, initialTime: TimeOfDay(hour: int.tryParse(cur[0]) ?? 23, minute: int.tryParse(cur.length > 1 ? cur[1] : '0') ?? 0));
    if (t != null) _change({key: '${two(t.hour)}:${two(t.minute)}'});
  }

  @override
  Widget build(BuildContext context) {
    final visible = kinds.entries.where((e) => e.key != 'custom' && e.value.perms.any(widget.permissions.contains)).toList();
    return Section(title: 'الإشعارات التلقائية', subtitle: 'تصل لصندوقك دائماً، وللهاتف إذا فعّلته', children: [
      for (final k in visible)
        SwitchListTile(
          secondary: Icon(k.value.icon, color: k.value.color),
          title: Text(k.value.label),
          subtitle: Text(k.value.hint),
          value: _p[k.key] != false,
          onChanged: _busy == k.key ? null : (v) => _change({k.key: v}),
        ),
      if (visible.any((k) => k.key == 'invoice') && _p['invoice'] != false)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: Row(children: [
            Expanded(child: MoneyField(controller: _min, label: 'أقل مبلغ لإشعار الفاتورة', helper: '0 = كل الفواتير')),
            const SizedBox(width: 8),
            OutlinedButton(onPressed: () => _change({'invoice_min': moneyValue(_min)}), child: const Text('حفظ')),
          ]),
        ),
      SwitchListTile(
        secondary: const Icon(Icons.bedtime_outlined),
        title: const Text('ساعات الهدوء'),
        subtitle: const Text('لا يرنّ الهاتف خلالها، والإشعار يُحفظ في الصندوق'),
        value: _p['quiet'] == true,
        onChanged: (v) => _change({'quiet': v}),
      ),
      if (_p['quiet'] == true)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
          child: Row(children: [
            Expanded(child: OutlinedButton(onPressed: () => _pickTime('quiet_from'), child: Text('من ${_p['quiet_from']}'))),
            const SizedBox(width: 8),
            Expanded(child: OutlinedButton(onPressed: () => _pickTime('quiet_to'), child: Text('إلى ${_p['quiet_to']}'))),
          ]),
        ),
    ]);
  }
}

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool? _deviceOn;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    deviceNotificationsEnabled().then((v) => mounted ? setState(() => _deviceOn = v) : null);
  }

  Future<void> _toggleDevice(bool on) async {
    setState(() => _busy = true);
    try {
      if (on) {
        final granted = await requestNotificationPermission();
        if (!granted) {
          if (mounted) toast(context, 'اسمح بالإشعارات من إعدادات الهاتف ← التطبيقات ← ياقوت', error: true);
          return;
        }
        await enableDeviceNotifications('Android • ${app.employeeName}');
        if (mounted) toast(context, 'تم تفعيل إشعارات هذا الهاتف');
      } else {
        await disableDeviceNotifications();
      }
      if (mounted) setState(() => _deviceOn = on);
    } on SessionExpired {
      widget.onExpired();
    } catch (e) {
      if (mounted) toast(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final perms = [...app.permissions, if (app.isAdmin) '__admin'];
    return ListView(padding: const EdgeInsets.all(12), children: [
      Card(
        child: ListTile(
          leading: Avatar(app.employeeName),
          title: Text(app.employeeName, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text('${roleLabel[app.employee['role']] ?? app.employee['role']} • ${app.storeName} • ${app.permissions.length} صلاحية'),
        ),
      ),
      const SizedBox(height: 12),
      Section(title: 'إشعارات هذا الهاتف', subtitle: 'تصل حتى والتطبيق مغلق (كل ~15 دقيقة) وفوراً أثناء فتحه', children: [
        SwitchListTile(
          secondary: const Icon(Icons.notifications_active_outlined),
          title: const Text('تفعيل الإشعارات على هذا الهاتف'),
          subtitle: Text(_deviceOn == true ? 'مفعّلة لـ ${app.employeeName}' : 'غير مفعّلة'),
          value: _deviceOn == true,
          onChanged: _busy || _deviceOn == null ? null : _toggleDevice,
        ),
        if (_deviceOn == true)
          ListTile(
            leading: const Icon(Icons.sync),
            title: const Text('فحص الآن'),
            onTap: () async {
              final n = await pollOnce();
              if (context.mounted) toast(context, n == null ? 'تم الفحص' : '$n غير مقروء');
            },
          ),
      ]),
      const SizedBox(height: 12),
      Loader<Map<String, dynamic>>(
        load: () => Api.I.prefs(),
        onExpired: widget.onExpired,
        builder: (context, p, _) => PrefsEditor(initial: p, permissions: perms, save: (patch) => Api.I.setPrefs(patch)),
      ),
      const SizedBox(height: 12),
      Section(title: 'المظهر', children: [
        RadioGroup<ThemeMode>(
          groupValue: app.theme,
          onChanged: (m) => app.setTheme(m ?? ThemeMode.system),
          child: const Column(children: [
            RadioListTile(value: ThemeMode.system, title: Text('حسب الهاتف')),
            RadioListTile(value: ThemeMode.light, title: Text('نهاري')),
            RadioListTile(value: ThemeMode.dark, title: Text('ليلي')),
          ]),
        ),
      ]),
      const SizedBox(height: 12),
      Section(title: 'الأمان', children: [
        ListTile(
          leading: const Icon(Icons.timer_outlined),
          title: const Text('القفل التلقائي بعد الخمول'),
          trailing: DropdownButton<int>(
            value: [5, 10, 15, 30].contains(app.idleMinutes) ? app.idleMinutes : 10,
            items: [for (final m in [5, 10, 15, 30]) DropdownMenuItem(value: m, child: Text('$m دقائق'))],
            onChanged: (m) => app.setIdle(m ?? 10),
          ),
        ),
        ListTile(leading: const Icon(Icons.lock_outline), title: const Text('قفل الآن وتبديل الموظف'), onTap: () => app.lock()),
        if (app.isAdmin || app.can('settings.account'))
          ListTile(
            leading: const Icon(Icons.logout, color: Yq.red),
            title: const Text('الخروج من حساب المحل', style: TextStyle(color: Yq.red)),
            subtitle: const Text('يلغي تفعيل هذا الهاتف ويحتاج حساب المالك من جديد'),
            onTap: () async {
              if (await confirm(context, 'الخروج من حساب المحل؟', 'سيُلغى تفعيل الهاتف وإشعاراته.', ok: 'خروج', danger: true)) await app.signOutStore();
            },
          ),
      ]),
      const SizedBox(height: 12),
      Center(child: Text('ياقوت ERP • أندرويد 1.0', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline))),
      const SizedBox(height: 24),
    ]);
  }
}
