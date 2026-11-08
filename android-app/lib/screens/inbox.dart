import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../main.dart';
import '../ui.dart';
import 'settings.dart';

class KindMeta {
  const KindMeta(this.label, this.icon, this.color, this.hint, this.perms);
  final String label;
  final IconData icon;
  final Color color;
  final String hint;
  final List<String> perms;
}

const kinds = <String, KindMeta>{
  'activity': KindMeta('كل حركات المحل', Icons.timeline, Yq.teal, 'للمدير العام: كل عملية من أي جهاز', ['__admin']),
  'invoice': KindMeta('فاتورة جديدة', Icons.receipt_long_outlined, Yq.teal, 'كل فاتورة بيع • أكثر من 3 بالدقيقة تُجمع', ['pos']),
  'debt_added': KindMeta('دين جديد', Icons.account_balance_wallet_outlined, Yq.gold, 'عند إضافة دين على زبون', ['customers']),
  'debt_paid': KindMeta('تسديد دين', Icons.payments_outlined, Yq.green, 'عند قبض دفعة أو مسامحة', ['customers']),
  'shortage': KindMeta('النواقص', Icons.inventory_2_outlined, Yq.amber, 'نقص يدوي أو منتج تحت حد التنبيه', ['shortages', 'inventory']),
  'repair_ready': KindMeta('صيانة جاهزة', Icons.build_outlined, Yq.blue, 'عندما تصبح التذكرة جاهزة للاستلام', ['repairs']),
  'isp_expiring': KindMeta('اشتراكات الإنترنت', Icons.wifi, Yq.blue, 'قبل الانتهاء بـ3 أيام وعند الانتهاء', ['customers']),
  'report_daily': KindMeta('التقرير اليومي', Icons.calendar_today_outlined, Yq.purple, 'كل يوم 11:00 مساءً', ['dashboard']),
  'report_weekly': KindMeta('التقرير الأسبوعي', Icons.date_range_outlined, Yq.purple, 'الجمعة 11:00 مساءً', ['dashboard']),
  'report_monthly': KindMeta('التقرير الشهري', Icons.calendar_month_outlined, Yq.purple, 'يوم 1 الساعة 9:00 صباحاً', ['dashboard']),
  'report_bimonthly': KindMeta('تقرير الشهرين', Icons.calendar_month_outlined, Yq.purple, 'يوم 1 من الأشهر الفردية', ['dashboard']),
  'report_yearly': KindMeta('التقرير السنوي', Icons.event_note_outlined, Yq.purple, '1 كانون الثاني 9:00 صباحاً', ['dashboard']),
  'custom': KindMeta('رسالة من الإدارة', Icons.campaign_outlined, Yq.red, '', []),
};

class InboxPage extends StatefulWidget {
  const InboxPage({super.key, required this.onExpired, required this.onUnread});
  final VoidCallback onExpired;
  final ValueChanged<int> onUnread;
  @override
  State<InboxPage> createState() => _InboxPageState();
}

