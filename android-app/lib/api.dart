// الاتصال بخادم ياقوت (نفس واجهة تطبيق الويب).
// الدخول: حساب المحل مرة واحدة على الجهاز (كوكي yq_store) ثم PIN يحدد الموظف (كوكي yq_sess).
// الكوكيز تُحفظ في التخزين الآمن للجهاز (Android Keystore) ولا تُحفظ كلمة المرور أبداً.
import 'dart:convert';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

/// عنوان الخادم يُمرَّر وقت البناء: --dart-define=YQ_BASE_URL=https://...
const String kBaseUrl = String.fromEnvironment('YQ_BASE_URL');

class ApiException implements Exception {
  ApiException(this.message, {this.reason, this.status = 0, this.data});
  final String message;
  final String? reason;
  final int status;
  final Map<String, dynamic>? data;
  @override
  String toString() => message;
}

/// الجلسة انتهت (خمول 30 دقيقة أو 12 ساعة) — الواجهة تعود لشاشة PIN.
class SessionExpired implements Exception {}

const _reasons = <String, String>{
  'bad_credentials': 'البريد أو كلمة المرور غير صحيحة.',
  'not_owner': 'هذا الحساب ليس حساب مالك محل.',
  'email_not_confirmed': 'البريد غير مؤكد بعد.',
  'rate_limited': 'محاولات كثيرة. انتظر قليلاً.',
  'invalid_input': 'أدخل بريداً صحيحاً وكلمة المرور.',
  'not_configured': 'الخادم غير مهيأ.',
  'migration_missing': 'قاعدة البيانات تحتاج تحديثاً.',
  'upstream_unreachable': 'تعذر الوصول إلى الخادم.',
  'wrong': 'الرمز غير صحيح.',
  'invalid': 'الرمز من 4 إلى 8 أرقام.',
  'locked': 'محاولات خاطئة كثيرة. انتظر دقيقتين.',
  'ambiguous': 'هذا الرمز مسجّل لأكثر من موظف. غيّر أحدهما.',
  'disabled': 'المحل أو الحساب موقوف.',
  'forbidden': 'ليست لديك صلاحية لهذا الإجراء.',
  'unpaired': 'هذا الجهاز غير مفعّل لمحل.',
};

