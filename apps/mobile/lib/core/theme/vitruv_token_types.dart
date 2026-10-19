import 'package:flutter/foundation.dart' show immutable;
import 'package:flutter/painting.dart';

/// Semantic colour roles — mirrors `ColorRole` in packages/design-tokens/src/tokens.ts.
/// Values come only from the generated `vitruv_tokens.g.dart`.
@immutable
class VitruvColorScheme {
  const VitruvColorScheme({
    required this.bg,
    required this.surface,
    required this.surfaceSunken,
    required this.surfaceHover,
    required this.overlay,
    required this.fg,
    required this.fgMuted,
    required this.fgSubtle,
    required this.fgDisabled,
    required this.accent,
    required this.accentHover,
    required this.accentText,
    required this.onAccent,
    required this.border,
    required this.borderSubtle,
    required this.borderStrong,
    required this.focusRing,
    required this.success,
    required this.warning,
    required this.error,
  });

  final Color bg;
  final Color surface;
  final Color surfaceSunken;
  final Color surfaceHover;
  final Color overlay;
  final Color fg;
  final Color fgMuted;
  final Color fgSubtle;
  final Color fgDisabled;
  final Color accent;
  final Color accentHover;
  final Color accentText;
  final Color onAccent;
  final Color border;
  final Color borderSubtle;
  final Color borderStrong;
  final Color focusRing;
  final Color success;
  final Color warning;
  final Color error;
}

/// A semantic typography role (display, h1 … button).
///
/// Sizes are fluid between [minSize] (360 px wide screens) and [maxSize] (1440 px), the same
/// interpolation the web uses. Flutter has no `text-transform`: when [uppercase] is true, the
/// widget rendering the text applies `toUpperCase()` (see [VitruvTextRole.apply]).
@immutable
class VitruvTextRole {
  const VitruvTextRole({
    required this.fontFamily,
    required this.fontWeight,
    required this.italic,
    required this.uppercase,
    required this.minSize,
    required this.maxSize,
    required this.height,
    required this.letterSpacingEm,
  });

  final String fontFamily;
  final FontWeight fontWeight;
  final bool italic;
  final bool uppercase;
  final double minSize;
  final double maxSize;
  final double height;
  final double letterSpacingEm;

  /// Font size for a given logical screen width (clamped to [minSize]..[maxSize]).
  double sizeFor(
    double screenWidth, {
    double minViewport = 360,
    double maxViewport = 1440,
  }) {
    if (minSize == maxSize) return minSize;
    final t = ((screenWidth - minViewport) / (maxViewport - minViewport)).clamp(
      0.0,
      1.0,
    );
    return minSize + (maxSize - minSize) * t;
  }

  TextStyle style({required Color color, double? screenWidth}) {
    final size = screenWidth == null ? minSize : sizeFor(screenWidth);
    return TextStyle(
      fontFamily: fontFamily,
      fontWeight: fontWeight,
      fontStyle: italic ? FontStyle.italic : FontStyle.normal,
      fontSize: size,
      height: height,
      letterSpacing: letterSpacingEm * size,
      color: color,
    );
  }

  /// Applies the role's text transform to a string.
  String apply(String text) => uppercase ? text.toUpperCase() : text;
}
