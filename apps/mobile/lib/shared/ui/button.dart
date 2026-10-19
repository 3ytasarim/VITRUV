import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_token_types.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import 'chamfer.dart';
import 'pressable.dart';

enum VitruvButtonVariant {
  /// The one high-priority action: blue fill + soft glow.
  primary,

  /// Outline, no glow.
  secondary,

  /// Low-emphasis text action.
  ghost,
}

enum VitruvButtonSize {
  /// 48 dp — the minimum touch target.
  md(VitruvLayout.tapTarget),

  /// 56 dp — hero-level calls to action.
  lg(VitruvSpace.s14);

  const VitruvButtonSize(this.minHeight);
  final double minHeight;
}

/// VITRUV button — visual parity with the web `Button` (chamfer, uppercase condensed label,
/// variant colours, focus ring, glow only for primary).
///
/// * `onPressed == null` → disabled (semantics: disabled).
/// * `loading` → keeps the variant colours (busy ≠ unavailable), blocks taps, keeps its size,
///   and reports "busy" to screen readers via [busyLabel].
class VitruvButton extends StatelessWidget {
  const VitruvButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = VitruvButtonVariant.primary,
    this.size = VitruvButtonSize.md,
    this.leadingIcon,
    this.trailingIcon,
    this.loading = false,
    this.fullWidth = false,
    this.semanticLabel,
    this.busyLabel = 'Lädt',
    this.previewState,
  });

  final String label;
  final VoidCallback? onPressed;
  final VitruvButtonVariant variant;
  final VitruvButtonSize size;
  final IconData? leadingIcon;
  final IconData? trailingIcon;
  final bool loading;
  final bool fullWidth;

  /// Overrides the spoken label (e.g. when the visible label is ambiguous out of context).
  final String? semanticLabel;

  /// Spoken while [loading]; pass a localized string from the screen.
  final String busyLabel;

  /// Design gallery only.
  final VitruvInteraction? previewState;

  @override
  Widget build(BuildContext context) {
    final c = VitruvTheme.of(context);
    final disabled = onPressed == null && !loading;
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    // Icons and the spinner grow with the system text size, like the label.
    final iconSize = MediaQuery.textScalerOf(context).scale(VitruvSpace.s4);

    return VitruvPressable(
      onTap: loading ? null : onPressed,
      semanticLabel: semanticLabel ?? label,
      semanticValue: loading ? busyLabel : null,
      previewState: previewState,
      builder: (context, states) {
        final pressed = states.contains(VitruvInteraction.pressed);
        final hovered = states.contains(VitruvInteraction.hovered);
        final focused = states.contains(VitruvInteraction.focused);
        final style = _VariantStyle.resolve(
          c,
          variant,
          disabled: disabled,
          emphasised: (pressed || hovered) && !loading,
        );

        final text = Text(
          VitruvType.button.apply(label),
          textAlign: TextAlign.center,
          style: VitruvType.button.style(color: style.foreground),
        );
        final content = Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (leadingIcon != null) ...[
              Icon(leadingIcon, size: iconSize, color: style.foreground),
              const SizedBox(width: VitruvSpace.s2),
            ],
            Flexible(child: text),
            if (trailingIcon != null) ...[
              const SizedBox(width: VitruvSpace.s2),
              Icon(trailingIcon, size: iconSize, color: style.foreground),
            ],
          ],
        );

        final body = AnimatedContainer(
          duration: reduceMotion ? Duration.zero : VitruvMotion.micro,
          curve: VitruvMotion.easeOut,
          constraints: BoxConstraints(
            minHeight: size.minHeight,
            minWidth: VitruvLayout.tapTarget,
          ),
          padding: EdgeInsets.symmetric(
            horizontal: size == VitruvButtonSize.lg
                ? VitruvSpace.s8
                : VitruvSpace.s6,
            vertical: VitruvSpace.s3,
          ),
          transform: pressed && !reduceMotion
              ? Matrix4.translationValues(0, VitruvShape.borderHairline, 0)
              : null,
          decoration: ShapeDecoration(
            color: style.fill,
            shape: chamferBorder(ChamferCut.sm, side: style.border),
            shadows: style.glow,
          ),
          // Only full-width buttons stretch; a centred Container would otherwise grow to fill
          // all available space.
          alignment: fullWidth ? Alignment.center : null,
          child: loading
              ? Stack(
                  alignment: Alignment.center,
                  children: [
                    // Keeps the exact size of the idle button (no jump while loading).
                    Opacity(opacity: 0, child: content),
                    SizedBox.square(
                      dimension: iconSize,
                      child: CircularProgressIndicator(
                        strokeWidth: VitruvShape.borderFocus,
                        color: style.foreground,
                      ),
                    ),
                  ],
                )
              : content,
        );

        return ChamferFocusRing(
          visible: focused,
          cut: ChamferCut.sm,
          color: c.focusRing,
          child: fullWidth
              ? SizedBox(width: double.infinity, child: body)
              : body,
        );
      },
    );
  }
}

class _VariantStyle {
  const _VariantStyle({
    required this.fill,
    required this.foreground,
    this.border = BorderSide.none,
    this.glow = const [],
  });

  final Color? fill;
  final Color foreground;
  final BorderSide border;
  final List<BoxShadow> glow;

  static _VariantStyle resolve(
    VitruvColorScheme c,
    VitruvButtonVariant variant, {
    required bool disabled,
    required bool emphasised,
  }) {
    if (disabled) {
      return _VariantStyle(
        fill: variant == VitruvButtonVariant.ghost ? null : c.surface,
        foreground: c.fgDisabled,
        border: variant == VitruvButtonVariant.secondary
            ? BorderSide(color: c.borderSubtle, width: VitruvShape.borderStrong)
            : BorderSide.none,
      );
    }
    return switch (variant) {
      VitruvButtonVariant.primary => _VariantStyle(
        fill: emphasised ? c.accentHover : c.accent,
        foreground: c.onAccent,
        glow: emphasised ? VitruvEffects.glow : VitruvEffects.glowSoft,
      ),
      VitruvButtonVariant.secondary => _VariantStyle(
        fill: emphasised ? c.surfaceHover : null,
        foreground: c.fg,
        border: BorderSide(
          color: emphasised ? c.fg : c.borderStrong,
          width: VitruvShape.borderStrong,
        ),
      ),
      VitruvButtonVariant.ghost => _VariantStyle(
        fill: emphasised ? c.surfaceHover : null,
        foreground: emphasised ? c.fg : c.accentText,
      ),
    };
  }
}
