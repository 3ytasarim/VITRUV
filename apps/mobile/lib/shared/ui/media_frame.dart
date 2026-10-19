import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import 'chamfer.dart';
import 'typography.dart';

/// Supported aspect ratios (same set as the web `MediaFrame`).
enum VitruvAspect {
  ultraWide(21 / 9),
  landscape(16 / 9),
  photo(3 / 2),
  classic(4 / 3),
  square(1),
  portrait(4 / 5),
  tall(3 / 4),
  story(9 / 16);

  const VitruvAspect(this.ratio);
  final double ratio;
}

/// Fixed-ratio frame for exercise videos, coach media, document covers and progress photos.
///
/// The box size depends only on the available width and [aspect], never on the media, so lists
/// do not jump while images load. Media is clipped to the chamfer (anti-aliased); the border is
/// painted on top so it is never covered. Pass the media widget as [child] (e.g. an `Image` with
/// `fit: BoxFit.cover`); without a child a neutral placeholder is shown.
class VitruvMediaFrame extends StatelessWidget {
  const VitruvMediaFrame({
    super.key,
    this.aspect = VitruvAspect.landscape,
    this.cut = ChamferCut.lg,
    this.child,
    this.placeholderLabel = 'Medium folgt',
    this.semanticLabel,
  });

  final VitruvAspect aspect;
  final ChamferCut cut;
  final Widget? child;
  final String placeholderLabel;

  /// Description of the media for screen readers; `null` treats it as decorative.
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = VitruvTheme.of(context);
    final shape = chamferBorder(cut);
    final media =
        child ??
        Center(
          // Small frames + large text scale: shrink the placeholder rather than overflow.
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Padding(
              padding: const EdgeInsets.all(VitruvSpace.s3),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.image_outlined,
                    size: VitruvSpace.s6,
                    color: c.fgSubtle,
                  ),
                  const SizedBox(height: VitruvSpace.s2),
                  MetaLabel(placeholderLabel),
                ],
              ),
            ),
          ),
        );

    return Semantics(
      image: semanticLabel != null,
      label: semanticLabel,
      excludeSemantics: semanticLabel != null,
      child: AspectRatio(
        aspectRatio: aspect.ratio,
        child: DecoratedBox(
          position: DecorationPosition.foreground,
          decoration: ShapeDecoration(
            shape: chamferBorder(
              cut,
              side: BorderSide(
                color: c.borderSubtle,
                width: VitruvShape.borderHairline,
              ),
            ),
          ),
          child: ClipPath(
            clipper: ShapeBorderClipper(shape: shape),
            child: ColoredBox(
              color: c.surface,
              child: SizedBox.expand(child: media),
            ),
          ),
        ),
      ),
    );
  }
}
