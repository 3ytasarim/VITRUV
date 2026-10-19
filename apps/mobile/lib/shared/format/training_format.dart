import 'package:intl/intl.dart';

import '../../features/training/training_models.dart';
import '../../l10n/app_localizations.dart';

/// THE presentation formatter for prescriptions — every screen (plan, day, live workout, history)
/// uses it, so "4 × 12", "70 Wdh. gesamt", "45 Sek.", "AMRAP", "Pause 01:00", "20 kg" look the
/// same everywhere. Structured fields only; the coach's free text is shown verbatim, never parsed.
class TrainingFormat {
  const TrainingFormat(this.l10n);

  final AppLocalizations l10n;

  /// Main target line, e.g. "4 × 12 · 20 kg", "70 Wdh. gesamt", "3 × 30 Sek.", "AMRAP".
  String target(Prescription p) {
    final parts = <String>[
      ?_volume(p),
      if (p.targetWeight != null) weight(p.targetWeight!),
      ?p.prescriptionText,
    ];
    return parts.join(' · ');
  }

  String? _volume(Prescription p) {
    final sets = p.sets;
    final reps = p.reps;
    final duration = p.durationSeconds;
    if (sets != null && reps != null) return l10n.rxSetsReps(sets, reps);
    if (sets != null && duration != null) {
      return l10n.rxSetsDuration(sets, this.duration(duration));
    }
    if (sets != null) return l10n.rxSets(sets);
    if (reps != null) return l10n.rxReps(reps);
    if (p.totalReps != null) return l10n.rxTotalReps(p.totalReps!);
    if (duration != null) return this.duration(duration);
    return null;
  }

  /// "Pause 01:00" — or null without rest.
  String? rest(Prescription p) {
    final seconds = p.restSeconds;
    return seconds == null || seconds == 0 ? null : l10n.rxRest(clock(seconds));
  }

  /// Exercise duration: 45 → "45 Sek.", 90 → "1:30 Min.", 300 → "5 Min.".
  String duration(int seconds) {
    if (seconds < 60) return l10n.rxSeconds(seconds);
    final rest = seconds % 60;
    final minutes = seconds ~/ 60;
    return l10n.rxMinutes(
      rest == 0 ? '$minutes' : '$minutes:${rest.toString().padLeft(2, '0')}',
    );
  }

  /// "20 kg", "7,5 kg" (German decimal comma).
  String weight(double kilograms) => l10n.rxWeight(
    NumberFormat('#,##0.##', l10n.localeName).format(kilograms),
  );

  /// Workout length in whole minutes ("48 Min.", "1 Std. 5 Min.").
  String workoutDuration(int seconds) {
    final minutes = (seconds / 60).round();
    if (minutes < 1) return l10n.durationUnderMinute;
    if (minutes < 60) return l10n.durationMinutes(minutes);
    return l10n.durationHours(minutes ~/ 60, minutes % 60);
  }

  String section(SectionType type) => switch (type) {
    SectionType.warmup => l10n.sectionWarmup,
    SectionType.main => l10n.sectionMain,
    SectionType.finisher => l10n.sectionFinisher,
  };

  String weekday(int isoWeekday) => l10n.weekday('$isoWeekday');
}

/// 60 → "01:00", 150 → "02:30" (timers and rest).
String clock(int seconds) {
  final s = seconds < 0 ? 0 : seconds;
  return '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
}
