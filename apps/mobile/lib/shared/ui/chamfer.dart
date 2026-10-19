import 'package:flutter/widgets.dart';

import '../../core/theme/chamfer_shape.dart';
import '../../core/theme/vitruv_tokens.g.dart';

export '../../core/theme/chamfer_shape.dart';

/// Static chamfered surface: fill, optional border, optional glow. The low-level building block
/// for cards, badges and media frames.
class ChamferBox extends StatelessWidget {
  const ChamferBox({
    super.key,
    this.cut = ChamferCut.md,
    this.fill,
    this.border,
    this.glow = const [],
    this.padding = EdgeInsets.zero,
    this.child,
  });

  final ChamferCut cut;
  final Color? fill;
  final BorderSide? border;

  /// Token shadows (e.g. [VitruvEffects.glowSoft]). Keep empty in long lists — see performance notes.
  final List<BoxShadow> glow;
  final EdgeInsetsGeometry padding;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: ShapeDecoration(
        color: fill,
        shape: chamferBorder(cut, side: border ?? BorderSide.none),
        shadows: glow,
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

/// Paints a chamfered focus ring *outside* its child without affecting layout (the ring may
/// overflow the child's bounds). Mirrors the web's 2 px `focus-ring` with a 3 px offset.
class ChamferFocusRing extends StatelessWidget {
  const ChamferFocusRing({
    super.key,
    required this.visible,
    required this.cut,
    required this.color,
    required this.child,
  });

  final bool visible;
  final ChamferCut cut;
  final Color color;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      foregroundPainter: visible
          ? _FocusRingPainter(cut: cut, color: color)
          : null,
      child: child,
    );
  }
}

class _FocusRingPainter extends CustomPainter {
  _FocusRingPainter({required this.cut, required this.color});

  final ChamferCut cut;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const inset = -(VitruvShape.focusOffset + VitruvShape.borderFocus / 2);
    final rect = (Offset.zero & size).deflate(inset);
    // Outsetting a 45° chamfer by d grows its cut by d·(2 − √2), keeping the ring's diagonal
    // parallel to the shape's own (the inverse of the web's inner-cut formula).
    const growth =
        (VitruvShape.focusOffset + VitruvShape.borderFocus / 2) * 0.5858;
    final path = BeveledRectangleBorder(
      borderRadius: BorderRadius.only(
        topLeft: Radius.circular(cut.size + growth),
        bottomRight: Radius.circular(cut.size + growth),
      ),
    ).getOuterPath(rect);
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = VitruvShape.borderFocus
        ..color = color,
    );
  }

  @override
  bool shouldRepaint(_FocusRingPainter old) =>
      old.cut != cut || old.color != color;
}
