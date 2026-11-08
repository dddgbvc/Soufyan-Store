import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api.dart';
import 'notify.dart';
import 'screens/auth.dart';
import 'screens/shell.dart';
import 'ui.dart';

/// حالة التطبيق: إعداد الخادم ← حساب المحل ← PIN ← الواجهة حسب الصلاحيات.
class AppState extends ChangeNotifier {
  String state = 'loading'; // loading | setup | unpaired | locked | active | error
  String storeName = '';
  Map<String, dynamic> employee = const {};
  List<String> permissions = const [];
  String? message;
  ThemeMode theme = ThemeMode.system;
  int idleMinutes = 10;
  String? pendingRoute;

  bool can(String p) => permissions.contains(p);
  void changed() => notifyListeners();
  bool get isAdmin => '${employee['role']}'.toUpperCase() == 'ADMIN';
  String get employeeName => '${employee['name'] ?? ''}';

  Future<void> boot() async {
    await Api.I.load();
    final t = await Api.I.read('theme');
    theme = t == 'dark' ? ThemeMode.dark : t == 'light' ? ThemeMode.light : ThemeMode.system;
    idleMinutes = int.tryParse(await Api.I.read('idle_minutes') ?? '') ?? 10;
    if (!Api.I.hasBase) {
      state = 'setup';
      notifyListeners();
      return;
    }
    await refresh();
  }

  Future<void> refresh() async {
    try {
      final s = await Api.I.status();
      apply(s);
    } catch (e) {
      state = 'error';
      message = '$e';
      notifyListeners();
    }
  }

  void apply(Map<String, dynamic> s) {
    final st = '${s['state']}';
    if (st == 'active') {
      state = 'active';
      storeName = '${s['store_name'] ?? storeName}';
      employee = Map<String, dynamic>.from(s['employee'] as Map? ?? {});
      permissions = List<String>.from((s['permissions'] as List?) ?? const []);
      message = null;
    } else if (st == 'locked') {
      state = 'locked';
      storeName = '${s['store_name'] ?? storeName}';
    } else {
      state = 'unpaired';
    }
    notifyListeners();
  }

  Future<void> lock([String? why]) async {
    await Api.I.lock();
    state = 'locked';
    message = why;
    employee = const {};
    permissions = const [];
    notifyListeners();
  }

  Future<void> signOutStore() async {
    await disableDeviceNotifications();
    await Api.I.forgetStore();
    state = 'unpaired';
    message = null;
    notifyListeners();
  }

  Future<void> setTheme(ThemeMode m) async {
    theme = m;
    await Api.I.write('theme', m == ThemeMode.dark ? 'dark' : m == ThemeMode.light ? 'light' : null);
    notifyListeners();
  }

  Future<void> setIdle(int m) async {
    idleMinutes = m;
    await Api.I.write('idle_minutes', '$m');
    notifyListeners();
  }
}

final app = AppState();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initNotifications(onTap: (url) {
    if (url != null && url.startsWith('/#')) {
      app.pendingRoute = url.substring(2);
      app.changed();
    }
  });
  runApp(const YaqootApp());
  app.boot();
}

class YaqootApp extends StatelessWidget {
  const YaqootApp({super.key});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: app,
        builder: (context, _) => MaterialApp(
          title: 'ياقوت ERP',
          debugShowCheckedModeBanner: false,
          theme: buildTheme(Brightness.light),
          darkTheme: buildTheme(Brightness.dark),
          themeMode: app.theme,
          locale: const Locale('ar', 'IQ'),
          supportedLocales: const [Locale('ar', 'IQ'), Locale('en')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: switch (app.state) {
            'setup' => const ServerSetupScreen(),
            'unpaired' => const StoreLoginScreen(),
            'locked' => PinScreen(key: ValueKey(app.message), message: app.message),
            'active' => Shell(key: ValueKey(app.employee['id'])),
            'error' => Scaffold(body: ErrorView(message: app.message ?? 'تعذر الاتصال', onRetry: app.refresh)),
            _ => const SplashScreen(),
          },
        ),
      );
}
