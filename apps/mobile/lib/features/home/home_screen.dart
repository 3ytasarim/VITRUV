import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/auth_models.dart';
import '../../core/routing/app_routes.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../core/time/clock.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/ui/ui.dart';
import '../../shared/widgets/async_value_view.dart';
import '../../shared/widgets/content_page.dart';
import '../training/training_api.dart';
import '../training/training_models.dart';
import '../training/training_schedule.dart';
import '../training/week_schedule_view.dart';
import '../workout/workout_controller.dart';
import '../workout/workout_models.dart';

/// "Heute" — greeting, the running workout (if any), "Nächstes Training", the current training
/// week (Montag … Sonntag, Vorherige / Nächste Woche, counters) and links to the
/// Trainingsübersicht and the Trainingsverlauf. Everything comes from the client's ACTIVE plan
/// (`GET /v1/client/training/active`) and the own current session — no demo or static cards.
///
/// DATES: a workout has a date only when the plan has a start date AND the coach gave the day a
/// weekday (training_schedule.dart); otherwise it is listed without a date, never placed on an
/// invented day. Coach-only DRAFT plans are not visible here (server rule).
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final profile = ref.watch(clientProfileProvider);
    final workout = ref.watch(workoutControllerProvider);
    final plan = ref.watch(activeTrainingProvider);

    Future<void> refresh() async {
      ref.invalidate(clientProfileProvider);
      ref.invalidate(activeTrainingProvider);
      await ref.read(workoutControllerProvider.notifier).reload();
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.navToday)),
      body: ContentPage(
        onRefresh: refresh,
        children: [
          AsyncValueView(
            value: profile,
            onRetry: () => ref.invalidate(clientProfileProvider),
            data: (p) => _Greeting(profile: p),
          ),
          const SizedBox(height: VitruvSpace.s6),
          if (workout.value case final running?) ...[
            _RunningWorkoutCard(session: running),
            const SizedBox(height: VitruvSpace.s8),
          ],
          AsyncValueView(
            value: plan,
            onRetry: () => ref.invalidate(activeTrainingProvider),
            data: (program) => program == null
                ? InfoState(
                    icon: Icons.fitness_center,
                    title: l10n.homeNoPlan,
                    body: l10n.homeNoPlanBody,
                  )
                : _PlanOverview(
                    program: program,
                    runningDayId: workout.value?.dayId,
                    today: calendarDateOf(ref.watch(clockProvider).now()),
                  ),
          ),
        ],
      ),
    );
  }
}

class _Greeting extends StatelessWidget {
  const _Greeting({required this.profile});

  final ClientProfile profile;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final (label, tone) = switch (profile.coachingStatus) {
      CoachingStatus.active => (l10n.coachingActive, VitruvTone.success),
      CoachingStatus.paused => (l10n.coachingPaused, VitruvTone.warning),
      CoachingStatus.completed => (l10n.coachingCompleted, VitruvTone.neutral),
      CoachingStatus.unknown => (null, VitruvTone.neutral),
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          l10n.homeGreeting(profile.firstName),
          size: SectionTitleSize.h1,
        ),
        const SizedBox(height: VitruvSpace.s3),
        Wrap(
          spacing: VitruvSpace.s3,
          runSpacing: VitruvSpace.s2,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (label != null) VitruvBadge(label, tone: tone, dot: true),
            if (profile.coachName != null)
              Text(l10n.homeCoach(profile.coachName!)),
          ],
        ),
      ],
    );
  }
}

class _RunningWorkoutCard extends StatelessWidget {
  const _RunningWorkoutCard({required this.session});

  final WorkoutSession session;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final p = session.progress;
    final done = p.completed + p.skipped;
    return VitruvCard(
      tone: VitruvCardTone.accent,
      glow: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Eyebrow(l10n.homeWorkoutRunning),
          const SizedBox(height: VitruvSpace.s2),
          SectionTitle(session.dayTitle, size: SectionTitleSize.h3),
          const SizedBox(height: VitruvSpace.s4),
          VitruvProgress(
            value: p.total == 0 ? 0 : done / p.total,
            label: l10n.workoutProgressLabel,
            valueText: l10n.workoutProgressValue(done, p.total),
          ),
          const SizedBox(height: VitruvSpace.s5),
          VitruvButton(
            label: l10n.continueWorkout,
            leadingIcon: Icons.play_arrow,
            fullWidth: true,
            size: VitruvButtonSize.lg,
            onPressed: () => context.push(AppRoutes.workout),
          ),
        ],
      ),
    );
  }
}

class _PlanOverview extends StatelessWidget {
  const _PlanOverview({
    required this.program,
    required this.runningDayId,
    required this.today,
  });

  final TrainingProgram program;
  final String? runningDayId;
  final DateTime today;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final schedule = scheduleOf(program, runningDayId: runningDayId);
    final next = nextWorkout(schedule, today);
    final dated = schedule.any((w) => w.date != null);

    void open(ScheduledWorkout w) =>
        context.go(AppRoutes.trainingDay(w.day.id));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionIntro(
          eyebrow: l10n.homePlanTitle,
          title: program.title,
          size: SectionTitleSize.h3,
        ),
        const SizedBox(height: VitruvSpace.s6),
        Eyebrow(l10n.homeNextTraining),
        const SizedBox(height: VitruvSpace.s2),
        if (next != null)
          ScheduledWorkoutCard(
            workout: next,
            highlight: true,
            onOpen: () => open(next),
          )
        else
          InfoState(
            icon: Icons.event_available,
            title: l10n.homeNoNextTraining,
            body: l10n.homeNoNextTrainingBody,
          ),
        const SizedBox(height: VitruvSpace.s8),
        if (dated)
          WeekScheduleView(schedule: schedule, today: today, onOpen: open)
        else
          Text(l10n.planWithoutDates),
        const SizedBox(height: VitruvSpace.s8),
        SectionIntro(
          eyebrow: l10n.trainingOverview,
          title: l10n.trainingDays(schedule.length),
          lead: l10n.trainingOverviewBody,
          size: SectionTitleSize.h3,
        ),
        const SizedBox(height: VitruvSpace.s3),
        VitruvButton(
          label: l10n.showAllWorkouts,
          variant: VitruvButtonVariant.secondary,
          trailingIcon: Icons.arrow_forward,
          fullWidth: true,
          onPressed: () => context.go(AppRoutes.training),
        ),
        const SizedBox(height: VitruvSpace.s3),
        VitruvButton(
          label: l10n.showHistory,
          variant: VitruvButtonVariant.ghost,
          leadingIcon: Icons.history,
          fullWidth: true,
          onPressed: () => context.go(AppRoutes.progress),
        ),
      ],
    );
  }
}
