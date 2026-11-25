import 'package:flutter/foundation.dart';

import '../../core/errors/app_failure.dart';
import '../../core/json/json_reader.dart';
import '../training/training_models.dart';
import 'workout_engine.dart';

/// Mirrors packages/contracts/src/workout.ts. Every TARGET value is the snapshot taken when the
/// session started — never the live plan.

enum WorkoutStatus {
  inProgress,
  completed,
  abandoned;

  static WorkoutStatus fromWire(String value) => switch (value) {
    'IN_PROGRESS' => inProgress,
    'COMPLETED' => completed,
    'ABANDONED' => abandoned,
    _ => throw const UnknownFailure('Unknown workout status'),
  };
}

/// Derived by the API from the structured prescription (never from free text).
enum ExecutionMode {
  setsReps,
  totalReps,
  duration,
  custom,

  /// Core interval — rounds × work/rest (Sprint 6: own timer UI, one row per round).
  interval,

  /// Sprint 2 (API): Warm-up checklist item — tick off only.
  checklist;

  /// Unknown future modes fall back to [custom] (mark done) instead of failing the whole
  /// workout — the API may learn new modes before an installed app does.
  static ExecutionMode fromWire(String value) => switch (value) {
    'SETS_REPS' => setsReps,
    'TOTAL_REPS' => totalReps,
    'DURATION' => duration,
    'CUSTOM' => custom,
    'INTERVAL' => interval,
    'CHECKLIST' => checklist,
    _ => custom,
  };
}

enum ExerciseStatus {
  pending,
  completed,
  skipped;

  static ExerciseStatus fromWire(String value) => switch (value) {
    'PENDING' => pending,
    'COMPLETED' => completed,
    'SKIPPED' => skipped,
    _ => throw const UnknownFailure('Unknown exercise status'),
  };

  String get wire => switch (this) {
    pending => 'PENDING',
    completed => 'COMPLETED',
    skipped => 'SKIPPED',
  };
}

@immutable
class WorkoutSet {
  const WorkoutSet({
    required this.setNumber,
    required this.targetReps,
    required this.targetDurationSeconds,
    required this.targetWeight,
    required this.actualReps,
    required this.actualWeight,
    required this.completed,
    this.actualDurationSeconds,
    this.clientSetId,
  });

  factory WorkoutSet.fromJson(JsonReader json) => WorkoutSet(
    setNumber: json.integer('setNumber'),
    targetReps: json.intOrNull('targetReps'),
    targetDurationSeconds: json.intOrNull('targetDurationSeconds'),
    targetWeight: json.numberOrNull('targetWeight'),
    actualReps: json.intOrNull('actualReps'),
    actualWeight: json.numberOrNull('actualWeight'),
    completed: json.boolean('completed'),
    actualDurationSeconds: json.intOrNull('actualDurationSeconds'),
    clientSetId: json.stringOrNull('clientSetId'),
  );

  final int setNumber;
  final int? targetReps;
  final int? targetDurationSeconds;
  final double? targetWeight;
  final int? actualReps;
  final double? actualWeight;
  final bool completed;

  /// Core round: seconds actually trained (one row per round).
  final int? actualDurationSeconds;

  /// Total reps: the id the app generated for this set (idempotent retries).
  final String? clientSetId;

  WorkoutSet copyWith({bool? completed, int? actualReps}) => WorkoutSet(
    setNumber: setNumber,
    targetReps: targetReps,
    targetDurationSeconds: targetDurationSeconds,
    targetWeight: targetWeight,
    actualReps: actualReps ?? this.actualReps,
    actualWeight: actualWeight,
    completed: completed ?? this.completed,
    actualDurationSeconds: actualDurationSeconds,
    clientSetId: clientSetId,
  );
}

@immutable
class WorkoutExercise {
  const WorkoutExercise({
    required this.id,
    required this.order,
    required this.sectionType,
    required this.sectionTitle,
    required this.name,
    required this.instructions,
    required this.media,
    required this.target,
    required this.mode,
    required this.status,
    required this.actualReps,
    required this.actualDurationSeconds,
    required this.sets,
    this.sectionOrder = 0,
    this.timer,
    this.serverTotalReps,
    this.exerciseId,
  });

  factory WorkoutExercise.fromJson(JsonReader json) => WorkoutExercise(
    id: json.string('id'),
    order: json.integer('order'),
    sectionType: SectionType.fromWire(json.string('sectionType')),
    sectionTitle: json.stringOrNull('sectionTitle'),
    name: json.string('name'),
    instructions: json.stringOrNull('instructions'),
    media: ResolvedMedia.fromJson(json.objectOrNull('media')),
    target: Prescription.fromJson(json.object('target')),
    mode: ExecutionMode.fromWire(json.string('executionMode')),
    status: ExerciseStatus.fromWire(json.string('status')),
    actualReps: json.intOrNull('actualReps'),
    actualDurationSeconds: json.intOrNull('actualDurationSeconds'),
    sets: json.list('sets', WorkoutSet.fromJson),
    sectionOrder: json.intOrNull('sectionOrder') ?? 0,
    timer: WorkoutTimer.fromJsonOrNull(json.objectOrNull('timer')),
    serverTotalReps: _totalRepsOrNull(json.objectOrNull('totalReps')),
    exerciseId: json.stringOrNull('exerciseId'),
  );

