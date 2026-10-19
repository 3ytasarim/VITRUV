import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/providers.dart';
import '../../auth/auth_state.dart';
import '../../core/errors/app_failure.dart';
import 'workout_api.dart';
import 'workout_models.dart';

final workoutApiProvider = Provider<WorkoutApi>(
  (ref) => WorkoutApi(ref.watch(apiClientProvider)),
);

/// The outcome of a start attempt.
sealed class StartResult {
  const StartResult();
}

final class Started extends StartResult {
  const Started(this.session);

  final WorkoutSession session;
}

/// Another day's workout is still running (server rule: one current workout per client).
final class OtherWorkoutRunning extends StartResult {
  const OtherWorkoutRunning();
}

final class StartFailed extends StartResult {
  const StartFailed(this.failure);

  final Object failure;
}

/// The client's CURRENT workout (IN_PROGRESS) — server state is the source of truth.
///
/// - loaded from `GET /current` (resume after restart / on another device)
/// - mutations are applied OPTIMISTICALLY and run one after another; the server answer replaces
///   the exercise (focused response, no full reload). On failure the exercise is rolled back to
///   its last server-confirmed version and the failure is returned to the screen (error + retry).
/// - an already loaded workout stays usable when one request fails.
class WorkoutController extends AsyncNotifier<WorkoutSession?> {
  final Map<String, WorkoutExercise> _confirmed = {};
  Future<void> _queue = Future.value();

  WorkoutApi get _api => ref.read(workoutApiProvider);

  @override
  Future<WorkoutSession?> build() async {
    if (ref.watch(signedInUserIdProvider) == null) return null;
    return _remember(await ref.watch(workoutApiProvider).current());
  }

  WorkoutSession? _remember(WorkoutSession? session) {
    _confirmed
      ..clear()
      ..addEntries([
        for (final e in session?.exercises ?? const <WorkoutExercise>[])
          MapEntry(e.id, e),
      ]);
    return session;
  }

  /// Re-reads the current workout. A failure keeps an already loaded workout usable.
  Future<void> reload() async {
    try {
      state = AsyncData(_remember(await _api.current()));
    } on Object catch (error, stack) {
      if (state.value == null) state = AsyncError(error, stack);
    }
  }

  Future<StartResult> start(String trainingDayId) async {
    try {
      final result = await _api.start(trainingDayId);
      state = AsyncData(_remember(result.session));
      return Started(result.session);
    } on ApiFailure catch (failure) {
      if (failure.code == 'WORKOUT_IN_PROGRESS') {
        unawaited(reload());
        return const OtherWorkoutRunning();
      }
      return StartFailed(failure);
    } on Object catch (failure) {
      return StartFailed(failure);
    }
  }

  /// Tick a set on/off. Optimistic status follows the server rule (all sets → completed).
  Future<AppFailure?> toggleSet(
    String exerciseId,
    int setNumber,
    bool completed,
  ) => _mutate(
    exerciseId,
    optimistic: (e) {
      final sets = [
        for (final s in e.sets)
          s.setNumber == setNumber ? s.copyWith(completed: completed) : s,
      ];
      final done = sets.where((s) => s.completed).length;
      final status = done == sets.length
          ? ExerciseStatus.completed
          : (e.status == ExerciseStatus.skipped && done == 0
                ? ExerciseStatus.skipped
                : ExerciseStatus.pending);
      return e.copyWith(sets: sets, status: status);
    },
    send: (session) =>
        _api.updateSet(session, exerciseId, setNumber, completed: completed),
  );

  Future<AppFailure?> setStatus(
    String exerciseId,
    ExerciseStatus status, {
    int? actualReps,
    int? actualDurationSeconds,
  }) => _mutate(
    exerciseId,
    optimistic: (e) => e.copyWith(
      status: status,
      actualReps: actualReps,
      actualDurationSeconds: actualDurationSeconds,
    ),
    send: (session) => _api.updateExercise(
      session,
      exerciseId,
      status: status,
      actualReps: actualReps,
      actualDurationSeconds: actualDurationSeconds,
    ),
  );

  Future<AppFailure?> _mutate(
    String exerciseId, {
    required WorkoutExercise Function(WorkoutExercise current) optimistic,
    required Future<({WorkoutExercise exercise, WorkoutProgress progress})>
    Function(String sessionId)
    send,
  }) {
    final session = state.value;
    if (session == null) {
      return Future.value(const UnknownFailure('No workout'));
    }
    final index = session.indexOf(exerciseId);
    if (index < 0) return Future.value(const UnknownFailure('No exercise'));
    state = AsyncData(
      session.withExercise(optimistic(session.exercises[index])),
    );

    final completer = Completer<AppFailure?>();
    _queue = _queue.then((_) async {
      try {
        final result = await send(session.id);
        _confirmed[exerciseId] = result.exercise;
        final current = state.value;
        if (current != null && current.id == session.id) {
          state = AsyncData(
            current.withExercise(result.exercise, result.progress),
          );
        }
        completer.complete(null);
      } on Object catch (error) {
        final current = state.value;
        final confirmed = _confirmed[exerciseId];
        if (current != null && current.id == session.id && confirmed != null) {
          state = AsyncData(current.withExercise(confirmed));
        }
        completer.complete(error is AppFailure ? error : UnknownFailure(error));
      }
    });
    return completer.future;
  }

  /// "Training abschließen" / "Training abbrechen" — returns the summary; the controller then has
  /// no current workout any more.
  Future<({WorkoutSummary? summary, AppFailure? failure})> finish({
    required bool abandon,
  }) async {
    final session = state.value;
    if (session == null) {
      return (summary: null, failure: const UnknownFailure());
    }
    await _queue; // pending set updates are written first
    try {
      final summary = abandon
          ? await _api.abandon(session.id)
          : await _api.complete(session.id);
      state = AsyncData(_remember(null));
      ref.read(lastWorkoutSummaryProvider.notifier).show(summary);
      ref.invalidate(workoutHistoryProvider);
      return (summary: summary, failure: null);
    } on AppFailure catch (failure) {
      return (summary: null, failure: failure);
    } on Object catch (error) {
      return (summary: null, failure: UnknownFailure(error));
    }
  }
}

final workoutControllerProvider =
    AsyncNotifierProvider<WorkoutController, WorkoutSession?>(
      WorkoutController.new,
      retry: (retryCount, error) => null,
    );

/// The summary of the workout that was just finished (completion screen).
class LastWorkoutSummary extends Notifier<WorkoutSummary?> {
  @override
  WorkoutSummary? build() {
    ref.watch(signedInUserIdProvider);
    return null;
  }

  void show(WorkoutSummary summary) => state = summary;
}

final lastWorkoutSummaryProvider =
    NotifierProvider<LastWorkoutSummary, WorkoutSummary?>(
      LastWorkoutSummary.new,
    );

final workoutHistoryProvider = FutureProvider<List<WorkoutSummary>>((ref) {
  ref.watch(signedInUserIdProvider);
  return ref.watch(workoutApiProvider).history();
}, retry: (retryCount, error) => null);
