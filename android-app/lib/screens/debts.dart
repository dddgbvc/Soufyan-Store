import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../format.dart';
import '../main.dart';
import '../ui.dart';
import 'records.dart';

Future<void> openUrl(BuildContext context, Uri? uri) async {
  if (uri == null) return;
  if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && context.mounted) {
    toast(context, 'تعذر فتح التطبيق', error: true);
  }
}

Uri? debtReminder(Map<String, dynamic> c) => waLink(c['phone'],
    'مرحباً ${c['name']}،\nنود تذكيرك بأن رصيدك المستحق لدى ${app.storeName} هو ${money(c['balance'])} د.ع.\nشكراً لتعاملك معنا 🌷');

class DebtsPage extends StatefulWidget {
  const DebtsPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  State<DebtsPage> createState() => _DebtsPageState();
}

class _DebtsPageState extends State<DebtsPage> {
  final _list = GlobalKey<PagedListState>();

  Future<void> _after(Future<bool?> f) async {
    if (await f == true) _list.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.transparent,
        floatingActionButton: app.can('customers.debt_addition') || app.can('customers.edit')
            ? FloatingActionButton.extended(
                onPressed: () => showModalBottomSheet(
                  context: context,
                  showDragHandle: true,
                  builder: (c) => SafeArea(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      if (app.can('customers.edit'))
                        ListTile(leading: const Icon(Icons.person_add_alt_1_outlined), title: const Text('زبون جديد'), subtitle: const Text('مع دين افتتاحي اختياري'), onTap: () {
                          Navigator.pop(c);
                          _after(sheet<bool>(context, const NewCustomerSheet()));
                        }),
                      if (app.can('customers.debt_addition'))
                        ListTile(leading: const Icon(Icons.add_card_outlined), title: const Text('دين على زبون موجود'), onTap: () {
                          Navigator.pop(c);
                          _after(sheet<bool>(context, const AddDebtSheet()));
                        }),
                    ]),
                  ),
                ),
                icon: const Icon(Icons.add),
                label: const Text('دين / زبون'),
              )
            : null,
        body: PagedList(
          key: _list,
          resource: 'customers', listKey: 'customers', onExpired: widget.onExpired,
          searchHint: 'اسم الزبون أو رقم الهاتف…',
          filters: const {'debtors_only=true': 'عليهم ديون', '': 'كل الزبائن'},
          cursor: (_, n) => {'offset': n},
          emptyText: 'لا توجد ديون مستحقة 🎉',
          header: (meta, reload) => _Summary(onExpired: widget.onExpired),
          itemBuilder: (context, r, reload) => CustomerTile(r, onChanged: reload, onExpired: widget.onExpired),
        ),
      );
}

class _Summary extends StatelessWidget {
  const _Summary({required this.onExpired});
  final VoidCallback onExpired;
  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
        future: Api.I.get('dashboard'),
        builder: (context, s) {
          final d = s.data?['debts'] as Map?;
          final col = s.data?['collected'] as Map?;
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: KpiGrid(children: [
              Kpi(label: 'إجمالي الديون', value: d?['total'] ?? 0, icon: Icons.account_balance_wallet_outlined, color: Yq.gold, hint: '${d?['debtors'] ?? 0} زبون عليهم رصيد'),
              Kpi(label: 'المحصّل اليوم', value: col?['today'] ?? 0, icon: Icons.south_west, color: Yq.green, hint: 'الشهر ${money(col?['month'])}'),
            ]),
          );
        },
      );
}

