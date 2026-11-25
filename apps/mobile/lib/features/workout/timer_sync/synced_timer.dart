import 'package:flutter/foundation.dart';

/// Wire format version of the timer synchronisation messages (iPhone ⇄ Apple Watch).
/// The watchOS companion (Sprint 5.5) must reject messages with a higher major version.
const kTimerSyncVersion = 1;

/// What the timer is for. Only [strengthRest] and [timedExercise] are produced today; the others
/// are reserved for the Total-Reps rest timer and the Core 40/20 interval timer (later sprints).
enum SyncedTimerKind {
  strengthRest('STRENGTH_REST'),
  totalRepsRest('TOTAL_REPS_REST'),
  timedExercise('TIMED_EXERCISE'),
  interval('INTERVAL');

  const SyncedTimerKind(this.wire);
  final String wire;

  static SyncedTimerKind? fromWire(Object? value) =>
      values.where((k) => k.wire == value).firstOrNull;
}

/// Current phase of the countdown (shown on the watch as "Pause" / "Belastung").
enum SyncedTimerPhase {
  rest('REST'),
  work('WORK');

  const SyncedTimerPhase(this.wire);
  final String wire;

  static SyncedTimerPhase? fromWire(Object? value) =>
      values.where((p) => p.wire == value).firstOrNull;
}

enum SyncedTimerStatus {
  running('RUNNING'),
  paused('PAUSED'),

  /// Reached zero → completion feedback (visual, haptic, sound where allowed).
  completed('COMPLETED'),

  /// Skipped / cancelled / replaced — the watch removes it silently (no completion feedback).
  cancelled('CANCELLED');

  const SyncedTimerStatus(this.wire);
  final String wire;

  bool get isTerminal => this == completed || this == cancelled;

  static SyncedTimerStatus? fromWire(Object? value) =>
      values.where((s) => s.wire == value).firstOrNull;
}

/// THE one logical timer state. The iPhone is the only writer; the watch renders it and may only
/// send commands ([TimerCommand]).
///
/// Time is transported as absolute UTC epoch milliseconds, never as "seconds left": every device
/// computes the remaining time locally from [deadlineMs], so no per-second messages are needed and
/// a lost connection does not stop or skew the countdown.
@immutable
class SyncedTimerState {
  const SyncedTimerState({
    required this.timerId,
    required this.workoutSessionId,
    required this.kind,
    required this.phase,
    required this.status,
    required this.startedAtMs,
    required this.durationMs,
    required this.revision,
    this.deadlineMs,
    this.pausedRemainingMs,
    this.exerciseId,
    this.exerciseName,
  });

  /// Random id of this countdown run. A new start = a new id (never reused).
  final String timerId;
  final String workoutSessionId;
  final String? exerciseId;

  /// Display name of the current exercise (already localized / coach text).
  final String? exerciseName;
  final SyncedTimerKind kind;
  final SyncedTimerPhase phase;
  final SyncedTimerStatus status;

  /// When this run was started (UTC epoch ms).
  final int startedAtMs;

  /// When it reaches zero (UTC epoch ms). Null while paused.
  final int? deadlineMs;

  /// Total length incl. extensions ("+30 Sek.") — for the progress ring.
  final int durationMs;

  /// Remaining time while [SyncedTimerStatus.paused].
  final int? pausedRemainingMs;

  /// Strictly increasing over ALL timers of this phone, also across app restarts
  /// (see [TimerRevisionSource]). A receiver keeps the state with the highest revision only.
  final int revision;

  /// Remaining time at [nowMs] (receiver's clock, already skew-corrected).
  int remainingMsAt(int nowMs) => switch (status) {
    SyncedTimerStatus.running => (deadlineMs! - nowMs).clamp(0, durationMs),
    SyncedTimerStatus.paused => pausedRemainingMs ?? 0,
    SyncedTimerStatus.completed || SyncedTimerStatus.cancelled => 0,
  };

