import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/app_harness.dart';

void main() {
  testWidgets('signed in: boots into "Heute" with the five German tabs', (
    tester,
  ) async {
    final h = AppHarness();
    await h.pump(tester);
    for (final label in [
      'Heute',
      'Training',
      'Ernährung',
      'Fortschritt',
      'Profil',
    ]) {
      expect(find.text(label), findsWidgets, reason: label);
    }
    expect(find.text('HALLO ERIKA'), findsOneWidget);
  });

  testWidgets('Ernährung stays an intentional placeholder (Sprint 7)', (
    tester,
  ) async {
    final h = AppHarness();
    await h.pump(tester);
    await tapOn(tester, find.byIcon(Icons.restaurant_outlined));
    expect(
      find.text('Dieser Bereich folgt in einem der nächsten Sprints.'),
      findsOneWidget,
    );
  });

  testWidgets(
    'a failed load shows a localized error with retry, then recovers',
    (tester) async {
      final h = AppHarness();
      await h.pump(tester);
      h.backend.offline = true;
      await tapOn(tester, find.byIcon(Icons.insights_outlined));
      expect(
        find.text('Keine Verbindung. Bitte prüfe deine Internetverbindung.'),
        findsOneWidget,
      );
      h.backend.offline = false;
      await tapOn(tester, find.text('Erneut versuchen'));
      expect(find.text('Noch keine Trainings'), findsOneWidget);
    },
  );

  testWidgets(
    'Fortschritt lists the workout history (summary rows, newest first)',
    (tester) async {
      final h = AppHarness();
      h.backend.history.addAll([
        {
          'id': 'h-2',
          'status': 'COMPLETED',
          'programTitle': 'Kraftaufbau',
          'dayTitle': 'Unterkörper',
          'weekOrder': 0,
          'dayOrder': 1,
          'startedAt': '2026-10-14T16:00:00.000Z',
          'completedAt': '2026-10-14T16:48:00.000Z',
          'abandonedAt': null,
          'durationSeconds': 2880,
          'exercisesTotal': 6,
          'exercisesCompleted': 5,
          'exercisesSkipped': 1,
        },
        {
          'id': 'h-1',
          'status': 'ABANDONED',
          'programTitle': 'Kraftaufbau',
          'dayTitle': 'Oberkörper A',
          'weekOrder': 0,
          'dayOrder': 0,
          'startedAt': '2026-10-12T16:00:00.000Z',
          'completedAt': null,
          'abandonedAt': '2026-10-12T16:10:00.000Z',
          'durationSeconds': 600,
          'exercisesTotal': 4,
          'exercisesCompleted': 1,
          'exercisesSkipped': 0,
        },
      ]);
      await h.pump(tester, height: 1400);
      await tapOn(tester, find.byIcon(Icons.insights_outlined));
      expect(find.text('Woche 1 · Tag 2 · Unterkörper'), findsOneWidget);
      expect(find.text('ABGESCHLOSSEN'), findsOneWidget);
      expect(find.text('ABGEBROCHEN'), findsOneWidget);
      final first = tester
          .getTopLeft(find.text('Woche 1 · Tag 2 · Unterkörper'))
          .dy;
      final second = tester
          .getTopLeft(find.text('Woche 1 · Tag 1 · Oberkörper A'))
          .dy;
      expect(first, lessThan(second));
    },
  );

  testWidgets('Profil shows the own account only and no internal data', (
    tester,
  ) async {
    final h = AppHarness();
    await h.pump(tester);
    await tapOn(tester, find.byIcon(Icons.person_outline));
    expect(find.text('ERIKA MUSTER'), findsOneWidget);
    expect(find.text('kunde@example.invalid'), findsOneWidget);
    expect(find.text('Coach Alex'), findsOneWidget);
    expect(find.text('Coaching aktiv'), findsOneWidget);
    expect(find.text('ABMELDEN'), findsOneWidget);
  });
}
