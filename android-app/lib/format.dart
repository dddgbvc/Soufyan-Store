// تنسيق الأرقام والتواريخ (بتوقيت بغداد UTC+3 بدون توقيت صيفي) والتسميات.

String money(Object? v) {
  final n = (v is num ? v : num.tryParse('${v ?? 0}') ?? 0).round();
  final s = n.abs().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return (n < 0 ? '-' : '') + b.toString();
}

String iqd(Object? v) => '${money(v)} د.ع';

num numOf(Object? v) => v is num ? v : num.tryParse('${v ?? 0}') ?? 0;

const _months = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const _days = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

DateTime? baghdad(Object? iso) {
  if (iso == null) return null;
  final d = DateTime.tryParse(iso.toString());
  return d?.toUtc().add(const Duration(hours: 3));
}

String two(int n) => n.toString().padLeft(2, '0');

String when(Object? iso) {
  final d = baghdad(iso);
  if (d == null) return '—';
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '${d.day} ${_months[d.month - 1]} • $h:${two(d.minute)} ${d.hour < 12 ? 'ص' : 'م'}';
}

String dateOnly(Object? iso) {
  final d = baghdad(iso);
  if (d == null) return '—';
  return '${d.day} ${_months[d.month - 1]} ${d.year}';
}

String weekday(String ymd) {
  final d = DateTime.tryParse(ymd);
  return d == null ? '' : _days[d.weekday - 1];
}

String todayLong() {
  final d = DateTime.now().toUtc().add(const Duration(hours: 3));
  return '${_days[d.weekday - 1]} ${d.day} ${_months[d.month - 1]}';
}

const roleLabel = <String, String>{
  'ADMIN': 'المدير العام', 'MANAGER': 'مدير', 'ACCOUNTANT': 'محاسب',
  'CASHIER': 'كاشير', 'TECHNICIAN': 'فني صيانة', 'DELIVERY': 'مندوب توصيل',
};

String paymentLabel(Object? v) => const {'CASH': 'نقدي', 'DEBT': 'آجل', 'CREDIT': 'آجل', 'CARD': 'بطاقة', 'MIXED': 'مختلط'}[
        '${v ?? ''}'.toUpperCase()] ??
    '${v ?? '—'}';

/// رقم عراقي بصيغة واتساب الدولية.
String waNumber(Object? phone) {
  var d = '${phone ?? ''}'.replaceAll(RegExp(r'\D'), '');
  if (d.isEmpty) return '';
  if (d.startsWith('00')) d = d.substring(2);
  if (d.startsWith('964')) return d;
  if (d.startsWith('0')) d = d.substring(1);
  return d.length == 10 && d.startsWith('7') ? '964$d' : d;
}

Uri? waLink(Object? phone, String text) {
  final n = waNumber(phone);
  if (n.isEmpty) return null;
  return Uri.parse('https://wa.me/$n?text=${Uri.encodeComponent(text)}');
}
