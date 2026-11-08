// إشعارات أندرويد بدون Firebase:
// • أثناء فتح التطبيق: فحص كل دقيقة.
// • في الخلفية: WorkManager كل ~15 دقيقة (أقل مدة يسمح بها أندرويد).
// المصدر واحد: صندوق إشعارات الموظف على الخادم، بنفس التفضيلات والصلاحيات وساعات الهدوء.
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:workmanager/workmanager.dart';

import 'api.dart';

final _plugin = FlutterLocalNotificationsPlugin();
const _task = 'yaqoot-poll';

const _channel = AndroidNotificationDetails(
  'yaqoot_alerts', 'إشعارات ياقوت',
  channelDescription: 'الفواتير والديون والنواقص والصيانة والتقارير وحركات المحل',
  importance: Importance.high,
  priority: Priority.high,
  styleInformation: BigTextStyleInformation(''),
);
const _quiet = AndroidNotificationDetails(
  'yaqoot_quiet', 'إشعارات ياقوت (هادئة)',
  channelDescription: 'تصل خلال ساعات الهدوء بدون صوت',
  importance: Importance.low,
  priority: Priority.low,
  playSound: false,
  enableVibration: false,
  styleInformation: BigTextStyleInformation(''),
);

Future<void> initNotifications({void Function(String? url)? onTap}) async {
  await _plugin.initialize(
    settings: const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
    onDidReceiveNotificationResponse: (r) => onTap?.call(r.payload),
  );
}

Future<bool> requestNotificationPermission() async {
  final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
  return await android?.requestNotificationsPermission() ?? true;
}

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, input) async {
    WidgetsFlutterBinding.ensureInitialized();
    try {
      await initNotifications();
      await pollOnce();
    } catch (_) {}
    return true;
  });
}

Future<void> startBackgroundPolling() async {
  await Workmanager().initialize(callbackDispatcher);
  await Workmanager().registerPeriodicTask(
    _task, _task,
    frequency: const Duration(minutes: 15),
    constraints: Constraints(networkType: NetworkType.connected),
    existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
  );
}

Future<void> stopBackgroundPolling() async {
  try {
    await Workmanager().cancelByUniqueName(_task);
  } catch (_) {}
}

/// تفعيل إشعارات هذا الهاتف للموظف الحالي (يتطلب جلسة PIN).
Future<void> enableDeviceNotifications(String deviceName) async {
  final api = Api.I;
  var token = await api.read('notify_token');
  if (token == null) {
    token = randomToken();
    await api.write('notify_token', token);
  }
  final last = await api.nativeRegister(token, deviceName);
  await api.write('notify_since', '$last');
  await startBackgroundPolling();
}

Future<void> disableDeviceNotifications() async {
  final api = Api.I;
  final token = await api.read('notify_token');
  if (token != null) await api.nativeUnregister(token);
  await api.write('notify_token', null);
  await api.write('notify_since', null);
  await stopBackgroundPolling();
}

Future<bool> deviceNotificationsEnabled() async => await Api.I.read('notify_token') != null;

/// يجلب الجديد ويعرضه كإشعارات أندرويد. يُرجع عدد غير المقروء إن عُرف.
Future<int?> pollOnce() async {
  final api = Api.I;
  await api.load();
  final token = await api.read('notify_token');
  if (token == null || !api.hasBase) return null;
  final since = int.tryParse(await api.read('notify_since') ?? '') ?? 0;
  final d = await api.nativePoll(token, since);
  if (d['ok'] != true) {
    if (d['reason'] == 'unregistered') await api.write('notify_token', null);
    return null;
  }
  final items = (d['items'] as List?) ?? const [];
  final quiet = d['quiet'] == true;
  for (final raw in items) {
    final n = Map<String, dynamic>.from(raw as Map);
    await _plugin.show(
      id: ((n['id'] as num?)?.toInt() ?? 0) % 2147483647,
      title: '${n['title'] ?? 'ياقوت'}',
      body: '${n['body'] ?? ''}',
      notificationDetails: NotificationDetails(android: quiet ? _quiet : _channel),
      payload: n['url']?.toString(),
    );
  }
  final last = (d['last_id'] as num?)?.toInt() ?? since;
  if (last > since) await api.write('notify_since', '$last');
  return (d['unread'] as num?)?.toInt();
}
