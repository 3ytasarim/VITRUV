import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:timezone/timezone.dart' as tz;

import 'countdown.dart';

/// End-of-rest signal that also works with a locked screen: a local notification scheduled for
/// the rest's absolute end time (iOS suspends Dart in the background, so only the OS can fire it).
///
/// - in the foreground iOS presents it as banner + sound (plus the in-app haptic/visual signal)
/// - with the silent switch on there is no sound — the visual + haptic signal remains
/// - permission is asked the first time the client starts a rest (in context, never at launch);
///   when it is denied, the signal is only shown in the app (on return)
abstract interface class RestAlertScheduler {
  Future<void> schedule({
    required DateTime at,
    required String title,
    required String body,
  });

  Future<void> cancel();
}

class NoopRestAlertScheduler implements RestAlertScheduler {
  const NoopRestAlertScheduler();

  @override
  Future<void> schedule({
    required DateTime at,
    required String title,
    required String body,
  }) async {}

  @override
  Future<void> cancel() async {}
}

/// iOS implementation (flutter_local_notifications). Android keeps the in-app signal only for
/// now: an exact alarm needs the SCHEDULE_EXACT_ALARM permission (see remaining work).
class LocalNotificationRestAlertScheduler implements RestAlertScheduler {
  LocalNotificationRestAlertScheduler([FlutterLocalNotificationsPlugin? plugin])
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  /// One rest at a time → one fixed id: a new schedule replaces the previous one.
  static const _id = 4711;

  final FlutterLocalNotificationsPlugin _plugin;
  Future<bool>? _ready;

  Future<bool> _init() async {
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          // ask later, when the first rest is started
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestSoundPermission: false,
            requestBadgePermission: false,
          ),
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        ),
      );
      final granted = await _plugin
          .resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin
          >()
          ?.requestPermissions(alert: true, sound: true);
      return granted ?? false;
    } on Object catch (error) {
      debugPrint('rest alert unavailable: $error');
      return false;
    }
  }

  @override
  Future<void> schedule({
    required DateTime at,
    required String title,
    required String body,
  }) async {
    if (!await (_ready ??= _init())) return;
    try {
      await _plugin.zonedSchedule(
        id: _id,
        title: title,
        body: body,
        // absolute instant — no wall-clock/time-zone interpretation
        scheduledDate: tz.TZDateTime.from(at.toUtc(), tz.UTC),
        notificationDetails: const NotificationDetails(
          iOS: DarwinNotificationDetails(
            presentAlert: true,
            presentBanner: true,
            presentList: true,
            presentSound: true,
          ),
          android: AndroidNotificationDetails(
            'rest_timer',
            'Pause-Timer',
            importance: Importance.high,
            priority: Priority.high,
          ),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      );
    } on Object catch (error) {
      debugPrint('rest alert not scheduled: $error');
    }
  }

  @override
  Future<void> cancel() async {
    if (_ready == null || !await _ready!) return;
    try {
      await _plugin.cancel(id: _id);
    } on Object catch (error) {
      debugPrint('rest alert not cancelled: $error');
    }
  }
}

/// iOS → scheduled notification; elsewhere (Android, tests, web) → in-app signal only.
final restAlertSchedulerProvider = Provider<RestAlertScheduler>((ref) {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) {
    return const NoopRestAlertScheduler();
  }
  return LocalNotificationRestAlertScheduler();
});

/// Keeps the scheduled end-of-rest notification in step with the rest [Countdown]:
/// running (start, "+30 Sek.", resume) → (re)schedule at the end time; paused or skipped →
/// cancel. When it reaches zero nothing is cancelled — the notification is the signal.
class RestAlertBinding {
  RestAlertBinding({
    required this._countdown,
    required this._scheduler,
    required this._texts,
  }) {
    _countdown.addListener(_onChange);
  }

  final Countdown _countdown;
  final RestAlertScheduler _scheduler;

  /// Title + body in the app language (asked when a rest is (re)scheduled).
  final ({String title, String body}) Function() _texts;
  DateTime? _scheduledFor;

  void _onChange() {
    switch (_countdown.phase) {
      case CountdownPhase.running:
        final endsAt = _countdown.endsAt!;
        if (endsAt == _scheduledFor) return;
        _scheduledFor = endsAt;
        final texts = _texts();
        unawaited(
          _scheduler.schedule(at: endsAt, title: texts.title, body: texts.body),
        );
      case CountdownPhase.paused:
      case CountdownPhase.idle:
        if (_scheduledFor == null) return;
        _scheduledFor = null;
        unawaited(_scheduler.cancel());
      case CountdownPhase.finished:
        _scheduledFor = null;
    }
  }

  /// Leaving the workout ends the rest → its notification must not fire later.
  void dispose() {
    _countdown.removeListener(_onChange);
    if (_countdown.phase == CountdownPhase.running ||
        _countdown.phase == CountdownPhase.paused) {
      unawaited(_scheduler.cancel());
    }
  }
}
