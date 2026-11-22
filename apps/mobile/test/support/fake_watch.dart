import 'dart:async';
import 'dart:convert';

import 'package:vitruv_mobile/features/workout/timer_sync/synced_timer.dart';
import 'package:vitruv_mobile/features/workout/timer_sync/timer_sync_transport.dart';

/// Fake WatchConnectivity link + a reference watch receiver (what the SwiftUI companion of
/// Sprint 5.5 must do). Every message goes through JSON, like over the real bridge.
///
/// Delivery model of WatchConnectivity:
/// - reachable: live message, delivered immediately
/// - not reachable: only the LATEST state is kept (application context) and delivered when the
///   watch becomes reachable again — intermediate states are lost, never queued per second
class FakeWatchLink implements TimerSyncTransport {
  FakeWatchLink({required this.watchNowMs, this.watchClockSkewMs = 0});

  /// The watch's own clock (may differ from the phone clock by [watchClockSkewMs]).
  final int Function() watchNowMs;
  final int watchClockSkewMs;

  final _commands = StreamController<TimerSyncMessage>.broadcast();

  /// Everything the phone published (decoded again from JSON).
  final published = <TimerSyncMessage>[];

  bool reachable = true;
  Map<String, Object?>? _pendingContext;

  /// Reference receiver state on the watch.
  SyncedTimerState? watchState;
  int _skewEstimate = 0;
  int completionFeedbacks = 0;

  @override
  Future<void> publish(TimerSyncMessage message) async {
    final json =
        jsonDecode(jsonEncode(message.toJson())) as Map<String, Object?>;
    published.add(TimerSyncMessage.tryParse(json)!);
    if (reachable) {
      _deliver(json);
    } else {
      _pendingContext = json; // latest wins
    }
  }

  void setReachable(bool value) {
    reachable = value;
    final pending = _pendingContext;
    if (value && pending != null) {
      _pendingContext = null;
      _deliver(pending);
    }
  }

  /// Delivers a raw message again (duplicate / late delivery).
  void redeliver(TimerSyncMessage message) => _deliver(
    jsonDecode(jsonEncode(message.toJson())) as Map<String, Object?>,
  );

  void _deliver(Map<String, Object?> json) {
    final message = TimerSyncMessage.tryParse(json);
    final incoming = message?.state;
    if (incoming == null) return;
    _skewEstimate = estimateClockSkewMs(
      sentAtMs: message!.sentAtMs,
      receivedAtMs: watchNowMs(),
    );
    final before = watchState;
    watchState = newerTimerState(before, incoming);
    if (!identical(before, watchState) &&
        watchState!.status == SyncedTimerStatus.completed) {
      completionFeedbacks++; // visual + haptic + sound (Sprint 5.5)
    }
  }

  /// Remaining time as the watch shows it: own clock, corrected by the estimated skew.
  int watchRemainingMs() =>
      watchState?.remainingMsAt(watchNowMs() - _skewEstimate) ?? 0;

  /// The watch user taps "Überspringen".
  void watchCancel() {
    final s = watchState;
    if (s == null) return;
    sendFromWatch(
      TimerSyncMessage.command(
        TimerCommand(
          TimerCommandType.cancel,
          timerId: s.timerId,
          revision: s.revision,
        ),
        sentAtMs: watchNowMs(),
      ),
    );
  }

  void sendFromWatch(TimerSyncMessage message) {
    final decoded = TimerSyncMessage.tryParse(
      jsonDecode(jsonEncode(message.toJson())),
    );
    if (decoded != null) _commands.add(decoded);
  }

  @override
  Stream<TimerSyncMessage> get incoming => _commands.stream;

  @override
  Future<void> dispose() => _commands.close();
}
