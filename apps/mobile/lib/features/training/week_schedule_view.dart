import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/format/training_format.dart';
import '../../shared/ui/ui.dart';
import 'training_models.dart';
import 'training_schedule.dart';

/// Status badge of one training day: Nicht begonnen / In Bearbeitung / Abgeschlossen.
class DayStatusBadge extends StatelessWidget {
  const DayStatusBadge({super.key, required this.status});

  final DayStatus status;

  @override
  Widget build(BuildContext context) {
    final label = TrainingFormat(AppLocalizations.of(context))
        .dayStatus(status);
    return switch (status) {
      DayStatus.completed => VitruvBadge(
        label,
        tone: VitruvTone.success,
        dot: true,
      ),
      DayStatus.inProgress => VitruvBadge(
        label,
        tone: VitruvTone.accent,
        dot: true,
      ),
      DayStatus.notStarted => VitruvBadge(label),
    };
  }
}

/// One assigned workout as a card: date, name, type, status, exercise count and "Workout öffnen".
class ScheduledWorkoutCard extends StatelessWidget {
  const ScheduledWorkoutCard({
    super.key,
    required this.workout,
    required this.onOpen,
    this.highlight = false,
  });

  final ScheduledWorkout workout;
  final VoidCallback onOpen;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final format = TrainingFormat(l10n);
    final theme = Theme.of(context);
    final day = workout.day;
    final date = workout.date;
    final meta = [
      format.workoutType(day),
      l10n.exerciseCount(day.exerciseCount),
    ];
    return VitruvCard(
      tone: highlight ? VitruvCardTone.accent : VitruvCardTone.standard,
      padding: VitruvCardPadding.sm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: VitruvSpace.s2,
            runSpacing: VitruvSpace.s2,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              MetaLabel(
                date == null ? l10n.noFixedDate : format.longDate(date),
              ),
              DayStatusBadge(status: workout.status),
            ],
          ),
          const SizedBox(height: VitruvSpace.s2),
          Text(day.title, style: theme.textTheme.titleMedium),
          const SizedBox(height: VitruvSpace.s1),
          VitruvMetaRow(meta),
          const SizedBox(height: VitruvSpace.s3),
          VitruvButton(
            label: l10n.openWorkout,
            variant: highlight
                ? VitruvButtonVariant.primary
                : VitruvButtonVariant.secondary,
            trailingIcon: Icons.arrow_forward,
            fullWidth: true,
            semanticLabel: '${l10n.openWorkout}: ${day.title}',
            onPressed: onOpen,
          ),
        ],
      ),
    );
  }
}

/// Four counters of the displayed week (Geplant, Abgeschlossen, In Bearbeitung, Offen).
class WeekStatsRow extends StatelessWidget {
  const WeekStatsRow({super.key, required this.stats});

