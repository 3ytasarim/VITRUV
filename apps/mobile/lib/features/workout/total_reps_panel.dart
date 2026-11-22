import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/ui/ui.dart';
import 'workout_models.dart';

/// −  [ reps ]  +  — the reps a set actually had (typed or stepped). Shared by Strength sets and
/// the Total reps target.
class RepsStepper extends StatelessWidget {
  const RepsStepper({
    super.key,
    required this.controller,
    required this.label,
    this.errorText,
    this.enabled = true,
  });

  static const maxReps = 9999;

  final TextEditingController controller;
  final String label;
  final String? errorText;
  final bool enabled;

  void _step(int delta) {
    final current = int.tryParse(controller.text.trim()) ?? 0;
    controller.text = '${(current + delta).clamp(0, maxReps)}';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    const tap = BoxConstraints(
      minWidth: VitruvSpace.s12,
      minHeight: VitruvSpace.s12,
    );
    return Row(
      children: [
        IconButton(
          tooltip: l10n.repsDecrease,
          constraints: tap,
          icon: const Icon(Icons.remove),
          onPressed: enabled ? () => _step(-1) : null,
        ),
        const SizedBox(width: VitruvSpace.s2),
        Expanded(
          child: TextField(
            controller: controller,
            enabled: enabled,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(4),
            ],
            style: theme.textTheme.headlineSmall,
            decoration: InputDecoration(labelText: label, errorText: errorText),
          ),
        ),
        const SizedBox(width: VitruvSpace.s2),
        IconButton(
          tooltip: l10n.repsIncrease,
          constraints: tap,
          icon: const Icon(Icons.add),
          onPressed: enabled ? () => _step(1) : null,
        ),
      ],
    );
  }
}

/// Gesamt-Wiederholungsziel (e.g. 60 Klimmzüge): unlimited sets until the target is reached.
///
/// Shows target / done / open, the progress, every recorded set and — while the target is open —
/// the current set with "Satz speichern". The numbers come from the server's answer (the API is
/// the source of truth); a set appears only after it was stored.
class TotalRepsPanel extends StatelessWidget {
  const TotalRepsPanel({
    super.key,
    required this.exercise,
    required this.controller,
    required this.saving,
    required this.repsMissing,
    required this.onSave,
  });

  final WorkoutExercise exercise;
  final TextEditingController controller;

  /// A set is being sent — the button is disabled (no double submit).
  final bool saving;
  final bool repsMissing;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final progress = exercise.totalProgress!;
    final reached = progress.reached;
    final open = exercise.status == ExerciseStatus.pending && !reached;
    final recorded = [...exercise.sets]
      ..sort((a, b) => a.setNumber.compareTo(b.setNumber));

    Widget stat(String label, int value, {bool emphasis = false}) => Expanded(
      child: Semantics(
        container: true,
        label: '$label: $value',
        excludeSemantics: true,
        child: Column(
          children: [
            Text(
              '$value',
              style: theme.textTheme.headlineSmall?.copyWith(
                color: emphasis ? c.accentText : c.fg,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            Text(
              label,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(color: c.fgMuted),
            ),
          ],
        ),
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        VitruvCard(
          tone: reached ? VitruvCardTone.accent : VitruvCardTone.standard,
          padding: VitruvCardPadding.sm,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  stat(l10n.totalGoal, progress.target),
                  stat(l10n.totalDone, progress.done),
                  stat(l10n.totalOpen, progress.remaining, emphasis: true),
                ],
              ),
              const SizedBox(height: VitruvSpace.s3),
              VitruvProgress(
                value: progress.target == 0
                    ? 1
                    : (progress.done / progress.target).clamp(0.0, 1.0),
                label: l10n.totalGoal,
                valueText: l10n.totalProgressValue(
                  progress.done,
                  progress.target,
                ),
              ),
              if (reached) ...[
                const SizedBox(height: VitruvSpace.s3),
                Row(
                  children: [
                    Icon(Icons.emoji_events_outlined, color: c.success),
                    const SizedBox(width: VitruvSpace.s2),
                    Expanded(
                      child: Text(
                        l10n.totalGoalReached,
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: c.success,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        for (final set in recorded) ...[
          const SizedBox(height: VitruvSpace.s2),
          Semantics(
            container: true,
            label: l10n.historySetResultPlain(
              set.setNumber,
              set.actualReps ?? 0,
            ),
            excludeSemantics: true,
            child: VitruvCard(
              tone: VitruvCardTone.sunken,
              padding: VitruvCardPadding.sm,
              child: Row(
                children: [
                  Icon(Icons.check_circle, color: c.success),
                  const SizedBox(width: VitruvSpace.s3),
                  Expanded(
                    child: Text(
                      l10n.historySetResultPlain(
                        set.setNumber,
                        set.actualReps ?? 0,
                      ),
                      style: theme.textTheme.titleMedium,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
        if (open) ...[
          const SizedBox(height: VitruvSpace.s3),
          VitruvCard(
            tone: VitruvCardTone.outline,
            padding: VitruvCardPadding.sm,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  l10n.totalCurrentSet(progress.setCount + 1),
                  style: theme.textTheme.titleMedium,
                ),
                const SizedBox(height: VitruvSpace.s3),
                RepsStepper(
                  controller: controller,
                  label: l10n.totalRepsInput,
                  enabled: !saving,
                  errorText: repsMissing ? l10n.totalRepsRange : null,
                ),
                const SizedBox(height: VitruvSpace.s3),
                VitruvButton(
                  label: saving ? l10n.totalSaving : l10n.totalSaveSet,
                  leadingIcon: Icons.check,
                  fullWidth: true,
                  onPressed: saving ? null : onSave,
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
