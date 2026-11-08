import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../format.dart';
import '../main.dart';
import '../ui.dart';

/// قائمة من الخادم مع بحث وفلاتر وتحميل المزيد وسحب للتحديث.
class PagedList extends StatefulWidget {
  const PagedList({
    super.key, required this.resource, required this.listKey, required this.itemBuilder, required this.onExpired,
    this.searchHint, this.filters, this.params = const {}, this.cursor, this.header, this.emptyText = 'لا توجد سجلات', this.pageSize = 50,
  });
  final String resource;
  final String listKey;
  final Widget Function(BuildContext, Map<String, dynamic>, VoidCallback reload) itemBuilder;
  final VoidCallback onExpired;
  final String? searchHint;
  final Map<String, String>? filters; // "مفتاح=قيمة" ← التسمية
  final Map<String, Object?> params;
  /// يحسب مؤشر الصفحة التالية من آخر عنصر وعدد العناصر.
  final Map<String, Object?> Function(Map<String, dynamic> last, int count)? cursor;
  final Widget Function(Map<String, dynamic> meta, VoidCallback reload)? header;
  final String emptyText;
  final int pageSize;
  @override
  State<PagedList> createState() => PagedListState();
}

class PagedListState extends State<PagedList> {
  final _rows = <Map<String, dynamic>>[];
  Map<String, dynamic> _meta = {};
  bool _loading = true, _more = false;
  String? _error;
  String _q = '';
  late String _filter = widget.filters?.keys.first ?? '';
  Timer? _debounce;
  int _seq = 0;

  Map<String, Object?> _params() => {...widget.params, if (_q.isNotEmpty) 'q': _q, ..._filterParams()};

  Map<String, Object?> _filterParams() {
    if (widget.filters == null) return {};
    final parts = _filter.split('=');
    return parts.length == 2 ? {parts[0]: parts[1] == 'true' ? true : parts[1]} : {};
  }

  @override
  void initState() {
    super.initState();
    reload();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> reload({bool append = false}) async {
    final n = ++_seq;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final cursor = append && _rows.isNotEmpty && widget.cursor != null ? widget.cursor!(_rows.last, _rows.length) : const <String, Object?>{};
      final d = await Api.I.get(widget.resource, {..._params(), 'limit': widget.pageSize, ...cursor});
      if (n != _seq || !mounted) return;
      final list = ((d[widget.listKey] as List?) ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      setState(() {
        if (!append) _rows.clear();
        _rows.addAll(list);
        _meta = d;
        _more = list.length == widget.pageSize && widget.cursor != null;
        _loading = false;
      });
    } on SessionExpired {
      widget.onExpired();
    } catch (e) {
      if (n == _seq && mounted) {
        setState(() {
          _error = '$e';
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: reload,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 90), children: [
        if (widget.header != null) widget.header!(_meta, reload),
        if (widget.searchHint != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: TextField(
              decoration: InputDecoration(hintText: widget.searchHint, prefixIcon: const Icon(Icons.search), isDense: true),
              onChanged: (v) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 350), () {
                  _q = v.trim();
                  reload();
                });
              },
            ),
          ),
        if (widget.filters != null)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(children: [
              for (final f in widget.filters!.entries)
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 8),
                  child: ChoiceChip(label: Text(f.value), selected: _filter == f.key, onSelected: (_) {
                    setState(() => _filter = f.key);
                    reload();
                  }),
                ),
            ]),
          ),
        if (_error != null) ErrorView(message: _error!, onRetry: reload),
        if (_error == null && !_loading && _rows.isEmpty) EmptyView(text: widget.emptyText),
        if (_rows.isNotEmpty)
          Card(
            child: Column(children: [
              for (var i = 0; i < _rows.length; i++) ...[
                if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
                widget.itemBuilder(context, _rows[i], reload),
              ],
            ]),
          ),
        if (_loading) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
        if (_more && !_loading) Padding(padding: const EdgeInsets.only(top: 10), child: OutlinedButton(onPressed: () => reload(append: true), child: const Text('تحميل المزيد'))),
      ]),
    );
  }
}

