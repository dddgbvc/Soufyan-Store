import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../main.dart';
import '../ui.dart';

const _kinds = {'sale': 'بيع', 'deposit': 'إيداع', 'withdraw': 'سحب', 'expense': 'مصروف', 'debt_payment': 'تسديد دين', 'return': 'مرتجع', 'reversal': 'عكس قيد', 'opening': 'رصيد افتتاحي'};

class VaultPage extends StatefulWidget {
  const VaultPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  State<VaultPage> createState() => _VaultPageState();
}

class _VaultPageState extends State<VaultPage> {
  int _v = 0;
  @override
  Widget build(BuildContext context) => Loader<Map<String, dynamic>>(
        key: ValueKey(_v),
        load: () => Api.I.get('vault', {'limit': 100}),
        onExpired: widget.onExpired,
        builder: (context, d, _) {
          final entries = ((d['entries'] as List?) ?? const []).cast<Map>();
          final today = d['today'] as Map? ?? {};
          Future<void> txn(String kind) async {
            if (await sheet<bool>(context, VaultTxnSheet(kind: kind, balance: numOf(d['balance']))) == true) setState(() => _v++);
          }

          return ListView(padding: const EdgeInsets.all(14), children: [
            Kpi(label: 'رصيد الخزنة', value: d['balance'], icon: Icons.account_balance_outlined, color: Yq.purple, hint: 'الخزنة الرئيسية'),
            const SizedBox(height: 10),
            KpiGrid(children: [
              Kpi(label: 'وارد اليوم', value: today['in'], icon: Icons.south_west, color: Yq.green),
              Kpi(label: 'صادر اليوم', value: today['out'], icon: Icons.north_east, color: Yq.red),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              if (app.can('vaults.deposit')) Expanded(child: FilledButton.icon(onPressed: () => txn('deposit'), icon: const Icon(Icons.south_west), label: const Text('إيداع'))),
              if (app.can('vaults.deposit') && app.can('vaults.withdraw')) const SizedBox(width: 10),
              if (app.can('vaults.withdraw')) Expanded(child: OutlinedButton.icon(onPressed: () => txn('withdraw'), icon: const Icon(Icons.north_east), label: const Text('سحب'))),
            ]),
            const SizedBox(height: 14),
            Section(title: 'الحركات', subtitle: 'آخر ${entries.length} حركة', children: [
              for (final e in entries)
                ListTile(
                  leading: Avatar('', icon: e['direction'] == 'in' ? Icons.south_west : Icons.north_east, color: e['direction'] == 'in' ? Yq.green : Yq.red),
                  title: Text(_kinds[e['kind']] ?? '${e['kind']}'),
                  subtitle: Text('${e['note'] ?? ''}${e['note'] != null ? '\n' : ''}${e['actor'] ?? ''} • ${when(e['created_at'])}'),
                  trailing: Text('${e['direction'] == 'out' ? '−' : '+'}${iqd(e['amount'])}', style: TextStyle(fontWeight: FontWeight.w700, color: e['direction'] == 'in' ? Yq.green : Yq.red)),
                ),
            ]),
          ]);
        },
      );
}

class VaultTxnSheet extends StatefulWidget {
  const VaultTxnSheet({super.key, required this.kind, required this.balance});
  final String kind;
  final num balance;
  @override
  State<VaultTxnSheet> createState() => _VaultTxnSheetState();
}

class _VaultTxnSheetState extends State<VaultTxnSheet> {
  final _amount = TextEditingController();
  final _note = TextEditingController();
  final _cid = clientId();
  bool _busy = false;
  String? _error;
  @override
  Widget build(BuildContext context) {
    final dep = widget.kind == 'deposit';
    return SheetBody(title: dep ? 'إيداع في الخزنة' : 'سحب من الخزنة', subtitle: 'الرصيد الحالي ${iqd(widget.balance)}', children: [
      MoneyField(controller: _amount, label: 'المبلغ', autofocus: true),
      const SizedBox(height: 10),
      TextField(controller: _note, decoration: const InputDecoration(labelText: 'البيان', hintText: 'يظهر في سجل الخزنة')),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, style: const TextStyle(color: Yq.red))),
      const SizedBox(height: 16),
      FilledButton(
        style: dep ? null : FilledButton.styleFrom(backgroundColor: Yq.red),
        onPressed: _busy ? null : () async {
          if (!dep && moneyValue(_amount) > widget.balance) return setState(() => _error = 'المبلغ أكبر من رصيد الخزنة');
          setState(() {
            _busy = true;
            _error = null;
          });
          try {
            await Api.I.act('vault_txn', {'kind': widget.kind, 'amount': moneyValue(_amount), 'note': _note.text.trim(), 'client_id': _cid});
            if (!context.mounted) return;
            toast(context, dep ? 'تم الإيداع' : 'تم السحب');
            Navigator.pop(context, true);
          } catch (e) {
            setState(() => _error = e is SessionExpired ? 'انتهت الجلسة' : '$e');
          } finally {
            if (mounted) setState(() => _busy = false);
          }
        },
        child: _busy ? const Busy() : Text(dep ? 'إيداع' : 'سحب'),
      ),
    ]);
  }
}
