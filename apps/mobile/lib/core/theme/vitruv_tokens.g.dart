// GENERATED FILE — do not edit.
// Source: packages/design-tokens/src/tokens.ts
// Regenerate: pnpm --filter @vitruv/design-tokens generate
// ignore_for_file: lines_longer_than_80_chars, require_trailing_commas
// Generated output must stay byte-identical (drift-checked), so the formatter is off:
// dart format off

import 'package:flutter/animation.dart';
import 'package:flutter/painting.dart';

import 'vitruv_token_types.dart';

abstract final class VitruvColors {
  static const dark = VitruvColorScheme(
    bg: Color(0xFF050505),
    surface: Color(0xFF0E0E0E),
    surfaceSunken: Color(0xFF0A0A0A),
    surfaceHover: Color(0x08FFFFFF),
    overlay: Color(0xB8050505),
    fg: Color(0xFFF2F2EE),
    fgMuted: Color(0xA8F2F2EE),
    fgSubtle: Color(0x80F2F2EE),
    fgDisabled: Color(0x59F2F2EE),
    accent: Color(0xFF4D8DFF),
    accentHover: Color(0xFF5B9DFF),
    accentText: Color(0xFF5B9DFF),
    onAccent: Color(0xFF050505),
    border: Color(0x1AFFFFFF),
    borderSubtle: Color(0x12FFFFFF),
    borderStrong: Color(0x38FFFFFF),
    focusRing: Color(0xFF5B9DFF),
    success: Color(0xFF3DDC97),
    warning: Color(0xFFFFC24B),
    error: Color(0xFFFF6B6B),
  );
  static const light = VitruvColorScheme(
    bg: Color(0xFFF6F6F3),
    surface: Color(0xFFFFFFFF),
    surfaceSunken: Color(0xFFECECE8),
    surfaceHover: Color(0x08000000),
    overlay: Color(0xCCF6F6F3),
    fg: Color(0xFF0E1014),
    fgMuted: Color(0xB30E1014),
    fgSubtle: Color(0x9E0E1014),
    fgDisabled: Color(0x610E1014),
    accent: Color(0xFF1F5FE0),
    accentHover: Color(0xFF184BB8),
    accentText: Color(0xFF1F5FE0),
    onAccent: Color(0xFFFFFFFF),
    border: Color(0x1A000000),
    borderSubtle: Color(0x12000000),
    borderStrong: Color(0x38000000),
    focusRing: Color(0xFF1F5FE0),
    success: Color(0xFF0F7A4D),
    warning: Color(0xFF9A5B00),
    error: Color(0xFFC62828),
  );
  static const public = VitruvColorScheme(
    bg: Color(0xFFF2EFE9),
    surface: Color(0xFFFAF8F4),
    surfaceSunken: Color(0xFFE9E4DB),
    surfaceHover: Color(0x082B2825),
    overlay: Color(0xDBF2EFE9),
    fg: Color(0xFF2B2825),
    fgMuted: Color(0xFF57524C),
    fgSubtle: Color(0xFF6F6A64),
    fgDisabled: Color(0x612B2825),
    accent: Color(0xFF2B2825),
    accentHover: Color(0xFF45403A),
    accentText: Color(0xFF7A6747),
    onAccent: Color(0xFFF2EFE9),
    border: Color(0x1F2B2825),
    borderSubtle: Color(0x122B2825),
    borderStrong: Color(0x3D2B2825),
    focusRing: Color(0xFF7A6747),
    success: Color(0xFF0F7A4D),
    warning: Color(0xFF9A5B00),
    error: Color(0xFFC62828),
  );
  static const admin = VitruvColorScheme(
    bg: Color(0xFFF4F2EE),
    surface: Color(0xFFFFFFFF),
    surfaceSunken: Color(0xFFEBE7E0),
    surfaceHover: Color(0x0A2B2825),
    overlay: Color(0xDBF4F2EE),
    fg: Color(0xFF2B2825),
    fgMuted: Color(0xFF57524C),
    fgSubtle: Color(0xFF6F6A64),
    fgDisabled: Color(0x612B2825),
    accent: Color(0xFF2B2825),
    accentHover: Color(0xFF45403A),
    accentText: Color(0xFF7A6747),
    onAccent: Color(0xFFFFFFFF),
    border: Color(0x1F2B2825),
    borderSubtle: Color(0x122B2825),
    borderStrong: Color(0x3D2B2825),
    focusRing: Color(0xFF7A6747),
    success: Color(0xFF0F7A4D),
    warning: Color(0xFF9A5B00),
    error: Color(0xFFC62828),
  );
  static const glass = VitruvColorScheme(
    bg: Color(0xFF070708),
    surface: Color(0x0FFFFFFF),
    surfaceSunken: Color(0x08FFFFFF),
    surfaceHover: Color(0x14FFFFFF),
    overlay: Color(0xCC070708),
    fg: Color(0xFFF4F4F5),
    fgMuted: Color(0xB8FFFFFF),
    fgSubtle: Color(0x94FFFFFF),
    fgDisabled: Color(0x57FFFFFF),
    accent: Color(0xFFF4F4F5),
    accentHover: Color(0xFFE4E4E7),
    accentText: Color(0xFFD4D4D8),
    onAccent: Color(0xFF070708),
    border: Color(0x24FFFFFF),
    borderSubtle: Color(0x14FFFFFF),
    borderStrong: Color(0x42FFFFFF),
    focusRing: Color(0xFFFFFFFF),
    success: Color(0xFF3DDC97),
    warning: Color(0xFFFFC24B),
    error: Color(0xFFFF6B6B),
  );
}

