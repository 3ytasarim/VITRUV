import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/core/json/json_reader.dart';
import 'package:vitruv_mobile/features/training/exercise_media.dart';
import 'package:vitruv_mobile/features/training/training_models.dart';
import 'package:vitruv_mobile/features/training/training_schedule.dart';

import '../support/fake_backend.dart';

TrainingProgram parse(Map<String, Object?> json) => TrainingProgram.fromJson(
  JsonReader(jsonDecode(jsonEncode(json)) as Map<String, dynamic>),
);

void main() {
  group('calendar dates (no time zone conversion)', () {
    test('parses only strict YYYY-MM-DD into UTC midnight', () {
      expect(parseCalendarDate('2026-10-12'), DateTime.utc(2026, 10, 12));
      expect(parseCalendarDate(null), isNull);
      expect(parseCalendarDate('12.10.2026'), isNull);
      expect(parseCalendarDate('2026-02-30'), isNull);
    });

    test('a local moment late in the evening stays on its own day', () {
      expect(
        calendarDateOf(DateTime(2026, 10, 15, 23, 59)),
        DateTime.utc(2026, 10, 15),
      );
      expect(
        calendarDateOf(DateTime(2026, 10, 16, 0, 1)),
        DateTime.utc(2026, 10, 16),
      );
    });

    test('day arithmetic is stable across the DST switch (2027-03-28)', () {
      final monday = DateTime.utc(2027, 3, 22);
      expect(addDays(monday, 7), DateTime.utc(2027, 3, 29));
      expect(mondayOf(DateTime.utc(2027, 3, 28)), monday);
      expect(daysBetween(monday, DateTime.utc(2027, 3, 29)), 7);
      // the same over the autumn switch (2026-10-25)
      expect(
        addDays(DateTime.utc(2026, 10, 19), 7),
        DateTime.utc(2026, 10, 26),
      );
    });
  });

  group('schedule of a real plan', () {
    final program = parse(weekProgram());
    final schedule = scheduleOf(program);
    DateTime? dateOf(String id) =>
        schedule.firstWhere((w) => w.day.id == id).date;

    test('weekday + week order give the calendar date', () {
      expect(dateOf('d-mo'), DateTime.utc(2026, 10, 12));
      expect(dateOf('d-mi1'), DateTime.utc(2026, 10, 14));
      expect(dateOf('d-mi2'), DateTime.utc(2026, 10, 14));
      expect(dateOf('d-do'), DateTime.utc(2026, 10, 15));
      expect(dateOf('d-di'), DateTime.utc(2026, 10, 20)); // week 2, Tuesday
      expect(dateOf('d-frei'), isNull); // no weekday → no invented date
    });

    test('a mid-week start date places days within its 7-day block', () {
      // starts Wednesday 2026-10-14: Monday of block 1 is 2026-10-19
      final mid = scheduleOf(parse(weekProgram(startsOn: '2026-10-14')));
      final mo = mid.firstWhere((w) => w.day.id == 'd-mo').date;
      final mi = mid.firstWhere((w) => w.day.id == 'd-mi1').date;
      expect(mo, DateTime.utc(2026, 10, 19));
      expect(mi, DateTime.utc(2026, 10, 14));
    });

    test('Monday…Sunday week with two workouts on Wednesday and stats', () {
      final week = weekScheduleOf(schedule, DateTime(2026, 10, 15, 16));
      expect(week.weekStart, DateTime.utc(2026, 10, 12));
      expect(week.weekEnd, DateTime.utc(2026, 10, 18));
      expect(week.days, hasLength(7));
      expect(week.days[2].workouts.map((w) => w.day.title), [
        'Rücken kurz',
        'Core kurz',
      ]);
      expect(week.days[4].workouts, isEmpty); // Friday: free
      final stats = week.stats;
      expect(stats.planned, 4);
      expect(stats.completed, 1);
      expect(stats.inProgress, 0);
      expect(stats.open, 3);
    });

    test('running day counts as in progress', () {
      final running = scheduleOf(program, runningDayId: 'd-mi1');
      final week = weekScheduleOf(running, DateTime(2026, 10, 15));
      expect(week.stats.inProgress, 1);
      expect(nextWorkout(running, DateTime(2026, 10, 15))!.day.id, 'd-mi1');
    });

    test('next workout = earliest open one from today on', () {
      expect(nextWorkout(schedule, DateTime(2026, 10, 15))!.day.id, 'd-do');
      expect(nextWorkout(schedule, DateTime(2026, 10, 13))!.day.id, 'd-mi1');
      expect(nextWorkout(schedule, DateTime(2026, 10, 21)), isNull);
    });

    test('without a start date: first open workout in plan order', () {
      final undated = scheduleOf(parse(demoProgram(weekday: 4)));
      expect(undated.every((w) => w.date == null), isTrue);
      expect(nextWorkout(undated, DateTime(2026, 10, 15)), isNotNull);
    });
  });

  test('iOS cannot play WebM/Ogg; Android can; non-video is never played', () {
    expect(canPlayVideo('video/mp4', TargetPlatform.iOS), isTrue);
    expect(canPlayVideo('video/webm', TargetPlatform.iOS), isFalse);
    expect(canPlayVideo('video/ogg', TargetPlatform.iOS), isFalse);
    expect(canPlayVideo('video/webm', TargetPlatform.android), isTrue);
    expect(canPlayVideo('image/jpeg', TargetPlatform.android), isFalse);
  });

  test('day status and execution type parse; unknown values stay safe', () {
    expect(DayStatus.fromWire('COMPLETED'), DayStatus.completed);
    expect(DayStatus.fromWire('IN_PROGRESS'), DayStatus.inProgress);
    expect(DayStatus.fromWire(null), DayStatus.notStarted);
    expect(ExecutionType.fromWire('CHECKLIST'), ExecutionType.checklist);
    expect(ExecutionType.fromWire('SOMETHING_NEW'), isNull);
  });
}