class CustomerTile extends StatelessWidget {
  const CustomerTile(this.r, {super.key, required this.onChanged, required this.onExpired});
  final Map<String, dynamic> r;
  final VoidCallback onChanged;
  final VoidCallback onExpired;
  @override
  Widget build(BuildContext context) {
    final bal = numOf(r['balance']);
    final limit = numOf(r['credit_limit']);
    final pct = limit > 0 ? (bal / limit).clamp(0, 1).toDouble() : 0.0;
    return ListTile(
      leading: Avatar('${r['name']}', color: bal > 0 ? Yq.gold : Yq.teal),
      title: Text('${r['name']}', maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${r['phone'] ?? 'بدون هاتف'}', textDirection: TextDirection.ltr),
        if (limit > 0) ...[
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(9),
            child: LinearProgressIndicator(value: pct, minHeight: 5, color: pct >= .9 ? Yq.red : pct >= .6 ? Yq.amber : Yq.green, backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest),
          ),
        ],
      ]),
      trailing: Text(iqd(bal), style: TextStyle(fontWeight: FontWeight.w700, color: bal > 0 ? Yq.gold : null)),
      onTap: () async {
        await Navigator.push(context, MaterialPageRoute(builder: (_) => StatementPage(customer: r, onExpired: onExpired)));
        onChanged();
      },
    );
  }
}

// ====================================================================== كشف الحساب
class StatementPage extends StatefulWidget {
  const StatementPage({super.key, required this.customer, required this.onExpired});
  final Map<String, dynamic> customer;
  final VoidCallback onExpired;
  @override
  State<StatementPage> createState() => _StatementPageState();
}

class _StatementPageState extends State<StatementPage> {
  int _v = 0;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('${widget.customer['name']}')),
        body: Loader<Map<String, dynamic>>(
          key: ValueKey(_v),
          load: () => Api.I.get('statement', {'id': widget.customer['id']}),
          onExpired: () {
            Navigator.pop(context);
            widget.onExpired();
          },
          builder: (context, d, reload) {
            final c = Map<String, dynamic>.from(d['customer'] as Map);
            final moves = ((d['movements'] as List?) ?? const []).cast<Map>();
            final bal = numOf(c['balance']);
            Future<void> act(Widget s) async {
              if (await sheet<bool>(context, s) == true) setState(() => _v++);
            }

            return ListView(padding: const EdgeInsets.all(14), children: [
              KpiGrid(children: [
                Kpi(label: 'الرصيد المستحق', value: bal, icon: Icons.account_balance_wallet_outlined, color: bal > 0 ? Yq.gold : Yq.green),
                Kpi(label: 'سقف الدين', value: c['credit_limit'], icon: Icons.speed, color: Yq.blue, hint: numOf(c['credit_limit']) == 0 ? 'بلا سقف' : null),
              ]),
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: [
                if (app.can('customers.payment') && bal > 0) FilledButton.icon(onPressed: () => act(PayDebtSheet(customer: c)), icon: const Icon(Icons.payments_outlined), label: const Text('تسديد')),
                if (app.can('customers.debt_addition')) OutlinedButton.icon(onPressed: () => act(AddDebtSheet(customer: c)), icon: const Icon(Icons.add), label: const Text('إضافة دين')),
                if (bal > 0 && debtReminder(c) != null) OutlinedButton.icon(onPressed: () => openUrl(context, debtReminder(c)), icon: const Icon(Icons.chat_outlined, color: Color(0xFF25A35A)), label: const Text('تذكير واتساب')),
                if ('${c['phone'] ?? ''}'.isNotEmpty) OutlinedButton.icon(onPressed: () => openUrl(context, Uri(scheme: 'tel', path: '${c['phone']}')), icon: const Icon(Icons.call_outlined), label: const Text('اتصال')),
              ]),
              const SizedBox(height: 14),
              Section(title: 'الحركات', subtitle: '${moves.length} حركة', children: [
                if (moves.isEmpty) const EmptyView(text: 'لا توجد حركات بعد'),
                for (final m in moves) _Move(Map<String, dynamic>.from(m)),
              ]),
            ]);
          },
        ),
      );
}