// ====================================================================== الفواتير
class InvoicesPage extends StatelessWidget {
  const InvoicesPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  Widget build(BuildContext context) => PagedList(
        resource: 'invoices', listKey: 'invoices', onExpired: onExpired,
        searchHint: 'رقم الفاتورة، اسم الزبون أو هاتفه…',
        filters: const {'': 'الكل', 'debt_only=true': 'غير مسددة'},
        cursor: (last, _) => {'before': last['created_at']},
        itemBuilder: (c, r, _) => InvoiceTile(r, onExpired: onExpired),
      );
}

class InvoiceTile extends StatelessWidget {
  const InvoiceTile(this.r, {super.key, required this.onExpired});
  final Map<String, dynamic> r;
  final VoidCallback onExpired;
  @override
  Widget build(BuildContext context) {
    final rest = numOf(r['total_amount']) - numOf(r['paid_amount']);
    return ListTile(
      leading: const Avatar('', icon: Icons.receipt_long_outlined),
      title: Text('${r['customer_name'] ?? 'زبون نقدي'}', maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text('${r['invoice_number']} • ${when(r['created_at'])}${r['actor'] != null ? ' • ${r['actor']}' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text(iqd(r['total_amount']), style: const TextStyle(fontWeight: FontWeight.w700)),
        rest > 0 ? Pill('آجل ${money(rest)}', color: Yq.amber) : Pill(paymentLabel(r['payment_type']), color: Yq.green),
      ]),
      onTap: () => sheet(context, InvoiceDetail(id: '${r['id']}', onExpired: onExpired)),
    );
  }
}

class InvoiceDetail extends StatelessWidget {
  const InvoiceDetail({super.key, required this.id, required this.onExpired});
  final String id;
  final VoidCallback onExpired;
  @override
  Widget build(BuildContext context) => SizedBox(
        height: MediaQuery.of(context).size.height * 0.75,
        child: Loader<Map<String, dynamic>>(
          load: () => Api.I.get('invoice', {'id': id}),
          onExpired: () {
            Navigator.pop(context);
            onExpired();
          },
          builder: (context, d, _) {
            final inv = Map<String, dynamic>.from(d['invoice'] as Map);
            final items = ((d['items'] as List?) ?? const []).cast<Map>();
            final rest = numOf(inv['total_amount']) - numOf(inv['paid_amount']);
            return ListView(padding: const EdgeInsets.fromLTRB(20, 0, 20, 24), children: [
              Text('فاتورة ${inv['invoice_number']}', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
              Text('${inv['customer_name'] ?? 'زبون نقدي'} • ${when(inv['created_at'])} • ${inv['actor'] ?? ''}', style: TextStyle(color: Theme.of(context).colorScheme.outline)),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: _Stat('الإجمالي', iqd(inv['total_amount']))),
                const SizedBox(width: 8),
                Expanded(child: _Stat(rest > 0 ? 'المتبقي (آجل)' : 'الدفع', rest > 0 ? iqd(rest) : paymentLabel(inv['payment_type']), color: rest > 0 ? Yq.amber : Yq.green)),
              ]),
              const SizedBox(height: 12),
              for (final it in items)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${it['product_name']}'),
                  subtitle: Text('${it['quantity']} × ${money(it['unit_price'])}${numOf(it['discount']) > 0 ? ' • خصم ${money(it['discount'])}' : ''}${(it['serials'] is List && (it['serials'] as List).isNotEmpty) ? '\n${(it['serials'] as List).join(', ')}' : ''}'),
                  trailing: Text(iqd(it['total']), style: const TextStyle(fontWeight: FontWeight.w600)),
                ),
              if ('${inv['notes'] ?? ''}'.isNotEmpty) Text('ملاحظات: ${inv['notes']}'),
            ]);
          },
        ),
      );
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, {this.color});
  final String label, value;
  final Color? color;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline)),
          Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: color)),
        ]),
      );
}

// ====================================================================== المخزون والنواقص
class ProductsPage extends StatelessWidget {
  const ProductsPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  Widget build(BuildContext context) => PagedList(
        resource: 'products', listKey: 'products', onExpired: onExpired,
        searchHint: 'اسم المنتج، الماركة، الموديل أو الباركود…',
        filters: const {'': 'الكل', 'low_only=true': 'تحت الحد'},
        cursor: (_, n) => {'offset': n},
        itemBuilder: (c, r, _) => ListTile(
          leading: Avatar('', icon: Icons.inventory_2_outlined, color: r['low'] == true ? Yq.amber : Yq.teal),
          title: Text('${r['name']}'),
          subtitle: Text([r['brand'], r['model'], r['category']].where((x) => x != null && '$x'.isNotEmpty).join(' • ')),
          trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(iqd(r['selling_price']), style: const TextStyle(fontWeight: FontWeight.w700)),
            r['is_service'] == true ? const Pill('خدمة') : Pill('${r['stock_quantity']} قطعة', color: r['low'] == true ? Yq.amber : Yq.green),
          ]),
        ),
      );
}

