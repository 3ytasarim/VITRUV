import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/features/workout/countdown_panel.dart';

import '../support/app_harness.dart';

void main() {
  Future<AppHarness> startDayOne(
    WidgetTester tester, {
    double height = 1400,
  }) async {
    final h = AppHarness();
    await h.pump(tester, height: height);
    await tapOn(tester, find.byIcon(Icons.fitness_center_outlined));
    await tapOn(tester, find.text('Tag 1 · Oberkörper A'));
    await tapOn(tester, find.text('TRAINING STARTEN'));
    return h;
  }

  Finder button(String label) => find.text(label).hitTestable();

  testWidgets('start → live workout with position, target, rest and section', (
    tester,
  ) async {
    final h = await startDayOne(tester);
    expect(h.backend.requests, contains('POST /v1/client/workouts'));
    expect(find.text('Oberkörper A'), findsOneWidget); // app bar
    expect(find.text('1 / 4'), findsOneWidget);
    expect(find.text('SEILSPRINGEN'), findsOneWidget);
    expect(find.text('45 Sek.'), findsOneWidget);
    expect(find.text('Pause 00:30'), findsOneWidget);
    expect(find.text('WARM-UP'), findsOneWidget);
    expect(find.bySemanticsLabel('Übung 1 von 4'), findsOneWidget);
  });

  testWidgets('all four execution modes, rest timer, completion summary', (
    tester,
  ) async {
    final h = await startDayOne(tester);

    // DURATION: optional work timer, then "Übung abschließen" (records the duration)
    await tapOn(tester, button('TIMER STARTEN'));
    expect(find.byType(CountdownPanel), findsOneWidget);
    h.clock.advance(const Duration(seconds: 45));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Zeit erreicht'), findsOneWidget);
    await tapOn(tester, button('ÜBUNG ABSCHLIEßEN'));
    expect(h.backend.mutationBodies.last, {
      'status': 'COMPLETED',
      'actualDurationSeconds': 45,
    });
    // advanced to the next exercise, rest (30 s) running
    expect(find.text('2 / 4'), findsOneWidget);
    expect(find.text('KLIMMZÜGE'), findsOneWidget);
    expect(find.text('00:30'), findsOneWidget);

    // SETS_REPS: tick each set; the exercise completes with the last set
    for (final n in [1, 2, 3, 4]) {
      await tapOn(
        tester,
        find.bySemanticsLabel(
          RegExp('^Satz $n, 12 Wdh\\., Satz $n abschließen'),
        ),
      );
    }
    expect(h.backend.requests.where((r) => r.contains('/sets/')), hasLength(4));
    expect(find.text('3 / 4'), findsOneWidget);
    expect(find.text('LIEGESTÜTZE'), findsOneWidget);
    expect(
      find.text('01:00'),
      findsOneWidget,
      reason: 'rest of the sets exercise',
    );

    // TOTAL_REPS: prefilled with the target, corrected by the client
    expect(find.widgetWithText(TextField, '70'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '65');
    await tapOn(tester, button('ÜBUNG ABSCHLIEßEN'));
    expect(h.backend.mutationBodies.last, {
      'status': 'COMPLETED',
      'actualReps': 65,
    });

    // CUSTOM (AMRAP): mark done without numbers
    expect(find.text('4 / 4'), findsOneWidget);
    expect(find.text('AMRAP'), findsOneWidget);
    await tapOn(tester, button('ÜBUNG ABSCHLIEßEN'));
    expect(h.backend.mutationBodies.last, {'status': 'COMPLETED'});

    // finish → restrained summary
    await tapOn(tester, button('TRAINING ABSCHLIEßEN'));
    expect(
      h.backend.requests.last,
      startsWith('POST /v1/client/workouts/session-1/complete'),
    );
    expect(find.text('TRAINING ABGESCHLOSSEN'), findsOneWidget);
    expect(find.text('4 von 4 Übungen'), findsOneWidget);
    expect(find.text('Dauer 48 Min.'), findsOneWidget);
    await tapOn(tester, button('ZUR ÜBERSICHT'));
    expect(find.text('HALLO ERIKA'), findsOneWidget);
    expect(find.text('TRAINING FORTSETZEN'), findsNothing);
  });

  testWidgets('previous / next buttons navigate without recording anything', (
    tester,
  ) async {
    final h = await startDayOne(tester);
    final before = h.backend.mutationBodies.length;
    await tapOn(tester, button('NÄCHSTE ÜBUNG'));
    expect(find.text('2 / 4'), findsOneWidget);
    await tapOn(tester, button('NÄCHSTE ÜBUNG'));
    expect(find.text('3 / 4'), findsOneWidget);
    await tapOn(tester, button('VORHERIGE ÜBUNG'));
    expect(find.text('2 / 4'), findsOneWidget);
    expect(h.backend.mutationBodies.length, before);
  });

  testWidgets(
    'finishing with open exercises asks first and records them as not done',
    (tester) async {
      final h = await startDayOne(tester);
      await tapOn(tester, button('ÜBERSPRINGEN'));
      await tapOn(tester, find.byTooltip('Weitere Aktionen'));
      await tapOn(tester, find.text('Training abschließen'));
      expect(
        find.text(
          '3 Übungen sind noch offen und werden als nicht erledigt gespeichert.',
        ),
        findsOneWidget,
      );
      await tapOn(
        tester,
        find.widgetWithText(FilledButton, 'Training abschließen'),
      );
      expect(find.text('TRAINING ABGESCHLOSSEN'), findsOneWidget);
      expect(find.text('0 von 4 Übungen'), findsOneWidget);
      expect(find.text('1 übersprungen'), findsOneWidget);
      expect(find.text('3 nicht erledigt'), findsOneWidget);
      expect(h.backend.history.single['exercisesSkipped'], 1);
    },
  );

  testWidgets('abandon: confirmed, kept as ABANDONED (not deleted)', (
    tester,
  ) async {
    final h = await startDayOne(tester);
    await tapOn(tester, find.byTooltip('Weitere Aktionen'));
    await tapOn(tester, find.text('Training abbrechen'));
    expect(
      find.text('TRAINING ABBRECHEN?'),
      findsNothing,
    ); // dialog title is not uppercased
    expect(find.text('Training abbrechen?'), findsOneWidget);
    await tapOn(
      tester,
      find.widgetWithText(FilledButton, 'Training abbrechen'),
    );
    expect(find.text('TRAINING ABGEBROCHEN'), findsOneWidget);
    expect(h.backend.history.single['status'], 'ABANDONED');
  });

  testWidgets(
    'leaving keeps the session running; "Heute" offers "Training fortsetzen" at the current exercise',
    (tester) async {
      final h = await startDayOne(tester);
      await tapOn(
        tester,
        button('ÜBUNG ABSCHLIEßEN'),
      ); // exercise 1 done → now 2 / 4
      await tapOn(tester, find.byType(BackButton));
      expect(
        find.text(
          'Dein Training läuft weiter – du kannst es jederzeit fortsetzen.',
        ),
        findsOneWidget,
      );
      await tapOn(tester, find.byIcon(Icons.today_outlined));
      expect(find.text('TRAINING LÄUFT'), findsOneWidget);
      await tapOn(tester, button('TRAINING FORTSETZEN'));
      expect(find.text('2 / 4'), findsOneWidget);
      expect(find.text('KLIMMZÜGE'), findsOneWidget);
      expect(
        h.backend.requests.where((r) => r == 'POST /v1/client/workouts'),
        hasLength(1),
      );
    },
  );

  testWidgets('app restart resumes the IN_PROGRESS workout from the server', (
    tester,
  ) async {
    final h = AppHarness();
    h.backend.startSession('d-1');
    final exercises = (h.backend.current!['exercises']! as List)
        .cast<Map<String, Object?>>();
    exercises[0]['status'] = 'COMPLETED';
    h.backend.current!['progress'] = {
      'total': 4,
      'completed': 1,
      'skipped': 0,
      'currentExerciseId': exercises[1]['id'],
    };
    await h.pump(tester, height: 1400);
    expect(find.text('TRAINING LÄUFT'), findsOneWidget);
    expect(find.text('1 VON 4 ÜBUNGEN ERLEDIGT'), findsOneWidget);
    await tapOn(tester, button('TRAINING FORTSETZEN'));
    expect(find.text('2 / 4'), findsOneWidget);
  });

  testWidgets('a failed save is rolled back, reported and can be retried', (
    tester,
  ) async {
    final h = await startDayOne(tester);
    await tapOn(tester, button('NÄCHSTE ÜBUNG')); // Klimmzüge
    h.backend.failMutations = 1;
    await tapOn(
      tester,
      find.bySemanticsLabel(RegExp('^Satz 1, 12 Wdh\\., Satz 1 abschließen')),
    );
    expect(
      find.text('Keine Verbindung. Bitte prüfe deine Internetverbindung.'),
      findsOneWidget,
    );
    // rolled back to the confirmed state: still "abschließen", not "wieder öffnen"
    expect(
      find.bySemanticsLabel(RegExp('^Satz 1, 12 Wdh\\., Satz 1 abschließen')),
      findsOneWidget,
    );
    await tapOn(
      tester,
      find.widgetWithText(SnackBarAction, 'Erneut versuchen'),
    );
    expect(
      find.bySemanticsLabel(RegExp('Satz 1 wieder öffnen')),
      findsOneWidget,
    );
    final sets =
        ((h.backend.current!['exercises']! as List)[1] as Map)['sets'] as List;
    expect((sets.first as Map)['completed'], isTrue);
  });

  testWidgets(
    'another day while a workout runs: the day offers the running workout instead',
    (tester) async {
      final h = AppHarness();
      h.backend.startSession('d-1');
      await h.pump(tester, height: 1400);
      await tapOn(tester, find.byIcon(Icons.fitness_center_outlined));
      expect(find.text('LÄUFT'), findsOneWidget); // badge on day 1
      await tapOn(tester, find.text('Tag 2 · Unterkörper'));
      expect(find.text('TRAINING STARTEN'), findsNothing);
      expect(find.text('LAUFENDES TRAINING ÖFFNEN'), findsOneWidget);
      await tapOn(tester, button('LAUFENDES TRAINING ÖFFNEN'));
      expect(find.text('Oberkörper A'), findsOneWidget);
    },
  );
}