abstract final class VitruvFonts {
  static const heading = 'Chakra Petch';
  static const label = 'Barlow Condensed';
  static const body = 'Barlow';
}

abstract final class VitruvType {
  static const display = VitruvTextRole(
    fontFamily: VitruvFonts.heading,
    fontWeight: FontWeight.w700,
    italic: true,
    uppercase: true,
    minSize: 40.0,
    maxSize: 80.0,
    height: 1.0,
    letterSpacingEm: -0.01,
  );
  static const h1 = VitruvTextRole(
    fontFamily: VitruvFonts.heading,
    fontWeight: FontWeight.w700,
    italic: false,
    uppercase: true,
    minSize: 32.0,
    maxSize: 54.0,
    height: 1.04,
    letterSpacingEm: -0.005,
  );
  static const h2 = VitruvTextRole(
    fontFamily: VitruvFonts.heading,
    fontWeight: FontWeight.w700,
    italic: false,
    uppercase: true,
    minSize: 28.0,
    maxSize: 48.0,
    height: 1.05,
    letterSpacingEm: -0.005,
  );
  static const h3 = VitruvTextRole(
    fontFamily: VitruvFonts.heading,
    fontWeight: FontWeight.w700,
    italic: false,
    uppercase: true,
    minSize: 22.0,
    maxSize: 30.0,
    height: 1.1,
    letterSpacingEm: 0.0,
  );
  static const title = VitruvTextRole(
    fontFamily: VitruvFonts.body,
    fontWeight: FontWeight.w500,
    italic: false,
    uppercase: false,
    minSize: 19.0,
    maxSize: 22.0,
    height: 1.35,
    letterSpacingEm: 0.0,
  );
  static const eyebrow = VitruvTextRole(
    fontFamily: VitruvFonts.label,
    fontWeight: FontWeight.w600,
    italic: false,
    uppercase: true,
    minSize: 12.0,
    maxSize: 12.0,
    height: 1.3,
    letterSpacingEm: 0.22,
  );
  static const bodyLg = VitruvTextRole(
    fontFamily: VitruvFonts.body,
    fontWeight: FontWeight.w400,
    italic: false,
    uppercase: false,
    minSize: 17.0,
    maxSize: 19.0,
    height: 1.7,
    letterSpacingEm: 0.0,
  );
  static const body = VitruvTextRole(
    fontFamily: VitruvFonts.body,
    fontWeight: FontWeight.w400,
    italic: false,
    uppercase: false,
    minSize: 16.0,
    maxSize: 16.0,
    height: 1.7,
    letterSpacingEm: 0.0,
  );
  static const bodySm = VitruvTextRole(
    fontFamily: VitruvFonts.body,
    fontWeight: FontWeight.w400,
    italic: false,
    uppercase: false,
    minSize: 14.0,
    maxSize: 14.0,
    height: 1.6,
    letterSpacingEm: 0.0,
  );
  static const caption = VitruvTextRole(
    fontFamily: VitruvFonts.label,
    fontWeight: FontWeight.w600,
    italic: false,
    uppercase: true,
    minSize: 12.0,
    maxSize: 12.0,
    height: 1.3,
    letterSpacingEm: 0.16,
  );
  static const button = VitruvTextRole(
    fontFamily: VitruvFonts.label,
    fontWeight: FontWeight.w600,
    italic: false,
    uppercase: true,
    minSize: 12.0,
    maxSize: 12.0,
    height: 1.0,
    letterSpacingEm: 0.2,
  );
  static const fluidMinViewport = 360.0;
  static const fluidMaxViewport = 1440.0;
}