  static TotalRepsProgress? _totalRepsOrNull(JsonReader? json) => json == null
      ? null
      : TotalRepsProgress(
          target: json.integer('target'),
          done: json.integer('done'),
          remaining: json.integer('remaining'),
          reached: json.boolean('reached'),
          setCount: json.integer('setCount'),
        );

  final String id;
  final int order;
  final SectionType sectionType;
  final String? sectionTitle;
  final String name;
  final String? instructions;
  final ResolvedMedia? media;
  final Prescription target;
  final ExecutionMode mode;
  final ExerciseStatus status;
  final int? actualReps;
  final int? actualDurationSeconds;
  final List<WorkoutSet> sets;

  /// 0-based section position at start time (groups a Warm-up checklist).
  final int sectionOrder;

  /// Timer the API derived from the snapshot (optional on the wire — older APIs omit it).
  final WorkoutTimer? timer;

  /// Total reps progress as computed by the API (null for other modes / older APIs).
  final TotalRepsProgress? serverTotalReps;

  /// The library exercise (stable across sessions; Sprint 7 progress chart). Null in old fakes.
  final String? exerciseId;

  bool get isDone => status != ExerciseStatus.pending;

  /// Total reps: the server's numbers, else the same rule over the recorded sets.
  TotalRepsProgress? get totalProgress {
    if (mode != ExecutionMode.totalReps) return null;
    final target = totalRepsTarget;
    if (target == null) return serverTotalReps;
    return serverTotalReps ??
        totalRepsProgress(target, [for (final s in sets) s.actualReps]);
  }

  int? get totalRepsTarget => target.totalReps ?? serverTotalReps?.target;

  /// Core: rounds × work/rest from the API timer, else from the snapshot (sets = rounds,
  /// duration = work, rest) with the documented defaults.
  IntervalConfig? get intervalConfig {
    if (mode != ExecutionMode.interval) return null;
    return timer?.interval ??
        IntervalConfig(
          rounds: target.sets ?? kIntervalDefaultRounds,
          workSeconds: target.durationSeconds ?? kIntervalDefaultWorkSeconds,
          restSeconds: target.restSeconds ?? kIntervalDefaultRestSeconds,
        );
  }

  WorkoutExercise copyWith({
    ExerciseStatus? status,
    List<WorkoutSet>? sets,
    int? actualReps,
    int? actualDurationSeconds,
  }) => WorkoutExercise(
    id: id,
    order: order,
    sectionType: sectionType,
    sectionTitle: sectionTitle,
    name: name,
    instructions: instructions,
    media: media,
    target: target,
    mode: mode,
    status: status ?? this.status,
    actualReps: actualReps ?? this.actualReps,
    actualDurationSeconds: actualDurationSeconds ?? this.actualDurationSeconds,
    sets: sets ?? this.sets,
    sectionOrder: sectionOrder,
    timer: timer,
    serverTotalReps: serverTotalReps,
    exerciseId: exerciseId,
  );
}

enum WorkoutTimerMode {
  none,
  manualRest,
  autoRest,
  interval;

  static WorkoutTimerMode fromWire(String? value) => switch (value) {
    'MANUAL_REST' => manualRest,
    'AUTO_REST' => autoRest,
    'INTERVAL' => interval,
    _ => none,
  };
}

/// `exercise.timer` (Sprint 2 contract): which timer the app runs for this exercise.
@immutable
class WorkoutTimer {
  const WorkoutTimer({
    required this.mode,
    required this.restSeconds,
    required this.interval,
  });

  static WorkoutTimer? fromJsonOrNull(JsonReader? json) {
    if (json == null) return null;
    final interval = json.objectOrNull('interval');
    return WorkoutTimer(
      mode: WorkoutTimerMode.fromWire(json.stringOrNull('mode')),
      restSeconds: json.intOrNull('restSeconds'),
      interval: interval == null
          ? null
          : IntervalConfig(
              rounds: interval.integer('rounds'),
              workSeconds: interval.integer('workSeconds'),
              restSeconds: interval.integer('restSeconds'),
            ),
    );
  }

  final WorkoutTimerMode mode;
  final int? restSeconds;
  final IntervalConfig? interval;
}

@immutable
class WorkoutProgress {
  const WorkoutProgress({
    required this.total,
    required this.completed,
    required this.skipped,
    required this.currentExerciseId,
  });

