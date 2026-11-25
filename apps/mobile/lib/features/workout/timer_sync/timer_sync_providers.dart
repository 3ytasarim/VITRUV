import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/time/clock.dart';
import 'synced_timer.dart';
import 'timer_sync_transport.dart';

/// Apple Watch timer sync is OFF unless the build sets `--dart-define=VITRUV_WATCH_TIMER_SYNC=true`
/// (only for Sprint 5.5 device builds on macOS). Production builds keep it off.
const kWatchTimerSyncEnabled = bool.fromEnvironment('VITRUV_WATCH_TIMER_SYNC');

/// The transport for the current device: the iOS bridge only on iOS with the switch on; the
/// no-op everywhere else (Android, tests, web). Tests override this provider with a fake.
final timerSyncTransportProvider = Provider<TimerSyncTransport>((ref) {
  if (!kWatchTimerSyncEnabled ||
      kIsWeb ||
      defaultTargetPlatform != TargetPlatform.iOS) {
    return const NoopTimerSyncTransport();
  }
  final transport = MethodChannelTimerSyncTransport();
  ref.onDispose(transport.dispose);
  return transport;
});

/// One revision source per app run, shared by all timers (revisions never repeat).
final timerRevisionSourceProvider = Provider<TimerRevisionSource>((ref) {
  final clock = ref.watch(clockProvider);
  return TimerRevisionSource(() => clock.now().millisecondsSinceEpoch);
});