class _Move extends StatelessWidget {
  const _Move(this.m);
  final Map<String, dynamic> m;
  @override
  Widget build(BuildContext context) {
    final kind = m['kind'];
    final isInv = kind == 'invoice', isPay = kind == 'payment';
    final color = isInv ? Yq.teal : isPay ? Yq.green : Yq.gold;
    final details = <String>[
      when(m['at']),
      if (m['actor'] != null) '${m['actor']}',
      if (isInv && numOf(m['total']) > numOf(m['paid'])) 'آجل ${money(numOf(m['total']) - numOf(m['paid']))}',
      if (!isInv && m['remaining'] != null) 'الرصيد بعدها ${money(m['remaining'])}',
      if (numOf(m['waived']) > 0) 'مسامحة ${money(m['waived'])}',
    ];
    return ListTile(
      leading: Avatar('', icon: isInv ? Icons.receipt_long_outlined : isPay ? Icons.south_west : Icons.north_east, color: color),
      title: Text(isInv ? 'فاتورة ${m['ref'] ?? ''}' : isPay ? 'تسديد' : 'إضافة دين'),
      subtitle: Text(details.join(' • ') + ('${m['notes'] ?? ''}'.isNotEmpty ? '\n${m['notes']}' : '')),
      trailing: Text(isInv ? iqd(m['total']) : '${isPay ? '−' : '+'}${iqd(m['amount'])}', style: TextStyle(fontWeight: FontWeight.w700, color: color)),
    );
  }
}

// ====================================================================== إضافة دين
class AddDebtSheet extends StatefulWidget {
  const AddDebtSheet({super.key, this.customer});
  final Map<String, dynamic>? customer;
  @override
  State<AddDebtSheet> createState() => _AddDebtSheetState();
}

class _AddDebtSheetState extends State<AddDebtSheet> {
  Map<String, dynamic>? _c;
  final _amount = TextEditingController();
  final _notes = TextEditingController();
  final _cid = clientId();
  bool _busy = false;
  String? _error;
  List<Map<String, dynamic>> _results = [];

  @override
  void initState() {
    super.initState();
    _c = widget.customer;
  }

  Future<void> _search(String q) async {
    if (q.trim().length < 2) {
      setState(() => _results = []);
      return;
    }
    try {
      final d = await Api.I.get('customers', {'q': q.trim(), 'limit': 8});
      if (mounted) setState(() => _results = ((d['customers'] as List?) ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList());
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final c = _c;
    if (c == null) {
      return SheetBody(title: 'دين جديد', subtitle: 'اختر الزبون', children: [
        TextField(autofocus: true, decoration: const InputDecoration(hintText: 'ابحث باسم الزبون أو رقمه…', prefixIcon: Icon(Icons.search)), onChanged: _search),
        const SizedBox(height: 8),
        for (final r in _results)
          ListTile(contentPadding: EdgeInsets.zero, leading: Avatar('${r['name']}'), title: Text('${r['name']}'), subtitle: Text('${r['phone'] ?? ''}'), trailing: Text(iqd(r['balance'])), onTap: () => setState(() => _c = r)),
      ]);
    }
    final bal = numOf(c['balance']);
    final limit = numOf(c['credit_limit']);
    final next = bal + moneyValue(_amount);
    return SheetBody(title: 'إضافة دين • ${c['name']}', subtitle: 'الرصيد الحالي ${iqd(bal)}', children: [
      MoneyField(controller: _amount, label: 'مبلغ الدين', autofocus: true, onChanged: (_) => setState(() {}),
          helper: 'بعد الإضافة: ${iqd(next)}${limit > 0 ? ' • السقف ${money(limit)}' : ''}'),
      if (limit > 0 && next > limit) const Padding(padding: EdgeInsets.only(top: 6), child: Text('سيتجاوز سقف الدين وسترفضه قاعدة البيانات.', style: TextStyle(color: Yq.amber))),
      const SizedBox(height: 12),
      TextField(controller: _notes, maxLines: 2, decoration: const InputDecoration(labelText: 'السبب', hintText: 'مثلاً: iPhone 13 بالأقساط')),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, style: const TextStyle(color: Yq.red))),
      const SizedBox(height: 16),
      FilledButton(
        onPressed: _busy ? null : () async {
          if (moneyValue(_amount) <= 0 || _notes.text.trim().isEmpty) {
            setState(() => _error = 'أدخل المبلغ والسبب');
            return;
          }
          setState(() {
            _busy = true;
            _error = null;
          });
          try {
            final r = await Api.I.act('debt_add', {'customer_id': c['id'], 'amount': moneyValue(_amount), 'notes': _notes.text.trim(), 'client_id': _cid});
            if (!context.mounted) return;
            toast(context, 'أُضيف الدين • الرصيد ${iqd(r['remaining_debt'] ?? next)}');
            Navigator.pop(context, true);
          } catch (e) {
            setState(() => _error = e is SessionExpired ? 'انتهت الجلسة' : '$e');
          } finally {
            if (mounted) setState(() => _busy = false);
          }
        },
        child: _busy ? const Busy() : const Text('تسجيل الدين'),
      ),
    ]);
  }
}

