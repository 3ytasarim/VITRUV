import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/routing/app_routes.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/ui/ui.dart';
import '../../shared/widgets/async_value_view.dart';
import '../../shared/widgets/content_page.dart';
import '../workout/workout_controller.dart';
import 'training_api.dart';
import 'training_day_tile.dart';
import 'training_models.dart';

/// "Training" — the client's ACTIVE plan: weeks → days, in API order. No plan → explicit empty
/// state (never a locally invented demo plan).
class TrainingScreen extends ConsumerWidget {
  const TrainingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final plan = ref.watch(activeTrainingProvider);
    final runningDayId = ref.watch(workoutControllerProvider).value?.dayId;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.navTraining)),
      body: ContentPage(
        onRefresh: () async => ref.invalidate(activeTrainingProvider),
        children: [
          AsyncValueView(
            value: plan,
            onRetry: () => ref.invalidate(activeTrainingProvider),
            data: (program) => program == null
                ? InfoState(
                    icon: Icons.fitness_center,
                    title: l10n.trainingEmptyTitle,
                    body: l10n.trainingEmptyBody,
                  )
                : _Program(program: program, runningDayId: runningDayId),
          ),
        ],
      ),
    );
  }
}

class _Program extends StatelessWidget {
  const _Program({required this.program, required this.runningDayId});

  final TrainingProgram program;
  final String? runningDayId;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionIntro(
          title: program.title,
          lead: program.description,
          size: SectionTitleSize.h2,
        ),
        for (final week in program.weeks) ...[
          const SizedBox(height: VitruvSpace.s8),
          Row(
            children: [
              Expanded(
                child: SectionTitle(
                  [l10n.weekLabel(week.order + 1), ?week.title].join(' · '),
                  size: SectionTitleSize.h3,
                ),
              ),
              if (week.id == program.currentWeekId)
                VitruvBadge(l10n.currentWeek, tone: VitruvTone.accent),
            ],
          ),
          if (week.notes != null) ...[
            const SizedBox(height: VitruvSpace.s2),
            Text(week.notes!),
          ],
          const SizedBox(height: VitruvSpace.s3),
          for (final day in week.days) ...[
            TrainingDayTile(
              day: day,
              running: day.id == runningDayId,
              onTap: () => context.go(AppRoutes.trainingDay(day.id)),
            ),
            const SizedBox(height: VitruvSpace.s3),
          ],
        ],
      ],
    );
  }
}
