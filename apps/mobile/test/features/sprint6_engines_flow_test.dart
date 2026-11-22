import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/api/api_client.dart';
import 'package:vitruv_mobile/features/workout/countdown_panel.dart';
import 'package:vitruv_mobile/features/workout/interval_panel.dart';
import 'package:vitruv_mobile/features/workout/interval_runner.dart';
import 'package:vitruv_mobile/features/workout/timer_sync/synced_timer.dart';
import 'package:vitruv_mobile/features/workout/timer_sync/timer_sync_providers.dart';
import 'package:vitruv_mobile/features/workout/total_reps_panel.dart';
import 'package:vitruv_mobile/features/workout/workout_engine.dart';

import '../support/app_harness.dart';
import '../support/fake_backend.dart';
import '../support/fake_watch.dart';

/// Sprint 6 on the real workout screen (fake API with the Sprint 6 contract, fake clock — no real
/// waiting): Gesamt-Wiederholungsziel with automatic rest after a STORED set, the Core routine
/// 5 × 40/20 with automatic phases, persistence, watch mirror and notifications, plus the
/// regressions (Warm-up without timer, Strength manual rest, older API contract).
/// Numbers in the test names refer to the Sprint 6 test list.
void main() {
  Finder button(String label) => find.text(label).hitTestable();
  Finder ci(String text) => find.textContaining(
    RegExp('^${RegExp.escape(text)}\$', caseSensitive: false),
  );
  Finder repsInput() =>
      find.widgetWithText(TextField, 'Wiederholungen eintragen');
  Finder stat(String label, int value) =>
      find.bySemanticsLabel('$label: $value');
  final uuid = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  );

  Future<AppHarness> openDay(
    WidgetTester tester,
    String title, {
    AppHarness? harness,
    FakeWatchLink Function(AppHarness h)? watch,
    bool engines = true,
  }) async {
    final h = harness ?? AppHarness();
    h.backend
      ..program = enginesProgram()
      ..engines = engines;
    await h.pump(
      tester,
      height: 1800,
      extra: [
        if (watch != null)
          timerSyncTransportProvider.overrideWithValue(watch(h)),
      ],
    );
    await tapOn(tester, find.bySemanticsLabel('Workout öffnen: $title').first);
    await tapOn(tester, find.text('TRAINING STARTEN'));
    return h;
  }

  /// Ticks the Warm-up checklist (no timer, no rest) and continues with the next section.
  Future<void> warmup(
    WidgetTester tester,
    AppHarness h,
    List<String> items,
  ) async {
    for (final n in items) {
      await tapOn(tester, find.bySemanticsLabel('$n abhaken'));
    }
    // Warm-up never starts a timer or a notification
    expect(find.byType(CountdownPanel), findsNothing);
    expect(h.restAlerts.scheduled, isNull);
    expect(h.restAlerts.series, isEmpty);
    await tapOn(tester, ci('Training fortsetzen').hitTestable());
  }

  Future<AppHarness> klimmzuege(
    WidgetTester tester, {
    FakeWatchLink Function(AppHarness h)? watch,
  }) async {
    final h = await openDay(tester, 'Klimmzug-Ziel', watch: watch);
    await warmup(tester, h, ['Schulterkreisen', 'Armkreisen']);
    expect(find.byType(TotalRepsPanel), findsOneWidget);
    return h;
  }

  Future<void> saveSet(WidgetTester tester, int reps) async {
    await tester.enterText(repsInput(), '$reps');
    await tapOn(tester, find.text('SATZ SPEICHERN'));
  }

  Map<String, Object?> exerciseOf(AppHarness h, String name) =>
      (h.backend.current!['exercises']! as List)
          .cast<Map<String, Object?>>()
          .firstWhere((e) => e['name'] == name);

  /// Wall-clock time passes; the screen's 250 ms ticker notices it (and stores rounds).
  Future<void> passTime(WidgetTester tester, AppHarness h, Duration d) async {
    h.clock.advance(d);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
  }

  List<Map<String, Object?>> roundBodies(AppHarness h) => [
    for (final b in h.backend.mutationBodies)
      if (b.containsKey('actualDurationSeconds')) b,
  ];

  // =========================================================================================
  group('Gesamt-Wiederholungsziel (Total reps)', () {
    testWidgets('1. target / done / open and the current set are shown', (
      tester,
    ) async {
      await klimmzuege(tester);
      expect(find.text('KLIMMZÜGE'), findsOneWidget);
      expect(stat('Gesamtziel', 60), findsOneWidget);
      expect(stat('Bereits geschafft', 0), findsOneWidget);
      expect(stat('Noch offen', 60), findsOneWidget);
      expect(find.text('Aktueller Satz 1'), findsOneWidget);
      expect(repsInput(), findsOneWidget);
      expect(button('SATZ SPEICHERN'), findsOneWidget);
      // no generic "Übung abschließen" / manual rest for this engine
      expect(ci('Übung abschließen'), findsNothing);
      expect(find.textContaining('PAUSE STARTEN'), findsNothing);
    });

    testWidgets(
      '2+4. a set is stored first (client set id), THEN the rest starts by itself',
      (tester) async {
        final h = await klimmzuege(tester);
        await saveSet(tester, 20);
        final body = h.backend.setRequests.single;
        expect(body['actualReps'], 20);
        expect(body['clientSetId'], matches(uuid));
        expect(stat('Bereits geschafft', 20), findsOneWidget);
        expect(stat('Noch offen', 40), findsOneWidget);
        expect(find.text('Satz 1: 20 Wdh.'), findsOneWidget);
        expect(find.text('Aktueller Satz 2'), findsOneWidget);
        // automatic rest of the API (60 s) — no tap needed
        expect(find.byType(CountdownPanel), findsOneWidget);
        expect(find.text('01:00'), findsOneWidget);
        expect(
          h.restAlerts.scheduled!.at,
          h.clock.now().add(const Duration(seconds: 60)),
        );
        // the entry is empty for the next set
        expect(tester.widget<TextField>(repsInput()).controller!.text, isEmpty);
      },
    );

    testWidgets('3. unlimited sets until the target; no rest after the last', (
      tester,
    ) async {
      final h = await klimmzuege(tester);
      for (final reps in [10, 10, 10, 10, 10]) {
        await saveSet(tester, reps);
        expect(find.byType(CountdownPanel), findsOneWidget);
        await tapOn(tester, button('PAUSE ÜBERSPRINGEN'));
      }
      expect(find.text('Aktueller Satz 6'), findsOneWidget);
      expect(stat('Noch offen', 10), findsOneWidget);
      final alertsBefore = h.restAlerts.log
          .where((l) => l == 'schedule')
          .length;
      await saveSet(tester, 10); // reaches 60
      expect(h.backend.setRequests, hasLength(6));
      expect(exerciseOf(h, 'Klimmzüge')['status'], 'COMPLETED');
      expect(
        find.byType(CountdownPanel),
        findsNothing,
      ); // no rest after the last set
      expect(
        h.restAlerts.log.where((l) => l == 'schedule').length,
        alertsBefore,
      );
      expect(ci('Ziel erreicht'), findsWidgets);
      expect(button('SATZ SPEICHERN'), findsNothing); // no new set opens
    });

    testWidgets(
      '12. overshoot: 30 + 35 → 65 done, 0 open, completed, no rest',
      (tester) async {
        final h = await klimmzuege(tester);
        await saveSet(tester, 30);
        await tapOn(tester, button('PAUSE ÜBERSPRINGEN'));
        await saveSet(tester, 35);
        expect(stat('Bereits geschafft', 65), findsOneWidget);
        expect(stat('Noch offen', 0), findsOneWidget);
        expect(find.byType(CountdownPanel), findsNothing);
        expect(exerciseOf(h, 'Klimmzüge')['actualReps'], 65);
      },
    );

    testWidgets('5. reps are required (≥ 1); nothing is sent without them', (
      tester,
    ) async {
      final h = await klimmzuege(tester);
      await tapOn(tester, button('SATZ SPEICHERN'));
      expect(
        find.text('Bitte mindestens 1 Wiederholung eintragen.'),
        findsOneWidget,
      );
      await saveSet(tester, 0);
      expect(h.backend.setRequests, isEmpty);
      expect(find.byType(CountdownPanel), findsNothing);
    });

    testWidgets(
      '6+7. API failure: no rest, entry kept; retry uses the SAME set id → one set',
      (tester) async {
        final h = await klimmzuege(tester);
        h.backend.failSetRecords = 1;
        await saveSet(tester, 20);
        expect(
          find.byType(CountdownPanel),
          findsNothing,
        ); // no timer on failure
        expect(h.restAlerts.scheduled, isNull);
        expect(
          find.textContaining('Satz nicht gespeichert. Es läuft keine Pause.'),
          findsOneWidget,
        );
        expect(tester.widget<TextField>(repsInput()).controller!.text, '20');
        expect(stat('Bereits geschafft', 0), findsOneWidget);
        await tapOn(tester, find.text('Erneut versuchen'));
        final ids = [for (final b in h.backend.setRequests) b['clientSetId']];
        expect(ids, hasLength(2));
        expect(ids.toSet(), hasLength(1));
        expect((exerciseOf(h, 'Klimmzüge')['sets']! as List), hasLength(1));
        expect(find.byType(CountdownPanel), findsOneWidget);
      },
    );

    testWidgets(
      '8. stored but the reply was lost: the retry replays it — one set, ONE rest',
      (tester) async {
        final h = await klimmzuege(tester);
        h.backend.loseSetReplies = 1;
        await saveSet(tester, 20);
        expect(find.byType(CountdownPanel), findsNothing);
        await tapOn(tester, button('SATZ SPEICHERN')); // same reps → same id
        expect(h.backend.setRequests, hasLength(2));
        expect(
          h.backend.setRequests.first['clientSetId'],
          h.backend.setRequests.last['clientSetId'],
        );
        expect((exerciseOf(h, 'Klimmzüge')['sets']! as List), hasLength(1));
        expect(stat('Bereits geschafft', 20), findsOneWidget);
        expect(h.restAlerts.log.where((l) => l == 'schedule'), hasLength(1));
      },
    );

    testWidgets('9. changed reps after a failure are a NEW set id', (
      tester,
    ) async {
      final h = await klimmzuege(tester);
      h.backend.failSetRecords = 1;
      await saveSet(tester, 20);
      await saveSet(tester, 18);
      final ids = [for (final b in h.backend.setRequests) b['clientSetId']];
      expect(ids.toSet(), hasLength(2));
      expect(stat('Bereits geschafft', 18), findsOneWidget);
    });

    testWidgets('10. a double tap sends one set', (tester) async {
      final h = await klimmzuege(tester);
      await tester.enterText(repsInput(), '12');
      await tester.ensureVisible(button('SATZ SPEICHERN'));
      await tester.pumpAndSettle();
      await tester.tap(button('SATZ SPEICHERN'));
      await tester.tap(button('SATZ SPEICHERN'), warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(h.backend.setRequests, hasLength(1));
    });

    testWidgets(
      '11. app restart keeps the stored sets (read back from the API)',
      (tester) async {
        final h = await klimmzuege(tester);
        await saveSet(tester, 25);
        await tapOn(tester, button('PAUSE ÜBERSPRINGEN'));
        await tester.pumpWidget(const SizedBox());
        await tester.pumpWidget(h.app());
        await tester.pumpAndSettle();
        await tapOn(tester, button('TRAINING FORTSETZEN'));
        expect(find.text('Satz 1: 25 Wdh.'), findsOneWidget);
        expect(stat('Noch offen', 35), findsOneWidget);
        expect(find.text('Aktueller Satz 2'), findsOneWidget);
      },
    );

    testWidgets('small screen + large text: no overflow with sets and rest', (
      tester,
    ) async {
      final h = AppHarness();
      h.backend
        ..program = enginesProgram()
        ..engines = true;
      await h.pump(tester, width: 320, height: 1600, textScale: 2);
      await tapOn(
        tester,
        find.bySemanticsLabel('Workout öffnen: Klimmzug-Ziel').first,
      );
      await tapOn(tester, find.text('TRAINING STARTEN'));
      await warmup(tester, h, ['Schulterkreisen', 'Armkreisen']);
      await saveSet(tester, 20);
      expect(find.byType(CountdownPanel), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('history lists every set and the total', (tester) async {
      final h = await klimmzuege(tester);
      await saveSet(tester, 30);
      await tapOn(tester, button('PAUSE ÜBERSPRINGEN'));
      await saveSet(tester, 35);
      await tapOn(tester, button('TRAINING ABSCHLIEßEN'));
      await tapOn(tester, button('ZUR ÜBERSICHT'));
      await tapOn(tester, find.byIcon(Icons.insights_outlined));
      await tapOn(tester, find.textContaining('· Klimmzug-Ziel'));
      expect(find.text('Satz 1: 30 Wdh.'), findsOneWidget);
      expect(find.text('Satz 2: 35 Wdh.'), findsOneWidget);
      // Sprint 7 detail format (was 'Gesamt: 65 von 60 Wdh.'): goal, done, sets needed
      expect(find.text('Gesamtziel: 60 Wdh.'), findsOneWidget);
      expect(find.text('Geschafft: 65 Wdh.'), findsOneWidget);
      expect(find.text('Benötigte Sätze: 2'), findsOneWidget);
      expect(h.backend.finishedSessions, hasLength(1));
    });
  });

  // =========================================================================================
  group('Core-Routine 5 × 40/20', () {
    Future<AppHarness> core(
      WidgetTester tester, {
      FakeWatchLink Function(AppHarness h)? watch,
    }) async {
      final h = await openDay(tester, 'Core-Tag', watch: watch);
      await warmup(tester, h, ['Hüftmobilisation', 'Katze-Kuh']);
      expect(find.byType(IntervalPanel), findsOneWidget);
      return h;
    }

    testWidgets('13+14. values from the API; start = WORK round 1, 00:40', (
      tester,
    ) async {
      final h = await core(tester);
      final timer = exerciseOf(h, 'Core-Routine')['timer']! as Map;
      expect(timer['interval'], {
        'rounds': 5,
        'workSeconds': 40,
        'restSeconds': 20,
      });
      expect(find.text('0 von 5 Runden gespeichert'), findsOneWidget);
      await tapOn(tester, button('CORE STARTEN'));
      expect(find.text('Runde 1 von 5'), findsOneWidget);
      expect(find.text('TRAINING'), findsWidgets);
      expect(find.text('00:40'), findsOneWidget);
      expect(
        find.bySemanticsLabel('TRAINING, Runde 1 von 5, noch 00:40'),
        findsOneWidget,
      );
    });

    testWidgets(
      '15+16+18. phases change by themselves; round saved after WORK; PAUSE shows the next round',
      (tester) async {
        final h = await core(tester);
        await tapOn(tester, button('CORE STARTEN'));
        await passTime(tester, h, const Duration(seconds: 39));
        expect(find.text('00:01'), findsOneWidget);
        expect(roundBodies(h), isEmpty);
        await passTime(tester, h, const Duration(seconds: 1));
        expect(find.text('PAUSE'), findsWidgets);
        expect(find.text('00:20'), findsOneWidget);
        expect(find.text('Nächste Runde: Runde 2 von 5'), findsOneWidget);
        expect(roundBodies(h), [
          {'completed': true, 'actualDurationSeconds': 40},
        ]);
        expect(find.text('1 von 5 Runden gespeichert'), findsOneWidget);
        await passTime(tester, h, const Duration(seconds: 20));
        expect(find.text('Runde 2 von 5'), findsOneWidget);
        expect(find.text('00:40'), findsOneWidget);
        expect(roundBodies(h), hasLength(1)); // the rest end stores nothing
      },
    );

    testWidgets(
      '17+19+20. 280 s in total, no rest after round 5, exercise completed',
      (tester) async {
        final h = await core(tester);
        await tapOn(tester, button('CORE STARTEN'));
        for (var s = 0; s < 260; s += 20) {
          await passTime(tester, h, const Duration(seconds: 20));
        }
        // 260 s: inside round 5 (WORK 240–280) — the last phase
        expect(find.text('Runde 5 von 5'), findsOneWidget);
        expect(find.text('00:20'), findsOneWidget);
        expect(roundBodies(h), hasLength(4));
        await passTime(tester, h, const Duration(seconds: 20));
        expect(roundBodies(h), hasLength(5));
        expect(exerciseOf(h, 'Core-Routine')['status'], 'COMPLETED');
        expect(find.text('PAUSE'), findsNothing);
        expect(find.text('Training abgeschlossen'), findsWidgets);
        // nothing runs afterwards
        await passTime(tester, h, const Duration(minutes: 2));
        expect(roundBodies(h), hasLength(5));
      },
    );

    testWidgets('21. pause freezes, resume continues', (tester) async {
      final h = await core(tester);
      await tapOn(tester, button('CORE STARTEN'));
      await passTime(tester, h, const Duration(seconds: 10));
      await tapOn(tester, button('ANHALTEN'));
      expect(ci('Angehalten'), findsWidgets);
      expect(
        h.restAlerts.series,
        isEmpty,
      ); // no phase-change notifications while paused
      await passTime(tester, h, const Duration(minutes: 3));
      expect(find.text('00:30'), findsOneWidget);
      expect(roundBodies(h), isEmpty);
      await tapOn(tester, button('FORTSETZEN'));
      expect(h.restAlerts.series, hasLength(9));
      await passTime(tester, h, const Duration(seconds: 30));
      expect(roundBodies(h), hasLength(1));
    });

    testWidgets(
      '25. background 130 s: resume lands on the wall clock, rounds stored once',
      (tester) async {
        final h = await core(tester);
        await tapOn(tester, button('CORE STARTEN'));
        for (final s in [
          AppLifecycleState.inactive,
          AppLifecycleState.hidden,
          AppLifecycleState.paused,
        ]) {
          tester.binding.handleAppLifecycleStateChanged(s);
        }
        h.clock.advance(
          const Duration(seconds: 130),
        ); // Dart suspended: no ticks
        for (final s in [
          AppLifecycleState.hidden,
          AppLifecycleState.inactive,
          AppLifecycleState.resumed,
        ]) {
          tester.binding.handleAppLifecycleStateChanged(s);
        }
        await tester.pumpAndSettle();
        expect(find.text('Runde 3 von 5'), findsOneWidget);
        expect(find.text('00:30'), findsOneWidget);
        expect(roundBodies(h), hasLength(2));
        await passTime(tester, h, const Duration(seconds: 1));
        expect(roundBodies(h), hasLength(2)); // no second report
      },
    );

    testWidgets(
      '22+23. a failed round is never shown as saved; retry stores it',
      (tester) async {
        final h = await core(tester);
        await tapOn(tester, button('CORE STARTEN'));
        h.backend.failMutations = 1;
        await passTime(tester, h, const Duration(seconds: 40));
        expect(find.text('0 von 5 Runden gespeichert'), findsOneWidget);
        expect(
          find.text('1 Runde ist noch nicht gespeichert.'),
          findsOneWidget,
        );
        await tapOn(tester, button('RUNDEN SPEICHERN'));
        expect(find.text('1 von 5 Runden gespeichert'), findsOneWidget);
        expect(find.text('1 Runde ist noch nicht gespeichert.'), findsNothing);
        // the server kept one record of round 1
        final sets = (exerciseOf(h, 'Core-Routine')['sets']! as List)
            .cast<Map<String, Object?>>();
        expect(
          [for (final s in sets) s['completed']],
          [true, false, false, false, false],
        );
      },
    );

    testWidgets(
      '24. cancel keeps stored rounds; restart from the next open round',
      (tester) async {
        final h = await core(tester);
        await tapOn(tester, button('CORE STARTEN'));
        await passTime(tester, h, const Duration(seconds: 45));
        await tapOn(tester, button('ABBRECHEN'));
        expect(h.restAlerts.series, isEmpty);
        expect(h.intervalStore.saved, isNull);
        expect(find.text('1 von 5 Runden gespeichert'), findsOneWidget);
        await tapOn(tester, button('AB RUNDE 2 STARTEN'));
        expect(find.text('Runde 2 von 5'), findsOneWidget);
        expect(find.text('00:40'), findsOneWidget);
      },
    );

    testWidgets(
      '26. app kill: restored from absolute times, missed rounds stored once',
      (tester) async {
        final h = await core(tester);
        await tapOn(tester, button('CORE STARTEN'));
        await passTime(
          tester,
          h,
          const Duration(seconds: 45),
        ); // round 1 stored, REST
        final saved = h.intervalStore.saved!;
        expect(saved.index, 1);
        // kill (pumping SizedBox disposes the screen; a kill would not → put the state back)
        await tester.pumpWidget(const SizedBox());
        h.intervalStore.saved = saved;
        h.clock.advance(const Duration(seconds: 80)); // 125 s after the start
        await tester.pumpWidget(h.app());
        await tester.pumpAndSettle();
        await tapOn(tester, button('TRAINING FORTSETZEN'));
        expect(find.text('Runde 3 von 5'), findsOneWidget);
        expect(find.text('00:35'), findsOneWidget);
        expect(roundBodies(h), [
          {'completed': true, 'actualDurationSeconds': 40},
          {'completed': true, 'actualDurationSeconds': 40},
        ]);
      },
    );

    testWidgets('a saved routine of another session is not restored (stale)', (
      tester,
    ) async {
      final h = AppHarness();
      h.backend
        ..program = enginesProgram()
        ..engines = true
        ..startSession('d-core');
      h.intervalStore.saved = SavedInterval(
        sessionId: 'other-session',
        exerciseId: 'we-3',
        config: const IntervalConfig(
          rounds: 5,
          workSeconds: 40,
          restSeconds: 20,
        ),
        index: 0,
        startedAtMs: h.clock.now().millisecondsSinceEpoch,
        endsAtMs: h.clock
            .now()
            .add(const Duration(seconds: 40))
            .millisecondsSinceEpoch,
      );
      await h.pump(tester, height: 1800);
      await tapOn(tester, button('TRAINING FORTSETZEN'));
      expect(h.intervalStore.saved, isNull);
      expect(h.backend.mutationBodies, isEmpty);
    });

    testWidgets(
      'notifications: rest, work and done at the absolute phase ends',
      (tester) async {
        final h = await core(tester);
        await tapOn(tester, button('CORE STARTEN'));
        final t0 = h.clock.now();
        final series = h.restAlerts.series;
        expect(series, hasLength(9));
        expect(series.first.at, t0.add(const Duration(seconds: 40)));
        expect(series.first.title, 'Pause');
        expect(series.first.body, 'Runde 1 geschafft – kurz durchatmen.');
        expect(series[1].title, 'Training');
        expect(series[1].body, 'Runde 2 von 5 startet.');
        expect(series.last.at, t0.add(const Duration(seconds: 280)));
        expect(series.last.title, 'Training abgeschlossen');
        expect(series.last.body, 'Core-Routine ist geschafft.');
        // leaving the workout cancels the pending phase notifications
        await tapOn(tester, find.byTooltip('Zurück'));
        expect(h.restAlerts.series, isEmpty);
      },
    );

    testWidgets('small screen + large text: no overflow while running', (
      tester,
    ) async {
      final h = AppHarness();
      h.backend
        ..program = enginesProgram()
        ..engines = true;
      await h.pump(tester, width: 320, height: 1400, textScale: 2);
      await tapOn(
        tester,
        find.bySemanticsLabel('Workout öffnen: Core-Tag').first,
      );
      await tapOn(tester, find.text('TRAINING STARTEN'));
      await tapOn(tester, find.bySemanticsLabel('Hüftmobilisation abhaken'));
      await tapOn(tester, find.bySemanticsLabel('Katze-Kuh abhaken'));
      await tapOn(tester, ci('Training fortsetzen').hitTestable());
      await tapOn(tester, button('CORE STARTEN'));
      await passTime(tester, h, const Duration(seconds: 40));
      expect(tester.takeException(), isNull);
      expect(find.text('Nächste Runde: Runde 2 von 5'), findsOneWidget);
    });
  });

  // =========================================================================================
  group('Watch mirror (fake bridge — no Apple hardware)', () {
    FakeWatchLink Function(AppHarness h) link(List<FakeWatchLink> out) => (h) {
      final w = FakeWatchLink(
        watchNowMs: () => h.clock.now().millisecondsSinceEpoch,
      );
      out.add(w);
      return w;
    };

    testWidgets('35. Total reps rest is sent only after the stored set', (
      tester,
    ) async {
      final watches = <FakeWatchLink>[];
      final h = await klimmzuege(tester, watch: link(watches));
      final watch = watches.single;
      h.backend.failSetRecords = 1;
      await saveSet(tester, 20);
      expect(watch.watchState, isNull); // nothing stored → nothing on the watch
      await tapOn(tester, find.text('Erneut versuchen'));
      final state = watch.watchState!;
      expect(state.kind, SyncedTimerKind.totalRepsRest);
      expect(state.phase, SyncedTimerPhase.rest);
      expect(state.durationMs, 60000);
      expect(state.exerciseName, 'Klimmzüge');
    });

    testWidgets(
      '36. Core phases appear on the watch; only state changes are sent',
      (tester) async {
        final watches = <FakeWatchLink>[];
        final h = await openDay(tester, 'Core-Tag', watch: link(watches));
        await warmup(tester, h, ['Hüftmobilisation', 'Katze-Kuh']);
        final watch = watches.single;
        await tapOn(tester, button('CORE STARTEN'));
        expect(watch.watchState!.kind, SyncedTimerKind.interval);
        expect(watch.watchState!.phase, SyncedTimerPhase.work);
        expect(watch.watchRemainingMs(), 40000);
        final sent = watch.published.length;
        await passTime(
          tester,
          h,
          const Duration(seconds: 20),
        ); // no change → nothing sent
        expect(watch.published, hasLength(sent));
        await passTime(tester, h, const Duration(seconds: 20)); // → REST
        expect(watch.watchState!.phase, SyncedTimerPhase.rest);
        expect(watch.watchState!.durationMs, 20000);
        expect(watch.published.length, greaterThan(sent));
      },
    );

    testWidgets(
      '37. a stale command of an earlier phase is ignored; a current one cancels',
      (tester) async {
        final watches = <FakeWatchLink>[];
        final h = await openDay(tester, 'Core-Tag', watch: link(watches));
        await warmup(tester, h, ['Hüftmobilisation', 'Katze-Kuh']);
        final watch = watches.single;
        await tapOn(tester, button('CORE STARTEN'));
        final workState = watch.watchState!;
        await passTime(tester, h, const Duration(seconds: 40)); // REST now
        watch.sendFromWatch(
          TimerSyncMessage.command(
            TimerCommand(
              TimerCommandType.cancel,
              timerId: workState.timerId,
              revision: workState.revision,
            ),
            sentAtMs: h.clock.now().millisecondsSinceEpoch,
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('PAUSE'), findsWidgets); // still running
        watch.watchCancel(); // the phase the watch shows now
        await tester.pumpAndSettle();
        expect(button('AB RUNDE 2 STARTEN'), findsOneWidget);
        expect(watch.watchState!.status, SyncedTimerStatus.cancelled);
      },
    );

    testWidgets(
      '34. without a watch (flag off) everything runs on the iPhone',
      (tester) async {
        final h = await openDay(tester, 'Core-Tag');
        await warmup(tester, h, ['Hüftmobilisation', 'Katze-Kuh']);
        await tapOn(tester, button('CORE STARTEN'));
        await passTime(tester, h, const Duration(seconds: 40));
        expect(roundBodies(h), hasLength(1));
        expect(tester.takeException(), isNull);
      },
    );
  });

  // =========================================================================================
  group('Regressions + composition', () {
    testWidgets(
      '27+28+39. Warm-up → Strength (manual rest) → Total reps → Core, in coach order',
      (tester) async {
        final h = await openDay(tester, 'Ganzkörper Mix');
        await warmup(tester, h, ['Armkreisen', 'Katze-Kuh']);
        // Strength: completing a set never starts the rest; "Pause starten" does
        expect(find.text('BANKDRÜCKEN'), findsOneWidget);
        await tapOn(
          tester,
          find.bySemanticsLabel(RegExp(r'^Satz 1, .*Satz 1 abschließen')),
        );
        expect(find.byType(CountdownPanel), findsNothing);
        await tapOn(tester, find.text('PAUSE STARTEN · 01:30'));
        expect(find.byType(CountdownPanel), findsOneWidget);
        await tapOn(tester, button('PAUSE ÜBERSPRINGEN'));
        await tapOn(
          tester,
          find.bySemanticsLabel(RegExp(r'^Satz 2, .*Satz 2 abschließen')),
        );
        // Total reps 20 (auto rest 45 s)
        expect(find.text('LIEGESTÜTZE'), findsOneWidget);
        await saveSet(tester, 12);
        expect(find.text('00:45'), findsOneWidget);
        await tapOn(tester, button('PAUSE ÜBERSPRINGEN'));
        await saveSet(tester, 8);
        expect(find.byType(CountdownPanel), findsNothing);
        // Core 3 × 30/15 from the coach's values
        await tapOn(tester, ci('Nächste Übung').hitTestable());
        expect(find.byType(IntervalPanel), findsOneWidget);
        await tapOn(tester, button('CORE STARTEN'));
        expect(find.text('Runde 1 von 3'), findsOneWidget);
        expect(find.text('00:30'), findsOneWidget);
        final modes = [
          for (final e
              in (h.backend.current!['exercises']! as List)
                  .cast<Map<String, Object?>>())
            (e['timer']! as Map)['mode'],
        ];
        expect(modes, ['NONE', 'NONE', 'AUTO_REST', 'AUTO_REST', 'INTERVAL']);
      },
    );

    testWidgets(
      '40. older API (no totalReps/timer): the single-field flow stays',
      (tester) async {
        final h = await openDay(tester, 'Klimmzug-Ziel', engines: false);
        await warmup(tester, h, ['Schulterkreisen', 'Armkreisen']);
        expect(find.byType(TotalRepsPanel), findsNothing);
        expect(ci('Übung abschließen'), findsWidgets);
        expect(h.backend.setRequests, isEmpty);
      },
    );

    testWidgets(
      '40. older API: INTERVAL without round rows keeps the generic controls',
      (tester) async {
        final h = await openDay(tester, 'Core-Tag', engines: false);
        await warmup(tester, h, ['Hüftmobilisation', 'Katze-Kuh']);
        expect(find.byType(IntervalPanel), findsNothing);
        expect(ci('Übung abschließen'), findsWidgets);
      },
    );

    test('the capability level stays 2 (the header is informational only)', () {
      expect(kTrainingCapabilityLevel, 2);
    });
  });
}
