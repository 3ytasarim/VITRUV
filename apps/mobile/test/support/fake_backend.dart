import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:vitruv_mobile/auth/auth_models.dart';

/// In-memory stand-in for the VITRUV API behind the REAL Dio stack (ApiClient, AuthInterceptor,
/// models) — tests never touch the network. Mirrors the contracts of /v1/auth, /v1/client/me,
/// /v1/client/training/active and /v1/client/workouts closely enough for UI flows; the server
/// rules themselves are proven by the API integration tests. Fictional data only.
class FakeBackend implements HttpClientAdapter {
  FakeBackend({DateTime Function()? now}) : _now = now ?? DateTime.now;

  final DateTime Function() _now;

  // ---------------------------------------------------------------- auth
  /// Keyed by login id (e-mail OR username, already normalised like `authLoginIdSchema`).
  /// `email` is what `currentUserSchema.email` returns — null for username-only clients.
  final accounts =
      <String, ({String password, String role, String id, String? email})>{
        'kunde@example.invalid': (
          password: 'richtig-1234',
          role: 'CLIENT',
          id: 'u-client',
          email: 'kunde@example.invalid',
        ),
        'coach@example.invalid': (
          password: 'richtig-1234',
          role: 'COACH',
          id: 'u-coach',
          email: 'coach@example.invalid',
        ),
        'admin@example.invalid': (
          password: 'richtig-1234',
          role: 'ADMIN',
          id: 'u-admin',
          email: 'admin@example.invalid',
        ),
        // fictional client created on the website with a username only (no e-mail address)
        'max.muster': (
          password: 'richtig-1234',
          role: 'CLIENT',
          id: 'u-client-2',
          email: null,
        ),
      };

  /// The exact JSON bodies sent to /v1/auth/login (to assert the request contract).
  final loginBodies = <Map<String, Object?>>[];
  final _access = <String, String>{}; // access → login id
  final _refresh = <String, String>{}; // refresh → login id
  int _seq = 0;
  int refreshCalls = 0;
  int logoutCalls = 0;
  bool rejectRefresh = false;

  /// All requests fail with a connection error.
  bool offline = false;

  /// The next N workout mutations (PATCH) fail with a connection error.
  int failMutations = 0;

  /// The next N reads of the plan (GET /v1/client/training/active) time out.
  int timeoutPlanReads = 0;

  /// The next N workout mutations (PATCH) answer 409 (e.g. the session was finished elsewhere).
  int conflictMutations = 0;

  /// Days whose workout was completed (→ `workoutStatus` COMPLETED, like the API derives it).
  final completedDayIds = <String>{};

  /// Request headers of the last request (to assert the capability header).
  Map<String, dynamic> lastHeaders = const {};

  /// Delay of /v1/auth/refresh (to make concurrent 401s overlap).
  Duration refreshDelay = Duration.zero;
  final requests = <String>[];

  /// Sprint 8A: asset ids whose URL the app renewed, and the URL the fake API answers.
  final renewedMedia = <String>[];
  String? Function(String assetId)? mediaUrlFor;

  AuthTokens issue(
    String email, {
    Duration accessTtl = const Duration(minutes: 15),
  }) {
    _seq++;
    final access = 'access-$_seq';
    final refresh = 'refresh-$_seq';
    _access[access] = email;
    _refresh[refresh] = email;
    return AuthTokens(
      accessToken: access,
      accessTokenExpiresAt: _now().add(accessTtl),
      refreshToken: refresh,
      refreshTokenExpiresAt: _now().add(const Duration(days: 30)),
    );
  }

  /// Simulates the 15-minute expiry of every access token issued so far.
  void expireAccessTokens() => _access.clear();

  // ---------------------------------------------------------------- client data
  Map<String, Object?> profile = {
    'id': 'u-client',
    'firstName': 'Erika',
    'lastName': 'Muster',
    'email': 'kunde@example.invalid',
    'coachingStatus': 'ACTIVE',
    'coach': {'displayName': 'Coach Alex'},
  };

  /// `GET /v1/client/me` of the username-only client: `email` is null on the wire.
  Map<String, Object?> usernameOnlyProfile = {
    'id': 'u-client-2',
    'firstName': 'Max',
    'lastName': 'Muster',
    'email': null,
    'coachingStatus': 'ACTIVE',
    'coach': {'displayName': 'Coach Alex'},
  };
  Map<String, Object?>? program = demoProgram();
  Map<String, Object?>? current;
  final history = <Map<String, Object?>>[];

  /// Sprint 7: query parameters of every history request (pagination checks).
  final historyRequests = <Map<String, dynamic>>[];

  /// Sprint 7: the next N "load more" requests (with a cursor) fail with 503.
  int failHistoryPages = 0;

  /// Sprint 7: GET …/:id/comparison answers by session id (default: no items).
  final comparisons = <String, Map<String, Object?>>{};

  /// Sprint 7: GET …/progress/exercises/:id answers by exercise id (default: no points).
  final exerciseProgress = <String, Map<String, Object?>>{};

