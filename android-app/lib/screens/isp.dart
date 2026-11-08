import 'package:flutter/material.dart';

import '../format.dart';
import '../main.dart';
import '../ui.dart';
import 'debts.dart';
import 'records.dart';

Uri? ispReminder(Map<String, dynamic> s) {
  final name = s['customer_name'] ?? s['display_name'];
  final date = dateOnly(s['expires_at']);
  return waLink(s['customer_phone'], s['state'] == 'expired'
      ? 'مرحباً $name،\nانتهى اشتراك الإنترنت (${s['username']}) بتاريخ $date.\nللتجديد تواصل معنا — ${app.storeName} 🌐'
      : 'مرحباً $name،\nاشتراك الإنترنت (${s['username']}) ينتهي بتاريخ $date.\nجدّد مبكراً حتى لا ينقطع الخط — ${app.storeName} 🌐');
}

class IspPage extends StatelessWidget {
  const IspPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  Widget build(BuildContext context) => PagedList(
        resource: 'isp', listKey: 'subscribers', onExpired: onExpired, pageSize: 300,
        searchHint: 'اسم المشترك، اسم المستخدم، أو الزبون…',
        filters: const {'status=all': 'الكل', 'status=expired': 'منتهية', 'status=soon': 'قريبة', 'status=active': 'فعّالة', 'status=unlinked': 'غير مربوط'},
        emptyText: 'لا يوجد مشتركون هنا. يُضافون عند ربطهم من قسم الإنترنت في برنامج المكتب.',
        header: (meta, reload) {
          final s = meta['summary'] as Map? ?? {};
          final accounts = ((meta['accounts'] as List?) ?? const []).cast<Map>();
          return Column(children: [
            KpiGrid(children: [
              Kpi(label: 'المشتركون', value: s['total'] ?? 0, raw: true, icon: Icons.wifi, color: Yq.teal, hint: '${s['unlinked'] ?? 0} غير مربوطين'),
              Kpi(label: 'منتهية', value: s['expired'] ?? 0, raw: true, icon: Icons.wifi_off, color: Yq.red),
              Kpi(label: 'تنتهي خلال 3 أيام', value: s['soon'] ?? 0, raw: true, icon: Icons.schedule, color: Yq.amber),
              Kpi(label: 'تجديدات معلّقة', value: meta['unresolved'] ?? 0, raw: true, icon: Icons.warning_amber_rounded, color: Yq.purple),
            ]),
            for (final a in accounts)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Card(
                  child: ListTile(
                    leading: const Avatar('', icon: Icons.dns_outlined, color: Yq.blue),
                    title: Text('${a['name']} • ${a['provider']}'),
                    subtitle: Text('${a['subscribers']} مشترك محفوظ • آخر دخول للمزود ${when(a['last_login_at'])}${a['last_error'] != null ? '\nآخر خطأ: ${a['last_error']}' : ''}'),
                    trailing: Pill(a['active'] == true ? 'مفعّل' : 'موقوف', color: a['active'] == true ? Yq.green : Yq.red),
                  ),
                ),
              ),
            const SizedBox(height: 10),
          ]);
        },
        itemBuilder: (context, r, _) {
          final st = r['state'];
          final days = (r['days_left'] as num?)?.toInt();
          final color = st == 'expired' ? Yq.red : st == 'soon' ? Yq.amber : Yq.green;
          final wa = ispReminder(r);
          return ListTile(
            leading: Avatar('', icon: Icons.router_outlined, color: color),
            title: Text('${r['display_name'] ?? r['username']}'),
            subtitle: Text('${r['username']} • ${r['package_name'] ?? ''}\n'
                '${r['customer_id'] != null ? '${r['customer_name']}${numOf(r['customer_balance']) > 0 ? ' • عليه ${money(r['customer_balance'])}' : ''}' : 'غير مربوط بزبون'}'),
            isThreeLine: true,
            trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
              Pill(st == 'expired' ? 'منتهي' : st == 'soon' ? 'قريب' : st == 'active' ? 'فعّال' : '؟', color: color),
              Text(days == null ? '' : days < 0 ? 'منذ ${-days} يوم' : days == 0 ? 'اليوم' : 'بعد $days يوم', style: const TextStyle(fontSize: 11)),
            ]),
            onTap: wa == null ? null : () => openUrl(context, wa),
          );
        },
      );
}
