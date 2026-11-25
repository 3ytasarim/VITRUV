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
import 'training_schedule.dart';
import 'week_schedule_view.dart';

/// Workout overview — one training day of the ACTIVE plan: name, type, planned date, status,
/// sections → exercises in the coach's order (Warm-up as a tick-off list without reps/timer),
/// target, rest, instructions, media and a video indicator.
///
/// Primary action by state:
/// - this day's workout is running → "Training fortsetzen" (resume, same session)
/// - the day is COMPLETED (server status) → "Abgeschlossen" (disabled) — a finished workout is
///   never restarted by accident
/// - ANOTHER day's workout runs → offer to open that one
/// - otherwise → "Training starten" (POST /v1/client/workouts — the existing start/resume API)
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
      case AlreadyCompleted():
        // the plan was stale (e.g. finished on another device): refresh → "Abgeschlossen"
        ref.invalidate(activeTrainingProvider);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(l10n.workoutAlreadyCompleted)));
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
      if (running == null && found.day.workoutStatus == DayStatus.completed) {
        action = Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.workoutAlreadyCompleted, textAlign: TextAlign.center),
            const SizedBox(height: VitruvSpace.s3),
            VitruvButton(
              label: l10n.dayStatusCompleted,
              leadingIcon: Icons.check,
              size: VitruvButtonSize.lg,
              fullWidth: true,
              onPressed: null,
            ),
          ],
        );
      } else if (running == null) {
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
                  _DayHeader(
                    week: found.week,
                    day: found.day,
                    date: scheduleOf(program!)
                        .where((w) => w.day.id == found.day.id)
                        .firstOrNull
                        ?.date,
                    status: running?.dayId == found.day.id
                        ? DayStatus.inProgress
                        : found.day.workoutStatus,
                  ),
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
  const _DayHeader({
    required this.week,
    required this.day,
    required this.date,
    required this.status,
  });

  final TrainingWeek week;
  final TrainingDay day;
  final DateTime? date;
  final DayStatus status;

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
        VitruvMetaRow([
          format.workoutType(day),
          l10n.exerciseCount(day.exerciseCount),
        ]),
        const SizedBox(height: VitruvSpace.s2),
        Wrap(
          spacing: VitruvSpace.s2,
          runSpacing: VitruvSpace.s2,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            DayStatusBadge(status: status),
            Text(
              date == null
                  ? l10n.noFixedDate
                  : l10n.plannedOn(format.longDate(date!)),
            ),
          ],
        ),
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
        if (isChecklistSection(section))
          _ChecklistPreview(section: section)
        else
          for (final exercise in section.exercises) ...[
            PlanExerciseCard(exercise: exercise),
            const SizedBox(height: VitruvSpace.s3),
          ],
      ],
    );
  }
}

/// A Warm-up whose exercises are all CHECKLIST items (Sprint 2 type): shown as a tick-off list
/// preview — no reps, no timer, no rest. Legacy warm-ups keep the normal exercise cards.
bool isChecklistSection(TrainingSection section) =>
    section.exercises.isNotEmpty &&
    section.exercises.every((e) => e.executionType == ExecutionType.checklist);

class _ChecklistPreview extends StatelessWidget {
  const _ChecklistPreview({required this.section});

  final TrainingSection section;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    return VitruvCard(
      padding: VitruvCardPadding.sm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.warmupHint,
            style: theme.textTheme.bodyMedium?.copyWith(color: c.fgMuted),
          ),
          for (final exercise in section.exercises) ...[
            const SizedBox(height: VitruvSpace.s3),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.check_box_outline_blank, color: c.fgSubtle),
                const SizedBox(width: VitruvSpace.s3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(exercise.name, style: theme.textTheme.titleMedium),
                      if (exercise.instructions != null) ...[
                        const SizedBox(height: VitruvSpace.s1),
                        Text(exercise.instructions!),
                      ],
                    ],
                  ),
                ),
                if (exercise.hasVideo) ...[
                  const SizedBox(width: VitruvSpace.s2),
                  VitruvBadge(l10n.videoBadge, tone: VitruvTone.accent),
                ],
              ],
            ),
          ],
        ],
      ),
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
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(exercise.name, style: theme.textTheme.titleMedium),
              ),
              if (exercise.hasVideo) ...[
                const SizedBox(width: VitruvSpace.s2),
                VitruvBadge(l10n.videoBadge, tone: VitruvTone.accent),
              ],
            ],
          ),
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