  /// Finished sessions with all exercises and sets (GET /v1/client/workouts/:id).
  final finishedSessions = <String, Map<String, Object?>>{};
  final mutationBodies = <Map<String, Object?>>[];

  /// Sprint 6 API: sessions carry `timer` / `totalReps`, INTERVAL has one row per round and
  /// TOTAL_REPS sets are recorded via `POST …/sets`. Off → the older contract (no engines).
  bool engines = false;

  /// `POST …/sets`: fail before storing (no set) / store it, then lose the reply (retry case).
  int failSetRecords = 0;
  int loseSetReplies = 0;

  /// Bodies of `POST …/sets` (also the failed ones).
  final setRequests = <Map<String, Object?>>[];

  // ---------------------------------------------------------------- transport
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final key = '${options.method} ${options.path}';
    requests.add(key);
    lastHeaders = Map.of(options.headers);
    if (timeoutPlanReads > 0 && key == 'GET /v1/client/training/active') {
      timeoutPlanReads--;
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.receiveTimeout,
      );
    }
    if (offline) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    }
    Object? body;
    if (requestStream != null) {
      final bytes = await requestStream.fold<List<int>>(
        [],
        (a, b) => a..addAll(b),
      );
      if (bytes.isNotEmpty) body = jsonDecode(utf8.decode(bytes));
    }
    final json = body is Map<String, Object?> ? body : <String, Object?>{};
    final reply = await _route(options, json);
    return ResponseBody.fromString(
      reply.body == null ? '' : jsonEncode(reply.body),
      reply.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}

  ({int status, Object? body}) _error(
    int status,
    String code, [
    Object? details,
  ]) => (
    status: status,
    body: {
      'error': {'code': code, 'message': code, 'details': ?details},
    },
  );

  String? _user(RequestOptions options) {
    final header = options.headers['Authorization'] as String?;
    if (header == null || !header.startsWith('Bearer ')) return null;
    return _access[header.substring(7)];
  }

  Future<({int status, Object? body})> _route(
    RequestOptions options,
    Map<String, Object?> json,
  ) async {
    final path = options.path;
    final method = options.method;
    if (method == 'POST' && path == '/v1/auth/login') {
      loginBodies.add(json);
      // server-side normalisation (authLoginIdSchema: trim + lowercase)
      final loginId = (json['email'] as String? ?? '').trim().toLowerCase();
      final account = accounts[loginId];
      if (account == null || account.password != json['password']) {
        return _error(401, 'UNAUTHENTICATED');
      }
      final tokens = issue(loginId);
      return (
        status: 200,
        body: {'tokens': tokens.toJson(), 'user': _userJson(loginId)},
      );
    }
    if (method == 'POST' && path == '/v1/auth/refresh') {
      refreshCalls++;
      if (refreshDelay > Duration.zero) {
        await Future<void>.delayed(refreshDelay);
      }
      final email = _refresh.remove(json['refreshToken']);
      if (email == null || rejectRefresh) return _error(401, 'UNAUTHENTICATED');
      final tokens = issue(email);
      return (
        status: 200,
        body: {'tokens': tokens.toJson(), 'user': _userJson(email)},
      );
    }
    if (method == 'POST' && path == '/v1/auth/logout') {
      logoutCalls++;
      _refresh.remove(json['refreshToken']);
      return (status: 204, body: null);
    }

    final email = _user(options);
    if (email == null) return _error(401, 'UNAUTHENTICATED');
    if (method == 'GET' && path == '/v1/auth/me') {
      return (status: 200, body: {'user': _userJson(email)});
    }
    if (method == 'GET' && path == '/v1/client/me') {
      if (accounts[email]?.role != 'CLIENT') return _error(404, 'NOT_FOUND');
      return (
        status: 200,
        body: email == 'max.muster' ? usernameOnlyProfile : profile,
      );
    }
    if (method == 'GET' && path == '/v1/client/training/active') {
      if (accounts[email]?.role != 'CLIENT') return _error(403, 'FORBIDDEN');
      return (status: 200, body: {'program': _withStatuses(program)});
    }
    // Sprint 8A: fresh signed URL of a training medium (null entry → 404).
    final mediaUrl = RegExp(r'^/v1/client/training/media/([^/]+)/url$')
        .firstMatch(path);
    if (method == 'GET' && mediaUrl != null) {
      if (accounts[email]?.role != 'CLIENT') return _error(403, 'FORBIDDEN');
      final assetId = mediaUrl.group(1)!;
      renewedMedia.add(assetId);
      final url = mediaUrlFor?.call(assetId);
      if (url == null) return _error(404, 'NOT_FOUND');
      return (
        status: 200,
        body: {'assetId': assetId, 'url': url, 'expiresAt': null},
      );
    }
    return _workouts(method, path, json, options.queryParameters);
  }

  /// Adds the derived day status (Sprint 2 `workoutStatus`) unless a test set one explicitly:
  /// running session → IN_PROGRESS, completed → COMPLETED, otherwise NOT_STARTED.
  Map<String, Object?>? _withStatuses(Map<String, Object?>? plan) {
    if (plan == null) return null;
    final copy = jsonDecode(jsonEncode(plan)) as Map<String, Object?>;
    for (final week in (copy['weeks']! as List).cast<Map<String, Object?>>()) {
      for (final day in (week['days']! as List).cast<Map<String, Object?>>()) {
        if (day.containsKey('workoutStatus')) continue;
        day['workoutStatus'] = current?['dayId'] == day['id']
            ? 'IN_PROGRESS'
            : completedDayIds.contains(day['id'])
            ? 'COMPLETED'
            : 'NOT_STARTED';
      }
    }
    return copy;
  }

  Map<String, Object?> _userJson(String loginId) {
    final account = accounts[loginId]!;
    return {
      'id': account.id,
      'email': account.email,
      'displayName': null,
      'role': account.role,
      'status': 'ACTIVE',
      'permissions': account.role == 'CLIENT'
          ? ['self:read', 'training.self.read', 'training.self.workout']
          : ['admin.access'],
    };
  }

  // ---------------------------------------------------------------- workouts
  Future<({int status, Object? body})> _workouts(
    String method,
    String path,
    Map<String, Object?> json, [
    Map<String, dynamic> query = const {},
  ]) async {
    const base = '/v1/client/workouts';
    if (method == 'GET' && path == '$base/current') {
      return (status: 200, body: {'session': current});
    }
    if (method == 'GET' && path == base) {
      historyRequests.add(Map.of(query));
      // Sprint 7: cursor pages like the API (here the cursor is simply the next index).
      if (failHistoryPages > 0 && query['cursor'] != null) {
        failHistoryPages--;
        return _error(503, 'UNAVAILABLE');
      }
      final limit = int.tryParse('${query['limit'] ?? 20}') ?? 20;
      final from = int.tryParse('${query['cursor'] ?? 0}') ?? 0;
      final page = history.skip(from).take(limit).toList();
      final next = from + page.length;
      return (
        status: 200,
        body: {
          'items': page,
          'nextCursor': next < history.length ? '$next' : null,
        },
      );
    }
    final progress = RegExp(r'^/v1/client/workouts/progress/exercises/([^/]+)$')
        .firstMatch(path);
    if (method == 'GET' && progress != null) {
      final id = progress.group(1)!;
      return (
        status: 200,
        body:
            exerciseProgress[id] ??
            {
              'exerciseId': id,
              'name': null,
              'executionMode': null,
              'repsMax': false,
              'kind': 'NONE',
              'points': <Object?>[],
            },
      );
    }
    final compare = RegExp(r'^/v1/client/workouts/([^/]+)/comparison$')
        .firstMatch(path);
    if (method == 'GET' && compare != null) {
      final id = compare.group(1)!;
      if (current?['id'] != id && !finishedSessions.containsKey(id)) {
        return _error(404, 'NOT_FOUND');
      }
      return (
        status: 200,
        body: comparisons[id] ?? {'sessionId': id, 'items': <Object?>[]},
      );
    }
    if (method == 'POST' && path == base) {
      final dayId = json['trainingDayId'];
      final running = current;
      // Like the API (Sprint 5): a completed day can not be started again.
      if (completedDayIds.contains(dayId) && running?['dayId'] != dayId) {
        return _error(409, 'WORKOUT_ALREADY_COMPLETED');
      }
      if (running != null) {
        if (running['dayId'] == dayId) {
          return (status: 200, body: {'session': running, 'resumed': true});
        }
        return _error(409, 'WORKOUT_IN_PROGRESS', [
          {'path': 'sessionId', 'message': running['id']},
        ]);
      }
      final session = startSession(dayId! as String);
      if (session == null) return _error(404, 'NOT_FOUND');
      return (status: 201, body: {'session': session, 'resumed': false});
    }
    final record = RegExp(
      r'^/v1/client/workouts/([^/]+)/exercises/([^/]+)/sets$',
    ).firstMatch(path);
    if (method == 'POST' && record != null) {
      return _recordSet(record.group(1)!, record.group(2)!, json, path);
    }
    final match = RegExp(
      r'^/v1/client/workouts/([^/]+)(?:/exercises/([^/]+)(?:/sets/(\d+))?)?(?:/(complete|abandon))?$',
    ).firstMatch(path);
    if (method == 'GET' &&
        match != null &&
        match.group(2) == null &&
        match.group(4) == null) {
      final id = match.group(1);
      final found = current?['id'] == id ? current : finishedSessions[id];
      // like the API: the session itself (workoutSessionSchema), no wrapper
      return found == null
          ? _error(404, 'NOT_FOUND')
          : (status: 200, body: found);
    }
    final session = current;
    if (match == null || session == null || session['id'] != match.group(1)) {
      return _error(404, 'NOT_FOUND');
    }
    if (method == 'PATCH') {
      mutationBodies.add(json);
      if (conflictMutations > 0) {
        conflictMutations--;
        return _error(409, 'CONFLICT');
      }
      if (failMutations > 0) {
        failMutations--;
        throw DioException(
          requestOptions: RequestOptions(path: path),
          type: DioExceptionType.connectionError,
        );
      }
      final exercises = (session['exercises']! as List)
          .cast<Map<String, Object?>>();
      final exercise = exercises.firstWhere((e) => e['id'] == match.group(2));
      final setNumber = match.group(3);
      if (setNumber != null) {
        final sets = (exercise['sets']! as List).cast<Map<String, Object?>>();
        final set = sets
            .where((s) => s['setNumber'] == int.parse(setNumber))
            .firstOrNull;
        if (set == null) return _error(404, 'NOT_FOUND');
        // like the API: the first completion time is kept (a repeated round changes nothing)
        if (json['completed'] == true) {
          set['completedAt'] ??= _now().toUtc().toIso8601String();
        } else {
          set['completedAt'] = null;
        }
        set['completed'] = json['completed'];
        if (json.containsKey('actualReps')) {
          set['actualReps'] = json['actualReps'];
        }
        if (json.containsKey('actualDurationSeconds')) {
          set['actualDurationSeconds'] = json['actualDurationSeconds'];
        }
        final done = sets.where((s) => s['completed'] == true).length;
        exercise['status'] = done == sets.length ? 'COMPLETED' : 'PENDING';
      } else {
        if (json['status'] != null) exercise['status'] = json['status'];
        if (json.containsKey('actualReps')) {
          exercise['actualReps'] = json['actualReps'];
        }
        if (json.containsKey('actualDurationSeconds')) {
          exercise['actualDurationSeconds'] = json['actualDurationSeconds'];
        }
      }
      session['progress'] = progressOf(exercises);
      return (
        status: 200,
        body: {'exercise': exercise, 'progress': session['progress']},
      );
    }
    if (method == 'POST' && match.group(4) != null) {
      final abandon = match.group(4) == 'abandon';
      final progress = progressOf((session['exercises']! as List).cast());
      final summary = {
        'id': session['id'],
        'status': abandon ? 'ABANDONED' : 'COMPLETED',
        'programTitle': session['programTitle'],
        'dayTitle': session['dayTitle'],
        'weekOrder': session['weekOrder'],
        'dayOrder': session['dayOrder'],
        'startedAt': session['startedAt'],
        'completedAt': abandon ? null : _now().toUtc().toIso8601String(),
        'abandonedAt': abandon ? _now().toUtc().toIso8601String() : null,
        'durationSeconds': 48 * 60,
        'exercisesTotal': progress['total'],
        'exercisesCompleted': progress['completed'],
        'exercisesSkipped': progress['skipped'],
      };
      history.insert(0, summary);
      finishedSessions[session['id']! as String] = {
        ...session,
        'status': summary['status'],
        'completedAt': summary['completedAt'],
        'abandonedAt': summary['abandonedAt'],
        'durationSeconds': summary['durationSeconds'],
      };
      if (!abandon && session['dayId'] is String) {
        completedDayIds.add(session['dayId']! as String);
      }
      current = null;
      return (status: 200, body: {'summary': summary});
    }
    return _error(404, 'NOT_FOUND');
  }

  /// Snapshot of a plan day into a session (same mode rule as the API).
  Map<String, Object?>? startSession(String dayId) {
    final weeks = ((program?['weeks'] as List?) ?? const [])
        .cast<Map<String, Object?>>();
    for (final week in weeks) {
      for (final day in (week['days']! as List).cast<Map<String, Object?>>()) {
        if (day['id'] != dayId) continue;
        final exercises = <Map<String, Object?>>[];
        for (final section
            in (day['sections']! as List).cast<Map<String, Object?>>()) {
          for (final e
              in (section['exercises']! as List).cast<Map<String, Object?>>()) {
            final type = e['executionType'];
            final mode = type == 'CHECKLIST'
                ? 'CHECKLIST'
                : type == 'INTERVAL'
                ? 'INTERVAL'
                : type == 'TOTAL_REPS'
                ? 'TOTAL_REPS'
                : e['sets'] != null || e['reps'] != null
                ? 'SETS_REPS'
                : e['totalReps'] != null
                ? 'TOTAL_REPS'
                : e['durationSeconds'] != null
                ? 'DURATION'
                : 'CUSTOM';
            exercises.add({
              'id': 'we-${exercises.length + 1}',
              'assignmentId': e['assignmentId'],
              'exerciseId': e['exerciseId'],
              'order': exercises.length,
              'sectionType': section['type'],
              'sectionTitle': section['title'],
              'sectionOrder': section['order'],
              'name': e['name'],
              'instructions': e['instructions'],
              'media': e['media'],
              'target': {
                for (final k in [
                  'sets',
                  'reps',
                  'totalReps',
                  'durationSeconds',
                  'restSeconds',
                  'targetWeight',
                  'weightUnit',
                  'prescriptionText',
                  'repsMax',
                ])
                  k: e[k],
              },
              'executionMode': mode,
              'status': 'PENDING',
              'completedAt': null,
              'actualReps': null,
              'actualDurationSeconds': null,
              'actualWeight': null,
              'sets': [
                if (mode == 'SETS_REPS')
                  for (var n = 1; n <= ((e['sets'] as int?) ?? 1); n++)
                    {
                      'setNumber': n,
                      'targetReps': e['reps'],
                      'targetDurationSeconds': e['durationSeconds'],
                      'targetWeight': e['targetWeight'],
                      'actualReps': null,
                      'actualWeight': null,
                      'completed': false,
                      'completedAt': null,
                    },
                // Sprint 6: one row per Core round (target = work seconds)
                if (engines && mode == 'INTERVAL')
                  for (var n = 1; n <= _interval(e)['rounds']!; n++)
                    {
                      'setNumber': n,
                      'targetReps': null,
                      'targetDurationSeconds': _interval(e)['workSeconds'],
                      'targetWeight': null,
                      'actualReps': null,
                      'actualWeight': null,
                      'actualDurationSeconds': null,
                      'completed': false,
                      'completedAt': null,
                    },
              ],
              if (engines) 'timer': _timerOf(mode, e),
              if (engines && mode == 'TOTAL_REPS')
                'totalReps': _totalOf((e['totalReps'] as int?) ?? 0, const []),
            });
          }
        }
        if (exercises.isEmpty) return null;
        return current = {
          'id': 'session-${history.length + 1}',
          'status': 'IN_PROGRESS',
          'programTitle': program!['title'],
          'programId': program!['id'],
          'dayTitle': day['title'],
          'dayId': day['id'],
          'weekOrder': week['order'],
          'dayOrder': day['order'],
          'startedAt': _now().toUtc().toIso8601String(),
          'completedAt': null,
          'abandonedAt': null,
          'durationSeconds': null,
          'progress': progressOf(exercises),
          'exercises': exercises,
        };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- Sprint 6 engines

  /// Core config like the shared engine: sets = rounds, duration = work, rest; defaults 5/40/20
  /// only for empty values.
  static Map<String, int> _interval(Map<String, Object?> e) => {
    'rounds': (e['sets'] as int?) ?? 5,
    'workSeconds': (e['durationSeconds'] as int?) ?? 40,
    'restSeconds': (e['restSeconds'] as int?) ?? 20,
  };

  /// `timerConfigOf` of the shared engine.
  static Map<String, Object?> _timerOf(String mode, Map<String, Object?> e) {
    final rest = e['restSeconds'] as int?;
    final r = rest != null && rest > 0 ? rest : null;
    const none = {'mode': 'NONE', 'restSeconds': null, 'interval': null};
    return switch (mode) {
      'CHECKLIST' => none,
      'INTERVAL' => {
        'mode': 'INTERVAL',
        'restSeconds': null,
        'interval': _interval(e),
      },
      'SETS_REPS' || 'TOTAL_REPS' =>
        r == null
            ? none
            : {'mode': 'AUTO_REST', 'restSeconds': r, 'interval': null},
      _ =>
        r == null
            ? none
            : {'mode': 'MANUAL_REST', 'restSeconds': r, 'interval': null},
    };
  }

  static Map<String, Object?> _totalOf(int target, List<int> reps) {
    final done = reps.fold(0, (a, b) => a + b);
    return {
      'target': target,
      'done': done,
      'remaining': done >= target ? 0 : target - done,
      'reached': done >= target,
      'setCount': reps.length,
    };
  }

  /// `POST …/exercises/:id/sets` (TOTAL_REPS): idempotent per clientSetId, 409 once the target is
  /// reached or when the id is reused for other values; rest only while the target is open.
  ({int status, Object? body}) _recordSet(
    String sessionId,
    String exerciseId,
    Map<String, Object?> json,
    String path,
  ) {
    setRequests.add(json);
    if (finishedSessions.containsKey(sessionId)) {
      return _error(409, 'CONFLICT');
    }
    final session = current;
    if (session == null || session['id'] != sessionId) {
      return _error(404, 'NOT_FOUND');
    }
    if (failSetRecords > 0) {
      failSetRecords--;
      throw DioException(
        requestOptions: RequestOptions(path: path),
        type: DioExceptionType.connectionError,
      );
    }
    final exercises = (session['exercises']! as List)
        .cast<Map<String, Object?>>();
    final exercise = exercises.where((e) => e['id'] == exerciseId).firstOrNull;
    if (exercise == null) return _error(404, 'NOT_FOUND');
    if (exercise['executionMode'] != 'TOTAL_REPS') {
      return _error(409, 'CONFLICT');
    }
    final target =
        ((exercise['target']! as Map)['totalReps'] as int?) ??
        ((exercise['totalReps'] as Map?)?['target'] as int?) ??
        0;
    final rest = (exercise['timer'] as Map?)?['restSeconds'] as int?;
    final sets = (exercise['sets']! as List).cast<Map<String, Object?>>();
    final id = json['clientSetId'];
    final reps = json['actualReps']! as int;
    var set = sets.where((s) => s['clientSetId'] == id).firstOrNull;
    var created = false;
    if (set != null) {
      if (set['actualReps'] != reps) return _error(409, 'CONFLICT');
    } else {
      if (exercise['status'] != 'PENDING') return _error(409, 'CONFLICT');
      set = {
        'setNumber': sets.length + 1,
        'targetReps': null,
        'targetDurationSeconds': null,
        'targetWeight': null,
        'actualReps': reps,
        'actualWeight': null,
        'actualDurationSeconds': null,
        'completed': true,
        'completedAt': _now().toUtc().toIso8601String(),
        'clientSetId': id,
      };
      sets.add(set);
      created = true;
    }
    final all = [for (final s in sets) s['actualReps']! as int];
    final total = _totalOf(target, all);
    exercise['totalReps'] = total;
    exercise['actualReps'] = total['done'];
    if (total['reached'] == true && exercise['status'] == 'PENDING') {
      exercise['status'] = 'COMPLETED';
      exercise['completedAt'] = _now().toUtc().toIso8601String();
    }
    session['progress'] = progressOf(exercises);
    // rest after this set only while the target is still open after it
    final upTo = all.take(set['setNumber']! as int).fold(0, (a, b) => a + b);
    final restSeconds = upTo >= target ? null : rest;
    if (loseSetReplies > 0) {
      loseSetReplies--;
      throw DioException(
        requestOptions: RequestOptions(path: path),
        type: DioExceptionType.connectionError,
      );
    }
    return (
      status: created ? 201 : 200,
      body: {
        'exercise': exercise,
        'progress': session['progress'],
        'set': set,
        'created': created,
        'restSeconds': restSeconds,
      },
    );
  }

  static Map<String, Object?> progressOf(
    List<Map<String, Object?>> exercises,
  ) => {
    'total': exercises.length,
    'completed': exercises.where((e) => e['status'] == 'COMPLETED').length,
    'skipped': exercises.where((e) => e['status'] == 'SKIPPED').length,
    'currentExerciseId': exercises
        .where((e) => e['status'] == 'PENDING')
        .firstOrNull?['id'],
  };
}

Map<String, Object?> _exercise(
  String id,
  String name, {
  int? sets,
  int? reps,
  int? totalReps,
  int? durationSeconds,
  int? restSeconds,
  double? targetWeight,
  String? prescriptionText,
  String? instructions,
  String? executionType,
  Map<String, Object?>? media,
  bool? repsMax,
}) => {
  'assignmentId': 'a-$id',
  'exerciseId': 'e-$id',
  'order': 0,
  'name': name,
  'description': null,
  'media': media,
  'sets': sets,
  'reps': reps,
  'totalReps': totalReps,
  'durationSeconds': durationSeconds,
  'restSeconds': restSeconds,
  'targetWeight': targetWeight,
  'weightUnit': targetWeight == null ? null : 'KG',
  'prescriptionText': prescriptionText,
  'instructions': instructions,
  'executionType': ?executionType,
  'repsMax': ?repsMax,
};

/// Fictional Strength plan (Sprint 5): Oberkörper (Mo) with a MAX exercise and Unterkörper (Th,
/// = harness "today"), each with rest between sets. Starts Monday 2026-10-12.
Map<String, Object?> strengthProgram() => {
  'id': 'p-3',
  'title': 'Kraftblock',
  'description': null,
  'startsOn': '2026-10-12',
  'endsOn': null,
  'currentWeekId': 'w-k',
  'weeks': [
    {
      'id': 'w-k',
      'order': 0,
      'title': null,
      'notes': null,
      'days': [
        _day('d-ok', 0, 'Oberkörper', 1, [
          _section('s-ok', 'MAIN', [
            _exercise(
              'ok1',
              'Bankdrücken',
              sets: 3,
              reps: 10,
              restSeconds: 90,
              executionType: 'STRENGTH',
            ),
            _exercise(
              'ok2',
              'Klimmzüge',
              sets: 3,
              repsMax: true,
              restSeconds: 120,
              executionType: 'STRENGTH',
            ),
          ]),
        ]),
        _day('d-uk', 1, 'Unterkörper', 4, [
          _section('s-uk', 'MAIN', [
            _exercise(
              'uk1',
              'Kniebeugen',
              sets: 4,
              reps: 8,
              restSeconds: 120,
              executionType: 'STRENGTH',
            ),
            _exercise(
              'uk2',
              'Ausfallschritte',
              sets: 3,
              reps: 12,
              restSeconds: 60,
              executionType: 'STRENGTH',
            ),
          ]),
        ]),
      ],
    },
  ],
};

/// Fictional technique video (resolved delivery URL, never a storage key).
Map<String, Object?> demoVideo({String mimeType = 'video/mp4'}) => {
  'assetId': 'm-video',
  'kind': 'VIDEO',
  'url': 'https://media.example.invalid/technik.mp4',
  'mimeType': mimeType,
  'width': 1280,
  'height': 720,
  'altText': null,
};

Map<String, Object?> _day(
  String id,
  int order,
  String title,
  int? weekday,
  List<Map<String, Object?>> sections, {
  String? status,
}) => {
  'id': id,
  'order': order,
  'title': title,
  'notes': null,
  'scheduledWeekday': weekday,
  'workoutStatus': ?status,
  'sections': [
    for (var i = 0; i < sections.length; i++) {...sections[i], 'order': i},
  ],
};

Map<String, Object?> _section(
  String id,
  String type,
  List<Map<String, Object?>> exercises, {
  String? title,
}) => {
  'id': id,
  'order': 0,
  'type': type,
  'title': title,
  'exercises': exercises,
};

/// Warm-up checklist of four items (Sprint 2 CHECKLIST type: no reps, timer or rest).
List<Map<String, Object?>> demoWarmup({bool withVideo = false}) => [
  _exercise(
    'w1',
    'Schulterkreisen',
    executionType: 'CHECKLIST',
    instructions: 'Langsam und kontrolliert.',
    media: withVideo ? demoVideo() : null,
  ),
  _exercise('w2', 'Armkreisen', executionType: 'CHECKLIST'),
  _exercise('w3', 'Hüftmobilisation', executionType: 'CHECKLIST'),
  _exercise('w4', 'Kniebeugen ohne Gewicht', executionType: 'CHECKLIST'),
];

/// Fictional ACTIVE plan WITH a calendar (Sprint 4): starts Monday 2026-10-12; the harness clock
/// is Thursday 2026-10-15.
/// - week 1: Mo 12.10. "Oberkörper A" (completed), We 14.10. "Rücken kurz" + "Core kurz" (two
///   workouts on one day), Th 15.10. "Aufwärmen und Kraft" (Warm-up checklist + strength)
/// - week 2: Tu 20.10. "Ganzkörper"
/// - no weekday: "Mobility frei" (only in the Trainingsübersicht)
Map<String, Object?> weekProgram({
  bool warmupOnly = false,
  bool warmupVideo = false,
  String startsOn = '2026-10-12',
}) => {
  'id': 'p-2',
  'title': 'Herbstblock',
  'description': null,
  'startsOn': startsOn,
  'endsOn': null,
  'currentWeekId': 'w-a',
  'weeks': [
    {
      'id': 'w-a',
      'order': 0,
      'title': null,
      'notes': null,
      'days': [
        _day('d-mo', 0, 'Oberkörper A', 1, [
          _section('s-mo', 'MAIN', [
            _exercise(
              'mo1',
              'Klimmzüge',
              sets: 4,
              reps: 8,
              executionType: 'STRENGTH',
            ),
          ]),
        ], status: 'COMPLETED'),
        _day('d-mi1', 1, 'Rücken kurz', 3, [
          _section('s-mi1', 'MAIN', [
            _exercise(
              'mi1',
              'Rudern',
              totalReps: 60,
              restSeconds: 60,
              executionType: 'TOTAL_REPS',
            ),
          ]),
        ]),
        _day('d-mi2', 2, 'Core kurz', 3, [
          _section('s-mi2', 'MAIN', [
            _exercise('mi2', 'Plank', durationSeconds: 40),
          ]),
        ]),
        _day('d-do', 3, 'Aufwärmen und Kraft', 4, [
          _section(
            's-do-w',
            'WARMUP',
            demoWarmup(withVideo: warmupVideo),
            title: 'Aufwärmen',
          ),
          if (!warmupOnly)
            _section('s-do-m', 'MAIN', [
              _exercise(
                'do1',
                'Bankdrücken',
                sets: 3,
                reps: 10,
                restSeconds: 90,
                executionType: 'STRENGTH',
              ),
            ]),
        ]),
        _day('d-frei', 4, 'Mobility frei', null, [
          _section('s-frei', 'MAIN', [
            _exercise('fr1', 'Dehnen', prescriptionText: 'locker'),
          ]),
        ]),
      ],
    },
    {
      'id': 'w-b',
      'order': 1,
      'title': null,
      'notes': null,
      'days': [
        _day('d-di', 0, 'Ganzkörper', 2, [
          _section('s-di', 'MAIN', [
            _exercise('di1', 'Kreuzheben', sets: 5, reps: 5),
          ]),
        ]),
      ],
    },
  ],
};

/// Fictional ACTIVE plan: week 1 = "Oberkörper A" (all four execution styles) + "Unterkörper",
/// week 2 = "Ganzkörper".
Map<String, Object?> demoProgram({String? currentWeekId, int? weekday}) => {
  'id': 'p-1',
  'title': 'Kraftaufbau',
  'description': 'Drei Einheiten pro Woche.',
  'startsOn': null,
  'endsOn': null,
  'currentWeekId': currentWeekId,
  'weeks': [
    {
      'id': 'w-1',
      'order': 0,
      'title': null,
      'notes': null,
      'days': [
        {
          'id': 'd-1',
          'order': 0,
          'title': 'Oberkörper A',
          'notes': null,
          'scheduledWeekday': weekday,
          'sections': [
            {
              'id': 's-1',
              'order': 0,
              'type': 'WARMUP',
              'title': null,
              'exercises': [
                _exercise(
                  '1',
                  'Seilspringen',
                  durationSeconds: 45,
                  restSeconds: 30,
                ),
              ],
            },
            {
              'id': 's-2',
              'order': 1,
              'type': 'MAIN',
              'title': null,
              'exercises': [
                _exercise(
                  '2',
                  'Klimmzüge',
                  sets: 4,
                  reps: 12,
                  restSeconds: 60,
                  instructions: 'Schulterblätter aktiv.',
                ),
                _exercise('3', 'Liegestütze', totalReps: 70, restSeconds: 60),
              ],
            },
            {
              'id': 's-3',
              'order': 2,
              'type': 'FINISHER',
              'title': null,
              'exercises': [
                _exercise(
                  '4',
                  'Burpees',
                  prescriptionText: 'AMRAP',
                  restSeconds: 0,
                ),
              ],
            },
          ],
        },
        {
          'id': 'd-2',
          'order': 1,
          'title': 'Unterkörper',
          'notes': null,
          'scheduledWeekday': null,
          'sections': [
            {
              'id': 's-4',
              'order': 0,
              'type': 'MAIN',
              'title': null,
              'exercises': [
                _exercise(
                  '5',
                  'Goblet Squat',
                  sets: 3,
                  reps: 10,
                  restSeconds: 90,
                  targetWeight: 20,
                ),
              ],
            },
          ],
        },
      ],
    },
    {
      'id': 'w-2',
      'order': 1,
      'title': 'Steigerung',
      'notes': null,
      'days': [
        {
          'id': 'd-3',
          'order': 0,
          'title': 'Ganzkörper',
          'notes': null,
          'scheduledWeekday': null,
          'sections': [
            {
              'id': 's-5',
              'order': 0,
              'type': 'MAIN',
              'title': null,
              'exercises': [_exercise('6', 'Kreuzheben', sets: 5, reps: 5)],
            },
          ],
        },
      ],
    },
  ],
};

/// Fictional Sprint 6 plan (all engines; the harness "today" is Thursday 2026-10-15):
/// - "Klimmzug-Ziel" (Mo): Warm-up checklist + Total reps Klimmzüge 60 (auto rest 60 s)
/// - "Core-Tag" (We): Warm-up + Core-Routine INTERVAL without values (→ 5 × 40/20 defaults)
/// - "Ganzkörper Mix" (Th): Warm-up + Strength Bankdrücken 2 × 10 (manual rest 90 s) + Total reps
///   Liegestütze 20 (rest 45 s) + Core-Routine 3 × 30/15 — sections and order as the coach set them
Map<String, Object?> enginesProgram() => {
  'id': 'p-6',
  'title': 'Zielblock',
  'description': null,
  'startsOn': '2026-10-12',
  'endsOn': null,
  'currentWeekId': 'w-z',
  'weeks': [
    {
      'id': 'w-z',
      'order': 0,
      'title': null,
      'notes': null,
      'days': [
        _day(
          'd-kz',
          0,
          'Klimmzug-Ziel',
          1,
          _ordered([
            _section('s-kz-w', 'WARMUP', [
              _exercise('kzw1', 'Schulterkreisen', executionType: 'CHECKLIST'),
              _exercise('kzw2', 'Armkreisen', executionType: 'CHECKLIST'),
            ], title: 'Aufwärmen'),
            _section('s-kz-m', 'MAIN', [
              _exercise(
                'kz1',
                'Klimmzüge',
                totalReps: 60,
                restSeconds: 60,
                executionType: 'TOTAL_REPS',
              ),
            ]),
          ]),
        ),
        _day(
          'd-core',
          1,
          'Core-Tag',
          3,
          _ordered([
            _section('s-core-w', 'WARMUP', [
              _exercise('cw1', 'Hüftmobilisation', executionType: 'CHECKLIST'),
              _exercise('cw2', 'Katze-Kuh', executionType: 'CHECKLIST'),
            ], title: 'Aufwärmen'),
            _section('s-core-f', 'FINISHER', [
              _exercise('core1', 'Core-Routine', executionType: 'INTERVAL'),
            ]),
          ]),
        ),
        _day(
          'd-mix',
          2,
          'Ganzkörper Mix',
          4,
          _ordered([
            _section('s-mix-w', 'WARMUP', [
              _exercise('mxw1', 'Armkreisen', executionType: 'CHECKLIST'),
              _exercise('mxw2', 'Katze-Kuh', executionType: 'CHECKLIST'),
            ], title: 'Aufwärmen'),
            _section('s-mix-m', 'MAIN', [
              _exercise(
                'mx1',
                'Bankdrücken',
                sets: 2,
                reps: 10,
                restSeconds: 90,
                executionType: 'STRENGTH',
              ),
              _exercise(
                'mx2',
                'Liegestütze',
                totalReps: 20,
                restSeconds: 45,
                executionType: 'TOTAL_REPS',
              ),
            ]),
            _section('s-mix-f', 'FINISHER', [
              _exercise(
                'mx3',
                'Core-Routine',
                sets: 3,
                durationSeconds: 30,
                restSeconds: 15,
                executionType: 'INTERVAL',
              ),
            ]),
          ]),
        ),
      ],
    },
  ],
};

/// Sections in the coach's order (0, 1, 2 …) like the API snapshot.
List<Map<String, Object?>> _ordered(List<Map<String, Object?>> sections) => [
  for (var i = 0; i < sections.length; i++) {...sections[i], 'order': i},
];
