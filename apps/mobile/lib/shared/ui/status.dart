import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_token_types.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import 'chamfer.dart';
import 'typography.dart';

enum VitruvTone { neutral, accent, success, warning, error }

Color _toneColor(VitruvColorScheme c, VitruvTone tone) => switch (tone) {
  VitruvTone.neutral => c.fgMuted,
  VitruvTone.accent => c.accentText,
  VitruvTone.success => c.success,
  VitruvTone.warning => c.warning,
  VitruvTone.error => c.error,
};

/// Short status tag ("AKTIV", "6 WOCHEN"). Always carries text — colour is never the only
/// signal; the optional dot is decorative.
class VitruvBadge extends StatelessWidget {
  const VitruvBadge(
    this.label, {
    super.key,
    this.tone = VitruvTone.neutral,
    this.dot = false,
  });

  final String label;
  final VitruvTone tone;
  final bool dot;

  @override
  Widget build(BuildContext context) {
    final c = VitruvTheme.of(context);
    final color = _toneColor(c, tone);
    return ChamferBox(
      cut: ChamferCut.xs,
      fill: c.surfaceSunken,
      border: BorderSide(color: color, width: VitruvShape.borderHairline),
      padding: const EdgeInsets.symmetric(
        horizontal: VitruvSpace.s3,
        vertical: VitruvSpace.s1,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            ExcludeSemantics(
              child: DecoratedBox(
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                child: const SizedBox.square(dimension: VitruvSpace.s2),
              ),
            ),
            const SizedBox(width: VitruvSpace.s2),
          ],
          Flexible(child: MetaLabel(label, color: color)),
        ],
      ),
    );
  }
}

/// Inline metadata ("WOCHE 03 · 45 MIN · KRAFT"); separators are hidden from screen readers.
class VitruvMetaRow extends StatelessWidget {
  const VitruvMetaRow(this.items, {super.key});

  final List<String> items;

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[];
    for (var i = 0; i < items.length; i++) {
      if (i > 0) children.add(const ExcludeSemantics(child: MetaLabel('·')));
      children.add(MetaLabel(items[i]));
    }
    return Wrap(
      spacing: VitruvSpace.s2,
      runSpacing: VitruvSpace.s1,
      children: children,
    );
  }
}

/// Compact progress bar with a visible text value ("3 / 4 Einheiten") — the bar alone never
/// carries the information. Screen readers get "label, valueText".
class VitruvProgress extends StatelessWidget {
  const VitruvProgress({
    super.key,
    required this.value,
    required this.label,
    required this.valueText,
  }) : assert(value >= 0 && value <= 1);

  /// 0..1
  final double value;
  final String label;
  final String valueText;

  @override
  Widget build(BuildContext context) {
    final c = VitruvTheme.of(context);
    return Semantics(
      label: label,
      value: valueText,
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Wraps instead of overflowing when the value text is long (small phones, 200 % text).
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: VitruvSpace.s3,
            runSpacing: VitruvSpace.s1,
            children: [
              MetaLabel(label),
              MetaLabel(valueText, color: c.fg),
            ],
          ),
          const SizedBox(height: VitruvSpace.s2),
          SizedBox(
            height: VitruvSpace.s1,
            child: DecoratedBox(
              decoration: BoxDecoration(color: c.border),
              child: FractionallySizedBox(
                alignment: Alignment.centerLeft,
                widthFactor: value,
                child: ColoredBox(color: c.accent),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
