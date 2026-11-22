import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/format/training_format.dart';
import '../../shared/ui/ui.dart';
import 'training_models.dart';
import 'week_schedule_view.dart';

/// One training day as a single tappable card ("Tag 1 · Oberkörper A", type, exercises, weekday
/// hint and the day status: Nicht begonnen / In Bearbeitung / Abgeschlossen).
class TrainingDayTile extends StatelessWidget {
  const TrainingDayTile({
    super.key,
    required this.day,
    required this.onTap,
    this.running = false,
  });

  final TrainingDay day;
  final VoidCallback onTap;
  final bool running;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final format = TrainingFormat(l10n);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final title = '${l10n.dayLabel(day.order + 1)} · ${day.title}';
    final status = running ? DayStatus.inProgress : day.workoutStatus;
    final meta = [
      format.workoutType(day),
      l10n.exerciseCount(day.exerciseCount),
      if (day.scheduledWeekday != null) format.weekday(day.scheduledWeekday!),
    ];
    return VitruvCard.tappable(
      onTap: onTap,
      semanticLabel: [title, ...meta, format.dayStatus(status)].join(', '),
      tone: status == DayStatus.inProgress
          ? VitruvCardTone.accent
          : VitruvCardTone.standard,
      padding: VitruvCardPadding.sm,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: theme.textTheme.titleMedium),
                const SizedBox(height: VitruvSpace.s1),
                VitruvMetaRow(meta),
                const SizedBox(height: VitruvSpace.s2),
                DayStatusBadge(status: status),
              ],
            ),
          ),
          const SizedBox(width: VitruvSpace.s2),
          Icon(Icons.chevron_right, color: c.fgSubtle),
        ],
      ),
    );
  }
}
