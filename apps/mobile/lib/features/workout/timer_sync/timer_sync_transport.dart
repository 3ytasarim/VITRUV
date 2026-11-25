import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'synced_timer.dart';

/// Channel between the timer logic and a paired device (Apple Watch). Platform independent:
/// - [NoopTimerSyncTransport] — default (Android, no watch, feature switched off)
/// - [MethodChannelTimerSyncTransport] — iOS bridge to the native WatchConnectivity code
///   (Runner side + watchOS target are Sprint 5.5, macOS/Xcode)
/// - a fake in tests
abstract interface class TimerSyncTransport {
  /// Hands the latest state to the peer. "Latest state wins": the native side stores it as the
  /// WatchConnectivity application context (delivered later if the watch is unreachable) and
  /// additionally sends it as a live message when the watch is reachable. Never throws.
  Future<void> publish(TimerSyncMessage message);

  /// Commands from the peer (cancel, request state).
  Stream<TimerSyncMessage> get incoming;

  Future<void> dispose();
}

class NoopTimerSyncTransport implements TimerSyncTransport {
  const NoopTimerSyncTransport();

  @override
  Future<void> publish(TimerSyncMessage message) async {}

  @override
  Stream<TimerSyncMessage> get incoming => const Stream.empty();

  @override
  Future<void> dispose() async {}
}

/// Flutter side of the iOS bridge. Contract (docs/apple-watch-timer-sync.md):
/// - Dart → native: `publish` with `{"payload": "<JSON TimerSyncMessage>"}` (a JSON string, so the
///   native side can put it unchanged into a property-list dictionary — plists have no null)
/// - native → Dart: `incoming` with the same `{"payload": "<JSON>"}` shape
///
/// Without the native handler (today, and on simulators without a watch) the first call fails
/// with [MissingPluginException]; the transport then switches itself off — the iPhone timer keeps
/// working exactly as without a watch.
class MethodChannelTimerSyncTransport implements TimerSyncTransport {
  MethodChannelTimerSyncTransport({
    this._channel = const MethodChannel(channelName),
  }) {
    _channel.setMethodCallHandler(_onCall);
  }

  static const channelName = 'app.vitruv/watch_timer';

  final MethodChannel _channel;
  final _incoming = StreamController<TimerSyncMessage>.broadcast();
  bool _available = true;

  @visibleForTesting
  bool get isAvailable => _available;

  @override
  Stream<TimerSyncMessage> get incoming => _incoming.stream;

  @override
  Future<void> publish(TimerSyncMessage message) async {
    if (!_available) return;
    try {
      await _channel.invokeMethod<void>('publish', {
        'payload': jsonEncode(message.toJson()),
      });
    } on MissingPluginException {
      _available = false; // no native bridge on this build
    } on PlatformException catch (error) {
      // e.g. no paired watch / session not activated — the phone timer is unaffected
      debugPrint('watch timer sync: ${error.code}');
    }
  }

  Future<Object?> _onCall(MethodCall call) async {
    if (call.method != 'incoming') return null;
    final args = call.arguments;
    final payload = args is Map ? args['payload'] : null;
    if (payload is! String) return null;
    Object? json;
    try {
      json = jsonDecode(payload);
    } on FormatException {
      return null;
    }
    final message = TimerSyncMessage.tryParse(json);
    if (message != null && message.command != null) _incoming.add(message);
    return null;
  }

  @override
  Future<void> dispose() async {
    _channel.setMethodCallHandler(null);
    await _incoming.close();
  }
}
