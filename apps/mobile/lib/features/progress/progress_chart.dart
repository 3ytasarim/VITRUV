import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import 'history_models.dart';

/// The VoiceOver text of a progress series ("4 Trainings. Erster Wert 27, …") or null when
/// there are not enough points for a chart (fewer than 2 — a single point is no trend).
String? progressSummary(AppLocalizations l10n, ExerciseProgress progress) {
  final values = [for (final p in progress.points) p.value];
  if (values.length < 2) return null;
  return l10n.progressChartSummary(
    values.length,
    values.first,
    values.last,
    values.reduce(math.max),
    progress.kind == ResultKind.rounds
        ? l10n.progressUnitRounds
        : l10n.progressUnitReps,
  );
}

/// A small line chart of RECORDED values only (oldest → newest; no interpolated or invented
/// points). No chart package: one CustomPainter, colours from the theme tokens. The drawing is
/// excluded from semantics; the text summary is what VoiceOver reads.
class ProgressChart extends StatelessWidget {
  const ProgressChart({super.key, required this.progress});

  final ExerciseProgress progress;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final c = VitruvTheme.of(context);
    final theme = Theme.of(context);
    final summary = progressSummary(l10n, progress);
    if (summary == null) {
      return Text(
        l10n.progressChartEmpty,
        style: theme.textTheme.bodyMedium?.copyWith(color: c.fgMuted),
      );
    }
    final values = [for (final p in progress.points) p.value];
    return Semantics(
      container: true,
      label: summary,
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: VitruvSpace.s28,
            child: CustomPaint(
              painter: _LinePainter(
                values: values,
                line: c.accent,
                grid: c.borderSubtle,
              ),
            ),
          ),
          const SizedBox(height: VitruvSpace.s2),
          Text(summary, style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _LinePainter extends CustomPainter {
  _LinePainter({required this.values, required this.line, required this.grid});

  final List<int> values;
  final Color line;
  final Color grid;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2 || size.isEmpty) return;
    final low = values.reduce(math.min).toDouble();
    final high = values.reduce(math.max).toDouble();
    final span = high - low == 0 ? 1.0 : high - low;
    const inset = VitruvSpace.s2;
    final width = size.width - inset * 2;
    final height = size.height - inset * 2;
    Offset at(int i) => Offset(
      inset + width * i / (values.length - 1),
      inset + height - height * (values[i] - low) / span,
    );
    final gridPaint = Paint()
      ..color = grid
      ..strokeWidth = 1;
    canvas
      ..drawLine(
        Offset(inset, inset + height),
        Offset(inset + width, inset + height),
        gridPaint,
      )
      ..drawLine(
        const Offset(inset, inset),
        Offset(inset + width, inset),
        gridPaint,
      );
    final path = Path()..moveTo(at(0).dx, at(0).dy);
    for (var i = 1; i < values.length; i++) {
      path.lineTo(at(i).dx, at(i).dy);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = line
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke,
    );
    final dot = Paint()..color = line;
    for (var i = 0; i < values.length; i++) {
      canvas.drawCircle(at(i), 3, dot);
    }
  }

  @override
  bool shouldRepaint(_LinePainter old) =>
      old.values != values || old.line != line || old.grid != grid;
}