  factory WorkoutProgress.fromJson(JsonReader json) => WorkoutProgress(
    total: json.integer('total'),
    completed: json.integer('completed'),
    skipped: json.integer('skipped'),
    currentExerciseId: json.stringOrNull('currentExerciseId'),
  );

  /// Same rule as the API (used only for optimistic display until the server answers).
  factory WorkoutProgress.of(List<WorkoutExercise> exercises) =>
      WorkoutProgress(
        total: exercises.length,
        completed: exercises
            .where((e) => e.status == ExerciseStatus.completed)
            .length,
        skipped: exercises
            .where((e) => e.status == ExerciseStatus.skipped)
            .length,
        currentExerciseId: exercises
            .where((e) => e.status == ExerciseStatus.pending)
            .firstOrNull
            ?.id,
      );

  final int total;
  final int completed;
  final int skipped;
  final String? currentExerciseId;

  int get open => total - completed - skipped;
}

@immutable
class WorkoutSession {
  const WorkoutSession({
    required this.id,
    required this.status,
    required this.programTitle,
    required this.dayTitle,
    required this.dayId,
    required this.weekOrder,
    required this.dayOrder,
    required this.startedAt,
    required this.progress,
    required this.exercises,
  });

  factory WorkoutSession.fromJson(JsonReader json) => WorkoutSession(
    id: json.string('id'),
    status: WorkoutStatus.fromWire(json.string('status')),
    programTitle: json.string('programTitle'),
    dayTitle: json.string('dayTitle'),
    dayId: json.stringOrNull('dayId'),
    weekOrder: json.integer('weekOrder'),
    dayOrder: json.integer('dayOrder'),
    startedAt: json.dateTime('startedAt'),
    progress: WorkoutProgress.fromJson(json.object('progress')),
    exercises: json.list('exercises', WorkoutExercise.fromJson),
  );

  final String id;
  final WorkoutStatus status;
  final String programTitle;
  final String dayTitle;
  final String? dayId;
  final int weekOrder;
  final int dayOrder;
  final DateTime startedAt;
  final WorkoutProgress progress;
  final List<WorkoutExercise> exercises;

  int indexOf(String exerciseId) =>
      exercises.indexWhere((e) => e.id == exerciseId);

  WorkoutSession withExercise(
    WorkoutExercise exercise, [
    WorkoutProgress? progress,
  ]) {
    final next = [
      for (final e in exercises)
        if (e.id == exercise.id) exercise else e,
    ];
    return WorkoutSession(
      id: id,
      status: status,
      programTitle: programTitle,
      dayTitle: dayTitle,
      dayId: dayId,
      weekOrder: weekOrder,
      dayOrder: dayOrder,
      startedAt: startedAt,
      progress: progress ?? WorkoutProgress.of(next),
      exercises: next,
    );
  }
}

/// History row / completion summary (`workoutSessionSummarySchema`).
@immutable
class WorkoutSummary {
  const WorkoutSummary({
    required this.id,
    required this.status,
    required this.programTitle,
    required this.dayTitle,
    required this.weekOrder,
    required this.dayOrder,
    required this.startedAt,
    required this.endedAt,
    required this.durationSeconds,
    required this.total,
    required this.completed,
    required this.skipped,
    this.totalReps,
    this.setsCompleted,
    this.roundsCompleted,
  });

  factory WorkoutSummary.fromJson(JsonReader json) => WorkoutSummary(
    id: json.string('id'),
    status: WorkoutStatus.fromWire(json.string('status')),
    programTitle: json.string('programTitle'),
    dayTitle: json.string('dayTitle'),
    weekOrder: json.integer('weekOrder'),
    dayOrder: json.integer('dayOrder'),
    startedAt: json.dateTime('startedAt'),
    endedAt:
        json.dateTimeOrNull('completedAt') ??
        json.dateTimeOrNull('abandonedAt'),
    durationSeconds: json.intOrNull('durationSeconds'),
    total: json.integer('exercisesTotal'),
    completed: json.integer('exercisesCompleted'),
    skipped: json.integer('exercisesSkipped'),
    // Sprint 7 (additive; older servers omit them → null, never shown as 0)
    totalReps: json.intOrNull('totalReps'),
    setsCompleted: json.intOrNull('setsCompleted'),
    roundsCompleted: json.intOrNull('roundsCompleted'),
  );

  final String id;
  final WorkoutStatus status;
  final String programTitle;
  final String dayTitle;
  final int weekOrder;
  final int dayOrder;
  final DateTime startedAt;
  final DateTime? endedAt;
  final int? durationSeconds;
  final int total;
  final int completed;
  final int skipped;

  /// Sprint 7: sum of the recorded reps (Strength + Total reps); null = nothing recorded.
  final int? totalReps;

  /// Sprint 7: sets with a recorded result; null = unknown (older server).
  final int? setsCompleted;

  /// Sprint 7: completed Core rounds; null = unknown (older server).
  final int? roundsCompleted;

  int get open => total - completed - skipped;
}
