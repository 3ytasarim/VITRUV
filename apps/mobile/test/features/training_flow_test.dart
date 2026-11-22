import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';
import '../support/fake_backend.dart';

void main() {
  Future<void> openTraining(WidgetTester tester) =>
      tapOn(tester, find.byIcon(Icons.fitness_center_outlined));

  testWidgets(
    'no ACTIVE plan: explicit empty state on Training and Heute (no demo plan)',
    (tester) async {
      final h = AppHarness();
      h.backend.program = null;
      await h.pump(tester);
      expect(find.text('Noch kein Trainingsplan'), findsOneWidget);
      await openTraining(tester);
      expect(find.text('Noch kein aktiver Trainingsplan'), findsOneWidget);
      expect(find.textContaining('Oberkörper'), findsNothing);
    },
  );

  testWidgets('ACTIVE plan: weeks and days in API order', (tester) async {
    final h = AppHarness();
    await h.pump(
      tester,
      height: 3000,
    ); // everything built at once → tree order = screen order
    await openTraining(tester);
    final texts = tester
        .widgetList<Text>(find.byType(Text))
        .map((t) => t.data)
        .whereType<String>()
        .toList();
    final expected = [
      'KRAFTAUFBAU',
      'WOCHE 1',
      'Tag 1 · Oberkörper A',
      'Tag 2 · Unterkörper',
      'WOCHE 2 · STEIGERUNG',
      'Tag 1 · Ganzkörper',
    ];
    final indexes = [for (final e in expected) texts.indexOf(e)];
    expect(indexes.every((i) => i >= 0), isTrue, reason: '$texts');
    expect([...indexes]..sort(), indexes);
    expect(find.text('4 ÜBUNGEN'), findsOneWidget);
  });

  testWidgets(
    'day detail: sections, exercises, prescriptions, rest, instructions',
    (tester) async {
      final h = AppHarness();
      await h.pump(tester, height: 3000);
      await openTraining(tester);
      await tapOn(tester, find.text('Tag 1 · Oberkörper A'));
      for (final text in [
        'WARM-UP',
        'Seilspringen',
        '45 Sek.',
        'Pause 00:30',
        'HAUPTTEIL',
        'Klimmzüge',
        '4 × 12',
        'Pause 01:00',
        'Schulterblätter aktiv.',
        'Liegestütze',
        '70 Wdh. gesamt',
        'ABSCHLUSS',
        'Burpees',
        'AMRAP',
      ]) {
        expect(find.text(text), findsWidgets, reason: text);
      }
      expect(find.text('TRAINING STARTEN'), findsOneWidget);
    },
  );

  testWidgets('weight is shown with the German decimal format', (tester) async {
    final h = AppHarness();
    await h.pump(tester);
    await openTraining(tester);
    await tapOn(tester, find.text('Tag 2 · Unterkörper'));
    expect(find.text('3 × 10 · 20 kg'), findsOneWidget);
    expect(find.text('Pause 01:30'), findsOneWidget);
  });

  testWidgets(
    'a workout is placed on today only with a real start date and matching weekday',
    (tester) async {
      // FakeClock: Thursday 2026-10-15 → ISO weekday 4; plan starts Monday 2026-10-12.
      final h = AppHarness();
      h.backend.program = weekProgram();
      await h.pump(tester, height: 4000);
      expect(find.text('HEUTE'), findsOneWidget); // badge on Donnerstag, 15.10.
      expect(find.text('Donnerstag, 15.10.'), findsWidgets);
      expect(find.text('Aufwärmen und Kraft'), findsWidgets);
    },
  );

  testWidgets('without a start date the app makes no "today" claim', (
    tester,
  ) async {
    final h = AppHarness();
    h.backend.program = demoProgram(weekday: 4); // weekday hint but no calendar
    await h.pump(tester, height: 3000);
    expect(find.text('HEUTE'), findsNothing);
    expect(find.text('DEIN TRAININGSPLAN'), findsOneWidget);
    // No invented dates: the plan says so and lists the workouts without a date.
    expect(
      find.textContaining('Dein Plan hat noch keine festen Termine'),
      findsOneWidget,
    );
    expect(
      find.text('OHNE FESTEN TERMIN'),
      findsOneWidget,
    ); // "Nächstes Training"
    expect(find.text('3 TRAININGSTAGE'), findsOneWidget);
  });
}
