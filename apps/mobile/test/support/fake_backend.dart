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
  final mutationBodies = <Map<String, Object?>>[];

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
    return _workouts(method, path, json);
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
    Map<String, Object?> json,
  ) async {
    const base = '/v1/client/workouts';
    if (method == 'GET' && path == '$base/current') {
      return (status: 200, body: {'session': current});
    }
    if (method == 'GET' && path == base) {
      return (status: 200, body: {'items': history});
    }
    if (method == 'POST' && path == base) {
      final dayId = json['trainingDayId'];
      final running = current;
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
    final match = RegExp(
      r'^/v1/client/workouts/([^/]+)(?:/exercises/([^/]+)(?:/sets/(\d+))?)?(?:/(complete|abandon))?$',
    ).firstMatch(path);
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
        final set = sets.firstWhere(
          (s) => s['setNumber'] == int.parse(setNumber),
        );
        set['completed'] = json['completed'];
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
              ],
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
