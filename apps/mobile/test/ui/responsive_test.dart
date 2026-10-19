import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/core/theme/app_theme.dart';
import 'package:vitruv_mobile/features/design_gallery/design_gallery_screen.dart';
import 'package:vitruv_mobile/shared/ui/ui.dart';

import 'helpers.dart';

/// Renders the whole gallery (every component in every state) at a logical width / text scale
/// and fails on any layout overflow or exception.
Future<void> pumpGallery(
  WidgetTester tester,
  double width,
  double textScale,
) async {
  tester.view.physicalSize = Size(width, 60000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: MediaQuery(
        data: MediaQueryData(
          size: Size(width, 60000),
          textScaler: TextScaler.linear(textScale),
        ),
        child: const DesignGalleryScreen(),
      ),
    ),
  );
  await tester.pump(const Duration(seconds: 1));
}

void main() {
  for (final width in [320.0, 375.0, 390.0, 430.0, 768.0]) {
    testWidgets('gallery lays out without overflow at ${width.round()} dp', (
      tester,
    ) async {
      await pumpGallery(tester, width, 1);
      expect(tester.takeException(), isNull);
      expect(find.byKey(const Key('gallery-navigation')), findsOneWidget);
    });
  }

  for (final scale in [1.5, 2.0]) {
    testWidgets('gallery tolerates text scale ${scale}x at 320 dp', (
      tester,
    ) async {
      await pumpGallery(tester, 320, scale);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'buttons stay ≥ 48 dp and labels wrap instead of clipping at 2x text',
    (tester) async {
      await pumpUi(
        tester,
        SizedBox(
          width: 288,
          child: VitruvButton(
            label: 'Sehr langer Beispieltext für einen Button',
            fullWidth: true,
            onPressed: () {},
          ),
        ),
        width: 320,
        textScale: 2,
      );
      expect(tester.takeException(), isNull);
      expect(
        tester.getSize(find.byType(AnimatedContainer)).height,
        greaterThanOrEqualTo(48),
      );
    },
  );

  testWidgets('button icons scale with the system text size', (tester) async {
    await pumpUi(
      tester,
      VitruvButton(
        label: 'Weiter',
        trailingIcon: Icons.arrow_forward,
        onPressed: () {},
      ),
      textScale: 2,
    );
    expect(tester.getSize(find.byIcon(Icons.arrow_forward)).width, 32);
  });

  testWidgets('reduced motion: interaction animations become instant', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(390, 844),
            disableAnimations: true,
          ),
          child: Scaffold(
            body: Center(
              child: VitruvButton(label: 'Ok', onPressed: () {}),
            ),
          ),
        ),
      ),
    );
    final container = tester.widget<AnimatedContainer>(
      find.byType(AnimatedContainer),
    );
    expect(container.duration, Duration.zero);
  });
}
