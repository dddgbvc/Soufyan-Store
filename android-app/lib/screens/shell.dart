import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../main.dart';
import '../notify.dart';
import '../ui.dart';
import 'dashboard.dart';
import 'debts.dart';
import 'inbox.dart';
import 'isp.dart';
import 'records.dart';
import 'repairs.dart';
import 'settings.dart';
import 'vault.dart';

class SectionDef {
  const SectionDef(this.key, this.title, this.icon, this.perms, this.group);
  final String key;
  final String title;
  final IconData icon;
  final List<String> perms;
  final String group;
}

const sections = <SectionDef>[
  SectionDef('dashboard', 'نظرة عامة', Icons.space_dashboard_outlined, ['dashboard'], 'work'),
  SectionDef('invoices', 'المبيعات والفواتير', Icons.receipt_long_outlined, ['pos'], 'work'),
  SectionDef('customers', 'الديون والزبائن', Icons.account_balance_wallet_outlined, ['customers'], 'work'),
  SectionDef('vault', 'الخزنة', Icons.account_balance_outlined, ['vaults'], 'work'),
  SectionDef('products', 'المخزون', Icons.inventory_2_outlined, ['inventory'], 'work'),
  SectionDef('shortages', 'النواقص', Icons.production_quantity_limits_outlined, ['shortages'], 'work'),
  SectionDef('repairs', 'الصيانة', Icons.build_outlined, ['repairs'], 'ops'),
  SectionDef('isp', 'الإنترنت (ISP)', Icons.wifi, ['customers'], 'ops'),
  SectionDef('returns', 'المرتجعات', Icons.assignment_return_outlined, ['returns'], 'ops'),
  SectionDef('expenses', 'المصروفات', Icons.payments_outlined, ['expenses'], 'ops'),
  SectionDef('shipping', 'الشحن والتوصيل', Icons.local_shipping_outlined, ['shipping', 'shipping.view'], 'ops'),
  SectionDef('employees', 'الموظفون', Icons.groups_outlined, ['employees'], 'admin'),
  SectionDef('sessions', 'الجلسات والأجهزة', Icons.devices_outlined, ['employees', 'employees.permissions'], 'admin'),
  SectionDef('notifications', 'مركز الإشعارات', Icons.notifications_outlined, [], 'admin'),
  SectionDef('settings', 'الإعدادات', Icons.settings_outlined, [], 'admin'),
];

const _groups = {'work': 'مساحة العمل', 'ops': 'العمليات', 'admin': 'الإدارة'};

class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> with WidgetsBindingObserver {
  late final List<SectionDef> _allowed = sections.where((s) => s.perms.every(app.can)).toList();
  late String _page = _allowed.first.key;
  int _unread = 0;
  DateTime _last = DateTime.now();
  Timer? _idle, _poll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _idle = Timer.periodic(const Duration(seconds: 15), (_) {
      if (DateTime.now().difference(_last).inMinutes >= app.idleMinutes) app.lock('قُفلت الشاشة تلقائياً بعد فترة خمول.');
    });
    _poll = Timer.periodic(const Duration(seconds: 60), (_) => _refreshUnread());
    _refreshUnread();
    app.addListener(_route);
    _route();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    app.removeListener(_route);
    _idle?.cancel();
    _poll?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed) {
      if (DateTime.now().difference(_last).inMinutes >= app.idleMinutes) {
        app.lock('قُفلت الشاشة تلقائياً بعد فترة خمول.');
      } else {
        _refreshUnread();
      }
    }
  }

  void _route() {
    final r = app.pendingRoute;
    if (r != null && _allowed.any((s) => s.key == r)) {
      app.pendingRoute = null;
      setState(() => _page = r);
    }
  }

  Future<void> _refreshUnread() async {
    try {
      await pollOnce();
      final d = await Api.I.get('inbox', {'limit': 1});
      if (mounted) setState(() => _unread = (d['unread'] as num?)?.toInt() ?? 0);
    } on SessionExpired {
      app.lock('انتهت الجلسة. أدخل رمزك من جديد.');
    } catch (_) {}
  }

  void expired() => app.lock('انتهت الجلسة. أدخل رمزك من جديد.');

  void go(String key) {
    if (!_allowed.any((s) => s.key == key)) return;
    setState(() => _page = key);
  }

  Widget _body() {
    switch (_page) {
      case 'dashboard': return DashboardPage(go: go, onExpired: expired);
      case 'invoices': return InvoicesPage(onExpired: expired);
      case 'customers': return DebtsPage(onExpired: expired);
      case 'vault': return VaultPage(onExpired: expired);
      case 'products': return ProductsPage(onExpired: expired);
      case 'shortages': return ShortagesPage(onExpired: expired);
      case 'repairs': return RepairsPage(onExpired: expired);
      case 'isp': return IspPage(onExpired: expired);
      case 'returns': return ReturnsPage(onExpired: expired);
      case 'expenses': return ExpensesPage(onExpired: expired);
      case 'shipping': return ShippingPage(onExpired: expired);
      case 'employees': return EmployeesPage(onExpired: expired);
      case 'sessions': return SessionsPage(onExpired: expired);
      case 'notifications': return InboxPage(onExpired: expired, onUnread: (n) => setState(() => _unread = n));
      default: return SettingsPage(onExpired: expired);
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = _allowed.firstWhere((s) => s.key == _page, orElse: () => _allowed.first);
    return Listener(
      onPointerDown: (_) => _last = DateTime.now(),
      child: Scaffold(
        appBar: AppBar(
          title: Text(current.title),
          actions: [
            IconButton(
              tooltip: 'مركز الإشعارات',
              onPressed: () => go('notifications'),
              icon: Badge(isLabelVisible: _unread > 0, label: Text(_unread > 99 ? '99+' : '$_unread'), child: const Icon(Icons.notifications_outlined)),
            ),
            IconButton(tooltip: 'قفل وتبديل الموظف', onPressed: () => app.lock(), icon: const Icon(Icons.lock_outline)),
          ],
        ),
        drawer: NavigationDrawer(
          selectedIndex: _allowed.indexOf(current),
          onDestinationSelected: (i) {
            Navigator.pop(context);
            setState(() => _page = _allowed[i].key);
          },
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 10),
              child: Row(children: [
                const BrandMark(size: 46),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(app.storeName, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text('${app.employeeName} • ${roleLabel[app.employee['role']] ?? app.employee['role'] ?? ''}', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline)),
                ])),
              ]),
            ),
            for (final g in _groups.keys)
              if (_allowed.any((s) => s.group == g)) ...[
                Padding(padding: const EdgeInsets.fromLTRB(28, 12, 16, 6), child: Text(_groups[g]!, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline))),
                for (final s in _allowed.where((s) => s.group == g))
                  NavigationDrawerDestination(
                    icon: s.key == 'notifications' && _unread > 0 ? Badge(label: Text('$_unread'), child: Icon(s.icon)) : Icon(s.icon),
                    label: Text(s.title),
                  ),
              ],
            const SizedBox(height: 16),
          ],
        ),
        body: KeyedSubtree(key: ValueKey(_page), child: _body()),
      ),
    );
  }
}