class ShortagesPage extends StatelessWidget {
  const ShortagesPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  Widget build(BuildContext context) => Loader<Map<String, dynamic>>(
        load: () => Api.I.get('shortages'),
        onExpired: onExpired,
        builder: (context, d, _) {
          final manual = ((d['manual'] as List?) ?? const []).cast<Map>();
          final low = ((d['low_stock'] as List?) ?? const []).cast<Map>();
          return ListView(padding: const EdgeInsets.all(12), children: [
            Section(title: 'نواقص مسجلة يدوياً', subtitle: '${manual.length} غير محلولة', children: [
              if (manual.isEmpty) const EmptyView(text: 'لا توجد نواقص يدوية'),
              for (final r in manual) ListTile(leading: const Avatar('', icon: Icons.report_outlined, color: Yq.amber), title: Text('${r['name']}'), subtitle: Text('${r['category'] ?? ''} • ${when(r['created_at'])}')),
            ]),
            const SizedBox(height: 12),
            Section(title: 'تحت حد التنبيه', subtitle: '${low.length} منتج', children: [
              if (low.isEmpty) const EmptyView(text: 'كل المنتجات فوق الحد'),
              for (final r in low)
                ListTile(leading: const Avatar('', icon: Icons.inventory_2_outlined, color: Yq.red), title: Text('${r['name']}'), trailing: Pill('${r['stock_quantity']} / ${r['min_stock_alert']}', color: Yq.red)),
            ]),
          ]);
        },
      );
}

// ====================================================================== المرتجعات والمصروفات والشحن
class ReturnsPage extends StatelessWidget {
  const ReturnsPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  Widget build(BuildContext context) => PagedList(
        resource: 'returns', listKey: 'returns', onExpired: onExpired, searchHint: 'رقم المرتجع أو الفاتورة أو الزبون…',
        itemBuilder: (c, r, _) => ListTile(
          leading: const Avatar('', icon: Icons.assignment_return_outlined, color: Yq.amber),
          title: Text('${r['customer_name'] ?? '—'}'),
          subtitle: Text('${r['return_number']} • فاتورة ${r['invoice_number'] ?? '—'} • ${when(r['created_at'])}${r['reason'] != null ? '\n${r['reason']}' : ''}'),
          trailing: Text(iqd(r['total_amount']), style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      );
}

class ExpensesPage extends StatefulWidget {
  const ExpensesPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  State<ExpensesPage> createState() => _ExpensesPageState();
}

class _ExpensesPageState extends State<ExpensesPage> {
  final _list = GlobalKey<PagedListState>();
  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.transparent,
        floatingActionButton: app.can('expenses.create')
            ? FloatingActionButton.extended(
                onPressed: () async {
                  final ok = await sheet<bool>(context, const NewExpenseSheet());
                  if (ok == true) _list.currentState?.reload();
                },
                icon: const Icon(Icons.add),
                label: const Text('مصروف جديد'),
              )
            : null,
        body: PagedList(
          key: _list, resource: 'expenses', listKey: 'expenses', onExpired: widget.onExpired,
          cursor: (last, _) => {'before': last['created_at']},
          itemBuilder: (c, r, _) => ListTile(
            leading: const Avatar('', icon: Icons.payments_outlined, color: Yq.red),
            title: Text('${r['description']}'),
            subtitle: Text('${r['category'] ?? ''} • ${r['actor'] ?? ''} • ${when(r['created_at'])}'),
            trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(iqd(r['amount']), style: const TextStyle(fontWeight: FontWeight.w700)),
              if (r['reversed'] == true) const Pill('معكوس', color: Yq.red),
            ]),
          ),
        ),
      );
}

class NewExpenseSheet extends StatefulWidget {
  const NewExpenseSheet({super.key});
  @override
  State<NewExpenseSheet> createState() => _NewExpenseSheetState();
}