String clientId() {
  final r = Random.secure();
  return List.generate(12, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}

String randomToken() {
  final r = Random.secure();
  return List.generate(32, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}

class Api {
  Api._();
  static final Api I = Api._();

  final _storage = const FlutterSecureStorage();
  final _client = http.Client();
  String _base = kBaseUrl;
  String? _store;
  String? _sess;
  bool _loaded = false;

  String get baseUrl => _base;
  bool get hasBase => _base.isNotEmpty;
  bool get hasStore => _store != null;

  Future<void> load() async {
    if (_loaded) return;
    _store = await _storage.read(key: 'yq_store');
    _sess = await _storage.read(key: 'yq_sess');
    final b = await _storage.read(key: 'base_url');
    if (b != null && b.isNotEmpty) _base = b;
    _loaded = true;
  }

  Future<void> setBaseUrl(String url) async {
    var u = url.trim();
    while (u.endsWith('/')) {
      u = u.substring(0, u.length - 1);
    }
    if (!u.startsWith('https://')) throw ApiException('العنوان يجب أن يبدأ بـ https://');
    _base = u;
    await _storage.write(key: 'base_url', value: u);
  }

  Future<String?> read(String key) => _storage.read(key: key);
  Future<void> write(String key, String? value) =>
      value == null ? _storage.delete(key: key) : _storage.write(key: key, value: value);

  Map<String, String> _headers({bool json = false}) {
    final c = <String>[
      if (_store != null) 'yq_store=$_store',
      if (_sess != null) 'yq_sess=$_sess',
    ];
    return {
      if (c.isNotEmpty) 'Cookie': c.join('; '),
      if (json) 'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'YaqootAndroid/1.0 (Android)',
    };
  }

  Future<void> _absorbCookies(http.Response r) async {
    final raw = r.headers['set-cookie'];
    if (raw == null) return;
    for (final part in raw.split(RegExp(r',(?=\s*[A-Za-z_]+=)'))) {
      final kv = part.split(';').first.trim();
      final i = kv.indexOf('=');
      if (i <= 0) continue;
      final name = kv.substring(0, i);
      final value = Uri.decodeComponent(kv.substring(i + 1));
      final cleared = value.isEmpty || part.toLowerCase().contains('max-age=0');
      if (name == 'yq_store') {
        _store = cleared ? null : value;
        await write('yq_store', _store);
      } else if (name == 'yq_sess') {
        _sess = cleared ? null : value;
        await write('yq_sess', _sess);
      }
    }
  }

  Future<Map<String, dynamic>> _send(String method, String path,
      {Object? body, Map<String, String>? query, Map<String, String>? headers}) async {
    await load();
    if (_base.isEmpty) throw ApiException('لم يُضبط عنوان الخادم.');
    final uri = Uri.parse(_base + path).replace(queryParameters: (query == null || query.isEmpty) ? null : query);
    http.Response r;
    try {
      final req = http.Request(method, uri)..headers.addAll({..._headers(json: body != null), ...?headers});
      if (body != null) req.body = jsonEncode(body);
      r = await http.Response.fromStream(await _client.send(req).timeout(const Duration(seconds: 25)));
    } catch (_) {
      throw ApiException('تعذر الاتصال بالخادم. تحقق من الإنترنت.', reason: 'network');
    }
    await _absorbCookies(r);
    Map<String, dynamic> data;
    try {
      final d = jsonDecode(utf8.decode(r.bodyBytes));
      data = d is Map<String, dynamic> ? d : {'ok': true, 'data': d};
    } catch (_) {
      data = {'ok': false, 'reason': 'server_error'};
    }
    data['_status'] = r.statusCode;
    return data;
  }

  ApiException _error(Map<String, dynamic> d, [String fallback = 'تعذر إكمال الطلب. حاول مجدداً.']) {
    final reason = d['reason']?.toString() ?? d['error']?.toString();
    final msg = (d['message'] is String && (d['message'] as String).isNotEmpty) ? d['message'] as String : (_reasons[reason] ?? fallback);
    return ApiException(msg, reason: reason, status: d['_status'] as int? ?? 0, data: d);
  }

  // ------------------------------------------------------------- الدخول
  Future<Map<String, dynamic>> status() async {
    final d = await _send('GET', '/api/auth/status');
    if (d['ok'] != true) throw _error(d, 'تعذر الاتصال بالخادم.');
    return d;
  }

  Future<Map<String, dynamic>> storeLogin(String email, String password) async {
    final d = await _send('POST', '/api/auth/store', body: {'email': email, 'password': password});
    if (d['ok'] != true) throw _error(d, 'تعذر تسجيل الدخول.');
    return d;
  }

  Future<Map<String, dynamic>> pin(String pin) async {
    final d = await _send('POST', '/api/auth/pin', body: {'pin': pin});
    if (d['ok'] != true) throw _error(d, 'تعذر الدخول.');
    return d;
  }

  Future<void> lock() async {
    try {
      await _send('DELETE', '/api/auth/pin');
    } catch (_) {}
    _sess = null;
    await write('yq_sess', null);
  }

  Future<void> forgetStore() async {
    try {
      await _send('DELETE', '/api/auth/store');
    } catch (_) {}
    _store = null;
    _sess = null;
    await write('yq_store', null);
    await write('yq_sess', null);
  }

  // ------------------------------------------------------------- البيانات
  Future<Map<String, dynamic>> get(String resource, [Map<String, Object?> params = const {}]) async {
    final q = <String, String>{'r': resource};
    params.forEach((k, v) {
      if (v == null || v == '' || v == false) return;
      q[k] = v == true ? '1' : v.toString();
    });
    final d = await _send('GET', '/api/erp', query: q);
    if (d['_status'] == 401) throw SessionExpired();
    if (d['ok'] != true) throw _error(d, 'تعذر تحميل البيانات.');
    return d;
  }

  Future<Map<String, dynamic>> act(String action, Map<String, Object?> payload) async {
    final d = await _send('POST', '/api/erp/action', body: {'action': action, 'payload': payload});
    if (d['_status'] == 401) throw SessionExpired();
    if (d['ok'] == false && d['reason'] != 'duplicate') throw _error(d, 'تعذر حفظ العملية.');
    return d;
  }

  Future<Map<String, dynamic>> prefs() async {
    final d = await _send('GET', '/api/push/prefs');
    if (d['_status'] == 401) throw SessionExpired();
    if (d['prefs'] is! Map) throw _error(d, 'تعذر تحميل إعدادات الإشعارات.');
    return Map<String, dynamic>.from(d['prefs'] as Map);
  }

  Future<Map<String, dynamic>> setPrefs(Map<String, Object?> patch) async {
    final d = await _send('PUT', '/api/push/prefs', body: {'prefs': patch});
    if (d['_status'] == 401) throw SessionExpired();
    if (d['prefs'] is! Map) throw _error(d, 'تعذر حفظ الإعداد.');
    return Map<String, dynamic>.from(d['prefs'] as Map);
  }

  // ------------------------------------------------------------- إشعارات التطبيق
  Future<int> nativeRegister(String token, String deviceName) async {
    final d = await _send('POST', '/api/native/register', body: {'token': token, 'device_name': deviceName});
    if (d['_status'] == 401) throw SessionExpired();
    if (d['ok'] != true) throw _error(d, 'تعذر تفعيل إشعارات الجهاز.');
    return (d['last_id'] as num?)?.toInt() ?? 0;
  }

  Future<void> nativeUnregister(String token) async {
    try {
      await _send('DELETE', '/api/native/register', headers: {'X-Yaqoot-Device': token});
    } catch (_) {}
  }

  Future<Map<String, dynamic>> nativePoll(String token, int since) =>
      _send('POST', '/api/native/poll', body: {'since': since}, headers: {'X-Yaqoot-Device': token});
}