class _InboxPageState extends State<InboxPage> {
  final _items = <Map<String, dynamic>>[];
  String _kind = 'all';
  int _unread = 0;
  bool _loading = true, _more = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool older = false}) async {
    setState(() => _loading = true);
    try {
      final d = await Api.I.get('inbox', {
        'limit': 40,
        if (_kind != 'all') 'kind': _kind,
        if (older && _items.isNotEmpty) 'before': _items.last['id'],
      });
      final list = ((d['items'] as List?) ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      setState(() {
        if (!older) _items.clear();
        _items.addAll(list);
        _unread = (d['unread'] as num?)?.toInt() ?? 0;
        _more = list.length == 40;
        _error = null;
        _loading = false;
      });
      widget.onUnread(_unread);
    } on SessionExpired {
      widget.onExpired();
    } catch (e) {
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  Future<void> _mark({bool all = false, List<int>? ids}) async {
    try {
      final d = await Api.I.act('notify_mark', {'all': all, 'ids': ids ?? []});
      setState(() {
        _unread = (d['unread'] as num?)?.toInt() ?? 0;
        for (final i in _items) {
          if (all || (ids ?? []).contains(i['id'])) i['read'] = true;
        }
      });
      widget.onUnread(_unread);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final admin = app.can('employees.permissions');
    return DefaultTabController(
      length: admin ? 2 : 1,
      child: Column(children: [
        if (admin) const TabBar(tabs: [Tab(text: 'صندوقي'), Tab(text: 'إدارة إشعارات المحل')]),
        Expanded(
          child: TabBarView(children: [
            RefreshIndicator(
              onRefresh: _load,
              child: ListView(padding: const EdgeInsets.all(12), children: [
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    for (final f in const {'all': 'الكل', 'activity': 'الحركات', 'invoice': 'الفواتير', 'debt': 'الديون', 'shortage': 'النواقص', 'repair_ready': 'الصيانة', 'isp_expiring': 'الإنترنت', 'report': 'التقارير', 'custom': 'الإدارة'}.entries)
                      Padding(
                        padding: const EdgeInsetsDirectional.only(end: 8),
                        child: ChoiceChip(label: Text(f.value), selected: _kind == f.key, onSelected: (_) {
                          _kind = f.key;
                          _load();
                        }),
                      ),
                  ]),
                ),
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(child: Text('$_unread غير مقروء', style: TextStyle(color: Theme.of(context).colorScheme.outline))),
                  TextButton.icon(onPressed: _unread == 0 ? null : () => _mark(all: true), icon: const Icon(Icons.done_all), label: const Text('تعليم الكل كمقروء')),
                ]),
                if (_error != null) ErrorView(message: _error!, onRetry: _load),
                if (!_loading && _items.isEmpty && _error == null) const EmptyView(text: 'لا توجد إشعارات', icon: Icons.notifications_none),
                if (_items.isNotEmpty)
                  Card(
                    child: Column(children: [
                      for (final n in _items)
                        ListTile(
                          tileColor: n['read'] == true ? null : Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.25),
                          leading: Avatar('', icon: (kinds[n['kind']] ?? kinds['custom']!).icon, color: (kinds[n['kind']] ?? kinds['custom']!).color),
                          title: Text('${n['title']}', style: TextStyle(fontWeight: n['read'] == true ? FontWeight.w500 : FontWeight.w700)),
                          subtitle: Text('${n['body']}\n${(kinds[n['kind']] ?? kinds['custom']!).label} • ${when(n['created_at'])}'),
                          isThreeLine: true,
                          onTap: () {
                            if (n['read'] != true) _mark(ids: [(n['id'] as num).toInt()]);
                            final url = '${n['url'] ?? ''}';
                            if (url.startsWith('/#')) {
                              app.pendingRoute = url.substring(2);
                              app.changed();
                            }
                          },
                        ),
                    ]),
                  ),
                if (_loading) const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator())),
                if (_more && !_loading) OutlinedButton(onPressed: () => _load(older: true), child: const Text('تحميل الأقدم')),
              ]),
            ),
            if (admin) AdminNotifications(onExpired: widget.onExpired),
          ]),
        ),
      ]),
    );
  }
}