// ====================================================================== تسديد
class PayDebtSheet extends StatefulWidget {
  const PayDebtSheet({super.key, required this.customer});
  final Map<String, dynamic> customer;
  @override
  State<PayDebtSheet> createState() => _PayDebtSheetState();
}

class _PayDebtSheetState extends State<PayDebtSheet> {
  final _paid = TextEditingController();
  final _waived = TextEditingController();
  final _reason = TextEditingController();
  final _notes = TextEditingController();
  final _cid = clientId();
  bool _busy = false;
  String? _error;

  void _set(num v) {
    _paid.text = money(v);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final bal = numOf(widget.customer['balance']);
    final rest = bal - moneyValue(_paid) - moneyValue(_waived);
    return SheetBody(title: 'تسديد • ${widget.customer['name']}', subtitle: 'المستحق ${iqd(bal)}', children: [
      MoneyField(controller: _paid, label: 'المبلغ المقبوض نقداً', autofocus: true, onChanged: (_) => setState(() {}), helper: 'المتبقي بعد التسديد: ${iqd(rest < 0 ? 0 : rest)}'),
      const SizedBox(height: 8),
      Wrap(spacing: 6, children: [
        ActionChip(label: const Text('كامل المبلغ'), onPressed: () => _set(bal - moneyValue(_waived))),
        ActionChip(label: const Text('النصف'), onPressed: () => _set((bal / 2).round())),
        for (final v in [50000, 100000, 250000].where((v) => v < bal)) ActionChip(label: Text(money(v)), onPressed: () => _set(v)),
      ]),
      if (app.can('customers.waiver')) ...[
        const SizedBox(height: 12),
        MoneyField(controller: _waived, label: 'مسامحة (اختياري)', onChanged: (_) => setState(() {})),
        if (moneyValue(_waived) > 0) ...[const SizedBox(height: 10), TextField(controller: _reason, decoration: const InputDecoration(labelText: 'سبب المسامحة'))],
      ],
      const SizedBox(height: 10),
      TextField(controller: _notes, decoration: const InputDecoration(labelText: 'ملاحظات (اختياري)')),
      const SizedBox(height: 6),
      Text('يُسجّل المقبوض في الخزنة تلقائياً.', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline)),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, style: const TextStyle(color: Yq.red))),
      const SizedBox(height: 14),
      FilledButton(
        onPressed: _busy ? null : () async {
          if (moneyValue(_paid) + moneyValue(_waived) <= 0) return setState(() => _error = 'أدخل المبلغ المقبوض');
          if (rest < 0) return setState(() => _error = 'المجموع أكبر من الرصيد المستحق');
          if (moneyValue(_waived) > 0 && _reason.text.trim().isEmpty) return setState(() => _error = 'اذكر سبب المسامحة');
          setState(() {
            _busy = true;
            _error = null;
          });
          try {
            final r = await Api.I.act('debt_pay', {
              'customer_id': widget.customer['id'], 'amount_paid': moneyValue(_paid), 'waived_amount': moneyValue(_waived),
              'waiver_reason': _reason.text.trim(), 'notes': _notes.text.trim(), 'client_id': _cid,
            });
            if (!context.mounted) return;
            toast(context, 'قُبض ${iqd(moneyValue(_paid))} • المتبقي ${iqd(r['remaining_debt'] ?? rest)}');
            Navigator.pop(context, true);
          } catch (e) {
            setState(() => _error = e is SessionExpired ? 'انتهت الجلسة' : '$e');
          } finally {
            if (mounted) setState(() => _busy = false);
          }
        },
        child: _busy ? const Busy() : const Text('تسجيل التسديد'),
      ),
    ]);
  }
}