class _NewExpenseSheetState extends State<NewExpenseSheet> {
  final _amount = TextEditingController();
  final _desc = TextEditingController();
  String _cat = 'مصاريف تشغيلية';
  final _cid = clientId();
  bool _busy = false;
  String? _error;
  @override
  Widget build(BuildContext context) => SheetBody(title: 'مصروف جديد', subtitle: 'يُخصم من الخزنة', children: [
        MoneyField(controller: _amount, label: 'المبلغ', autofocus: true),
        const SizedBox(height: 12),
        TextField(controller: _desc, decoration: const InputDecoration(labelText: 'الوصف', hintText: 'مثلاً: فاتورة المولدة')),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _cat,
          decoration: const InputDecoration(labelText: 'التصنيف'),
          items: [for (final c in ['مصاريف تشغيلية', 'إيجار', 'كهرباء ومولدة', 'إنترنت واتصالات', 'نقل وتوصيل', 'صيانة المحل', 'ضيافة', 'أخرى']) DropdownMenuItem(value: c, child: Text(c))],
          onChanged: (v) => setState(() => _cat = v ?? _cat),
        ),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, style: const TextStyle(color: Yq.red))),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : () async {
            setState(() {
              _busy = true;
              _error = null;
            });
            try {
              await Api.I.act('expense_create', {'amount': moneyValue(_amount), 'description': _desc.text.trim(), 'category': _cat, 'client_id': _cid});
              if (!context.mounted) return;
              toast(context, 'سُجّل المصروف');
              Navigator.pop(context, true);
            } catch (e) {
              setState(() => _error = e is SessionExpired ? 'انتهت الجلسة' : '$e');
            } finally {
              if (mounted) setState(() => _busy = false);
            }
          },
          child: _busy ? const Busy() : const Text('تسجيل المصروف'),
        ),
      ]);
}

class ShippingPage extends StatelessWidget {
  const ShippingPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  Widget build(BuildContext context) => PagedList(
        resource: 'shipping', listKey: 'orders', onExpired: onExpired, emptyText: 'لا توجد شحنات بعد',
        itemBuilder: (c, r, _) => ListTile(
          leading: const Avatar('', icon: Icons.local_shipping_outlined, color: Yq.blue),
          title: Text('${r['recipient'] ?? '—'}'),
          subtitle: Text('${[r['governorate'], r['city']].where((x) => x != null).join(' • ')}\n${r['provider_status_text'] ?? r['status'] ?? ''} • ${when(r['created_at'])}'),
          trailing: Text(iqd(r['cod_amount']), style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      );
}

// ====================================================================== الموظفون والجلسات
class EmployeesPage extends StatelessWidget {
  const EmployeesPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  Widget build(BuildContext context) => PagedList(
        resource: 'employees', listKey: 'employees', onExpired: onExpired,
        itemBuilder: (c, r, _) => ListTile(
          leading: Avatar('${r['display_name'] ?? r['name']}'),
          title: Text('${r['display_name'] ?? r['name']}'),
          subtitle: Text('${roleLabel[r['role']] ?? r['role']} • آخر ظهور ${when(r['last_seen_at'])}'),
          trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
            Pill(r['status'] == 'active' ? 'نشط' : 'موقوف', color: r['status'] == 'active' ? Yq.green : Yq.red),
            Text(r['has_pin'] == true ? 'رمز مضبوط' : 'بدون رمز', style: const TextStyle(fontSize: 11)),
          ]),
        ),
      );
}

class SessionsPage extends StatelessWidget {
  const SessionsPage({super.key, required this.onExpired});
  final VoidCallback onExpired;
  @override
  Widget build(BuildContext context) => PagedList(
        resource: 'sessions', listKey: 'sessions', onExpired: onExpired,
        itemBuilder: (c, r, _) => ListTile(
          leading: Avatar('', icon: r['kind'] == 'web' ? Icons.language : Icons.computer, color: r['closed_at'] == null ? Yq.green : Yq.blue),
          title: Text('${r['employee_name'] ?? '—'}'),
          subtitle: Text('${r['kind'] == 'web' ? 'ويب/تطبيق' : 'برنامج المكتب'} • ${r['device_name'] ?? r['os'] ?? ''}\nآخر نشاط ${when(r['last_seen_at'])}'),
          trailing: r['is_current'] == true ? const Pill('جلستك', color: Yq.green) : r['closed_at'] == null ? const Pill('نشطة', color: Yq.amber) : const Pill('مغلقة', color: Yq.blue),
        ),
      );
}
