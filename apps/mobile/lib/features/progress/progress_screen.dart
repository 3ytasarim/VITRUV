import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/routing/app_routes.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/format/training_format.dart';
import '../../shared/ui/ui.dart';
import '../../shared/widgets/async_value_view.dart';
import '../../shared/widgets/content_page.dart';
import '../workout/workout_controller.dart';
import '../workout/workout_models.dart';

/// "Fortschritt" — the workout history from `GET /v1/client/workouts` (newest first). Sprint 5:
/// a row opens the session with the reps actually done per set. Sprint 7 (iOS): recorded totals
/// per row, page-wise loading ("Mehr laden"), comparison + charts on the detail screen.
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
            data: (state) => state.items.isEmpty
                ? InfoState(
                    icon: Icons.insights,
                    title: l10n.historyEmpty,
                    body: l10n.historyEmptyBody,
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final item in state.items) ...[
                        _HistoryRow(item: item),
                        const SizedBox(height: VitruvSpace.s3),
                      ],
                      if (state.loadMoreFailed) ...[
                        Text(l10n.historyLoadMoreFailed),
                        const SizedBox(height: VitruvSpace.s2),
                      ],
                      if (state.hasMore)
                        VitruvButton(
                          label: state.loadMoreFailed
                              ? l10n.retry
                              : l10n.historyLoadMore,
                          variant: VitruvButtonVariant.secondary,
                          fullWidth: true,
                          loading: state.loadingMore,
                          onPressed: state.loadingMore
                              ? null
                              : () => ref
                                    .read(workoutHistoryProvider.notifier)
                                    .loadMore(),
                        ),
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
    return VitruvCard.tappable(
      onTap: () => context.go(AppRoutes.historyEntry(item.id)),
      semanticLabel:
          '${l10n.historyOpen}: ${item.dayTitle}, ${material.formatMediumDate(local)}, $status',
      padding: VitruvCardPadding.sm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Wrap, not Row: at 320 px with large text the badge moves below the date instead
          // of overflowing.
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: VitruvSpace.s2,
            runSpacing: VitruvSpace.s1,
            children: [
              Text(
                '${material.formatMediumDate(local)}, '
                '${material.formatTimeOfDay(TimeOfDay.fromDateTime(local), alwaysUse24HourFormat: true)}',
                style: theme.textTheme.bodySmall,
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
            // Sprint 7: recorded values only (null = nothing recorded → not shown, never "0")
            if (item.totalReps case final reps?) l10n.historyTotalReps(reps),
            if (item.setsCompleted case final sets? when sets > 0)
              l10n.historySetCount(sets),
            if (item.roundsCompleted case final rounds? when rounds > 0)
              l10n.historyRoundCount(rounds),
          ]),
        ],
      ),
    );
  }
}
