import 'package:flutter/material.dart';

import 'chamfer_shape.dart';
import 'vitruv_token_types.dart';
import 'vitruv_tokens.g.dart';

/// Builds Material themes exclusively from the generated VITRUV tokens
/// (packages/design-tokens → vitruv_tokens.g.dart). No colour or size literals live here.
///
/// Dark is the production master (`Website Funktional Dunkel`); light is kept compatible only.
abstract final class AppTheme {
  static ThemeData dark() => _build(VitruvColors.dark, Brightness.dark);

  static ThemeData light() => _build(VitruvColors.light, Brightness.light);

  static ThemeData _build(VitruvColorScheme c, Brightness brightness) {
    final scheme = ColorScheme(
      brightness: brightness,
      primary: c.accent,
      onPrimary: c.onAccent,
      secondary: c.accentText,
      onSecondary: c.onAccent,
      error: c.error,
      onError: c.bg,
      surface: c.bg,
      onSurface: c.fg,
      onSurfaceVariant: c.fgMuted,
      surfaceContainerLowest: c.bg,
      surfaceContainerLow: c.surfaceSunken,
      surfaceContainer: c.surface,
      surfaceContainerHigh: c.surface,
      surfaceContainerHighest: c.surface,
      outline: c.borderStrong,
      outlineVariant: c.border,
      scrim: c.overlay,
    );

    TextStyle role(VitruvTextRole r, Color color) => r.style(color: color);

    final textTheme = TextTheme(
      displayLarge: role(VitruvType.display, c.fg),
      headlineLarge: role(VitruvType.h1, c.fg),
      headlineMedium: role(VitruvType.h2, c.fg),
      headlineSmall: role(VitruvType.h3, c.fg),
      titleLarge: role(VitruvType.title, c.fg),
      titleMedium: role(VitruvType.title, c.fg),
      bodyLarge: role(VitruvType.bodyLg, c.fgMuted),
      bodyMedium: role(VitruvType.body, c.fg),
      bodySmall: role(VitruvType.bodySm, c.fgMuted),
      labelLarge: role(VitruvType.button, c.fg),
      labelMedium: role(VitruvType.eyebrow, c.accentText),
      labelSmall: role(VitruvType.caption, c.fgSubtle),
    );

    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      fontFamily: VitruvFonts.body,
      textTheme: textTheme,
    );

    final focusOutline = BorderSide(
      color: c.focusRing,
      width: VitruvShape.borderFocus,
    );

    return base.copyWith(
      scaffoldBackgroundColor: c.bg,
      canvasColor: c.bg,
      dividerTheme: DividerThemeData(
        color: c.border,
        thickness: VitruvShape.borderHairline,
        space: VitruvShape.borderHairline,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: c.bg,
        foregroundColor: c.fg,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        titleTextStyle: role(VitruvType.title, c.fg),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: c.surfaceSunken,
        surfaceTintColor: Colors.transparent,
        // Chamfered selection marker instead of the Material pill.
        indicatorColor: c.accent.withValues(alpha: 0.16),
        indicatorShape: chamferBorder(
          ChamferCut.xs,
          side: BorderSide(color: c.accent, width: VitruvShape.borderHairline),
        ),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => role(
            VitruvType.caption,
            states.contains(WidgetState.selected) ? c.accentText : c.fgSubtle,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected)
                ? c.accentText
                : c.fgMuted,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(
            Size(VitruvLayout.tapTarget, VitruvLayout.tapTarget),
          ),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(
              horizontal: VitruvSpace.s6,
              vertical: VitruvSpace.s4,
            ),
          ),
          textStyle: WidgetStatePropertyAll(
            role(VitruvType.button, c.onAccent),
          ),
          foregroundColor: WidgetStatePropertyAll(c.onAccent),
          backgroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.disabled)
                ? c.surface
                : states.contains(WidgetState.hovered) ||
                      states.contains(WidgetState.pressed)
                ? c.accentHover
                : c.accent,
          ),
          shape: WidgetStateProperty.resolveWith(
            (states) => chamferBorder(
              ChamferCut.sm,
              side: states.contains(WidgetState.focused)
                  ? focusOutline
                  : BorderSide.none,
            ),
          ),
          animationDuration: VitruvMotion.micro,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(
            Size(VitruvLayout.tapTarget, VitruvLayout.tapTarget),
          ),
          textStyle: WidgetStatePropertyAll(role(VitruvType.button, c.fg)),
          foregroundColor: WidgetStatePropertyAll(c.fg),
          shape: WidgetStatePropertyAll(
            chamferBorder(
              ChamferCut.sm,
              side: BorderSide(color: c.fg, width: VitruvShape.borderStrong),
            ),
          ),
          animationDuration: VitruvMotion.micro,
        ),
      ),
      cardTheme: CardThemeData(
        color: c.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: chamferBorder(
          ChamferCut.md,
          side: BorderSide(
            color: c.borderSubtle,
            width: VitruvShape.borderHairline,
          ),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: c.accent),
      extensions: [VitruvTheme(colors: c)],
    );
  }
}

/// Exposes the full VITRUV colour roles (incl. those Material has no slot for, e.g. `fgSubtle`,
/// `accentText`, `success`) to widgets: `Theme.of(context).extension<VitruvTheme>()!.colors`.
@immutable
class VitruvTheme extends ThemeExtension<VitruvTheme> {
  const VitruvTheme({required this.colors});

  final VitruvColorScheme colors;

  static VitruvColorScheme of(BuildContext context) =>
      Theme.of(context).extension<VitruvTheme>()?.colors ?? VitruvColors.dark;

  @override
  VitruvTheme copyWith({VitruvColorScheme? colors}) =>
      VitruvTheme(colors: colors ?? this.colors);

  @override
  VitruvTheme lerp(covariant VitruvTheme? other, double t) =>
      t < 0.5 || other == null ? this : other;
}