// ====================================================================== زبون جديد
class NewCustomerSheet extends StatefulWidget {
  const NewCustomerSheet({super.key});
  @override
  State<NewCustomerSheet> createState() => _NewCustomerSheetState();
}

class _NewCustomerSheetState extends State<NewCustomerSheet> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _limit = TextEditingController(text: '500,000');
  final _debt = TextEditingController();
  final _notes = TextEditingController();
  final _cid = clientId();
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _dup;

  Future<void> _save({bool allowDuplicate = false}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await Api.I.act('customer_create', {
        'name': _name.text.trim(), 'phone': _phone.text.trim(), 'address': _address.text.trim(),
        'credit_limit': moneyValue(_limit), 'opening_debt': app.can('customers.debt_addition') ? moneyValue(_debt) : 0,
        'notes': _notes.text.trim(), 'allow_duplicate': allowDuplicate, 'client_id': _cid,
      });
      if (r['reason'] == 'duplicate') {
        setState(() => _dup = Map<String, dynamic>.from(r['existing'] as Map));
        return;
      }
      if (!mounted) return;
      toast(context, 'أُضيف الزبون ${r['customer']['name']}');
      Navigator.pop(context, true);
    } catch (e) {
      setState(() => _error = e is SessionExpired ? 'انتهت الجلسة' : '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_dup != null) {
      return SheetBody(title: 'يوجد زبون بنفس الرقم', children: [
        ListTile(leading: Avatar('${_dup!['name']}'), title: Text('${_dup!['name']}'), subtitle: Text('${_dup!['phone']} • الرصيد ${iqd(_dup!['balance'])}')),
        const SizedBox(height: 10),
        FilledButton(
          onPressed: () async {
            final nav = Navigator.of(context);
            final ok = await sheet<bool>(context, AddDebtSheet(customer: _dup));
            nav.pop(ok == true);
          },
          child: Text('إضافة الدين على ${_dup!['name']}'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(onPressed: _busy ? null : () => _save(allowDuplicate: true), child: const Text('إنشاء زبون منفصل')),
      ]);
    }
    final canDebt = app.can('customers.debt_addition');
    return SheetBody(title: 'زبون جديد', children: [
      TextField(controller: _name, autofocus: true, decoration: const InputDecoration(labelText: 'الاسم')),
      const SizedBox(height: 10),
      TextField(controller: _phone, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'الهاتف', hintText: '07xx xxx xxxx')),
      const SizedBox(height: 10),
      TextField(controller: _address, decoration: const InputDecoration(labelText: 'العنوان')),
      const SizedBox(height: 10),
      MoneyField(controller: _limit, label: 'سقف الدين', helper: '0 = بلا سقف'),
      if (canDebt) ...[
        const SizedBox(height: 10),
        MoneyField(controller: _debt, label: 'دين افتتاحي (اختياري)', onChanged: (_) => setState(() {})),
        if (moneyValue(_debt) > 0) ...[const SizedBox(height: 10), TextField(controller: _notes, decoration: const InputDecoration(labelText: 'سبب الدين', hintText: 'رصيد افتتاحي'))],
      ],
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, style: const TextStyle(color: Yq.red))),
      const SizedBox(height: 16),
      FilledButton(onPressed: _busy ? null : () => _save(), child: _busy ? const Busy() : const Text('حفظ الزبون')),
    ]);
  }
}
