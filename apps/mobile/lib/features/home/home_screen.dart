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
import '../training/training_day_tile.dart';
import '../training/training_models.dart';
import '../workout/workout_controller.dart';
import '../workout/workout_models.dart';

/// "Heute" — greeting, coaching context and the one next training action.
///
/// TODAY SEMANTICS: a day is called "Heute geplant" only when the plan has a real calendar
/// (start date → `currentWeekId`) AND the coach gave that day today's weekday. Otherwise the
/// screen says "Dein Trainingsplan" / "Diese Woche" — no invented scheduling.
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
          if (workout.value case final running?)
            _RunningWorkoutCard(session: running)
          else
            AsyncValueView(
              value: plan,
              onRetry: () => ref.invalidate(activeTrainingProvider),
              data: (program) => program == null
                  ? InfoState(
                      icon: Icons.fitness_center,
                      title: l10n.homeNoPlan,
                      body: l10n.homeNoPlanBody,
                    )
                  : _PlanCard(
                      program: program,
                      weekday: ref.watch(clockProvider).now().weekday,
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

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.program, required this.weekday});

  final TrainingProgram program;
  final int weekday;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final currentWeek = program.weeks
        .where((w) => w.id == program.currentWeekId)
        .firstOrNull;
    final today = currentWeek?.days
        .where((d) => d.scheduledWeekday == weekday)
        .toList();
    final dayCount = program.weeks.fold(0, (n, w) => n + w.days.length);

    void open(TrainingDay day) => context.go(AppRoutes.trainingDay(day.id));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionIntro(
          eyebrow: l10n.homePlanTitle,
          title: program.title,
          size: SectionTitleSize.h3,
          lead: currentWeek == null
              ? '${l10n.weekCount(program.weeks.length)} · ${l10n.trainingDays(dayCount)}'
              : null,
        ),
        const SizedBox(height: VitruvSpace.s4),
        if (today != null && today.isNotEmpty) ...[
          Eyebrow(l10n.homeScheduledToday),
          const SizedBox(height: VitruvSpace.s2),
          for (final day in today) ...[
            TrainingDayTile(day: day, onTap: () => open(day)),
            const SizedBox(height: VitruvSpace.s3),
          ],
        ] else if (currentWeek != null) ...[
          Eyebrow(
            '${l10n.homeThisWeek} · ${l10n.weekLabel(currentWeek.order + 1)}',
          ),
          const SizedBox(height: VitruvSpace.s2),
          for (final day in currentWeek.days) ...[
            TrainingDayTile(day: day, onTap: () => open(day)),
            const SizedBox(height: VitruvSpace.s3),
          ],
        ],
        const SizedBox(height: VitruvSpace.s2),
        VitruvButton(
          label: l10n.homeOpenPlan,
          variant: VitruvButtonVariant.secondary,
          trailingIcon: Icons.arrow_forward,
          fullWidth: true,
          onPressed: () => context.go(AppRoutes.training),
        ),
      ],
    );
  }
}
