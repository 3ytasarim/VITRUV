import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/ui/ui.dart';
import '../training/exercise_media.dart';
import '../training/training_models.dart';
import 'workout_models.dart';

/// The contiguous run of CHECKLIST exercises (Warm-up, Sprint 2 type) of one section around
/// [index], or null when the exercise at [index] is not a checklist item. Legacy warm-ups (sets,
/// duration, custom) keep the one-exercise-at-a-time screen.
({int start, int end})? checklistGroupAt(WorkoutSession session, int index) {
  final exercises = session.exercises;
  if (index < 0 || index >= exercises.length) return null;
  final current = exercises[index];
  if (current.mode != ExecutionMode.checklist) return null;
  bool sameGroup(WorkoutExercise e) =>
      e.mode == ExecutionMode.checklist &&
      e.sectionOrder == current.sectionOrder;
  var start = index;
  while (start > 0 && sameGroup(exercises[start - 1])) {
    start--;
  }
  var end = index;
  while (end < exercises.length - 1 && sameGroup(exercises[end + 1])) {
    end++;
  }
  return (start: start, end: end);
}

/// "Aufwärmen": every warm-up exercise below each other in the coach's order — name, optional
/// description, optional technique video, a tick-off box and a completion indicator.
///
/// No reps, no timer, no rest. Every tick is saved on the server immediately (PATCH exercise
/// status, idempotent); the box shows the server-confirmed state again if a save fails, so an
/// unsaved tick is never shown as saved.
class WarmupChecklist extends StatelessWidget {
  const WarmupChecklist({
    super.key,
    required this.exercises,
    required this.onToggle,
  });

  final List<WorkoutExercise> exercises;
  final void Function(WorkoutExercise exercise) onToggle;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final done = exercises
        .where((e) => e.status == ExerciseStatus.completed)
        .length;
    final allDone = done == exercises.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Wrap, not Row: the "done" badge moves below the title when both don't fit.
        Wrap(
          spacing: VitruvSpace.s3,
          runSpacing: VitruvSpace.s2,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SectionTitle(l10n.warmupTitle, size: SectionTitleSize.h2),
            if (allDone)
              VitruvBadge(l10n.warmupDone, tone: VitruvTone.success, dot: true),
          ],
        ),
        const SizedBox(height: VitruvSpace.s2),
        Text(
          l10n.warmupHint,
          style: theme.textTheme.bodyMedium?.copyWith(color: c.fgMuted),
        ),
        const SizedBox(height: VitruvSpace.s4),
        VitruvProgress(
          value: exercises.isEmpty ? 0 : done / exercises.length,
          label: l10n.warmupTitle,
          valueText: l10n.warmupProgress(done, exercises.length),
        ),
        const SizedBox(height: VitruvSpace.s4),
        for (final exercise in exercises) ...[
          _ChecklistItem(
            exercise: exercise,
            onToggle: () => onToggle(exercise),
          ),
          const SizedBox(height: VitruvSpace.s2),
        ],
      ],
    );
  }
}

class _ChecklistItem extends StatelessWidget {
  const _ChecklistItem({required this.exercise, required this.onToggle});

  final WorkoutExercise exercise;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final checked = exercise.status == ExerciseStatus.completed;
    final media = exercise.media;
    return VitruvCard(
      padding: VitruvCardPadding.sm,
      tone: checked ? VitruvCardTone.outline : VitruvCardTone.standard,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            checked: checked,
            button: true,
            label: checked
                ? l10n.warmupChecked(exercise.name)
                : l10n.warmupCheck(exercise.name),
            excludeSemantics: true,
            child: InkWell(
              onTap: onToggle,
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  minHeight: VitruvLayout.tapTarget,
                ),
                child: Row(
                  children: [
                    Icon(
                      checked ? Icons.check_box : Icons.check_box_outline_blank,
                      color: checked ? c.success : c.fgMuted,
                      size: VitruvSpace.s8,
                    ),
                    const SizedBox(width: VitruvSpace.s3),
                    Expanded(
                      child: Text(
                        exercise.name,
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: checked ? c.fgMuted : c.fg,
                          decoration: checked
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                    ),
                    if (checked) Icon(Icons.check_circle, color: c.success),
                  ],
                ),
              ),
            ),
          ),
          if (exercise.instructions != null) ...[
            const SizedBox(height: VitruvSpace.s1),
            Text(exercise.instructions!),
          ],
          if (media != null) ...[
            const SizedBox(height: VitruvSpace.s2),
            Align(
              alignment: Alignment.centerLeft,
              child: VitruvButton(
                label: media.kind == MediaKind.video
                    ? l10n.watchVideo
                    : l10n.showImage,
                variant: VitruvButtonVariant.ghost,
                leadingIcon: media.kind == MediaKind.video
                    ? Icons.play_circle_outline
                    : Icons.image_outlined,
                semanticLabel:
                    '${media.kind == MediaKind.video ? l10n.watchVideo : l10n.showImage}: ${exercise.name}',
                onPressed: () => showExerciseMediaSheet(
                  context,
                  media: media,
                  exerciseName: exercise.name,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Technique media in a bottom sheet (the inline player is only created when opened).
Future<void> showExerciseMediaSheet(
  BuildContext context, {
  required ResolvedMedia media,
  required String exerciseName,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.all(VitruvSpace.s4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionTitle(exerciseName, size: SectionTitleSize.h3),
          const SizedBox(height: VitruvSpace.s3),
          ExerciseMedia(media: media, exerciseName: exerciseName),
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
);