  /// 0..1 of the total still remaining (progress ring).
  double fractionAt(int nowMs) =>
      durationMs <= 0 ? 0 : (remainingMsAt(nowMs) / durationMs).clamp(0, 1);

  SyncedTimerState copyWith({
    SyncedTimerStatus? status,
    int? deadlineMs,
    bool clearDeadline = false,
    int? durationMs,
    int? pausedRemainingMs,
    bool clearPausedRemaining = false,
    required int revision,
  }) => SyncedTimerState(
    timerId: timerId,
    workoutSessionId: workoutSessionId,
    exerciseId: exerciseId,
    exerciseName: exerciseName,
    kind: kind,
    phase: phase,
    status: status ?? this.status,
    startedAtMs: startedAtMs,
    deadlineMs: clearDeadline ? null : (deadlineMs ?? this.deadlineMs),
    durationMs: durationMs ?? this.durationMs,
    pausedRemainingMs: clearPausedRemaining
        ? null
        : (pausedRemainingMs ?? this.pausedRemainingMs),
    revision: revision,
  );

  Map<String, Object?> toJson() => {
    'timerId': timerId,
    'workoutSessionId': workoutSessionId,
    'exerciseId': exerciseId,
    'exerciseName': exerciseName,
    'kind': kind.wire,
    'phase': phase.wire,
    'status': status.wire,
    'startedAtMs': startedAtMs,
    'deadlineMs': deadlineMs,
    'durationMs': durationMs,
    'pausedRemainingMs': pausedRemainingMs,
    'revision': revision,
  };

