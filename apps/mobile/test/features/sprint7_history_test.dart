import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/features/progress/history_models.dart';
import 'package:vitruv_mobile/features/progress/progress_chart.dart';
import 'package:vitruv_mobile/features/progress/workout_detail_screen.dart';
import 'package:vitruv_mobile/core/json/json_reader.dart';
import 'package:vitruv_mobile/features/workout/workout_models.dart';
import 'package:vitruv_mobile/l10n/app_localizations.dart';
import 'package:vitruv_mobile/shared/format/training_format.dart';

import '../support/app_harness.dart';
import '../support/fake_backend.dart';

/// Sprint 7 — participant history (iPhone app): recorded totals per row, page-wise loading,
/// the detail per execution type, "previous vs current" and the progress chart. Fake API with
/// fictional sessions; every value shown must be a recorded value (never an invented 0).
void main() {
  /// One history row by its day title ("… · Einheit 7", not 17).
  Finder row(int n) =>
      find.textContaining(RegExp('· Einheit $n\$'), skipOffstage: false);

  /// Meta texts (VitruvMetaRow) are shown in capitals.
  Finder meta(String text) =>
      find.textContaining(RegExp(RegExp.escape(text), caseSensitive: false));

  /// A finished "Ganzkörper Mix" session built from the real snapshot of the fake API, with
  /// recorded values: Warm-up ticked, Bankdrücken 2 × 10 ([bench]), Liegestütze 20 as [push],
  /// Core [rounds] of 3 rounds.
  Map<String, Object?> finished(
    AppHarness h, {
    required String id,
    required DateTime startedAt,
    List<int?> bench = const [10, 8],
    List<int> push = const [12, 9],
    int rounds = 2,
    bool max = false,
  }) {
    final s = h.backend.startSession('d-mix')!;
    h.backend.current = null;
    final exercises = (s['exercises']! as List).cast<Map<String, Object?>>();
    for (final e in exercises) {
      switch (e['executionMode']) {
        case 'CHECKLIST':
          e['status'] = 'COMPLETED';
        case 'SETS_REPS':
          if (max) (e['target']! as Map<String, Object?>)['repsMax'] = true;
          final sets = (e['sets']! as List).cast<Map<String, Object?>>();
          for (var i = 0; i < sets.length; i++) {
            final reps = i < bench.length ? bench[i] : null;
            sets[i]
              ..['actualReps'] = reps
              ..['completed'] = reps != null;
          }
          e['status'] = bench.every((r) => r != null) ? 'COMPLETED' : 'PENDING';
        case 'TOTAL_REPS':
          final done = push.fold(0, (a, b) => a + b);
          e
            ..['status'] = 'COMPLETED'
            ..['actualReps'] = done
            ..['sets'] = [
              for (var i = 0; i < push.length; i++)
                {
                  'setNumber': i + 1,
                  'targetReps': null,
                  'targetDurationSeconds': null,
                  'targetWeight': null,
                  'actualReps': push[i],
                  'actualWeight': null,
                  'completed': true,
                  'completedAt': null,
                },
            ]
            ..['totalReps'] = {
              'target': 20,
              'done': done,
              'remaining': done >= 20 ? 0 : 20 - done,
              'reached': done >= 20,
              'setCount': push.length,
            };
        case 'INTERVAL':
          final sets = (e['sets']! as List).cast<Map<String, Object?>>();
          for (var i = 0; i < sets.length; i++) {
            sets[i]
              ..['completed'] = i < rounds
              ..['actualDurationSeconds'] = i < rounds ? 30 : null;
          }
          e['status'] = rounds >= sets.length ? 'COMPLETED' : 'PENDING';
      }
    }
    final at = startedAt.toUtc().toIso8601String();
    s
      ..['id'] = id
      ..['status'] = 'COMPLETED'
      ..['startedAt'] = at
      ..['completedAt'] = at
      ..['durationSeconds'] = 40 * 60
      ..['progress'] = FakeBackend.progressOf(exercises);
    h.backend.finishedSessions[id] = s;
    return s;
  }

  Map<String, Object?> summary(
    String id,
    String title,
    DateTime startedAt, {
    int? totalReps,
    int? sets,
    int? rounds,
  }) => {
    'id': id,
    'status': 'COMPLETED',
    'programTitle': 'Engine-Test',
    'dayTitle': title,
    'weekOrder': 0,
    'dayOrder': 2,
    'startedAt': startedAt.toUtc().toIso8601String(),
    'completedAt': startedAt.toUtc().toIso8601String(),
    'abandonedAt': null,
    'durationSeconds': 40 * 60,
    'exercisesTotal': 5,
    'exercisesCompleted': 5,
    'exercisesSkipped': 0,
    'totalReps': totalReps,
    'setsCompleted': sets,
    'roundsCompleted': rounds,
  };

  Map<String, Object?> result(
    String kind, {
    int? total,
    int sets = 0,
    int? rounds,
    List<int?> reps = const [],
  }) => {
    'kind': kind,
    'totalReps': total,
    'setCount': sets,
    'roundsCompleted': rounds,
    'totalTarget': null,
    'interval': null,
    'sets': [
      for (var i = 0; i < reps.length; i++)
        {
          'setNumber': i + 1,
          'targetReps': 10,
          'actualReps': reps[i],
          'completed': reps[i] != null,
        },
    ],
  };

  Future<AppHarness> openHistory(
    WidgetTester tester, {
    void Function(AppHarness h)? seed,
    double width = 390,
    double textScale = 1,
  }) async {
    final h = AppHarness();
    h.backend
      ..program = enginesProgram()
      ..engines = true;
    seed?.call(h);
    await h.pump(tester, width: width, height: 1800, textScale: textScale);
    await tapOn(tester, find.byIcon(Icons.insights_outlined));
    return h;
  }

  /// One finished session "mix-2" (with a previous one "mix-1") in the list and opened.
  Future<AppHarness> openDetail(
    WidgetTester tester, {
    void Function(AppHarness h)? extra,
    double width = 390,
    double textScale = 1,
    bool max = false,
  }) async {
    final h = await openHistory(
      tester,
      width: width,
      textScale: textScale,
      seed: (h) {
        finished(
          h,
          id: 'mix-2',
          startedAt: DateTime.utc(2026, 10, 15, 8),
          max: max,
        );
        h.backend.history.add(
          summary(
            'mix-2',
            'Ganzkörper Mix',
            DateTime.utc(2026, 10, 15, 8),
            totalReps: 39,
            sets: 4,
            rounds: 2,
          ),
        );
        extra?.call(h);
      },
    );
    await tapOn(tester, find.textContaining('· Ganzkörper Mix'));
    return h;
  }

  // ------------------------------------------------------------------------------- list
  group('history list', () {
    testWidgets('22. a row shows the recorded totals (reps, sets, rounds)', (
      tester,
    ) async {
      await openHistory(
        tester,
        seed: (h) => h.backend.history.add(
          summary(
            'mix-1',
            'Ganzkörper Mix',
            DateTime.utc(2026, 10, 15, 8),
            totalReps: 39,
            sets: 4,
            rounds: 2,
          ),
        ),
      );
      expect(meta('Gesamt: 39 Wiederholungen'), findsOneWidget);
      expect(meta('4 Sätze'), findsOneWidget);
      expect(meta('2 Runden'), findsOneWidget);
    });

    testWidgets('25. nothing recorded (older API / warm-up only) → no "0"', (
      tester,
    ) async {
      await openHistory(
        tester,
        seed: (h) => h.backend.history.add(
          summary('w-1', 'Mobility', DateTime.utc(2026, 10, 14, 8)),
        ),
      );
      expect(find.textContaining('Mobility'), findsOneWidget);
      expect(meta('Wiederholungen'), findsNothing);
      expect(meta('0 Sätze'), findsNothing);
      expect(meta('0 Runden'), findsNothing);
    });

    testWidgets(
      '23. pagination: 20 per page, "Mehr laden" appends, newest first',
      (tester) async {
        final h = await openHistory(
          tester,
          seed: (h) {
            for (var i = 0; i < 25; i++) {
              h.backend.history.add(
                summary(
                  'p-$i',
                  'Einheit ${i + 1}',
                  DateTime.utc(2026, 10, 30).subtract(Duration(days: i)),
                ),
              );
            }
          },
        );
        expect(h.backend.historyRequests.first['limit'].toString(), '20');
        expect(h.backend.historyRequests.first['cursor'], isNull);
        expect(row(1), findsOneWidget);
        expect(row(21), findsNothing);
        final more = find.bySemanticsLabel('Mehr laden');
        await tester.ensureVisible(more);
        await tapOn(tester, more);
        expect(h.backend.historyRequests.last['cursor'].toString(), '20');
        expect(row(25), findsOneWidget);
        expect(find.bySemanticsLabel('Mehr laden'), findsNothing);
        // no duplicates after appending
        expect(row(1), findsOneWidget);
        expect(row(20), findsOneWidget);
      },
    );

    testWidgets(
      '24. a failing "Mehr laden" keeps the loaded rows and offers a retry',
      (tester) async {
        await openHistory(
          tester,
          seed: (h) {
            for (var i = 0; i < 22; i++) {
              h.backend.history.add(
                summary(
                  'p-$i',
                  'Einheit ${i + 1}',
                  DateTime.utc(2026, 10, 30).subtract(Duration(days: i)),
                ),
              );
            }
            h.backend.failHistoryPages = 1;
          },
        );
        final more = find.bySemanticsLabel('Mehr laden');
        await tester.ensureVisible(more);
        await tapOn(tester, more);
        expect(
          find.text('Weitere Einträge konnten nicht geladen werden.'),
          findsOneWidget,
        );
        expect(row(1), findsWidgets);
        final retry = find.bySemanticsLabel('Erneut versuchen');
        await tester.ensureVisible(retry);
        await tapOn(tester, retry);
        expect(
          find.text('Weitere Einträge konnten nicht geladen werden.'),
          findsNothing,
        );
        expect(row(22), findsOneWidget);
      },
    );

    testWidgets(
      '35. app resume reloads the history (trained on another device)',
      (tester) async {
        final h = await openHistory(
          tester,
          seed: (h) => h.backend.history.add(
            summary('mix-1', 'Ganzkörper Mix', DateTime.utc(2026, 10, 15, 8)),
          ),
        );
        final before = h.backend.historyRequests.length;
        h.backend.history.insert(
          0,
          summary('mix-9', 'Neue Einheit', DateTime.utc(2026, 10, 16, 8)),
        );
        for (final state in [
          AppLifecycleState.inactive,
          AppLifecycleState.hidden,
          AppLifecycleState.paused,
          AppLifecycleState.hidden,
          AppLifecycleState.inactive,
          AppLifecycleState.resumed,
        ]) {
          tester.binding.handleAppLifecycleStateChanged(state);
        }
        await tester.pumpAndSettle();
        expect(h.backend.historyRequests.length, greaterThan(before));
        expect(find.textContaining('· Neue Einheit'), findsOneWidget);
      },
    );

    testWidgets('pull-to-refresh reloads the first page', (tester) async {
      final h = await openHistory(
        tester,
        seed: (h) => h.backend.history.add(
          summary('mix-1', 'Ganzkörper Mix', DateTime.utc(2026, 10, 15, 8)),
        ),
      );
      final before = h.backend.historyRequests.length;
      h.backend.history.insert(
        0,
        summary('mix-9', 'Neue Einheit', DateTime.utc(2026, 10, 16, 8)),
      );
      await tester.drag(find.byType(RefreshIndicator), const Offset(0, 500));
      await tester.pumpAndSettle();
      expect(h.backend.historyRequests.length, greaterThan(before));
      expect(h.backend.historyRequests.last['cursor'], isNull);
      expect(find.textContaining('· Neue Einheit'), findsOneWidget);
    });
  });

  // ----------------------------------------------------------------------------- detail
  group('history detail', () {
    testWidgets(
      '26-30. Strength sets + total, Total reps goal/done/sets, Core rounds, Warm-up done',
      (tester) async {
        await openDetail(tester);
        // Strength
        expect(find.text('Satz 1: 10 von 10 Wdh.'), findsOneWidget);
        expect(find.text('Satz 2: 8 von 10 Wdh.'), findsOneWidget);
        expect(find.text('Gesamt: 18 Wiederholungen'), findsOneWidget);
        // Total reps
        expect(find.text('Gesamtziel: 20 Wdh.'), findsOneWidget);
        expect(find.text('Geschafft: 21 Wdh.'), findsOneWidget);
        expect(find.text('Benötigte Sätze: 2'), findsOneWidget);
        // Core: configuration + rounds (open rounds stay "offen", not 0 seconds)
        expect(
          find.text('3 Runden · 30 Sek. Belastung · 15 Sek. Pause'),
          findsOneWidget,
        );
        expect(find.text('Runden geschafft: 2 von 3'), findsOneWidget);
        expect(find.text('Runde 3: 0 Sek.'), findsNothing);
        // Warm-up: completion only, no reps
        expect(find.text('Aufwärmen erledigt'), findsNWidgets(2));
      },
    );

    testWidgets('27. MAX sets read "Satz 1: 17 Wdh. (MAX)"', (tester) async {
      final h = AppHarness();
      h.backend
        ..program = enginesProgram()
        ..engines = true;
      final s = finished(
        h,
        id: 'max-1',
        startedAt: DateTime.utc(2026, 10, 15),
        bench: [17, null],
        max: true,
      );
      final l10n = lookupAppLocalizations(const Locale('de'));
      final bench = (s['exercises']! as List)
          .cast<Map<String, Object?>>()
          .firstWhere((e) => e['name'] == 'Bankdrücken');
      final exercise = WorkoutExercise.fromJson(JsonReader(bench));
      final lines = resultLines(l10n, TrainingFormat(l10n), exercise);
      expect(lines, contains('Satz 1: 17 Wdh. (MAX)'));
      expect(lines, contains('Satz 2: nicht erledigt'));
      // only recorded reps count: 17, never 17 + 0
      expect(lines, contains('Gesamt: 17 Wiederholungen'));
    });

    testWidgets(
      '31-33. comparison with the previous workout: per set, total, difference',
      (tester) async {
        await openDetail(
          tester,
          extra: (h) => h.backend.comparisons['mix-2'] = {
            'sessionId': 'mix-2',
            'items': [
              {
                'sessionExerciseId': 'we-3',
                'exerciseId': 'e-mx1',
                'current': {
                  'sessionId': 'mix-2',
                  'date': '2026-10-15T08:00:00.000Z',
                  'result': result('REPS', total: 18, sets: 2, reps: [10, 8]),
                },
                'previous': {
                  'sessionId': 'mix-1',
                  'date': '2026-10-08T08:00:00.000Z',
                  'result': result('REPS', total: 15, sets: 2, reps: [8, 7]),
                },
                'difference': 3,
                'setDifferences': [
                  {
                    'setNumber': 1,
                    'previous': 8,
                    'current': 10,
                    'difference': 2,
                  },
                  {
                    'setNumber': 2,
                    'previous': 7,
                    'current': 8,
                    'difference': 1,
                  },
                ],
                'configChanged': false,
              },
              {
                'sessionExerciseId': 'we-4',
                'exerciseId': 'e-mx2',
                'current': {
                  'sessionId': 'mix-2',
                  'date': '2026-10-15T08:00:00.000Z',
                  'result': result('TOTAL_REPS', total: 21, sets: 2),
                },
                'previous': null,
                'difference': null,
                'setDifferences': <Object?>[],
                'configChanged': false,
              },
            ],
          },
        );
        expect(find.text('Vergleich'), findsNWidgets(2));
        expect(find.textContaining('Vorheriges Training:'), findsOneWidget);
        expect(find.text('Satz 1: 8 → 10 (+2)'), findsOneWidget);
        expect(find.text('Satz 2: 7 → 8 (+1)'), findsOneWidget);
        expect(find.text('Gesamt: 15 → 18 Wdh.'), findsOneWidget);
        expect(find.text('Differenz: +3'), findsOneWidget);
        // Total reps without an earlier comparable workout
        expect(find.text('Noch keine Vergleichsdaten'), findsOneWidget);
      },
    );

    testWidgets('34. a failing comparison never hides the results', (
      tester,
    ) async {
      await openDetail(tester, extra: (h) => h.backend.comparisons.clear());
      expect(find.text('Satz 1: 10 von 10 Wdh.'), findsOneWidget);
      expect(find.text('Vergleich'), findsNothing);
    });

    testWidgets(
      '35-37. "Verlauf ansehen": chart with a VoiceOver summary; too few points → hint',
      (tester) async {
        final h = await openDetail(
          tester,
          extra: (h) => h.backend.exerciseProgress['e-mx1'] = {
            'exerciseId': 'e-mx1',
            'name': 'Bankdrücken',
            'executionMode': 'SETS_REPS',
            'repsMax': false,
            'kind': 'REPS',
            'points': [
              for (final (i, v) in [15, 17, 18].indexed)
                {
                  'sessionId': 'mix-$i',
                  'date': '2026-10-0${i + 1}T08:00:00.000Z',
                  'value': v,
                  'setCount': 2,
                },
            ],
          },
        );
        await tapOn(
          tester,
          find.bySemanticsLabel('Verlauf ansehen: Bankdrücken'),
        );
        expect(
          find.textContaining(
            RegExp(r'^Verlauf: Bankdrücken$', caseSensitive: false),
          ),
          findsOneWidget,
        );
        expect(
          find.bySemanticsLabel(
            '3 Trainings. Erster Wert 15, letzter Wert 18, bester Wert 18 Wiederholungen.',
          ),
          findsOneWidget,
        );
        expect(
          h.backend.requests,
          contains('GET /v1/client/workouts/progress/exercises/e-mx1'),
        );
        await tapOn(tester, find.bySemanticsLabel('Schließen'));
        // Liegestütze: no points → a hint, never a fake line
        await tapOn(
          tester,
          find.bySemanticsLabel('Verlauf ansehen: Liegestütze'),
        );
        expect(
          find.text('Noch zu wenige Daten für einen Verlauf'),
          findsOneWidget,
        );
        expect(find.byType(ProgressChart), findsOneWidget);
      },
    );

    testWidgets('Warm-up has no chart button (nothing to compare)', (
      tester,
    ) async {
      await openDetail(tester);
      expect(
        find.bySemanticsLabel('Verlauf ansehen: Armkreisen'),
        findsNothing,
      );
      expect(
        find.bySemanticsLabel('Verlauf ansehen: Bankdrücken'),
        findsOneWidget,
      );
    });

    testWidgets('38. 320 px + 200 % text: detail and chart sheet fit', (
      tester,
    ) async {
      await openDetail(
        tester,
        width: 320,
        textScale: 2,
        extra: (h) => h.backend.exerciseProgress['e-mx1'] = {
          'exerciseId': 'e-mx1',
          'name': 'Bankdrücken',
          'executionMode': 'SETS_REPS',
          'repsMax': false,
          'kind': 'REPS',
          'points': [
            for (final (i, v) in [15, 17].indexed)
              {
                'sessionId': 'mix-$i',
                'date': '2026-10-0${i + 1}T08:00:00.000Z',
                'value': v,
                'setCount': 2,
              },
          ],
        },
      );
      expect(tester.takeException(), isNull);
      final open = find.bySemanticsLabel('Verlauf ansehen: Bankdrücken');
      await tester.ensureVisible(open);
      await tapOn(tester, open);
      expect(tester.takeException(), isNull);
      expect(find.byType(ProgressChart), findsOneWidget);
    });
  });

  // ------------------------------------------------------------------------- pure helpers
  group('pure helpers', () {
    final l10n = lookupAppLocalizations(const Locale('de'));

    test('signed() formats the difference', () {
      expect(signed(3), '+3');
      expect(signed(-2), '−2');
      expect(signed(0), '±0');
    });

    test('progressSummary needs two recorded points', () {
      ExerciseProgress p(List<int> values) => ExerciseProgress.fromJson(
        JsonReader({
          'exerciseId': 'e',
          'name': null,
          'kind': 'ROUNDS',
          'points': [
            for (final (i, v) in values.indexed)
              {
                'sessionId': 's$i',
                'date': '2026-10-0${i + 1}T08:00:00.000Z',
                'value': v,
                'setCount': 1,
              },
          ],
        }),
      );
      expect(progressSummary(l10n, p([])), isNull);
      expect(progressSummary(l10n, p([3])), isNull);
      expect(
        progressSummary(l10n, p([2, 3])),
        '2 Trainings. Erster Wert 2, letzter Wert 3, bester Wert 3 Runden.',
      );
    });

    test('a comparison with unrecorded values says "nicht erfasst"', () {
      const material = DefaultMaterialLocalizations();
      final comparison = ExerciseComparison.fromJson(
        JsonReader({
          'sessionExerciseId': 'we-1',
          'exerciseId': 'e',
          'current': {
            'sessionId': 'b',
            'date': '2026-10-15T08:00:00.000Z',
            'result': result('REPS', total: 10, sets: 2, reps: [10, null]),
          },
          'previous': {
            'sessionId': 'a',
            'date': '2026-10-08T08:00:00.000Z',
            'result': result('REPS', total: 18, sets: 2, reps: [9, 9]),
          },
          'difference': -8,
          'setDifferences': [
            {'setNumber': 1, 'previous': 9, 'current': 10, 'difference': 1},
            {
              'setNumber': 2,
              'previous': 9,
              'current': null,
              'difference': null,
            },
          ],
          'configChanged': false,
        }),
      );
      final lines = comparisonLines(l10n, material, comparison);
      expect(lines, contains('Satz 2: 9 → nicht erfasst'));
      expect(lines, contains('Differenz: −8'));
    });
  });
}
