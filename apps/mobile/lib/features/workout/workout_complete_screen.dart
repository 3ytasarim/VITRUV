import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/routing/app_routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/format/training_format.dart';
import '../../shared/ui/ui.dart';
import '../../shared/widgets/content_page.dart';
import 'workout_controller.dart';
import 'workout_models.dart';

/// Restrained confirmation after "Training abschließen" / "Training abbrechen": only recorded
/// facts (day, exercises done, duration, skipped/open) — no invented statistics.
class WorkoutCompleteScreen extends ConsumerWidget {
  const WorkoutCompleteScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final summary = ref.watch(lastWorkoutSummaryProvider);
    void overview() => context.go(AppRoutes.today);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) overview();
      },
      child: Scaffold(
        body: SafeArea(
          child: ContentPage(
            bottom: VitruvButton(
              label: l10n.toOverview,
              fullWidth: true,
              size: VitruvButtonSize.lg,
              onPressed: overview,
            ),
            children: [
              const SizedBox(height: VitruvSpace.s10),
              if (summary == null)
                InfoState(
                  icon: Icons.fitness_center,
                  title: l10n.noWorkoutRunning,
                )
              else
                _Summary(summary: summary),
            ],
          ),
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.summary});

  final WorkoutSummary summary;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final format = TrainingFormat(l10n);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final completed = summary.status == WorkoutStatus.completed;
    final lines = [
      l10n.completedExercises(summary.completed, summary.total),
      if (summary.durationSeconds != null)
        l10n.completedDuration(
          format.workoutDuration(summary.durationSeconds!),
        ),
      if (summary.skipped > 0) l10n.completedSkipped(summary.skipped),
      if (summary.open > 0) l10n.completedOpen(summary.open),
    ];
    return Semantics(
      container: true,
      liveRegion: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            completed ? Icons.check_circle_outline : Icons.highlight_off,
            size: VitruvSpace.s12,
            color: completed ? c.success : c.fgMuted,
          ),
          const SizedBox(height: VitruvSpace.s4),
          SectionTitle(
            completed ? l10n.completedTitle : l10n.abandonedTitle,
            size: SectionTitleSize.h1,
          ),
          const SizedBox(height: VitruvSpace.s4),
          Text(summary.dayTitle, style: theme.textTheme.titleLarge),
          const SizedBox(height: VitruvSpace.s4),
          for (final line in lines) ...[
            Text(line, style: theme.textTheme.bodyLarge),
            const SizedBox(height: VitruvSpace.s1),
          ],
        ],
      ),
    );
  }
}
