import 'package:flutter/material.dart';

/// The owner's VITRUV logo (mark + wordmark) — the byte-identical website asset
/// (`apps/web/public/brand/vitruv-logo-v2.png`, 704 × 400, black on transparent).
///
/// Never redrawn or recoloured. Exactly like the website (`--vt-logo-filter: invert(1)` on dark
/// themes, apps/web/src/lib/theme.ts) the only allowed treatment is inverting it to light on a
/// dark background; the aspect ratio is always kept.
class VitruvLogo extends StatelessWidget {
  const VitruvLogo({
    super.key,
    this.height = 64,
    this.semanticLabel = 'VITRUV',
  });

  static const asset = 'assets/brand/vitruv-logo.png';

  /// Width / height of the source file.
  static const aspectRatio = 704 / 400;

  final double height;
  final String semanticLabel;

  // Colour inversion (the website's `invert(1)`), not a colour value.
  static const _invert = ColorFilter.matrix(<double>[
    -1, 0, 0, 0, 255, //
    0, -1, 0, 0, 255, //
    0, 0, -1, 0, 255, //
    0, 0, 0, 1, 0, //
  ]);

  @override
  Widget build(BuildContext context) {
    final image = Image.asset(
      asset,
      height: height,
      width: height * aspectRatio,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.medium,
      semanticLabel: semanticLabel,
    );
    final dark = Theme.of(context).brightness == Brightness.dark;
    return dark ? ColorFiltered(colorFilter: _invert, child: image) : image;
  }
}