  final WeekStats stats;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final items = [
      (l10n.statPlanned, stats.planned),
      (l10n.statCompleted, stats.completed),
      (l10n.statInProgress, stats.inProgress),
      (l10n.statOpen, stats.open),
    ];
    return Semantics(
      container: true,
      label: l10n.weekStatsLabel(
        stats.planned,
        stats.completed,
        stats.inProgress,
        stats.open,
      ),
      excludeSemantics: true,
      child: LayoutBuilder(
        builder: (context, constraints) {
          // 4 tiles side by side on wide phones, 2 × 2 on narrow ones / large text.
          final columns = constraints.maxWidth >= 4 * 84 ? 4 : 2;
          final width =
              (constraints.maxWidth - (columns - 1) * VitruvSpace.s2) / columns;
          return Wrap(
            spacing: VitruvSpace.s2,
            runSpacing: VitruvSpace.s2,
            children: [
              for (final (label, value) in items)
                SizedBox(
                  width: width,
                  child: _StatTile(label: label, value: value),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return VitruvCard(
      padding: VitruvCardPadding.sm,
      cut: ChamferCut.sm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$value', style: theme.textTheme.headlineSmall),
          const SizedBox(height: VitruvSpace.s1),
          MetaLabel(label),
        ],
      ),
    );
  }
}

/// "Aktuelle Trainingswoche": Monday … Sunday of one calendar week with the assigned workouts
/// (several per day possible), "Kein Training geplant" on free days, the week's counters and
/// Vorherige / Nächste Woche. Week navigation is local state; the data is the server's plan.
class WeekScheduleView extends StatefulWidget {
  const WeekScheduleView({
    super.key,
    required this.schedule,
    required this.today,
    required this.onOpen,
  });

  final List<ScheduledWorkout> schedule;

  /// Device calendar date (see [calendarDateOf]).
  final DateTime today;
  final void Function(ScheduledWorkout workout) onOpen;

  @override
  State<WeekScheduleView> createState() => _WeekScheduleViewState();
}

class _WeekScheduleViewState extends State<WeekScheduleView> {
  int _offset = 0;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final format = TrainingFormat(l10n);
    final c = VitruvTheme.of(context);
    final theme = Theme.of(context);
    final week = weekScheduleOf(
      widget.schedule,
      addDays(widget.today, 7 * _offset),
    );
    final today = calendarDateOf(widget.today);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionIntro(
          eyebrow: _offset == 0 ? l10n.homeCurrentWeek : null,
          title: l10n.weekRange(
            format.dayMonth(week.weekStart),
            format.dayMonth(week.weekEnd),
          ),
          size: SectionTitleSize.h3,
        ),
        const SizedBox(height: VitruvSpace.s3),
        LayoutBuilder(
          builder: (context, constraints) {
            final previous = VitruvButton(
              label: l10n.previousWeek,
              variant: VitruvButtonVariant.secondary,
              leadingIcon: Icons.chevron_left,
              fullWidth: true,
              onPressed: () => setState(() => _offset--),
            );
            final next = VitruvButton(
              label: l10n.nextWeek,
              variant: VitruvButtonVariant.secondary,
              trailingIcon: Icons.chevron_right,
              fullWidth: true,
              onPressed: () => setState(() => _offset++),
            );
            // Side by side only when each label fits on one line (small phones, large text →
            // stacked), like the workout navigation.
            final scale = MediaQuery.textScalerOf(context).scale(1);
            if (constraints.maxWidth / scale >= 360) {
              return Row(
                children: [
                  Expanded(child: previous),
                  const SizedBox(width: VitruvSpace.s2),
                  Expanded(child: next),
                ],
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                previous,
                const SizedBox(height: VitruvSpace.s2),
                next,
              ],
            );
          },
        ),
        if (_offset != 0) ...[
          const SizedBox(height: VitruvSpace.s2),
          VitruvButton(
            label: l10n.backToThisWeek,
            variant: VitruvButtonVariant.ghost,
            fullWidth: true,
            onPressed: () => setState(() => _offset = 0),
          ),
        ],
        const SizedBox(height: VitruvSpace.s4),
        WeekStatsRow(stats: week.stats),
        if (week.stats.planned == 0) ...[
          const SizedBox(height: VitruvSpace.s3),
          Text(
            l10n.weekOutsidePlan,
            style: theme.textTheme.bodyMedium?.copyWith(color: c.fgMuted),
          ),
        ],
        for (final day in week.days) ...[
          const SizedBox(height: VitruvSpace.s5),
          Wrap(
            spacing: VitruvSpace.s2,
            runSpacing: VitruvSpace.s1,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                format.longDate(day.date),
                style: theme.textTheme.titleSmall,
              ),
              if (day.date == today)
                VitruvBadge(l10n.todayLabel, tone: VitruvTone.accent),
            ],
          ),
          const SizedBox(height: VitruvSpace.s2),
          if (day.workouts.isEmpty)
            Text(
              l10n.noTrainingPlanned,
              style: theme.textTheme.bodyMedium?.copyWith(color: c.fgSubtle),
            )
          else
            for (final workout in day.workouts) ...[
              ScheduledWorkoutCard(
                workout: workout,
                highlight: day.date == today,
                onOpen: () => widget.onOpen(workout),
              ),
              const SizedBox(height: VitruvSpace.s2),
            ],
        ],
      ],
    );
  }
}
