import 'package:flutter/painting.dart';

import 'vitruv_tokens.g.dart';

/// Corner cut sizes — map 1:1 to the `--chamfer-*` / `VitruvShape.chamfer*` design tokens.
enum ChamferCut {
  xs(VitruvShape.chamferXs),
  sm(VitruvShape.chamferSm),
  md(VitruvShape.chamferMd),
  lg(VitruvShape.chamferLg);

  const ChamferCut(this.size);

  /// Cut length along each edge, in logical pixels.
  final double size;
}

/// The VITRUV chamfer: top-left + bottom-right cut corners. The single shape definition used by
/// the Material theme and every VITRUV widget.
///
/// Flutter-native: a [BeveledRectangleBorder] that only bevels two corners. Unlike the web (which
/// needs pseudo-element layers), a [ShapeDecoration] strokes the border along the real outline —
/// including the 45° diagonal — and its shadows follow the same silhouette.
OutlinedBorder chamferBorder(
  ChamferCut cut, {
  BorderSide side = BorderSide.none,
}) => BeveledRectangleBorder(
  side: side,
  borderRadius: BorderRadius.only(
    topLeft: Radius.circular(cut.size),
    bottomRight: Radius.circular(cut.size),
  ),
);
