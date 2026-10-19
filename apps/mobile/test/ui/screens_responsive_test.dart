import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';

/// Every Sprint 7 screen at the target phone/tablet widths and text scales: no RenderFlex
/// overflow (an overflow fails the test), plus the Flutter accessibility guidelines.
typedef Open = Future<void> Function(WidgetTester tester, AppHarness h);

Future<void> _day(WidgetTester tester, AppHarness h) async {
  await tapOn(tester, find.byIcon(Icons.fitness_center_outlined));
  await tapOn(tester, find.text('Tag 1 · Oberkörper A'));
}

Future<void> _workout(WidgetTester tester, AppHarness h) async {
  await _day(tester, h);
  await tapOn(tester, find.text('TRAINING STARTEN'));
  await tapOn(
    tester,
    find.text('NÄCHSTE ÜBUNG').hitTestable(),
  ); // Klimmzüge (sets)
  await tapOn(
    tester,
    find.bySemanticsLabel(RegExp('^Satz 1, ')),
  ); // rest timer visible
}

final Map<String, ({bool signedIn, Open open})> screens = {
  'Login': (signedIn: false, open: (tester, h) async {}),
  'Heute': (signedIn: true, open: (tester, h) async {}),
  'Training': (
    signedIn: true,
    open: (tester, h) =>
        tapOn(tester, find.byIcon(Icons.fitness_center_outlined)),
  ),
  'Tag': (signedIn: true, open: _day),
  'Workout': (signedIn: true, open: _workout),
  'Abschluss': (
    signedIn: true,
    open: (tester, h) async {
      await _workout(tester, h);
      await tapOn(tester, find.byTooltip('Weitere Aktionen'));
      await tapOn(tester, find.text('Training abschließen'));
      await tapOn(
        tester,
        find.widgetWithText(FilledButton, 'Training abschließen'),
      );
    },
  ),
  'Profil': (
    signedIn: true,
    open: (tester, h) => tapOn(tester, find.byIcon(Icons.person_outline)),
  ),
};

void main() {
  for (final MapEntry(key: name, value: screen) in screens.entries) {
    for (final width in [320.0, 375.0, 390.0, 430.0, 768.0]) {
      for (final scale in [1.0, 1.5, 2.0]) {
        testWidgets('$name @${width.round()} dp × $scale: no overflow', (
          tester,
        ) async {
          final h = AppHarness(signedIn: screen.signedIn);
          await h.pump(
            tester,
            width: width,
            height: width < 600 ? 780 : 1024,
            textScale: scale,
          );
          await screen.open(tester, h);
          expect(tester.takeException(), isNull);
        });
      }
    }

    testWidgets(
      '$name: tap targets, labels and contrast (Android + iOS guidelines)',
      (tester) async {
        final h = AppHarness(signedIn: screen.signedIn);
        await h.pump(tester);
        await screen.open(tester, h);
        await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
        await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        await expectLater(tester, meetsGuideline(textContrastGuideline));
      },
    );
  }

  testWidgets('reduced motion is honoured on the live workout (rest timer)', (
    tester,
  ) async {
    final h = AppHarness();
    await h.pump(tester, disableAnimations: true);
    await _workout(tester, h);
    final switcher = tester.widget<AnimatedSwitcher>(
      find.byType(AnimatedSwitcher).first,
    );
    expect(switcher.duration, Duration.zero);
  });
}
