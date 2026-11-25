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
import 'history_models.dart';
import 'progress_chart.dart';

/// History detail (Sprint 5, extended in Sprint 7): one session from
/// `GET /v1/client/workouts/:id` — every exercise with the values actually recorded (read-only,
/// the session snapshot), the comparison with the previous comparable workout and, per scored
/// exercise, a progress chart on demand.
class WorkoutDetailScreen extends ConsumerWidget {
  const WorkoutDetailScreen({required this.sessionId, super.key});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final detail = ref.watch(workoutDetailProvider(sessionId));
    // The comparison is an addition: while it loads or if it fails the results stay visible.
    final comparison = ref.watch(workoutComparisonProvider(sessionId)).value;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.historyDetailTitle)),
      body: ContentPage(
        onRefresh: () async {
          ref
            ..invalidate(workoutDetailProvider(sessionId))
            ..invalidate(workoutComparisonProvider(sessionId));
        },
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
                  ExerciseResultCard(
                    exercise: exercise,
                    comparison: comparison?.forExercise(exercise.id),
                  ),
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

/// The recorded result lines of one exercise (pure — no fake values: an unrecorded value is
/// "nicht erledigt", never 0). Warm-up: completion only (the badge), no reps.
List<String> resultLines(
  AppLocalizations l10n,
  TrainingFormat format,
  WorkoutExercise exercise,
) {
  switch (exercise.mode) {
    case ExecutionMode.setsReps:
      final recorded = [
        for (final s in exercise.sets)
          if (s.completed && s.actualReps != null) s.actualReps!,
      ];
      return [
        for (final set in exercise.sets) setResult(l10n, exercise, set),
        if (recorded.isNotEmpty)
          l10n.historyTotalReps(recorded.reduce((a, b) => a + b)),
      ];
    case ExecutionMode.totalReps:
      final total = exercise.totalProgress;
      if (total == null) return const [];
      final sets = [...exercise.sets]
        ..sort((a, b) => a.setNumber.compareTo(b.setNumber));
      if (sets.isEmpty && exercise.actualReps == null) {
        return [l10n.historyTotalGoal(total.target)];
      }
      return [
        l10n.historyTotalGoal(total.target),
        l10n.historyTotalDone(total.done),
        l10n.historyTotalSetsNeeded(sets.isEmpty ? 1 : sets.length),
        for (final set in sets)
          set.actualReps == null
              ? l10n.historySetOpen(set.setNumber)
              : l10n.historySetResultPlain(set.setNumber, set.actualReps!),
      ];
    case ExecutionMode.interval:
      final config = exercise.intervalConfig;
      final done = exercise.sets.where((s) => s.completed).length;
      return [
        if (config != null)
          l10n.historyCoreConfig(
            config.rounds,
            config.workSeconds,
            config.restSeconds,
          ),
        if (config != null && exercise.sets.isNotEmpty)
          l10n.historyCoreDone(done, config.rounds),
        for (final set in exercise.sets)
          set.completed
              ? l10n.historyRoundResult(
                  set.setNumber,
                  set.actualDurationSeconds ?? set.targetDurationSeconds ?? 0,
                )
              : l10n.historyRoundOpen(set.setNumber),
      ];
    case ExecutionMode.checklist:
      return [
        if (exercise.status == ExerciseStatus.completed) l10n.historyWarmupDone,
      ];
    case ExecutionMode.duration:
    case ExecutionMode.custom:
      return [
        if (exercise.status == ExerciseStatus.completed &&
            exercise.actualReps != null)
          l10n.rxReps(exercise.actualReps!)
        else if (exercise.status == ExerciseStatus.completed &&
            exercise.actualDurationSeconds != null)
          format.duration(exercise.actualDurationSeconds!),
      ];
  }
}

/// "+3" / "−2" / "±0".
String signed(int value) => value > 0
    ? '+$value'
    : value < 0
    ? '−${value.abs()}'
    : '±0';

/// The comparison lines (previous → current). Empty for exercises without a score (Warm-up).
List<String> comparisonLines(
  AppLocalizations l10n,
  MaterialLocalizations material,
  ExerciseComparison comparison,
) {
  final current = comparison.current.result;
  if (current.kind == ResultKind.none) return const [];
  final previous = comparison.previous;
  if (previous == null) return [l10n.compareNoData];
  final before = previous.result;
  String v(int? value) => value?.toString() ?? l10n.compareNotRecorded;
  return [
    l10n.comparePrevious(material.formatMediumDate(previous.date.toLocal())),
    if (current.kind == ResultKind.reps)
      for (final set in comparison.setDifferences)
        set.difference == null
            ? l10n.compareSetLine(
                set.setNumber,
                v(set.previous),
                v(set.current),
              )
            : '${l10n.compareSetLine(set.setNumber, v(set.previous), v(set.current))} (${signed(set.difference!)})',
    if (current.kind == ResultKind.reps || current.kind == ResultKind.totalReps)
      l10n.compareTotalLine(v(before.totalReps), v(current.totalReps)),
    if (current.kind == ResultKind.totalReps)
      l10n.compareSetsUsed('${before.setCount}', '${current.setCount}'),
    if (current.kind == ResultKind.rounds)
      l10n.compareRoundsLine(
        v(before.roundsCompleted),
        v(current.roundsCompleted),
      ),
    if (comparison.configChanged) l10n.compareConfigChanged,
    if (comparison.difference != null)
      l10n.compareDifference(signed(comparison.difference!)),
  ];
}

class ExerciseResultCard extends StatelessWidget {
  const ExerciseResultCard({
    super.key,
    required this.exercise,
    this.comparison,
  });

  final WorkoutExercise exercise;
  final ExerciseComparison? comparison;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final format = TrainingFormat(l10n);
    final material = MaterialLocalizations.of(context);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final target = format.target(exercise.target);
    final lines = resultLines(l10n, format, exercise);
    final compare = comparison == null
        ? const <String>[]
        : comparisonLines(l10n, material, comparison!);
    final scored =
        exercise.mode == ExecutionMode.setsReps ||
        exercise.mode == ExecutionMode.totalReps ||
        exercise.mode == ExecutionMode.interval;
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
          if (target.isNotEmpty &&
              exercise.mode != ExecutionMode.checklist) ...[
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
          if (compare.isNotEmpty) ...[
            const SizedBox(height: VitruvSpace.s3),
            Semantics(
              container: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l10n.compareTitle, style: theme.textTheme.labelLarge),
                  for (final line in compare) ...[
                    const SizedBox(height: VitruvSpace.s1),
                    Text(line, style: theme.textTheme.bodySmall),
                  ],
                ],
              ),
            ),
          ],
          if (scored && exercise.exerciseId != null) ...[
            const SizedBox(height: VitruvSpace.s2),
            VitruvButton(
              label: l10n.progressChartOpen,
              variant: VitruvButtonVariant.ghost,
              leadingIcon: Icons.show_chart,
              semanticLabel: '${l10n.progressChartOpen}: ${exercise.name}',
              onPressed: () => showProgressSheet(
                context,
                exerciseId: exercise.exerciseId!,
                exerciseName: exercise.name,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// The progress chart of one exercise in a sheet (loaded only when opened).
Future<void> showProgressSheet(
  BuildContext context, {
  required String exerciseId,
  required String exerciseName,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (context) => Consumer(
    builder: (context, ref, _) {
      final l10n = AppLocalizations.of(context);
      final progress = ref.watch(exerciseProgressProvider(exerciseId));
      return SingleChildScrollView(
        padding: const EdgeInsets.all(VitruvSpace.s4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionTitle(
              l10n.progressChartTitle(exerciseName),
              size: SectionTitleSize.h3,
            ),
            const SizedBox(height: VitruvSpace.s3),
            AsyncValueView(
              value: progress,
              onRetry: () =>
                  ref.invalidate(exerciseProgressProvider(exerciseId)),
              data: (value) => ProgressChart(progress: value),
            ),
            const SizedBox(height: VitruvSpace.s3),
            VitruvButton(
              label: l10n.closeLabel,
              variant: VitruvButtonVariant.secondary,
              fullWidth: true,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      );
    },
  ),
);

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
