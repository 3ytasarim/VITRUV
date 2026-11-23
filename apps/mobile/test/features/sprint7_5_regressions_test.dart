import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/features/training/training_schedule.dart';

import '../support/app_harness.dart';
import '../support/fake_backend.dart';

/// Sprint 7.5 — regression tests that Sprint 7 left open (docs/ios-training-sprint7-test-results.md,
/// "Honest gaps" 24, 33, 34): A. history after an app restart, B. two workouts on the same day,
/// C. time zone / UTC midnight / week and year boundaries. Fake API, fictional sessions only.
void main() {
  Map<String, Object?> summary(String id, String title, DateTime startedAt) => {
    'id': id,
    'status': 'COMPLETED',
    'programTitle': 'Engine-Test',
    'dayTitle': title,
    'weekOrder': 0,
    'dayOrder': 0,
    'startedAt': startedAt.toUtc().toIso8601String(),
    'completedAt': startedAt.toUtc().toIso8601String(),
    'abandonedAt': null,
    'durationSeconds': 30 * 60,
    'exercisesTotal': 3,
    'exercisesCompleted': 3,
    'exercisesSkipped': 0,
    'totalReps': 30,
    'setsCompleted': 3,
    'roundsCompleted': null,
  };

  AppHarness harness() {
    final h = AppHarness();
    h.backend
      ..program = enginesProgram()
      ..engines = true;
    return h;
  }

  Future<void> openHistory(WidgetTester tester) =>
      tapOn(tester, find.byIcon(Icons.insights_outlined));

  // ------------------------------------------------------------------------- A. restart
  testWidgets(
    'A. after an app restart the history is loaded again from the server (nothing stale)',
    (tester) async {
      final h = harness();
      h.backend.history.add(
        summary('a-1', 'Montag Kraft', DateTime.utc(2026, 10, 12, 8)),
      );
      await h.pump(tester);
      await openHistory(tester);
      expect(find.textContaining('· Montag Kraft'), findsOneWidget);
      final requestsBefore = h.backend.historyRequests.length;

      // The app is closed (whole widget tree + ProviderScope disposed) …
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      // … meanwhile a workout is finished (e.g. on another device) …
      h.backend.history.insert(
        0,
        summary('a-2', 'Mittwoch Core', DateTime.utc(2026, 10, 14, 8)),
      );
      // … and the app starts cold with the same saved session (secure token store).
      await h.pump(tester);
      await openHistory(tester);

      expect(h.backend.historyRequests.length, greaterThan(requestsBefore));
      expect(h.backend.historyRequests.last['cursor'], isNull);
      expect(find.textContaining('· Mittwoch Core'), findsOneWidget);
      expect(find.textContaining('· Montag Kraft'), findsOneWidget);
      // newest first
      expect(
        tester.getTopLeft(find.textContaining('· Mittwoch Core')).dy,
        lessThan(tester.getTopLeft(find.textContaining('· Montag Kraft')).dy),
      );
    },
  );

  // ------------------------------------------------------------- B. same day, two workouts
  testWidgets('B. two workouts on the same day are two separate history rows', (
    tester,
  ) async {
    final h = harness();
    h.backend.history
      ..add(summary('b-2', 'Abend Core', DateTime.utc(2026, 10, 15, 17)))
      ..add(summary('b-1', 'Morgen Kraft', DateTime.utc(2026, 10, 15, 6)));
    await h.pump(tester);
    await openHistory(tester);
    expect(find.textContaining('· Morgen Kraft'), findsOneWidget);
    expect(find.textContaining('· Abend Core'), findsOneWidget);
    // each row is its own button (own semantics node), never merged into one day entry
    final labels = tester
        .widgetList<Semantics>(find.byType(Semantics))
        .map((s) => s.properties.label ?? '')
        .where((l) => l.contains('Morgen Kraft') || l.contains('Abend Core'))
        .toList();
    expect(labels.where((l) => l.contains('Morgen Kraft')), isNotEmpty);
    expect(labels.where((l) => l.contains('Abend Core')), isNotEmpty);
    expect(
      labels.any((l) => l.contains('Morgen Kraft') && l.contains('Abend Core')),
      isFalse,
    );
  });

  // ------------------------------------------------------------------- C. time zone
  testWidgets(
    'C. a workout at 23:30 UTC is listed under the DEVICE-local date, not the UTC date',
    (tester) async {
      final instant = DateTime.utc(2026, 10, 14, 23, 30);
      final h = harness();
      h.backend.history.add(summary('c-1', 'Spätes Training', instant));
      await h.pump(tester);
      await openHistory(tester);
      final context = tester.element(find.textContaining('· Spätes Training'));
      final material = MaterialLocalizations.of(context);
      final expected = material.formatMediumDate(instant.toLocal());
      // the row's accessible label carries the date exactly as the device shows it
      final label = tester
          .widgetList<Semantics>(find.byType(Semantics))
          .map((s) => s.properties.label ?? '')
          .firstWhere((l) => l.contains('Spätes Training'));
      expect(label, contains(expected));
      if (instant.toLocal().day != instant.day) {
        // east of UTC (e.g. Berlin, Istanbul) this is already the next day
        expect(label, isNot(contains(material.formatMediumDate(instant))));
      }
    },
  );

  group('C. calendar week boundaries (device-local, no conversion)', () {
    test('Sunday belongs to the week that started the Monday before', () {
      expect(mondayOf(DateTime.utc(2026, 11, 29)), DateTime.utc(2026, 11, 23));
      expect(mondayOf(DateTime.utc(2026, 11, 30)), DateTime.utc(2026, 11, 30));
    });

    test('the ISO week across New Year starts in December', () {
      expect(mondayOf(DateTime.utc(2027, 1, 3)), DateTime.utc(2026, 12, 28));
      expect(addDays(DateTime.utc(2026, 12, 28), 6), DateTime.utc(2027, 1, 3));
      expect(
        daysBetween(DateTime.utc(2026, 12, 31), DateTime.utc(2027, 1, 1)),
        1,
      );
    });

    test('local moments around midnight across the spring DST switch count whole days', () {
      // 2027-03-28 has only 23 hours in Central Europe; dates must still be 1 day apart each
      expect(
        daysBetween(
          DateTime(2027, 3, 27, 23, 30),
          DateTime(2027, 3, 29, 0, 30),
        ),
        2,
      );
      expect(
        calendarDateOf(DateTime(2027, 3, 28, 23, 59)),
        DateTime.utc(2027, 3, 28),
      );
      expect(
        mondayOf(calendarDateOf(DateTime(2027, 3, 28, 0, 1))),
        DateTime.utc(2027, 3, 22),
      );
    });

    test('UTC midnight instants are not shifted when only the calendar date is used', () {
      final utcMidnight = DateTime.utc(2026, 11, 23);
      expect(calendarDateOf(utcMidnight), DateTime.utc(2026, 11, 23));
      expect(formatCalendarDate(utcMidnight), '2026-11-23');
      expect(parseCalendarDate('2026-11-23'), utcMidnight);
    });
  });
}
