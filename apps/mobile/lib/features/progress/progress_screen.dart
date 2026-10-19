import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/format/training_format.dart';
import '../../shared/ui/ui.dart';
import '../../shared/widgets/async_value_view.dart';
import '../../shared/widgets/content_page.dart';
import '../workout/workout_controller.dart';
import '../workout/workout_models.dart';

/// "Fortschritt" — Sprint 7: the plain workout history from `GET /v1/client/workouts` (summary
/// rows only). Charts and analytics come later.
class ProgressScreen extends ConsumerWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final history = ref.watch(workoutHistoryProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.navProgress)),
      body: ContentPage(
        onRefresh: () async => ref.invalidate(workoutHistoryProvider),
        children: [
          SectionTitle(l10n.historyTitle, size: SectionTitleSize.h2),
          const SizedBox(height: VitruvSpace.s4),
          AsyncValueView(
            value: history,
            onRetry: () => ref.invalidate(workoutHistoryProvider),
            data: (items) => items.isEmpty
                ? InfoState(
                    icon: Icons.insights,
                    title: l10n.historyEmpty,
                    body: l10n.historyEmptyBody,
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final item in items) ...[
                        _HistoryRow(item: item),
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

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.item});

  final WorkoutSummary item;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final format = TrainingFormat(l10n);
    final material = MaterialLocalizations.of(context);
    final theme = Theme.of(context);
    final local = item.startedAt.toLocal();
    final (status, tone) = switch (item.status) {
      WorkoutStatus.completed => (l10n.statusCompleted, VitruvTone.success),
      WorkoutStatus.abandoned => (l10n.statusAbandoned, VitruvTone.neutral),
      WorkoutStatus.inProgress => (l10n.statusInProgress, VitruvTone.accent),
    };
    return VitruvCard(
      padding: VitruvCardPadding.sm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${material.formatMediumDate(local)}, '
                  '${material.formatTimeOfDay(TimeOfDay.fromDateTime(local), alwaysUse24HourFormat: true)}',
                  style: theme.textTheme.bodySmall,
                ),
              ),
              VitruvBadge(status, tone: tone, dot: true),
            ],
          ),
          const SizedBox(height: VitruvSpace.s2),
          Text(
            '${l10n.weekLabel(item.weekOrder + 1)} · ${l10n.dayLabel(item.dayOrder + 1)} · ${item.dayTitle}',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: VitruvSpace.s1),
          VitruvMetaRow([
            l10n.completedExercises(item.completed, item.total),
            if (item.durationSeconds != null)
              format.workoutDuration(item.durationSeconds!),
            if (item.skipped > 0) l10n.completedSkipped(item.skipped),
          ]),
        ],
      ),
    );
  }
}
