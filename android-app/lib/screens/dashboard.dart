import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../main.dart';
import '../ui.dart';
import 'records.dart';

class DashboardPage extends StatelessWidget {
  const DashboardPage({super.key, required this.go, required this.onExpired});
  final void Function(String) go;
  final VoidCallback onExpired;

  Future<Map<String, dynamic>> _load() async {
    final r = await Future.wait([
      Api.I.get('dashboard'),
      app.can('pos') ? Api.I.get('invoices', {'limit': 5}) : Future.value(<String, dynamic>{}),
      app.can('inventory') ? Api.I.get('products', {'low_only': true, 'limit': 4}) : Future.value(<String, dynamic>{}),
      app.can('customers') ? Api.I.get('customers', {'debtors_only': true, 'limit': 4}) : Future.value(<String, dynamic>{}),
    ]);
    return {...r[0], 'latest': r[1]['invoices'] ?? [], 'low': r[2]['products'] ?? [], 'debtors': r[3]['customers'] ?? []};
  }

  @override
  Widget build(BuildContext context) => Loader<Map<String, dynamic>>(
        load: _load,
        onExpired: onExpired,
        builder: (context, d, reload) {
          final s = d['sales'] as Map?;
          final p = d['profit'] as Map?;
          final series = ((d['series'] as List?) ?? const []).cast<Map>();
          final tiles = <Widget>[
            if (s != null) Kpi(label: 'مبيعات اليوم', value: s['today_total'], icon: Icons.receipt_long, color: Yq.teal, hint: '${s['today_count']} فاتورة • المقبوض ${money(s['today_paid'])}', onTap: () => go('invoices')),
            if (s != null) Kpi(label: 'مبيعات الشهر', value: s['month_total'], icon: Icons.trending_up, color: Yq.blue, hint: '${s['month_count']} فاتورة', onTap: () => go('invoices')),
            if (p != null) Kpi(label: 'ربح اليوم', value: numOf(p['today_revenue']) - numOf(p['today_cost']), icon: Icons.savings_outlined, color: Yq.green, hint: 'الشهر ${money(numOf(p['month_revenue']) - numOf(p['month_cost']))}'),
            if (d['debts'] is Map) Kpi(label: 'ديون الزبائن', value: d['debts']['total'], icon: Icons.account_balance_wallet_outlined, color: Yq.gold, hint: '${d['debts']['debtors']} زبون • المحصّل اليوم ${money((d['collected'] as Map?)?['today'])}', onTap: () => go('customers')),
            if (d['vault_balance'] != null) Kpi(label: 'رصيد الخزنة', value: d['vault_balance'], icon: Icons.account_balance_outlined, color: Yq.purple, onTap: () => go('vault')),
            if (d['expenses'] is Map) Kpi(label: 'مصروفات اليوم', value: d['expenses']['today'], icon: Icons.north_east, color: Yq.red, hint: 'الشهر ${money(d['expenses']['month'])}', onTap: () => go('expenses')),
            if (d['my_sales'] is Map && s == null) Kpi(label: 'مبيعاتي اليوم', value: d['my_sales']['total'], icon: Icons.receipt_long, color: Yq.teal, hint: '${d['my_sales']['count']} فاتورة'),
            if (d['repairs'] is Map) Kpi(label: 'صيانة مفتوحة', value: d['repairs']['open'], raw: true, icon: Icons.build_outlined, color: Yq.blue, hint: '${d['repairs']['ready']} جاهزة', onTap: () => go('repairs')),
            if (d['stock'] is Map) Kpi(label: 'تحت حد التنبيه', value: d['stock']['low'], raw: true, icon: Icons.inventory_2_outlined, color: Yq.amber, hint: '${d['stock']['out']} نفدت', onTap: () => go(app.can('shortages') ? 'shortages' : 'products')),
          ];
          final maxV = series.fold<num>(1, (m, x) => numOf(x['total']) > m ? numOf(x['total']) : m);
          return ListView(padding: const EdgeInsets.all(14), children: [
            Text('أهلاً ${app.employeeName} 👋', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            Text('${todayLong()} • ${app.storeName}', style: TextStyle(color: Theme.of(context).colorScheme.outline)),
            const SizedBox(height: 14),
            KpiGrid(children: tiles),
            if (series.isNotEmpty) ...[
              const SizedBox(height: 14),
              Section(title: 'مبيعات آخر 7 أيام', subtitle: 'إجمالي الفواتير لكل يوم', children: [
                SizedBox(
                  height: 190,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      for (final x in series)
                        Expanded(
                          child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                            Text(numOf(x['total']) > 0 ? '${money(numOf(x['total']) / 1000)}k' : '', style: TextStyle(fontSize: 10, color: Theme.of(context).colorScheme.outline)),
                            const SizedBox(height: 4),
                            Container(
                              height: 4 + 120 * (numOf(x['total']) / maxV).toDouble(),
                              margin: const EdgeInsets.symmetric(horizontal: 5),
                              decoration: BoxDecoration(
                                borderRadius: const BorderRadius.vertical(top: Radius.circular(8), bottom: Radius.circular(3)),
                                color: x['day'] == d['today'] ? Yq.gold : Yq.teal,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(weekday('${x['day']}'), style: const TextStyle(fontSize: 10)),
                          ]),
                        ),
                    ]),
                  ),
                ),
              ]),
            ],
            if ((d['low'] as List).isNotEmpty || (d['debtors'] as List).isNotEmpty) ...[
              const SizedBox(height: 14),
              Section(title: 'تحتاج انتباهك', children: [
                for (final r in (d['low'] as List).cast<Map>())
                  ListTile(leading: const Avatar('', icon: Icons.inventory_2_outlined, color: Yq.amber), title: Text('${r['name']}'), subtitle: Text('${r['stock_quantity']} متبقية • الحد ${r['min_stock_alert']}'), onTap: () => go(app.can('shortages') ? 'shortages' : 'products')),
                for (final r in (d['debtors'] as List).cast<Map>())
                  ListTile(leading: const Avatar('', icon: Icons.account_balance_wallet_outlined, color: Yq.red), title: Text('${r['name']}'), subtitle: Text('عليه ${iqd(r['balance'])}'), onTap: () => go('customers')),
              ]),
            ],
            if ((d['latest'] as List).isNotEmpty) ...[
              const SizedBox(height: 14),
              Section(
                title: 'آخر الفواتير',
                trailing: TextButton(onPressed: () => go('invoices'), child: const Text('عرض الكل')),
                children: [for (final r in (d['latest'] as List).cast<Map>()) InvoiceTile(Map<String, dynamic>.from(r), onExpired: onExpired)],
              ),
            ],
            const SizedBox(height: 24),
          ]);
        },
      );
}