abstract final class VitruvSpace {
  static const base = 4.0;
  static const s0 = 0.0;
  static const s1 = 4.0;
  static const s2 = 8.0;
  static const s3 = 12.0;
  static const s4 = 16.0;
  static const s5 = 20.0;
  static const s6 = 24.0;
  static const s7 = 28.0;
  static const s8 = 32.0;
  static const s9 = 36.0;
  static const s10 = 40.0;
  static const s11 = 44.0;
  static const s12 = 48.0;
  static const s14 = 56.0;
  static const s16 = 64.0;
  static const s20 = 80.0;
  static const s24 = 96.0;
  static const s28 = 112.0;
}

abstract final class VitruvLayout {
  static const contentMax = 1240.0;
  static const measureNarrow = 540.0;
  static const measure = 680.0;
  static const measureDisplay = 820.0;
  static const gutterMin = 20.0;
  static const gutterMax = 44.0;
  static const sectionMin = 72.0;
  static const sectionMax = 110.0;
  static const tapTarget = 48.0;
  static const breakpointSm = 480.0;
  static const breakpointMd = 820.0;
  static const breakpointLg = 1240.0;
  static const breakpointXl = 1440.0;
  static const breakpointXxl = 1920.0;
}

abstract final class VitruvShape {
  static const chamferXs = 7.0;
  static const chamferSm = 12.0;
  static const chamferMd = 14.0;
  static const chamferLg = 16.0;
  static const radiusXs = 2.0;
  static const radiusSm = 4.0;
  static const radiusMd = 12.0;
  static const radiusLg = 22.0;
  static const radiusXl = 28.0;
  static const radiusPill = 999.0;
  static const borderHairline = 1.0;
  static const borderStrong = 1.5;
  static const borderFocus = 2.0;
  static const focusOffset = 3.0;
}

abstract final class VitruvEffects {
  static const glow = <BoxShadow>[
    BoxShadow(color: Color(0x59468CFF), offset: Offset(0.0, 0.0), blurRadius: 24.0, spreadRadius: 0.0),
    BoxShadow(color: Color(0xCCA0CDFF), offset: Offset(0.0, 0.0), blurRadius: 2.0, spreadRadius: 0.0),
  ];
  static const glowStrong = <BoxShadow>[
    BoxShadow(color: Color(0x525B9DFF), offset: Offset(0.0, 0.0), blurRadius: 72.0, spreadRadius: 0.0),
  ];
  static const glowSoft = <BoxShadow>[
    BoxShadow(color: Color(0x245B9DFF), offset: Offset(0.0, 0.0), blurRadius: 38.0, spreadRadius: 0.0),
  ];
  static const backdropBlur = 14.0;
}

abstract final class VitruvMotion {
  static const micro = Duration(milliseconds: 200);
  static const short = Duration(milliseconds: 400);
  static const base = Duration(milliseconds: 600);
  static const long = Duration(milliseconds: 900);
  static const easeOut = Cubic(0.22, 1.0, 0.36, 1.0);
  static const easeInOut = Cubic(0.45, 0.0, 0.2, 1.0);
  static const maxFlashesPerSecond = 3;
}
