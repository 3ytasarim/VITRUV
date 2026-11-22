import 'dart:async';
import 'dart:math';

import '../../../core/time/clock.dart';
import '../countdown.dart';
import 'synced_timer.dart';
import 'timer_sync_transport.dart';

/// What a countdown is about — asked for when a new run starts.
class TimerSyncContext {
  const TimerSyncContext({
    required this.workoutSessionId,
    required this.kind,
    required this.phase,
    this.exerciseId,
    this.exerciseName,
  });

  final String workoutSessionId;
  final SyncedTimerKind kind;
  final SyncedTimerPhase phase;
  final String? exerciseId;
  final String? exerciseName;
}

/// Mirrors one local [Countdown] as a [SyncedTimerState] and publishes every change (start,
/// "+30 Sek.", pause, resume, finished, skipped) to the [TimerSyncTransport].
///
/// The countdown itself is unchanged and stays the source of truth on the iPhone: without a watch
/// (or with the no-op transport) nothing behaves differently. Messages are sent only on state
/// changes — never every second.
class CountdownSync {
  CountdownSync({
    required this._countdown,
    required this._transport,
    required this._clock,
    required this._revisions,
    required this._describe,
    Random? random,
  }) : _random = random ?? Random.secure() {
    _countdown.addListener(_onChange);
    _commands = _transport.incoming.listen(_onMessage);
  }

  final Countdown _countdown;
  final TimerSyncTransport _transport;
  final Clock _clock;
  final TimerRevisionSource _revisions;
  final TimerSyncContext? Function() _describe;
  final Random _random;
  late final StreamSubscription<TimerSyncMessage> _commands;

  SyncedTimerState? _state;
  int _generation = -1;

  /// The last published state (null before the first run).
  SyncedTimerState? get state => _state;

  int get _nowMs => _clock.now().millisecondsSinceEpoch;

  void _onChange() {
    final c = _countdown;
    final current = _state;
    SyncedTimerState? next;
    switch (c.phase) {
      case CountdownPhase.running:
      case CountdownPhase.paused:
        final isNewRun =
            current == null ||
            current.status.isTerminal ||
            c.generation != _generation;
        if (isNewRun) {
          next = _newRun(c);
        } else if (c.phase == CountdownPhase.running) {
          next = current.copyWith(
            status: SyncedTimerStatus.running,
            deadlineMs: c.endsAt!.millisecondsSinceEpoch,
            durationMs: c.total.inMilliseconds,
            clearPausedRemaining: true,
            revision: _revisions.next(),
          );
        } else {
          next = current.copyWith(
            status: SyncedTimerStatus.paused,
            clearDeadline: true,
            durationMs: c.total.inMilliseconds,
            pausedRemainingMs: c.remaining.inMilliseconds,
            revision: _revisions.next(),
          );
        }
      case CountdownPhase.finished:
        if (current != null && !current.status.isTerminal) {
          next = current.copyWith(
            status: SyncedTimerStatus.completed,
            revision: _revisions.next(),
          );
        }
      case CountdownPhase.idle:
        next = _cancelled(current);
    }
    if (next == null || next == current) return;
    _state = next;
    unawaited(_publish(next));
  }

  SyncedTimerState? _newRun(Countdown c) {
    final context = _describe();
    if (context == null) return null;
    _generation = c.generation;
    final running = c.phase == CountdownPhase.running;
    return SyncedTimerState(
      timerId: _newId(),
      workoutSessionId: context.workoutSessionId,
      exerciseId: context.exerciseId,
      exerciseName: context.exerciseName,
      kind: context.kind,
      phase: context.phase,
      status: running ? SyncedTimerStatus.running : SyncedTimerStatus.paused,
      startedAtMs: (c.startedAt ?? _clock.now()).millisecondsSinceEpoch,
      deadlineMs: running ? c.endsAt!.millisecondsSinceEpoch : null,
      pausedRemainingMs: running ? null : c.remaining.inMilliseconds,
      durationMs: c.total.inMilliseconds,
      revision: _revisions.next(),
    );
  }

  SyncedTimerState? _cancelled(SyncedTimerState? current) =>
      current == null || current.status.isTerminal
      ? null
      : current.copyWith(
          status: SyncedTimerStatus.cancelled,
          revision: _revisions.next(),
        );

  Future<void> _publish(SyncedTimerState state) =>
      _transport.publish(TimerSyncMessage.state(state, sentAtMs: _nowMs));

  void _onMessage(TimerSyncMessage message) {
    final command = message.command;
    if (command == null) return;
    switch (command.type) {
      case TimerCommandType.cancel:
        final current = _state;
        // Only the timer the watch was showing; a command for an older/other run is stale.
        if (current == null ||
            current.status.isTerminal ||
            command.timerId != current.timerId) {
          return;
        }
        _countdown.skip(); // → idle → CANCELLED is published by _onChange
      case TimerCommandType.requestState:
        republish();
    }
  }

  /// Sends the current state again (watch resync, app resume). Remaining time is not recomputed:
  /// the receiver derives it from the deadline.
  void republish() {
    final current = _state;
    if (current != null) unawaited(_publish(current));
  }

  String _newId() => [
    for (var i = 0; i < 16; i++)
      _random.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ].join();

  /// Leaving the workout ends the local countdown → the watch removes it as well.
  void dispose() {
    _countdown.removeListener(_onChange);
    unawaited(_commands.cancel());
    final cancelled = _cancelled(_state);
    if (cancelled != null) {
      _state = cancelled;
      unawaited(_publish(cancelled));
    }
  }
}
