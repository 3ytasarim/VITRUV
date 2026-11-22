import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/format/training_format.dart';
import '../../shared/ui/ui.dart';
import '../../shared/widgets/async_value_view.dart';
import '../../shared/widgets/content_page.dart';
import '../workout/workout_controller.dart';
import '../workout/workout_models.dart';

/// History detail (Sprint 5): one finished session from `GET /v1/client/workouts/:id` — every
/// exercise with the reps actually recorded per set (read-only, the session snapshot).
class WorkoutDetailScreen extends ConsumerWidget {
  const WorkoutDetailScreen({required this.sessionId, super.key});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final detail = ref.watch(workoutDetailProvider(sessionId));
    return Scaffold(
      appBar: AppBar(title: Text(l10n.historyDetailTitle)),
      body: ContentPage(
        onRefresh: () async => ref.invalidate(workoutDetailProvider(sessionId)),
        children: [
          AsyncValueView(
            value: detail,
            onRetry: () => ref.invalidate(workoutDetailProvider(sessionId)),
            data: (session) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionTitle(session.dayTitle, size: SectionTitleSize.h2),
                const SizedBox(height: VitruvSpace.s4),
                for (final exercise in session.exercises) ...[
                  _ExerciseResult(exercise: exercise),
                  const SizedBox(height: VitruvSpace.s3),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ExerciseResult extends StatelessWidget {
  const _ExerciseResult({required this.exercise});

  final WorkoutExercise exercise;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final format = TrainingFormat(l10n);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final target = format.target(exercise.target);
    final lines = [
      if (exercise.mode == ExecutionMode.setsReps)
        for (final set in exercise.sets) setResult(l10n, exercise, set)
      else if (exercise.status == ExerciseStatus.completed &&
          exercise.actualReps != null)
        l10n.rxReps(exercise.actualReps!)
      else if (exercise.status == ExerciseStatus.completed &&
          exercise.actualDurationSeconds != null)
        format.duration(exercise.actualDurationSeconds!),
    ];
    final (status, tone) = switch (exercise.status) {
      ExerciseStatus.completed => (l10n.statusCompleted, VitruvTone.success),
      ExerciseStatus.skipped => (l10n.exerciseSkipped, VitruvTone.neutral),
      ExerciseStatus.pending => (l10n.historyExerciseOpen, VitruvTone.neutral),
    };
    return VitruvCard(
      padding: VitruvCardPadding.sm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: VitruvSpace.s2,
            runSpacing: VitruvSpace.s1,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(exercise.name, style: theme.textTheme.titleMedium),
              VitruvBadge(status, tone: tone, dot: true),
            ],
          ),
          if (target.isNotEmpty) ...[
            const SizedBox(height: VitruvSpace.s1),
            Text(
              target,
              style: theme.textTheme.bodySmall?.copyWith(color: c.fgMuted),
            ),
          ],
          for (final line in lines) ...[
            const SizedBox(height: VitruvSpace.s1),
            Text(line, style: theme.textTheme.bodyMedium),
          ],
        ],
      ),
    );
  }
}

/// "Satz 1: 10 von 12 Wdh." / "Satz 1: 17 Wdh. (MAX)" / "Satz 3: nicht erledigt".
String setResult(
  AppLocalizations l10n,
  WorkoutExercise exercise,
  WorkoutSet set,
) {
  final n = set.setNumber;
  final actual = set.actualReps;
  if (!set.completed) return l10n.historySetOpen(n);
  if (actual == null) return l10n.historySetDone(n);
  if (exercise.target.repsMax) return l10n.historySetResultMax(n, actual);
  final target = set.targetReps;
  return target == null
      ? l10n.historySetResultPlain(n, actual)
      : l10n.historySetResult(n, actual, target);
}
