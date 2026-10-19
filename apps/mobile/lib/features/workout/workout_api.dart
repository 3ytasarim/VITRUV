import '../../api/api_client.dart';
import '../../core/json/json_reader.dart';
import 'workout_models.dart';

/// `/v1/client/workouts` — the signed-in client's own workouts (self context).
class WorkoutApi {
  const WorkoutApi(this._client);

  final ApiClient _client;
  static const _base = '/v1/client/workouts';

  Future<WorkoutSession?> current() async {
    final session = JsonReader(await _client.getJson('$_base/current'))
        .objectOrNull('session');
    return session == null ? null : WorkoutSession.fromJson(session);
  }

  /// Starts the day's workout — or returns the running one of the same day (`resumed`).
  /// Another running day: ApiFailure `WORKOUT_IN_PROGRESS` (detail `sessionId`).
  Future<({WorkoutSession session, bool resumed})> start(
    String trainingDayId,
  ) async {
    final json = JsonReader(
      await _client.sendJson('POST', _base, {'trainingDayId': trainingDayId}),
    );
    return (
      session: WorkoutSession.fromJson(json.object('session')),
      resumed: json.boolean('resumed'),
    );
  }

  Future<({WorkoutExercise exercise, WorkoutProgress progress})> updateExercise(
    String sessionId,
    String exerciseId, {
    ExerciseStatus? status,
    int? actualReps,
    int? actualDurationSeconds,
  }) => _update('$_base/$sessionId/exercises/$exerciseId', {
    'status': ?status?.wire,
    'actualReps': ?actualReps,
    'actualDurationSeconds': ?actualDurationSeconds,
  });

  Future<({WorkoutExercise exercise, WorkoutProgress progress})> updateSet(
    String sessionId,
    String exerciseId,
    int setNumber, {
    required bool completed,
  }) => _update('$_base/$sessionId/exercises/$exerciseId/sets/$setNumber', {
    'completed': completed,
  });

  Future<WorkoutSummary> complete(String sessionId) =>
      _finish(sessionId, 'complete');

  Future<WorkoutSummary> abandon(String sessionId) =>
      _finish(sessionId, 'abandon');

  Future<List<WorkoutSummary>> history({int limit = 30}) async =>
      JsonReader(await _client.getJson(_base, query: {'limit': limit}))
          .list('items', WorkoutSummary.fromJson);

  Future<({WorkoutExercise exercise, WorkoutProgress progress})> _update(
    String path,
    Map<String, Object?> body,
  ) async {
    final json = JsonReader(await _client.sendJson('PATCH', path, body));
    return (
      exercise: WorkoutExercise.fromJson(json.object('exercise')),
      progress: WorkoutProgress.fromJson(json.object('progress')),
    );
  }

  Future<WorkoutSummary> _finish(String sessionId, String action) async =>
      WorkoutSummary.fromJson(
        JsonReader(await _client.sendJson('POST', '$_base/$sessionId/$action'))
            .object('summary'),
      );
}