class AdminNotifications extends StatefulWidget {
  const AdminNotifications({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  State<AdminNotifications> createState() => _AdminNotificationsState();
}

class _AdminNotificationsState extends State<AdminNotifications> {
  int _v = 0;
  @override
  Widget build(BuildContext context) => Loader<Map<String, dynamic>>(
        key: ValueKey(_v),
        load: () => Api.I.get('notify_admin'),
        onExpired: widget.onExpired,
        builder: (context, d, _) {
          final emps = ((d['employees'] as List?) ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          final recent = ((d['recent'] as List?) ?? const []).cast<Map>();
          final total = ((d['stats'] as Map?) ?? {}).values.fold<num>(0, (a, b) => a + numOf(b));
          return ListView(padding: const EdgeInsets.all(12), children: [
            KpiGrid(children: [
              Kpi(label: 'إشعارات آخر 7 أيام', value: total, raw: true, icon: Icons.notifications_active_outlined, color: Yq.teal),
              Kpi(label: 'بأجهزة مفعّلة', value: emps.where((e) => numOf(e['devices']) > 0).length, raw: true, icon: Icons.smartphone, color: Yq.blue, hint: 'من ${emps.length} موظف'),
            ]),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: () async {
                if (await sheet<bool>(context, BroadcastSheet(employees: emps)) == true) setState(() => _v++);
              },
              icon: const Icon(Icons.campaign_outlined),
              label: const Text('إرسال إشعار مخصص'),
            ),
            const SizedBox(height: 12),
            Section(title: 'الموظفون والإشعارات', subtitle: 'اضغط موظفاً لتخصيص إشعاراته', children: [
              for (final e in emps)
                ListTile(
                  leading: Avatar('${e['name']}'),
                  title: Text('${e['name']}'),
                  subtitle: Text('${roleLabel[e['role']] ?? e['role']} • ${numOf(e['devices']) > 0 ? (e['device_names'] as List).join('، ') : 'بلا جهاز'}${e['prefs']?['quiet'] == true ? ' • هدوء ${e['prefs']['quiet_from']}–${e['prefs']['quiet_to']}' : ''}'),
                  trailing: numOf(e['unread']) > 0 ? Pill('${e['unread']}', color: Yq.amber) : null,
                  onTap: () async {
                    await Navigator.push(context, MaterialPageRoute(builder: (_) => Scaffold(
                      appBar: AppBar(title: Text('إشعارات ${e['name']}')),
                      body: ListView(padding: const EdgeInsets.all(12), children: [
                        PrefsEditor(
                          initial: Map<String, dynamic>.from(e['prefs'] as Map),
                          permissions: [...List<String>.from(e['permissions'] as List), if (e['role'] == 'ADMIN') '__admin'],
                          save: (patch) async => Map<String, dynamic>.from((await Api.I.act('notify_admin_set', {'employee_id': e['id'], 'prefs': patch}))['prefs'] as Map),
                        ),
                      ]),
                    )));
                    setState(() => _v++);
                  },
                ),
            ]),
            const SizedBox(height: 12),
            Section(title: 'سجل الإشعارات (7 أيام)', children: [
              for (final n in recent)
                ListTile(
                  leading: Icon((kinds[n['kind']] ?? kinds['custom']!).icon, color: (kinds[n['kind']] ?? kinds['custom']!).color),
                  title: Text('${n['title']}'),
                  subtitle: Text('${n['body']}\n${when(n['created_at'])} • ${n['recipients']} مستلم'),
                ),
            ]),
          ]);
        },
      );
}

class BroadcastSheet extends StatefulWidget {
  const BroadcastSheet({super.key, required this.employees});
  final List<Map<String, dynamic>> employees;
  @override
  State<BroadcastSheet> createState() => _BroadcastSheetState();
}

class _BroadcastSheetState extends State<BroadcastSheet> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  bool _all = true, _urgent = false, _busy = false;
  final _picked = <String>{};
  String? _error;
  @override
  Widget build(BuildContext context) => SheetBody(title: 'إشعار مخصص', subtitle: 'يُضاف اسمك في آخره', children: [
        TextField(controller: _title, maxLength: 80, decoration: const InputDecoration(labelText: 'العنوان')),
        TextField(controller: _body, maxLength: 300, maxLines: 3, decoration: const InputDecoration(labelText: 'النص')),
        SegmentedButton<bool>(
          segments: const [ButtonSegment(value: true, label: Text('كل الموظفين')), ButtonSegment(value: false, label: Text('محددون'))],
          selected: {_all},
          onSelectionChanged: (s) => setState(() => _all = s.first),
        ),
        if (!_all)
          for (final e in widget.employees)
            CheckboxListTile(
              value: _picked.contains(e['id']),
              title: Text('${e['name']}'),
              subtitle: numOf(e['devices']) == 0 ? const Text('صندوق فقط') : null,
              onChanged: (v) => setState(() => v == true ? _picked.add('${e['id']}') : _picked.remove(e['id'])),
            ),
        SwitchListTile(value: _urgent, onChanged: (v) => setState(() => _urgent = v), title: const Text('عاجل'), subtitle: const Text('يتجاوز ساعات الهدوء')),
        if (_error != null) Text(_error!, style: const TextStyle(color: Yq.red)),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: _busy ? null : () async {
            if (!_all && _picked.isEmpty) return setState(() => _error = 'اختر موظفاً واحداً على الأقل');
            setState(() {
              _busy = true;
              _error = null;
            });
            try {
              final r = await Api.I.act('notify_broadcast', {'title': _title.text.trim(), 'body': _body.text.trim(), 'urgent': _urgent, 'employee_ids': _all ? [] : _picked.toList()});
              if (!context.mounted) return;
              toast(context, 'وصل إلى ${r['recipients']} موظف');
              Navigator.pop(context, true);
            } catch (e) {
              setState(() => _error = '$e');
            } finally {
              if (mounted) setState(() => _busy = false);
            }
          },
          icon: _busy ? const Busy() : const Icon(Icons.send),
          label: const Text('إرسال الآن'),
        ),
      ]);
}
