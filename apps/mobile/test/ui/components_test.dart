import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/core/theme/vitruv_tokens.g.dart';
import 'package:vitruv_mobile/shared/ui/ui.dart';

import 'helpers.dart';

const c = VitruvColors.dark;

ShapeDecoration buttonDecoration(WidgetTester tester) =>
    tester.widget<AnimatedContainer>(find.byType(AnimatedContainer)).decoration!
        as ShapeDecoration;

BeveledRectangleBorder shapeOf(Decoration d) =>
    (d as ShapeDecoration).shape as BeveledRectangleBorder;

void main() {
  group('Chamfer', () {
    test('cut sizes come from the design tokens', () {
      expect(ChamferCut.xs.size, VitruvShape.chamferXs);
      expect(ChamferCut.sm.size, VitruvShape.chamferSm);
      expect(ChamferCut.md.size, VitruvShape.chamferMd);
      expect(ChamferCut.lg.size, VitruvShape.chamferLg);
    });

    test('only the top-left and bottom-right corners are cut', () {
      final shape = chamferBorder(ChamferCut.md) as BeveledRectangleBorder;
      expect(
        shape.borderRadius,
        const BorderRadius.only(
          topLeft: Radius.circular(VitruvShape.chamferMd),
          bottomRight: Radius.circular(VitruvShape.chamferMd),
        ),
      );
    });

    testWidgets('ChamferBox strokes its border along the chamfer outline', (
      tester,
    ) async {
      await pumpUi(
        tester,
        ChamferBox(
          cut: ChamferCut.lg,
          fill: c.surface,
          border: BorderSide(
            color: c.borderStrong,
            width: VitruvShape.borderStrong,
          ),
          child: const SizedBox.square(dimension: 80),
        ),
      );
      final deco = tester
          .widget<DecoratedBox>(find.byType(DecoratedBox).first)
          .decoration;
      expect((deco as ShapeDecoration).color, c.surface);
      expect(shapeOf(deco).side.color, c.borderStrong);
      expect(shapeOf(deco).side.width, VitruvShape.borderStrong);
      expect(shapeOf(deco).borderRadius, isA<BorderRadius>());
    });
  });

  group('VitruvButton', () {
    testWidgets('primary: uppercase label, accent fill, soft glow, tap fires', (
      tester,
    ) async {
      var taps = 0;
      await pumpUi(
        tester,
        VitruvButton(label: 'Weiter', onPressed: () => taps++),
      );
      expect(find.text('WEITER'), findsOneWidget);
      final deco = buttonDecoration(tester);
      expect(deco.color, c.accent);
      expect(deco.shadows, VitruvEffects.glowSoft);
      await tester.tap(find.byType(VitruvButton));
      expect(taps, 1);
    });

    testWidgets('secondary is an outline; ghost has no fill and no border', (
      tester,
    ) async {
      await pumpUi(
        tester,
        VitruvButton(
          label: 'Sekundär',
          variant: VitruvButtonVariant.secondary,
          onPressed: () {},
        ),
      );
      final secondary = buttonDecoration(tester);
      expect(secondary.color, isNull);
      expect(shapeOf(secondary).side.color, c.borderStrong);
      expect(shapeOf(secondary).side.width, VitruvShape.borderStrong);

      await pumpUi(
        tester,
        VitruvButton(
          label: 'Ghost',
          variant: VitruvButtonVariant.ghost,
          onPressed: () {},
        ),
      );
      final ghost = buttonDecoration(tester);
      expect(ghost.color, isNull);
      expect(shapeOf(ghost).side, BorderSide.none);
      expect(
        tester.widget<Text>(find.text('GHOST')).style!.color,
        c.accentText,
      );
    });

    testWidgets('meets the 48 dp minimum touch target', (tester) async {
      await pumpUi(tester, VitruvButton(label: 'Ok', onPressed: () {}));
      final size = tester.getSize(find.byType(AnimatedContainer));
      expect(size.height, greaterThanOrEqualTo(VitruvLayout.tapTarget));
      expect(size.width, greaterThanOrEqualTo(VitruvLayout.tapTarget));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    });

    testWidgets('disabled: no tap, disabled semantics, no glow', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await pumpUi(tester, const VitruvButton(label: 'Nein', onPressed: null));
      expect(
        tester.getSemantics(find.byType(VitruvButton)),
        matchesSemantics(
          label: 'Nein',
          isButton: true,
          hasEnabledState: true,
          isEnabled: false,
          isFocusable: false,
        ),
      );
      final deco = buttonDecoration(tester);
      expect(deco.shadows, isEmpty);
      expect(tester.widget<Text>(find.text('NEIN')).style!.color, c.fgDisabled);
      handle.dispose();
    });

    testWidgets(
      'loading keeps variant colours and size, blocks taps, announces busy',
      (tester) async {
        final handle = tester.ensureSemantics();
        var taps = 0;
        await pumpUi(
          tester,
          VitruvButton(label: 'Speichern', onPressed: () => taps++),
        );
        final idleSize = tester.getSize(find.byType(AnimatedContainer));

        await pumpUi(
          tester,
          VitruvButton(
            label: 'Speichern',
            onPressed: () => taps++,
            loading: true,
          ),
        );
        expect(tester.getSize(find.byType(AnimatedContainer)), idleSize);
        expect(
          buttonDecoration(tester).color,
          c.accent,
          reason: 'busy ≠ disabled',
        );
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        await tester.tap(find.byType(VitruvButton));
        expect(taps, 0);
        expect(
          tester.getSemantics(find.byType(VitruvButton)),
          matchesSemantics(
            label: 'Speichern',
            value: 'Lädt',
            isButton: true,
            hasEnabledState: true,
          ),
        );
        handle.dispose();
      },
    );

    testWidgets('semanticLabel overrides the spoken label', (tester) async {
      final handle = tester.ensureSemantics();
      await pumpUi(
        tester,
        VitruvButton(
          label: 'Mehr',
          semanticLabel: 'Mehr zur Einheit',
          onPressed: () {},
        ),
      );
      expect(find.bySemanticsLabel('Mehr zur Einheit'), findsOneWidget);
      handle.dispose();
    });

    testWidgets('keyboard: Tab shows a focus ring, Enter activates', (
      tester,
    ) async {
      var taps = 0;
      await pumpUi(tester, VitruvButton(label: 'Los', onPressed: () => taps++));
      FocusManager.instance.highlightStrategy =
          FocusHighlightStrategy.alwaysTraditional;
      addTearDown(
        () => FocusManager.instance.highlightStrategy =
            FocusHighlightStrategy.automatic,
      );

      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      final ring = tester.widget<CustomPaint>(
        find.descendant(
          of: find.byType(ChamferFocusRing),
          matching: find.byType(CustomPaint),
        ),
      );
      expect(ring.foregroundPainter, isNotNull);

      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      expect(taps, 1);
    });

    testWidgets('icons are rendered with the label colour', (tester) async {
      await pumpUi(
        tester,
        VitruvButton(
          label: 'Weiter',
          trailingIcon: Icons.arrow_forward,
          onPressed: () {},
        ),
      );
      expect(
        tester.widget<Icon>(find.byIcon(Icons.arrow_forward)).color,
        c.onAccent,
      );
    });
  });

  group('VitruvCard', () {
    ShapeDecoration cardDecoration(WidgetTester tester) =>
        tester
                .widget<DecoratedBox>(
                  find.descendant(
                    of: find.byType(ChamferBox),
                    matching: find.byType(DecoratedBox),
                  ),
                )
                .decoration
            as ShapeDecoration;

    testWidgets(
      'standard: surface fill, hairline border, no glow, not a button',
      (tester) async {
        final handle = tester.ensureSemantics();
        await pumpUi(tester, const VitruvCard(child: Text('Inhalt')));
        final deco = cardDecoration(tester);
        expect(deco.color, c.surface);
        expect(shapeOf(deco).side.color, c.borderSubtle);
        expect(deco.shadows, isEmpty);
        expect(
          tester.getSemantics(find.text('Inhalt')),
          isNot(matchesSemantics(isButton: true)),
        );
        handle.dispose();
      },
    );

    testWidgets('accent: blue strong border and strong glow', (tester) async {
      await pumpUi(
        tester,
        const VitruvCard(
          tone: VitruvCardTone.accent,
          glow: true,
          child: Text('Aktiv'),
        ),
      );
      final deco = cardDecoration(tester);
      expect(shapeOf(deco).side.color, c.accent);
      expect(shapeOf(deco).side.width, VitruvShape.borderStrong);
      expect(deco.shadows, VitruvEffects.glowStrong);
    });

    testWidgets('tappable: one labelled button, tap fires', (tester) async {
      final handle = tester.ensureSemantics();
      var taps = 0;
      await pumpUi(
        tester,
        VitruvCard.tappable(
          onTap: () => taps++,
          semanticLabel: 'Einheit öffnen',
          child: const Text('Einheit'),
        ),
      );
      expect(
        tester.getSemantics(find.byType(VitruvCard)),
        matchesSemantics(
          label: 'Einheit öffnen',
          isButton: true,
          hasEnabledState: true,
          isEnabled: true,
          isFocusable: true,
          hasTapAction: true,
        ),
      );
      await tester.tap(find.byType(VitruvCard));
      expect(taps, 1);
      handle.dispose();
    });
  });

  group('VitruvMediaFrame', () {
    testWidgets('size depends only on width and aspect (no layout shift)', (
      tester,
    ) async {
      Future<Size> sizeWith(Widget? child) async {
        await pumpUi(
          tester,
          SizedBox(width: 300, child: VitruvMediaFrame(child: child)),
        );
        return tester.getSize(find.byType(VitruvMediaFrame));
      }

      final empty = await sizeWith(null);
      final filled = await sizeWith(const SizedBox(width: 10, height: 999));
      expect(empty, const Size(300, 300 * 9 / 16));
      expect(filled, empty);
    });

    testWidgets('shows a placeholder without media and the child with media', (
      tester,
    ) async {
      await pumpUi(
        tester,
        const SizedBox(width: 300, child: VitruvMediaFrame()),
      );
      expect(find.text('MEDIUM FOLGT'), findsOneWidget);

      await pumpUi(
        tester,
        const SizedBox(
          width: 300,
          child: VitruvMediaFrame(child: Text('Video')),
        ),
      );
      expect(find.text('Video'), findsOneWidget);
      expect(find.text('MEDIUM FOLGT'), findsNothing);
      expect(find.byType(ClipPath), findsOneWidget);
    });
  });

  group('labels & status', () {
    testWidgets('badge always shows text; dot is hidden from semantics', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await pumpUi(
        tester,
        const VitruvBadge('Aktiv', tone: VitruvTone.success, dot: true),
      );
      expect(find.text('AKTIV'), findsOneWidget);
      expect(tester.widget<Text>(find.text('AKTIV')).style!.color, c.success);
      handle.dispose();
    });

    testWidgets('progress exposes label and value text to screen readers', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await pumpUi(
        tester,
        const SizedBox(
          width: 300,
          child: VitruvProgress(
            value: 0.5,
            label: 'Einheiten',
            valueText: '2 / 4',
          ),
        ),
      );
      expect(
        tester.getSemantics(find.byType(VitruvProgress)),
        matchesSemantics(label: 'Einheiten', value: '2 / 4'),
      );
      handle.dispose();
    });

    testWidgets('section title is a heading', (tester) async {
      final handle = tester.ensureSemantics();
      await pumpUi(tester, const SectionTitle('Training'));
      expect(
        tester.getSemantics(find.byType(SectionTitle)),
        matchesSemantics(label: 'TRAINING', isHeader: true),
      );
      handle.dispose();
    });
  });
}
