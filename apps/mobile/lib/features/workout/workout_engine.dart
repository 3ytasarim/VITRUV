import 'package:flutter/foundation.dart';

/// Pure workout arithmetic — mirrors `packages/shared/src/workout-engine.ts` so the app shows the
/// same numbers the API stores. The API stays the source of truth: these values are only used
/// for display until (or when) the server answer does not carry them (older API, offline view).

/// Core interval defaults (`INTERVAL_DEFAULTS`): used only when the session snapshot has no
/// value — the API stores the defaults itself, so a current server always sends real values.
const kIntervalDefaultRounds = 5;
const kIntervalDefaultWorkSeconds = 40;
const kIntervalDefaultRestSeconds = 20;

@immutable
class TotalRepsProgress {
  const TotalRepsProgress({
    required this.target,
    required this.done,
    required this.remaining,
    required this.reached,
    required this.setCount,
  });

  final int target;
  final int done;

  /// Never negative: overshooting the target ends the exercise with 0 remaining.
  final int remaining;
  final bool reached;
  final int setCount;
}

/// `remaining = max(0, target − Σ actual reps)`; an overshoot is kept in [TotalRepsProgress.done].
TotalRepsProgress totalRepsProgress(int target, Iterable<int?> recordedReps) {
  final reps = recordedReps.toList();
  final done = reps.fold<int>(0, (sum, r) => sum + (r ?? 0));
  return TotalRepsProgress(
    target: target,
    done: done,
    remaining: done >= target ? 0 : target - done,
    reached: done >= target,
    setCount: reps.length,
  );
}

@immutable
class IntervalConfig {
  const IntervalConfig({
    required this.rounds,
    required this.workSeconds,
    required this.restSeconds,
  });

  final int rounds;
  final int workSeconds;
  final int restSeconds;

  @override
  bool operator ==(Object other) =>
      other is IntervalConfig &&
      other.rounds == rounds &&
      other.workSeconds == workSeconds &&
      other.restSeconds == restSeconds;

  @override
  int get hashCode => Object.hash(rounds, workSeconds, restSeconds);
}

enum IntervalPhaseKind { work, rest }

@immutable
class IntervalPhase {
  const IntervalPhase({
    required this.round,
    required this.kind,
    required this.startsAt,
    required this.seconds,
  });

  /// 1-based round.
  final int round;
  final IntervalPhaseKind kind;

  /// Offset from the interval start in seconds.
  final int startsAt;
  final int seconds;
}

@immutable
class IntervalPlan {
  const IntervalPlan(this.phases, this.totalSeconds);

  final List<IntervalPhase> phases;
  final int totalSeconds;

  /// Index of the WORK phase of [round] (1-based), or -1.
  int workIndexOf(int round) => phases.indexWhere(
    (p) => p.round == round && p.kind == IntervalPhaseKind.work,
  );
}

/// WORK, REST, WORK, …, WORK — starts with work, no rest after the last round.
/// 5 × 40/20 → 9 phases, 280 s.
IntervalPlan intervalPlan(IntervalConfig config) {
  final phases = <IntervalPhase>[];
  var at = 0;
  for (var round = 1; round <= config.rounds; round++) {
    phases.add(
      IntervalPhase(
        round: round,
        kind: IntervalPhaseKind.work,
        startsAt: at,
        seconds: config.workSeconds,
      ),
    );
    at += config.workSeconds;
    if (round < config.rounds && config.restSeconds > 0) {
      phases.add(
        IntervalPhase(
          round: round,
          kind: IntervalPhaseKind.rest,
          startsAt: at,
          seconds: config.restSeconds,
        ),
      );
      at += config.restSeconds;
    }
  }
  return IntervalPlan(List.unmodifiable(phases), at);
}

/// Where an interval stands after [elapsedSeconds] (null = finished).
({int index, int remainingSeconds})? intervalPositionAt(
  IntervalPlan plan,
  int elapsedSeconds,
) {
  final at = elapsedSeconds < 0 ? 0 : elapsedSeconds;
  for (var i = 0; i < plan.phases.length; i++) {
    final p = plan.phases[i];
    if (at < p.startsAt + p.seconds) {
      return (index: i, remainingSeconds: p.startsAt + p.seconds - at);
    }
  }
  return null;
}
