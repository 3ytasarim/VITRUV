import 'package:flutter/foundation.dart';

import '../../core/json/json_reader.dart';
import '../workout/workout_models.dart';

/// Sprint 7 — history page, "previous vs current" and exercise progress. Mirrors
/// `packages/contracts/src/workout.ts` (exerciseResultSchema, workoutComparisonSchema,
/// exerciseProgressSchema). Every value is a RECORDED value from the API; a value that was never
/// recorded stays `null` and is never shown as 0.

/// One page of `GET /v1/client/workouts` (newest first). `nextCursor` null = no older entries.
@immutable
class HistoryPage {
  const HistoryPage({required this.items, required this.nextCursor});

  factory HistoryPage.fromJson(JsonReader json) => HistoryPage(
    items: json.list('items', WorkoutSummary.fromJson),
    nextCursor: json.stringOrNull('nextCursor'),
  );

  final List<WorkoutSummary> items;
  final String? nextCursor;
}

enum ResultKind {
  reps,
  totalReps,
  rounds,
  none;

  static ResultKind fromWire(String value) => switch (value) {
    'REPS' => ResultKind.reps,
    'TOTAL_REPS' => ResultKind.totalReps,
    'ROUNDS' => ResultKind.rounds,
    _ => ResultKind.none,
  };
}

@immutable
class ResultSet {
  const ResultSet({
    required this.setNumber,
    required this.targetReps,
    required this.actualReps,
    required this.completed,
  });

  factory ResultSet.fromJson(JsonReader json) => ResultSet(
    setNumber: json.integer('setNumber'),
    targetReps: json.intOrNull('targetReps'),
    actualReps: json.intOrNull('actualReps'),
    completed: json.boolean('completed'),
  );

  final int setNumber;
  final int? targetReps;
  final int? actualReps;
  final bool completed;
}

@immutable
class IntervalResultConfig {
  const IntervalResultConfig({
    required this.rounds,
    required this.workSeconds,
    required this.restSeconds,
  });

  factory IntervalResultConfig.fromJson(JsonReader json) =>
      IntervalResultConfig(
        rounds: json.intOrNull('rounds'),
        workSeconds: json.intOrNull('workSeconds'),
        restSeconds: json.intOrNull('restSeconds'),
      );

  final int? rounds;
  final int? workSeconds;
  final int? restSeconds;
}

@immutable
class ExerciseResult {
  const ExerciseResult({
    required this.kind,
    required this.totalReps,
    required this.setCount,
    required this.roundsCompleted,
    required this.totalTarget,
    required this.interval,
    required this.sets,
  });

  factory ExerciseResult.fromJson(JsonReader json) {
    final interval = json.objectOrNull('interval');
    return ExerciseResult(
      kind: ResultKind.fromWire(json.string('kind')),
      totalReps: json.intOrNull('totalReps'),
      setCount: json.integer('setCount'),
      roundsCompleted: json.intOrNull('roundsCompleted'),
      totalTarget: json.intOrNull('totalTarget'),
      interval: interval == null
          ? null
          : IntervalResultConfig.fromJson(interval),
      sets: json.list('sets', ResultSet.fromJson),
    );
  }

  final ResultKind kind;
  final int? totalReps;
  final int setCount;
  final int? roundsCompleted;
  final int? totalTarget;
  final IntervalResultConfig? interval;
  final List<ResultSet> sets;
}

@immutable
class ResultEntry {
  const ResultEntry({
    required this.sessionId,
    required this.date,
    required this.result,
  });

  factory ResultEntry.fromJson(JsonReader json) => ResultEntry(
    sessionId: json.string('sessionId'),
    date: json.dateTime('date'),
    result: ExerciseResult.fromJson(json.object('result')),
  );

  final String sessionId;
  final DateTime date;
  final ExerciseResult result;
}

@immutable
class SetDifference {
  const SetDifference({
    required this.setNumber,
    required this.previous,
    required this.current,
    required this.difference,
  });

  factory SetDifference.fromJson(JsonReader json) => SetDifference(
    setNumber: json.integer('setNumber'),
    previous: json.intOrNull('previous'),
    current: json.intOrNull('current'),
    difference: json.intOrNull('difference'),
  );

  final int setNumber;
  final int? previous;
  final int? current;
  final int? difference;
}

@immutable
class ExerciseComparison {
  const ExerciseComparison({
    required this.sessionExerciseId,
    required this.exerciseId,
    required this.current,
    required this.previous,
    required this.difference,
    required this.setDifferences,
    required this.configChanged,
  });

  factory ExerciseComparison.fromJson(JsonReader json) {
    final previous = json.objectOrNull('previous');
    return ExerciseComparison(
      sessionExerciseId: json.string('sessionExerciseId'),
      exerciseId: json.string('exerciseId'),
      current: ResultEntry.fromJson(json.object('current')),
      previous: previous == null ? null : ResultEntry.fromJson(previous),
      difference: json.intOrNull('difference'),
      setDifferences: json.list('setDifferences', SetDifference.fromJson),
      configChanged: json.booleanOrNull('configChanged') ?? false,
    );
  }

  final String sessionExerciseId;
  final String exerciseId;
  final ResultEntry current;
  final ResultEntry? previous;
  final int? difference;
  final List<SetDifference> setDifferences;
  final bool configChanged;
}

/// `GET …/:sessionId/comparison`, keyed by session exercise id.
@immutable
class WorkoutComparison {
  const WorkoutComparison({required this.items});

  factory WorkoutComparison.fromJson(JsonReader json) =>
      WorkoutComparison(items: json.list('items', ExerciseComparison.fromJson));

  final List<ExerciseComparison> items;

  ExerciseComparison? forExercise(String sessionExerciseId) =>
      items.where((i) => i.sessionExerciseId == sessionExerciseId).firstOrNull;
}

@immutable
class ProgressPoint {
  const ProgressPoint({
    required this.sessionId,
    required this.date,
    required this.value,
    required this.setCount,
  });

  factory ProgressPoint.fromJson(JsonReader json) => ProgressPoint(
    sessionId: json.string('sessionId'),
    date: json.dateTime('date'),
    value: json.integer('value'),
    setCount: json.integer('setCount'),
  );

  final String sessionId;
  final DateTime date;
  final int value;
  final int setCount;
}

/// `GET …/progress/exercises/:exerciseId` — oldest → newest, completed sessions only.
@immutable
class ExerciseProgress {
  const ExerciseProgress({
    required this.exerciseId,
    required this.name,
    required this.kind,
    required this.points,
  });

  factory ExerciseProgress.fromJson(JsonReader json) => ExerciseProgress(
    exerciseId: json.string('exerciseId'),
    name: json.stringOrNull('name'),
    kind: ResultKind.fromWire(json.string('kind')),
    points: json.list('points', ProgressPoint.fromJson),
  );

  final String exerciseId;
  final String? name;
  final ResultKind kind;
  final List<ProgressPoint> points;
}
