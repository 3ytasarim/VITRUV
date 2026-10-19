import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_token_types.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import 'chamfer.dart';
import 'pressable.dart';

enum VitruvCardTone {
  /// Dark surface + hairline.
  standard,

  /// Transparent with a visible border.
  outline,

  /// Darker nested surface.
  sunken,

  /// Blue border — active / featured / recommended.
  accent,
}

enum VitruvCardPadding {
  none(0),
  sm(VitruvSpace.s4),
  md(VitruvSpace.s6),
  lg(VitruvSpace.s8);

  const VitruvCardPadding(this.value);
  final double value;
}

/// The VITRUV card surface. Compose any content inside (today's workout, coach message,
/// training day, progress summary, document, settings row …) — the card knows nothing about it.
///
/// Use [VitruvCard.tappable] when the whole card is one action (one focus/tap target with a
/// semantic label); keep its content non-interactive.
class VitruvCard extends StatelessWidget {
  const VitruvCard({
    super.key,
    required this.child,
    this.tone = VitruvCardTone.standard,
    this.cut = ChamferCut.md,
    this.padding = VitruvCardPadding.md,
    this.glow = false,
  }) : onTap = null,
       semanticLabel = null,
       previewState = null;

  const VitruvCard.tappable({
    super.key,
    required this.child,
    required VoidCallback this.onTap,
    required String this.semanticLabel,
    this.tone = VitruvCardTone.standard,
    this.cut = ChamferCut.md,
    this.padding = VitruvCardPadding.md,
    this.glow = false,
    this.previewState,
  });

  final Widget child;
  final VitruvCardTone tone;
  final ChamferCut cut;
  final VitruvCardPadding padding;

  /// Soft glow (strong for accent cards). Reserve for one featured item per screen.
  final bool glow;
  final VoidCallback? onTap;
  final String? semanticLabel;

  /// Design gallery only.
  final VitruvInteraction? previewState;

  @override
  Widget build(BuildContext context) {
    final c = VitruvTheme.of(context);
    if (onTap == null) return _surface(c, const {});

    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    return VitruvPressable(
      onTap: onTap,
      semanticLabel: semanticLabel,
      previewState: previewState,
      builder: (context, states) => ChamferFocusRing(
        visible: states.contains(VitruvInteraction.focused),
        cut: cut,
        color: c.focusRing,
        child: AnimatedScale(
          scale: states.contains(VitruvInteraction.pressed) && !reduceMotion
              ? 0.99
              : 1,
          duration: reduceMotion ? Duration.zero : VitruvMotion.micro,
          curve: VitruvMotion.easeOut,
          child: _surface(c, states),
        ),
      ),
    );
  }

  Widget _surface(VitruvColorScheme c, Set<VitruvInteraction> states) {
    final active =
        states.contains(VitruvInteraction.hovered) ||
        states.contains(VitruvInteraction.pressed);
    final Color borderColor = switch (tone) {
      VitruvCardTone.accent => active ? c.accentHover : c.accent,
      VitruvCardTone.outline => active ? c.borderStrong : c.border,
      _ => active ? c.borderStrong : c.borderSubtle,
    };
    return ChamferBox(
      cut: cut,
      fill: switch (tone) {
        VitruvCardTone.outline => null,
        VitruvCardTone.sunken => c.surfaceSunken,
        _ => c.surface,
      },
      border: BorderSide(
        color: borderColor,
        width: tone == VitruvCardTone.accent
            ? VitruvShape.borderStrong
            : VitruvShape.borderHairline,
      ),
      glow: glow
          ? (tone == VitruvCardTone.accent
                ? VitruvEffects.glowStrong
                : VitruvEffects.glowSoft)
          : const [],
      padding: EdgeInsets.all(padding.value),
      child: child,
    );
  }
}
