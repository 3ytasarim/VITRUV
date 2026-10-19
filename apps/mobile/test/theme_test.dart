import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/core/theme/app_theme.dart';
import 'package:vitruv_mobile/core/theme/vitruv_token_types.dart';
import 'package:vitruv_mobile/core/theme/vitruv_tokens.g.dart';

/// WCAG 2.1 contrast of [fg] composited over opaque [bg].
double contrast(Color fg, Color bg) {
  final blended = Color.alphaBlend(fg, bg);
  final l1 = blended.computeLuminance();
  final l2 = bg.computeLuminance();
  final hi = l1 > l2 ? l1 : l2;
  final lo = l1 > l2 ? l2 : l1;
  return (hi + 0.05) / (lo + 0.05);
}

void main() {
  group('generated tokens', () {
    test('carry the master prototype values', () {
      expect(VitruvColors.dark.bg, const Color(0xFF050505));
      expect(VitruvColors.dark.surface, const Color(0xFF0E0E0E));
      expect(VitruvColors.dark.fg, const Color(0xFFF2F2EE));
      expect(VitruvColors.dark.accent, const Color(0xFF4D8DFF));
      expect(VitruvColors.dark.accentText, const Color(0xFF5B9DFF));
      expect(VitruvFonts.heading, 'Chakra Petch');
      expect(VitruvFonts.label, 'Barlow Condensed');
      expect(VitruvFonts.body, 'Barlow');
      expect(VitruvLayout.contentMax, 1240);
      expect(VitruvLayout.breakpointMd, 820);
      expect(VitruvMotion.easeOut, const Cubic(0.22, 1, 0.36, 1));
    });

    test('fluid type interpolates like the web (360 → 1440 px)', () {
      expect(VitruvType.display.sizeFor(320), 40);
      expect(VitruvType.display.sizeFor(1440), 80);
      expect(VitruvType.display.sizeFor(900), closeTo(60, 0.001));
      expect(VitruvType.body.sizeFor(2560), 16);
      expect(VitruvType.eyebrow.apply('Dein Weg'), 'DEIN WEG');
      expect(VitruvType.body.apply('Dein Weg'), 'Dein Weg');
    });
  });

  group('important text pairs stay WCAG AA on both platforms', () {
    const c = VitruvColors.dark;
    final pairs = <String, (Color, Color)>{
      'fg / bg': (c.fg, c.bg),
      'fgMuted / bg': (c.fgMuted, c.bg),
      'fgMuted / surface': (c.fgMuted, c.surface),
      'fgSubtle / bg': (c.fgSubtle, c.bg),
      'fgSubtle / surface': (c.fgSubtle, c.surface),
      'accentText / bg': (c.accentText, c.bg),
      'accentText / surface': (c.accentText, c.surface),
      'onAccent / accent': (c.onAccent, c.accent),
      'error / surface': (c.error, c.surface),
    };
    pairs.forEach((name, pair) {
      test(
        name,
        () => expect(contrast(pair.$1, pair.$2), greaterThanOrEqualTo(4.5)),
      );
    });
  });

  group('AppTheme.dark()', () {
    final theme = AppTheme.dark();
    const c = VitruvColors.dark;

    test('maps colour roles from tokens', () {
      expect(theme.scaffoldBackgroundColor, c.bg);
      expect(theme.colorScheme.primary, c.accent);
      expect(theme.colorScheme.onPrimary, c.onAccent);
      expect(theme.colorScheme.onSurface, c.fg);
      expect(theme.colorScheme.onSurfaceVariant, c.fgMuted);
      expect(theme.colorScheme.error, c.error);
      expect(theme.extension<VitruvTheme>()!.colors, same(c));
    });

    test('uses the VITRUV font roles', () {
      expect(theme.textTheme.displayLarge!.fontFamily, 'Chakra Petch');
      expect(theme.textTheme.displayLarge!.fontStyle, FontStyle.italic);
      expect(theme.textTheme.headlineMedium!.fontWeight, FontWeight.w700);
      expect(theme.textTheme.labelMedium!.fontFamily, 'Barlow Condensed');
      expect(theme.textTheme.bodyMedium!.fontFamily, 'Barlow');
      expect(theme.textTheme.bodyMedium!.fontSize, 16);
    });

    test('buttons are chamfered and meet the 48 px tap target', () {
      final style = theme.filledButtonTheme.style!;
      expect(style.minimumSize!.resolve({}), const Size(48, 48));
      final shape = style.shape!.resolve({})! as BeveledRectangleBorder;
      expect(
        shape.borderRadius,
        const BorderRadius.only(
          topLeft: Radius.circular(VitruvShape.chamferSm),
          bottomRight: Radius.circular(VitruvShape.chamferSm),
        ),
      );
    });

    test('focus state draws a visible focus ring', () {
      final shape =
          theme.filledButtonTheme.style!.shape!.resolve({WidgetState.focused})!
              as BeveledRectangleBorder;
      expect(shape.side.color, c.focusRing);
      expect(shape.side.width, VitruvShape.borderFocus);
    });
  });

  test('VitruvTextRole is the only source of text styles', () {
    const role = VitruvTextRole(
      fontFamily: 'X',
      fontWeight: FontWeight.w400,
      italic: false,
      uppercase: false,
      minSize: 10,
      maxSize: 20,
      height: 1.5,
      letterSpacingEm: 0.1,
    );
    final style = role.style(color: const Color(0xFF000000), screenWidth: 1440);
    expect(style.fontSize, 20);
    expect(style.letterSpacing, closeTo(2, 0.0001));
  });
}
