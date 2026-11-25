import 'package:flutter/foundation.dart';

import 'training_models.dart';

/// Calendar logic of the client's ACTIVE plan — pure functions, no widgets, no I/O.
///
/// DATE RULES (no time-zone / DST shifts):
/// - The server sends calendar dates ("2026-11-23") and ISO weekdays; the app never converts
///   them through a time zone. Dates are held as UTC midnight `DateTime`s and only moved by whole
///   days in UTC, where every day has exactly 24 hours.
/// - "Today" is the device's LOCAL calendar date ([calendarDateOf] takes year/month/day as they
///   are; it never calls `toUtc()`/`toLocal()`).
/// - Program weeks are 7-day blocks from `startsOn` (week i = startsOn + 7·i … + 6) — the same rule
///   as the API (`GET /v1/client/training/active` `currentWeekId`, coach "Trainingswoche").
///   A day with ISO weekday w lies on the date inside its week block that has weekday w.
/// - Without `startsOn` or without a weekday a workout has no date: it is listed in the
///   "Trainingsübersicht", never placed on an invented day.

/// Parses "YYYY-MM-DD" into UTC midnight; null for null/invalid input.
DateTime? parseCalendarDate(String? value) {
  if (value == null) return null;
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(value);
  if (match == null) return null;
  final date = DateTime.utc(
    int.parse(match.group(1)!),
    int.parse(match.group(2)!),
    int.parse(match.group(3)!),
  );
  // Rejects "2026-02-30" (DateTime would roll it over into March).
  return date.month == int.parse(match.group(2)!) ? date : null;
}

/// The calendar date of [moment] as it reads on the device (year/month/day, no conversion).
DateTime calendarDateOf(DateTime moment) =>
    DateTime.utc(moment.year, moment.month, moment.day);

DateTime addDays(DateTime date, int days) =>
    DateTime.utc(date.year, date.month, date.day + days);

/// Monday of the ISO week containing [date].
DateTime mondayOf(DateTime date) => addDays(date, 1 - date.weekday);

int daysBetween(DateTime from, DateTime to) =>
    calendarDateOf(to).difference(calendarDateOf(from)).inHours ~/ 24;

String formatCalendarDate(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';

/// One workout of the plan with its (optional) calendar date.
@immutable
class ScheduledWorkout {
  const ScheduledWorkout({
    required this.week,
    required this.day,
    required this.date,
    required this.status,
  });

  final TrainingWeek week;
  final TrainingDay day;

  /// Null when the plan has no start date or the day no weekday.
  final DateTime? date;
  final DayStatus status;
}

@immutable
class ScheduleDay {
  const ScheduleDay({required this.date, required this.workouts});

  final DateTime date;
  final List<ScheduledWorkout> workouts;

  int get weekday => date.weekday;
}

@immutable
class WeekStats {
  const WeekStats({
    required this.planned,
    required this.completed,
    required this.inProgress,
  });

  final int planned;
  final int completed;
  final int inProgress;

  /// Planned but neither started nor finished.
  int get open => planned - completed - inProgress;
}

@immutable
class WeekSchedule {
  const WeekSchedule({required this.weekStart, required this.days});

  /// Monday.
  final DateTime weekStart;

  /// Always 7 entries, Monday … Sunday.
  final List<ScheduleDay> days;

  DateTime get weekEnd => addDays(weekStart, 6);

  List<ScheduledWorkout> get workouts => [for (final d in days) ...d.workouts];

  WeekStats get stats {
    final all = workouts;
    return WeekStats(
      planned: all.length,
      completed: all.where((w) => w.status == DayStatus.completed).length,
      inProgress: all.where((w) => w.status == DayStatus.inProgress).length,
    );
  }
}

/// All workouts of [program] with their dates, in plan order (weeks, then days).
/// [runningDayId]: the day of the client's IN_PROGRESS session (shown as in progress even when
/// the plan was loaded before the start).
List<ScheduledWorkout> scheduleOf(
  TrainingProgram program, {
  String? runningDayId,
}) {
  final start = parseCalendarDate(program.startsOn);
  return [
    for (final week in program.weeks)
      for (final day in week.days)
        ScheduledWorkout(
          week: week,
          day: day,
          date: _dateOf(start, week, day),
          status: day.id == runningDayId
              ? DayStatus.inProgress
              : day.workoutStatus,
        ),
  ];
}

DateTime? _dateOf(DateTime? start, TrainingWeek week, TrainingDay day) {
  final weekday = day.scheduledWeekday;
  if (start == null || weekday == null || weekday < 1 || weekday > 7) {
    return null;
  }
  final blockStart = addDays(start, week.order * 7);
  return addDays(blockStart, (weekday - blockStart.weekday + 7) % 7);
}

/// The calendar week (Monday … Sunday) containing [anyDay].
WeekSchedule weekScheduleOf(List<ScheduledWorkout> schedule, DateTime anyDay) {
  final monday = mondayOf(calendarDateOf(anyDay));
  return WeekSchedule(
    weekStart: monday,
    days: [
      for (var i = 0; i < 7; i++)
        ScheduleDay(
          date: addDays(monday, i),
          workouts: [
            for (final w in schedule)
              if (w.date == addDays(monday, i)) w,
          ],
        ),
    ],
  );
}

/// "Nächstes Training": the earliest dated workout from [today] on that is not completed (a
/// running one counts first). Without any dated workout: the first open workout in plan order.
ScheduledWorkout? nextWorkout(List<ScheduledWorkout> schedule, DateTime today) {
  final running = schedule
      .where((w) => w.status == DayStatus.inProgress)
      .firstOrNull;
  if (running != null) return running;
  final day = calendarDateOf(today);
  final dated =
      schedule
          .where(
            (w) =>
                w.date != null &&
                !w.date!.isBefore(day) &&
                w.status != DayStatus.completed,
          )
          .toList()
        ..sort((a, b) {
          final byDate = a.date!.compareTo(b.date!);
          return byDate != 0 ? byDate : a.day.order.compareTo(b.day.order);
        });
  if (dated.isNotEmpty) return dated.first;
  if (schedule.any((w) => w.date != null)) return null;
  return schedule.where((w) => w.status != DayStatus.completed).firstOrNull;
}