  /// Null for anything malformed or unknown (a newer/older peer never crashes the app).
  static SyncedTimerState? tryParse(Object? json) {
    if (json is! Map) return null;
    final kind = SyncedTimerKind.fromWire(json['kind']);
    final phase = SyncedTimerPhase.fromWire(json['phase']);
    final status = SyncedTimerStatus.fromWire(json['status']);
    final timerId = json['timerId'];
    final sessionId = json['workoutSessionId'];
    final startedAt = json['startedAtMs'];
    final duration = json['durationMs'];
    final revision = json['revision'];
    final deadline = json['deadlineMs'];
    final paused = json['pausedRemainingMs'];
    if (kind == null ||
        phase == null ||
        status == null ||
        timerId is! String ||
        timerId.isEmpty ||
        sessionId is! String ||
        startedAt is! int ||
        duration is! int ||
        revision is! int ||
        (deadline != null && deadline is! int) ||
        (paused != null && paused is! int) ||
        (status == SyncedTimerStatus.running && deadline == null)) {
      return null;
    }
    final exerciseId = json['exerciseId'];
    final exerciseName = json['exerciseName'];
    return SyncedTimerState(
      timerId: timerId,
      workoutSessionId: sessionId,
      exerciseId: exerciseId is String ? exerciseId : null,
      exerciseName: exerciseName is String ? exerciseName : null,
      kind: kind,
      phase: phase,
      status: status,
      startedAtMs: startedAt,
      deadlineMs: deadline as int?,
      durationMs: duration,
      pausedRemainingMs: paused as int?,
      revision: revision,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is SyncedTimerState &&
      other.timerId == timerId &&
      other.revision == revision &&
      other.status == status &&
      other.deadlineMs == deadlineMs &&
      other.durationMs == durationMs &&
      other.pausedRemainingMs == pausedRemainingMs;

  @override
  int get hashCode => Object.hash(timerId, revision, status, deadlineMs);
}

/// Receiver rule (phone AND watch): keep [incoming] only if it is newer than [current].
/// Older or equal revisions are stale (late delivery, duplicate, replay) and are dropped — this is
/// what prevents duplicate and resurrected timers.
SyncedTimerState? newerTimerState(
  SyncedTimerState? current,
  SyncedTimerState incoming,
) {
  if (current == null) return incoming;
  return incoming.revision > current.revision ? incoming : current;
}

/// Revisions that keep increasing across app restarts: `max(last + 1, now)`. Using the wall
/// clock as the floor means a freshly started app never re-uses a revision the watch has already
/// seen (unless the phone clock jumps backwards — then the watch's "requestState" resync, which
/// accepts any state after a reset, recovers).
class TimerRevisionSource {
  TimerRevisionSource(this._nowMs);

  final int Function() _nowMs;
  int _last = 0;

  int next() {
    final now = _nowMs();
    _last = now > _last ? now : _last + 1;
    return _last;
  }
}

/// Estimated offset between the sender's and the receiver's clock (receiver − sender), from one
/// message: `receivedAt − sentAt`. It includes the transport latency, so small values are treated
/// as zero; only a real clock difference (> [toleranceMs]) is corrected.
int estimateClockSkewMs({
  required int sentAtMs,
  required int receivedAtMs,
  int toleranceMs = 1500,
}) {
  final skew = receivedAtMs - sentAtMs;
  return skew.abs() <= toleranceMs ? 0 : skew;
}

/// Commands the watch may send. The watch never edits the state itself.
enum TimerCommandType {
  /// "Überspringen" on the watch → the phone skips the countdown and publishes CANCELLED.
  cancel('CANCEL'),

  /// Watch app launched / became reachable again → phone republishes the current state.
  requestState('REQUEST_STATE');

  const TimerCommandType(this.wire);
  final String wire;

  static TimerCommandType? fromWire(Object? value) =>
      values.where((c) => c.wire == value).firstOrNull;
}

@immutable
class TimerCommand {
  const TimerCommand(this.type, {this.timerId, this.revision});

  final TimerCommandType type;

  /// The timer the command refers to (required for [TimerCommandType.cancel]).
  final String? timerId;

  /// The revision the watch was showing when the user acted.
  final int? revision;
}

/// One message on the wire (both directions).
@immutable
class TimerSyncMessage {
  const TimerSyncMessage.state(
    SyncedTimerState this.state, {
    required this.sentAtMs,
  }) : command = null,
       origin = 'phone';

  const TimerSyncMessage.command(
    TimerCommand this.command, {
    required this.sentAtMs,
  }) : state = null,
       origin = 'watch';

  /// Exactly one of [state] / [command] is set.
  final SyncedTimerState? state;
  final TimerCommand? command;
  final String origin;
  final int sentAtMs;

  Map<String, Object?> toJson() => {
    'v': kTimerSyncVersion,
    'type': state != null ? 'timer.state' : 'timer.command',
    'origin': origin,
    'sentAtMs': sentAtMs,
    if (state != null) 'timer': state!.toJson(),
    if (command != null) ...{
      'command': command!.type.wire,
      'timerId': command!.timerId,
      'revision': command!.revision,
    },
  };

  /// Null for unknown versions, types or malformed payloads.
  static TimerSyncMessage? tryParse(Object? json) {
    if (json is! Map) return null;
    final version = json['v'];
    final sentAt = json['sentAtMs'];
    if (version is! int || version > kTimerSyncVersion || sentAt is! int) {
      return null;
    }
    switch (json['type']) {
      case 'timer.state':
        final state = SyncedTimerState.tryParse(json['timer']);
        return state == null
            ? null
            : TimerSyncMessage.state(state, sentAtMs: sentAt);
      case 'timer.command':
        final type = TimerCommandType.fromWire(json['command']);
        final timerId = json['timerId'];
        final revision = json['revision'];
        if (type == null) return null;
        if (type == TimerCommandType.cancel && timerId is! String) return null;
        return TimerSyncMessage.command(
          TimerCommand(
            type,
            timerId: timerId is String ? timerId : null,
            revision: revision is int ? revision : null,
          ),
          sentAtMs: sentAt,
        );
    }
    return null;
  }
}
