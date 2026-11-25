import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/features/workout/countdown_panel.dart';
import 'package:vitruv_mobile/features/workout/rest_timer_store.dart';

import '../support/app_harness.dart';
import '../support/fake_backend.dart';

/// Sprint 5: Oberkörper / Unterkörper Strength — actual reps per set (FIXED and MAX), the rest
/// timer started only by "Pause starten", end-of-rest notification, restore after an app restart
/// and the history with the recorded reps. Fake API, fictional plan.
void main() {
  Finder button(String label) => find.text(label).hitTestable();
  Finder setDone(int n) =>
      find.bySemanticsLabel(RegExp('^Satz $n, .*Satz $n abschließen'));
  Finder repsField(int n) =>
      find.widgetWithText(TextField, 'Wiederholungen in Satz $n');

  Future<AppHarness> startDay(
    WidgetTester tester,
    String title, {
    AppHarness? harness,
  }) async {
    final h = harness ?? AppHarness();
    h.backend.program ??= strengthProgram();
    if (harness == null) h.backend.program = strengthProgram();
    await h.pump(tester, height: 1600);
    await tapOn(tester, find.bySemanticsLabel('Workout öffnen: $title').first);
    await tapOn(tester, find.text('TRAINING STARTEN'));
    return h;
  }

  Map<String, Object?> lastBody(AppHarness h) => h.backend.mutationBodies.last;

  group('Oberkörper: FIXED reps per set', () {
    testWidgets(
      'each set stores the reps actually done; prefilled with the target',
      (tester) async {
        final h = await startDay(tester, 'Oberkörper');
        expect(find.text('BANKDRÜCKEN'), findsOneWidget);
        expect(find.text('3 × 10'), findsWidgets);
        // prefilled with the target, corrected with − / typing
        expect(find.widgetWithText(TextField, '10'), findsOneWidget);
        await tapOn(tester, find.byTooltip('Eine Wiederholung weniger'));
        await tapOn(tester, setDone(1));
        expect(lastBody(h), {'completed': true, 'actualReps': 9});

        await tester.enterText(repsField(2), '11');
        await tapOn(tester, setDone(2));
        expect(lastBody(h), {'completed': true, 'actualReps': 11});

        // the server keeps every set separately
        final sets =
            ((h.backend.current!['exercises']! as List).first as Map)['sets']
                as List;
        expect(sets.map((s) => (s as Map)['actualReps']), [9, 11, null]);
        expect(find.text('9 Wdh. geschafft'), findsOneWidget);
        expect(find.text('11 Wdh. geschafft'), findsOneWidget);
      },
    );

    testWidgets('a later set waits for the open one (no skipping ahead)', (
      tester,
    ) async {
      await startDay(tester, 'Oberkörper');
      expect(setDone(1), findsOneWidget);
      expect(setDone(2), findsNothing);
      expect(find.bySemanticsLabel(RegExp('^Satz 2, 10 Wdh\\.\$')), findsOne);
    });
  });

  group('MAX', () {
    testWidgets('MAX target is shown, starts empty and requires the reps', (
      tester,
    ) async {
      final h = await startDay(tester, 'Oberkörper');
      for (final n in [1, 2, 3]) {
        await tapOn(tester, setDone(n)); // Bankdrücken with the target
      }
      expect(find.text('KLIMMZÜGE'), findsOneWidget); // advanced
      expect(find.text('3 × MAX'), findsWidgets);
      expect(
        find.bySemanticsLabel(RegExp('^Satz 1, MAX, Satz 1 abschließen')),
        findsOne,
      );
      final before = h.backend.mutationBodies.length;
      await tapOn(tester, setDone(1));
      expect(
        find.text('Bitte trage deine Wiederholungen ein.'),
        findsOneWidget,
      );
      expect(h.backend.mutationBodies.length, before); // nothing saved
      await tester.enterText(repsField(1), '17');
      await tapOn(tester, setDone(1));
      expect(lastBody(h), {'completed': true, 'actualReps': 17});
      expect(find.text('17 Wdh. geschafft'), findsOneWidget);
    });
  });

  group('rest timer (manual)', () {
    testWidgets(
      'completing a set never starts the rest; "Pause starten" does',
      (tester) async {
        final h = await startDay(tester, 'Oberkörper');
        await tapOn(tester, setDone(1));
        expect(find.byType(CountdownPanel), findsNothing);
        expect(h.restAlerts.scheduled, isNull);
        await tapOn(tester, find.text('PAUSE STARTEN · 01:30'));
        expect(find.byType(CountdownPanel), findsOneWidget);
        expect(find.text('01:30'), findsOneWidget);
        // the end-of-rest notification is scheduled for the absolute end time
        final alert = h.restAlerts.scheduled!;
        expect(alert.at, h.clock.now().add(const Duration(seconds: 90)));
        expect(alert.title, 'Pause vorbei');
        expect(alert.body, 'Weiter mit Bankdrücken.');
      },
    );

    testWidgets('background → foreground: the remaining time is correct', (
      tester,
    ) async {
      final h = await startDay(tester, 'Oberkörper');
      await tapOn(tester, setDone(1));
      await tapOn(tester, find.text('PAUSE STARTEN · 01:30'));
      for (final state in [
        AppLifecycleState.inactive,
        AppLifecycleState.hidden,
        AppLifecycleState.paused,
      ]) {
        tester.binding.handleAppLifecycleStateChanged(state);
      }
      h.clock.advance(
        const Duration(seconds: 50),
      ); // nothing runs in the background
      for (final state in [
        AppLifecycleState.hidden,
        AppLifecycleState.inactive,
        AppLifecycleState.resumed,
      ]) {
        tester.binding.handleAppLifecycleStateChanged(state);
      }
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('00:40'), findsOneWidget);
    });

    testWidgets(
      'end of rest: visual signal; the notification is not withdrawn',
      (tester) async {
        final h = await startDay(tester, 'Oberkörper');
        await tapOn(tester, setDone(1));
        await tapOn(tester, find.text('PAUSE STARTEN · 01:30'));
        h.clock.advance(const Duration(seconds: 91));
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.text('Pause beendet'), findsWidgets);
        expect(h.restAlerts.log, ['schedule']); // fires as the (sound) signal
      },
    );

    testWidgets(
      '"+30 Sek." reschedules, pause and skip cancel the notification',
      (tester) async {
        final h = await startDay(tester, 'Oberkörper');
        await tapOn(tester, setDone(1));
        await tapOn(tester, find.text('PAUSE STARTEN · 01:30'));
        final first = h.restAlerts.scheduled!.at;
        await tapOn(
          tester,
          find.bySemanticsLabel('30 Sekunden Pause hinzufügen'),
        );
        expect(
          h.restAlerts.scheduled!.at,
          first.add(const Duration(seconds: 30)),
        );
        await tapOn(tester, button('ANHALTEN'));
        expect(h.restAlerts.scheduled, isNull);
        await tapOn(tester, button('PAUSE ÜBERSPRINGEN'));
        expect(h.restAlerts.log.last, 'cancel');
        expect(find.byType(CountdownPanel), findsNothing);
      },
    );

    testWidgets(
      'app killed during the rest → restored from the saved end time',
      (tester) async {
        final h = await startDay(tester, 'Oberkörper');
        await tapOn(tester, setDone(1));
        await tapOn(tester, find.text('PAUSE STARTEN · 01:30'));
        expect(h.restStore.saved!.endsAtMs, isNotNull);
        // cold start (no dispose of the old screen — like a kill), 30 s later
        h.clock.advance(const Duration(seconds: 30));
        await tester.pumpWidget(const SizedBox());
        // pumping SizedBox disposed the screen; a kill would not — restore the saved rest
        h.restStore.saved = SavedRest(
          sessionId: h.backend.current!['id']! as String,
          exerciseId: 'we-1',
          startedAtMs: h.clock
              .now()
              .subtract(const Duration(seconds: 30))
              .millisecondsSinceEpoch,
          totalMs: 90000,
          endsAtMs: h.clock
              .now()
              .add(const Duration(seconds: 60))
              .millisecondsSinceEpoch,
        );
        await tester.pumpWidget(h.app());
        await tester.pumpAndSettle();
        await tapOn(tester, button('TRAINING FORTSETZEN'));
        expect(find.byType(CountdownPanel), findsOneWidget);
        expect(find.text('01:00'), findsOneWidget);
      },
    );

    testWidgets('a rest of another session or one long over is not restored', (
      tester,
    ) async {
      final h = AppHarness();
      h.backend.program = strengthProgram();
      h.backend.startSession('d-uk');
      h.restStore.saved = SavedRest(
        sessionId: 'other-session',
        exerciseId: 'x',
        startedAtMs: 0,
        totalMs: 90000,
        endsAtMs: h.clock
            .now()
            .add(const Duration(minutes: 1))
            .millisecondsSinceEpoch,
      );
      await h.pump(tester, height: 1600);
      await tapOn(tester, button('TRAINING FORTSETZEN'));
      expect(find.byType(CountdownPanel), findsNothing);
      expect(h.restStore.saved, isNull); // stale entry removed
    });

    testWidgets('leaving the workout discards the rest and its notification', (
      tester,
    ) async {
      final h = await startDay(tester, 'Oberkörper');
      await tapOn(tester, setDone(1));
      await tapOn(tester, find.text('PAUSE STARTEN · 01:30'));
      await tapOn(tester, find.byType(BackButton));
      expect(h.restAlerts.log.last, 'cancel');
      expect(h.restStore.saved, isNull);
    });
  });

  group('Unterkörper → history', () {
    testWidgets('all sets recorded, completed, history shows the real reps', (
      tester,
    ) async {
      final h = await startDay(tester, 'Unterkörper');
      // Kniebeugen 4 × 8: set 2 with 7 reps
      for (final n in [1, 2, 3, 4]) {
        if (n == 2) await tester.enterText(repsField(2), '7');
        await tapOn(tester, setDone(n));
      }
      // Ausfallschritte 3 × 12
      expect(find.text('AUSFALLSCHRITTE'), findsOneWidget);
      for (final n in [1, 2, 3]) {
        await tapOn(tester, setDone(n));
      }
      expect(
        h.backend.mutationBodies.where((b) => b['actualReps'] != null),
        hasLength(7),
      );
      await tapOn(tester, button('TRAINING ABSCHLIEßEN'));
      expect(find.text('TRAINING ABGESCHLOSSEN'), findsOneWidget);

      await tapOn(tester, button('ZUR ÜBERSICHT'));
      await tapOn(tester, find.byIcon(Icons.insights_outlined));
      await tapOn(tester, find.textContaining('· Unterkörper'));
      expect(find.text('Satz 1: 8 von 8 Wdh.'), findsOneWidget);
      expect(find.text('Satz 2: 7 von 8 Wdh.'), findsOneWidget);
      expect(find.text('Satz 3: 12 von 12 Wdh.'), findsOneWidget);
      expect(
        h.backend.requests,
        contains(startsWith('GET /v1/client/workouts/session-')),
      );
    });

    testWidgets('history shows MAX results and open sets', (tester) async {
      final h = await startDay(tester, 'Oberkörper');
      for (final n in [1, 2, 3]) {
        await tapOn(tester, setDone(n));
      }
      await tester.enterText(repsField(1), '17');
      await tapOn(tester, setDone(1));
      await tapOn(tester, find.byTooltip('Weitere Aktionen'));
      await tapOn(tester, find.text('Training abschließen'));
      await tapOn(
        tester,
        find.widgetWithText(FilledButton, 'Training abschließen'),
      );
      await tapOn(tester, button('ZUR ÜBERSICHT'));
      await tapOn(tester, find.byIcon(Icons.insights_outlined));
      await tapOn(tester, find.textContaining('Tag 1 · Oberkörper'));
      expect(find.text('Satz 1: 17 Wdh. (MAX)'), findsOneWidget);
      expect(find.text('Satz 2: nicht erledigt'), findsOneWidget);
      expect(find.text('Satz 1: 10 von 10 Wdh.'), findsOneWidget);
      expect(h.backend.finishedSessions, hasLength(1));
    });
  });

  group('completed day', () {
    testWidgets(
      'the server refuses a second start; the app explains and refreshes',
      (tester) async {
        final h = AppHarness();
        h.backend
          ..program = strengthProgram()
          ..completedDayIds.add('d-uk');
        // stale plan on the phone: still shows the day as not started
        final days =
            (((h.backend.program!['weeks']! as List).first as Map)['days']!
                    as List)
                .cast<Map<String, Object?>>();
        days.firstWhere((d) => d['id'] == 'd-uk')['workoutStatus'] =
            'NOT_STARTED';
        await h.pump(tester, height: 1600);
        await tapOn(
          tester,
          find.bySemanticsLabel('Workout öffnen: Unterkörper').first,
        );
        final reads = h.backend.requests
            .where((r) => r == 'GET /v1/client/training/active')
            .length;
        await tapOn(tester, find.text('TRAINING STARTEN'));
        expect(
          find.text('Dieses Training hast du bereits abgeschlossen.'),
          findsOneWidget,
        );
        expect(h.backend.current, isNull);
        expect(
          h.backend.requests
              .where((r) => r == 'GET /v1/client/training/active')
              .length,
          greaterThan(reads),
        );
      },
    );
  });
}
