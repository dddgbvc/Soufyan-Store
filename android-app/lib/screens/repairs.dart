import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../main.dart';
import '../ui.dart';
import 'debts.dart';
import 'records.dart';

class RepairsPage extends StatefulWidget {
  const RepairsPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  State<RepairsPage> createState() => _RepairsPageState();
}

class _RepairsPageState extends State<RepairsPage> {
  final _list = GlobalKey<PagedListState>();
  @override
  Widget build(BuildContext context) => PagedList(
        key: _list,
        resource: 'repairs', listKey: 'repairs', onExpired: widget.onExpired,
        searchHint: 'رقم التذكرة، الزبون، الجهاز أو IMEI…',
        filters: const {'status=OPEN': 'مفتوحة', 'status=READY': 'جاهزة', 'status=ALL': 'الكل', 'mine=true': 'تذاكري'},
        itemBuilder: (context, r, reload) {
          final ready = r['status'] == 'READY';
          return ListTile(
            leading: Avatar('', icon: Icons.build_outlined, color: ready ? Yq.green : Yq.blue),
            title: Text('${r['device'] ?? 'جهاز'} • ${r['customer_name'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text('${r['ticket_no']} • ${r['fault'] ?? ''}${r['technician_name'] != null ? '\nالفني: ${r['technician_name']}' : ''}'),
            trailing: Pill('${r['status_label'] ?? r['status']}', color: ready ? Yq.green : r['status'] == 'CANCELLED' ? Yq.red : Yq.amber),
            onTap: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => RepairDetailPage(id: '${r['id']}', onExpired: widget.onExpired)));
              reload();
            },
          );
        },
      );
}

class RepairDetailPage extends StatefulWidget {
  const RepairDetailPage({super.key, required this.id, required this.onExpired});
  final String id;
  final VoidCallback onExpired;
  @override
  State<RepairDetailPage> createState() => _RepairDetailPageState();
}

class _RepairDetailPageState extends State<RepairDetailPage> {
  int _v = 0;
  String? _busy;

  Future<void> _move(String code, String label) async {
    String? reason;
    if (code == 'UNREPAIRABLE') {
      final c = TextEditingController();
      final ok = await showDialog<bool>(
        context: context,
        builder: (d) => AlertDialog(
          title: const Text('سبب عدم إمكانية الإصلاح'),
          content: TextField(controller: c, autofocus: true),
          actions: [TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('إلغاء')), FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('حفظ'))],
        ),
      );
      if (ok != true || c.text.trim().isEmpty) return;
      reason = c.text.trim();
    } else if (!mounted || !await confirm(context, 'نقل إلى «$label»؟', 'سيُسجّل التغيير باسمك.')) {
      return;
    }
    setState(() => _busy = code);
    try {
      await Api.I.act('repair_status', {'repair_id': widget.id, 'to_status': code, 'reason': reason});
      if (!mounted) return;
      toast(context, 'حُدّثت الحالة إلى «$label»');
      setState(() => _v++);
    } on SessionExpired {
      widget.onExpired();
    } catch (e) {
      if (mounted) toast(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('تذكرة صيانة')),
        body: Loader<Map<String, dynamic>>(
          key: ValueKey(_v),
          load: () => Api.I.get('repair', {'id': widget.id}),
          onExpired: widget.onExpired,
          builder: (context, d, _) {
            final r = Map<String, dynamic>.from(d['repair'] as Map);
            final next = ((d['next_statuses'] as List?) ?? const []).cast<Map>();
            final history = ((d['history'] as List?) ?? const []).cast<Map>();
            final rest = numOf(r['cost']) + numOf(r['labour']) - numOf(r['prepaid']);
            final phone = '${r['customer_phone'] ?? ''}';
            return ListView(padding: const EdgeInsets.all(14), children: [
              Text('${r['ticket_no']} • ${r['device'] ?? ''}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              Text('${r['customer_name'] ?? ''} • $phone', style: TextStyle(color: Theme.of(context).colorScheme.outline)),
              const SizedBox(height: 10),
              Wrap(spacing: 8, children: [
                Pill('${r['status_label'] ?? r['status']}', color: r['status'] == 'READY' ? Yq.green : Yq.amber),
                if (r['promised_at'] != null) Pill('موعد التسليم ${when(r['promised_at'])}', color: Yq.blue),
              ]),
              const SizedBox(height: 12),
              KpiGrid(children: [
                Kpi(label: 'الكلفة الكلية', value: numOf(r['cost']) + numOf(r['labour']), icon: Icons.receipt_outlined, color: Yq.teal),
                Kpi(label: 'المتبقي على الزبون', value: rest, icon: Icons.account_balance_wallet_outlined, color: rest > 0 ? Yq.gold : Yq.green, hint: 'مدفوع مقدماً ${money(r['prepaid'])}'),
              ]),
              const SizedBox(height: 12),
              Section(title: 'التفاصيل', children: [
                ListTile(title: const Text('العطل'), subtitle: Text('${r['fault'] ?? '—'}')),
                if (r['diagnosis'] != null) ListTile(title: const Text('التشخيص'), subtitle: Text('${r['diagnosis']}')),
                ListTile(title: const Text('الفني'), subtitle: Text('${r['technician_name'] ?? '—'}')),
                if (r['imei'] != null) ListTile(title: const Text('IMEI'), subtitle: Text('${r['imei']}', textDirection: TextDirection.ltr)),
                if (r['accessories'] != null) ListTile(title: const Text('الملحقات'), subtitle: Text('${r['accessories']}')),
              ]),
              if (phone.isNotEmpty) ...[
                const SizedBox(height: 10),
                Wrap(spacing: 8, children: [
                  OutlinedButton.icon(
                    onPressed: () => openUrl(context, waLink(phone, r['status'] == 'READY'
                        ? 'مرحباً ${r['customer_name']}، جهازك (${r['device']}) جاهز للاستلام في ${app.storeName}${rest > 0 ? '. المبلغ المتبقي ${money(rest)} د.ع' : ''} 🔧'
                        : 'مرحباً ${r['customer_name']}، بخصوص جهازك (${r['device']}) لدى ${app.storeName}: ')),
                    icon: const Icon(Icons.chat_outlined, color: Color(0xFF25A35A)),
                    label: Text(r['status'] == 'READY' ? 'أبلغه أنه جاهز' : 'واتساب'),
                  ),
                  OutlinedButton.icon(onPressed: () => openUrl(context, Uri(scheme: 'tel', path: phone)), icon: const Icon(Icons.call_outlined), label: const Text('اتصال')),
                ]),
              ],
              if (next.isNotEmpty) ...[
                const SizedBox(height: 14),
                Section(title: 'نقل الحالة', subtitle: 'التسليم والإلغاء من برنامج المكتب لأنهما يحرّكان المال', children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 4, 14, 10),
                    child: Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final s in next)
                        (s['code'] == 'READY' ? FilledButton.new : OutlinedButton.new)(
                          onPressed: _busy != null ? null : () => _move('${s['code']}', '${s['label']}'),
                          child: _busy == s['code'] ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text('${s['label']}'),
                        ),
                    ]),
                  ),
                ]),
              ],
              const SizedBox(height: 14),
              Section(title: 'السجل', children: [
                for (final h in history)
                  ListTile(leading: const Icon(Icons.history), title: Text('${h['to_label'] ?? h['to']}'), subtitle: Text('${when(h['at'])}${h['actor'] != null ? ' • ${h['actor']}' : ''}${h['reason'] != null ? '\n${h['reason']}' : ''}')),
              ]),
              const SizedBox(height: 24),
            ]);
          },
        ),
      );
}
