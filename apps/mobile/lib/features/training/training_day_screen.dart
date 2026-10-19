import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/routing/app_routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/format/training_format.dart';
import '../../shared/ui/ui.dart';
import '../../shared/widgets/async_value_view.dart';
import '../../shared/widgets/content_page.dart';
import '../workout/workout_controller.dart';
import 'exercise_media.dart';
import 'training_api.dart';
import 'training_models.dart';

/// One training day of the ACTIVE plan: sections → exercises with target, rest, instructions and
/// media. Primary action "Training starten" — or "Training fortsetzen" when this day's workout
/// is running. While ANOTHER day's workout runs, the screen offers to open that one instead.
class TrainingDayScreen extends ConsumerStatefulWidget {
  const TrainingDayScreen({super.key, required this.dayId});

  final String dayId;

  @override
  ConsumerState<TrainingDayScreen> createState() => _TrainingDayScreenState();
}

class _TrainingDayScreenState extends ConsumerState<TrainingDayScreen> {
  bool _starting = false;

  Future<void> _start() async {
    setState(() => _starting = true);
    final result = await ref
        .read(workoutControllerProvider.notifier)
        .start(widget.dayId);
    if (!mounted) return;
    setState(() => _starting = false);
    final l10n = AppLocalizations.of(context);
    switch (result) {
      case Started():
        unawaited(context.push(AppRoutes.workout));
      case OtherWorkoutRunning():
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l10n.otherWorkoutRunning)));
      case StartFailed(:final failure):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ErrorView.messageFor(l10n, failure))),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final plan = ref.watch(activeTrainingProvider);
    final running = ref.watch(workoutControllerProvider).value;
    final found = plan.value?.findDay(widget.dayId);
    final title = found == null
        ? l10n.navTraining
        : '${l10n.dayLabel(found.day.order + 1)} · ${found.day.title}';

    Widget? action;
    if (found != null && found.day.exerciseCount > 0) {
      if (running == null) {
        action = VitruvButton(
          label: l10n.startWorkout,
          leadingIcon: Icons.play_arrow,
          size: VitruvButtonSize.lg,
          fullWidth: true,
          loading: _starting,
          busyLabel: l10n.loading,
          onPressed: _start,
        );
      } else if (running.dayId == widget.dayId) {
        action = VitruvButton(
          label: l10n.continueWorkout,
          leadingIcon: Icons.play_arrow,
          size: VitruvButtonSize.lg,
          fullWidth: true,
          onPressed: () => context.push(AppRoutes.workout),
        );
      } else {
        action = _OtherRunning(dayTitle: running.dayTitle);
      }
    }

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: AsyncValueView(
        value: plan,
        onRetry: () => ref.invalidate(activeTrainingProvider),
        data: (program) => found == null
            ? ContentPage(
                children: [
                  InfoState(
                    icon: Icons.event_busy,
                    title: l10n.dayNotFound,
                    action: VitruvButton(
                      label: l10n.backToTraining,
                      variant: VitruvButtonVariant.secondary,
                      onPressed: () => context.go(AppRoutes.training),
                    ),
                  ),
                ],
              )
            : ContentPage(
                bottom: action,
                children: [
                  _DayHeader(week: found.week, day: found.day),
                  if (found.day.exerciseCount == 0) ...[
                    const SizedBox(height: VitruvSpace.s6),
                    Text(l10n.dayNoExercises),
                  ],
                  for (final section in found.day.sections)
                    if (section.exercises.isNotEmpty) ...[
                      const SizedBox(height: VitruvSpace.s8),
                      _SectionBlock(section: section),
                    ],
                ],
              ),
      ),
    );
  }
}

class _OtherRunning extends StatelessWidget {
  const _OtherRunning({required this.dayTitle});

  final String dayTitle;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '${l10n.otherWorkoutRunning}: $dayTitle. ${l10n.otherWorkoutRunningBody}',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: VitruvSpace.s3),
        VitruvButton(
          label: l10n.openRunningWorkout,
          variant: VitruvButtonVariant.secondary,
          fullWidth: true,
          onPressed: () => context.push(AppRoutes.workout),
        ),
      ],
    );
  }
}

class _DayHeader extends StatelessWidget {
  const _DayHeader({required this.week, required this.day});

  final TrainingWeek week;
  final TrainingDay day;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final format = TrainingFormat(l10n);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Eyebrow(
          [
            l10n.weekLabel(week.order + 1),
            if (day.scheduledWeekday != null)
              format.weekday(day.scheduledWeekday!),
          ].join(' · '),
        ),
        const SizedBox(height: VitruvSpace.s2),
        SectionTitle(day.title, size: SectionTitleSize.h2),
        const SizedBox(height: VitruvSpace.s2),
        VitruvMetaRow([l10n.exerciseCount(day.exerciseCount)]),
        if (day.notes != null) ...[
          const SizedBox(height: VitruvSpace.s3),
          Text(day.notes!),
        ],
      ],
    );
  }
}

class _SectionBlock extends StatelessWidget {
  const _SectionBlock({required this.section});

  final TrainingSection section;

  @override
  Widget build(BuildContext context) {
    final format = TrainingFormat(AppLocalizations.of(context));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(
          [format.section(section.type), ?section.title].join(' · '),
          size: SectionTitleSize.h3,
        ),
        const SizedBox(height: VitruvSpace.s3),
        for (final exercise in section.exercises) ...[
          PlanExerciseCard(exercise: exercise),
          const SizedBox(height: VitruvSpace.s3),
        ],
      ],
    );
  }
}

/// Read-only exercise of the plan (target, rest, instructions, media).
class PlanExerciseCard extends StatelessWidget {
  const PlanExerciseCard({super.key, required this.exercise});

  final TrainingExercise exercise;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final format = TrainingFormat(l10n);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final rest = format.rest(exercise.prescription);
    final target = format.target(exercise.prescription);
    return VitruvCard(
      padding: VitruvCardPadding.sm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (exercise.media != null) ...[
            ExerciseMedia(media: exercise.media, exerciseName: exercise.name),
            const SizedBox(height: VitruvSpace.s3),
          ],
          Text(exercise.name, style: theme.textTheme.titleMedium),
          const SizedBox(height: VitruvSpace.s1),
          if (target.isNotEmpty)
            Text(
              target,
              style: theme.textTheme.bodyLarge?.copyWith(color: c.accentText),
            ),
          if (rest != null) ...[
            const SizedBox(height: VitruvSpace.s1),
            Text(
              rest,
              style: theme.textTheme.bodyMedium?.copyWith(color: c.fgMuted),
            ),
          ],
          if (exercise.instructions != null) ...[
            const SizedBox(height: VitruvSpace.s3),
            MetaLabel(l10n.instructionsLabel),
            const SizedBox(height: VitruvSpace.s1),
            Text(exercise.instructions!),
          ],
        ],
      ),
    );
  }
}
