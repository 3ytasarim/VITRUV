import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/core/time/clock.dart';
import 'package:vitruv_mobile/features/workout/countdown.dart';
import 'package:vitruv_mobile/features/workout/interval_runner.dart';
import 'package:vitruv_mobile/features/workout/rest_alert.dart';
import 'package:vitruv_mobile/features/workout/workout_engine.dart';

/// Sprint 6 engines without widgets: Total reps arithmetic, the Core plan, the runner on a fake
/// clock (absolute times — no tick counting), persistence and the notification series.
void main() {
  const core = IntervalConfig(rounds: 5, workSeconds: 40, restSeconds: 20);

  group('Total reps (spec 1–3, 12)', () {
    test('remaining = max(0, target − sum), every set counts', () {
      final p = totalRepsProgress(60, [20, 15, null, 10]);
      expect(p.done, 45);
      expect(p.remaining, 15);
      expect(p.reached, isFalse);
      expect(p.setCount, 4);
    });

    test('no sets: everything open', () {
      final p = totalRepsProgress(60, const []);
      expect((p.done, p.remaining, p.reached, p.setCount), (0, 60, false, 0));
    });

    test('exactly the target → reached, 0 open', () {
      final p = totalRepsProgress(60, [30, 30]);
      expect((p.done, p.remaining, p.reached), (60, 0, true));
    });

    test('overshoot is kept (65 done) and never negative (0 open)', () {
      final p = totalRepsProgress(60, [30, 35]);
      expect((p.done, p.remaining, p.reached), (65, 0, true));
    });
  });

  group('Core plan (spec 13–16)', () {
    test(
      '5 × 40/20: starts with WORK, no rest after the last round, 280 s',
      () {
        final plan = intervalPlan(core);
        expect(plan.totalSeconds, 280);
        expect(plan.phases, hasLength(9));
        expect(plan.phases.first.kind, IntervalPhaseKind.work);
        expect(plan.phases.last.kind, IntervalPhaseKind.work);
        expect(plan.phases.last.round, 5);
        expect(
          [
            for (final p in plan.phases)
              p.kind == IntervalPhaseKind.work ? 'W' : 'R',
          ].join(),
          'WRWRWRWRW',
        );
        expect(
          [for (final p in plan.phases) p.startsAt],
          [
            0, 40, 60, 100, 120, 160, 180, 220, 240, //
          ],
        );
        expect(plan.workIndexOf(3), 4);
        expect(plan.workIndexOf(6), -1);
      },
    );

    test(
      'position at an elapsed time (phase boundaries belong to the next)',
      () {
        final plan = intervalPlan(core);
        expect(intervalPositionAt(plan, 0), (index: 0, remainingSeconds: 40));
        expect(intervalPositionAt(plan, 40), (index: 1, remainingSeconds: 20));
        expect(intervalPositionAt(plan, 279), (index: 8, remainingSeconds: 1));
        expect(intervalPositionAt(plan, 280), isNull);
      },
    );

    test('defaults are documented constants (used only for empty values)', () {
      expect(
        (
          kIntervalDefaultRounds,
          kIntervalDefaultWorkSeconds,
          kIntervalDefaultRestSeconds,
        ),
        (5, 40, 20),
      );
      final custom = intervalPlan(
        const IntervalConfig(rounds: 3, workSeconds: 30, restSeconds: 15),
      );
      expect(custom.totalSeconds, 3 * 30 + 2 * 15);
    });

    test('a single round has no rest at all', () {
      final plan = intervalPlan(
        const IntervalConfig(rounds: 1, workSeconds: 40, restSeconds: 20),
      );
      expect(plan.phases, hasLength(1));
      expect(plan.totalSeconds, 40);
    });
  });

  group('IntervalRunner on a fake clock (spec 17–21, 25, 26)', () {
    late FakeClock clock;
    late IntervalRunner runner;
    setUp(() {
      clock = FakeClock(DateTime.utc(2026, 10, 15, 16));
      runner = IntervalRunner(clock, core);
    });
    tearDown(() => runner.dispose());

    test('start → WORK round 1 with 40 s and a work signal', () {
      runner.start();
      expect(runner.status, IntervalStatus.running);
      expect(runner.current!.kind, IntervalPhaseKind.work);
      expect(runner.current!.round, 1);
      expect(runner.phase.remainingSeconds, 40);
      expect(runner.signal, IntervalSignal.work);
      expect(runner.signalCount, 1);
    });

    test(
      'phases change by themselves: work → rest → work, round reported once',
      () {
        runner.start();
        clock.advance(const Duration(seconds: 39));
        expect(runner.sync(), isEmpty);
        clock.advance(const Duration(seconds: 1));
        expect(runner.sync(), [1]);
        expect(runner.current!.kind, IntervalPhaseKind.rest);
        expect(runner.signal, IntervalSignal.rest);
        expect(runner.phase.remainingSeconds, 20);
        expect(runner.sync(), isEmpty); // nothing new → no second report
        clock.advance(const Duration(seconds: 20));
        expect(runner.sync(), isEmpty); // rest end completes no round
        expect(runner.current!.round, 2);
        expect(runner.signal, IntervalSignal.work);
      },
    );

    test('the whole routine lasts exactly 280 s and ends without a rest', () {
      runner.start();
      final reported = <int>[];
      var signals = <IntervalSignal>[];
      runner.addListener(() => signals = [...signals, runner.signal!]);
      for (var s = 1; s <= 280; s++) {
        clock.advance(const Duration(seconds: 1));
        reported.addAll(runner.sync());
        if (s < 280) {
          expect(runner.status, IntervalStatus.running, reason: '$s');
        }
      }
      expect(reported, [1, 2, 3, 4, 5]);
      expect(runner.status, IntervalStatus.finished);
      expect(signals.last, IntervalSignal.done);
      expect(signals.where((s) => s == IntervalSignal.rest), hasLength(4));
    });

    test(
      'background: one sync after 130 s lands where the wall clock says',
      () {
        runner.start();
        clock.advance(
          const Duration(seconds: 130),
        ); // Dart was suspended — no ticks
        expect(runner.sync(), [1, 2]); // round 3 is still running
        // 130 = 40+20+40+20 → round 3 work started at 120 → 30 s left
        expect(runner.current!.round, 3);
        expect(runner.current!.kind, IntervalPhaseKind.work);
        expect(runner.phase.remainingSeconds, 30);
      },
    );

    test('back after the end: all rounds reported once, finished', () {
      runner.start();
      clock.advance(const Duration(minutes: 10));
      expect(runner.sync(), [1, 2, 3, 4, 5]);
      expect(runner.status, IntervalStatus.finished);
      expect(runner.sync(), isEmpty);
    });

    test('pause freezes, resume continues; later phases move with it', () {
      runner.start();
      clock.advance(const Duration(seconds: 10));
      runner.pause();
      expect(runner.status, IntervalStatus.paused);
      clock.advance(const Duration(minutes: 5));
      expect(runner.sync(), isEmpty);
      expect(runner.phase.remainingSeconds, 30);
      runner.resume();
      clock.advance(const Duration(seconds: 30));
      expect(runner.sync(), [1]);
      expect(runner.current!.kind, IntervalPhaseKind.rest);
    });

    test(
      'cancel stops the run (also when the phase is skipped from the watch)',
      () {
        runner.start();
        runner.cancel();
        expect(runner.status, IntervalStatus.idle);
        expect(runner.isActive, isFalse);
        runner.start(fromRound: 2);
        expect(runner.current!.round, 2);
        runner.phase
            .skip(); // the watch's "cancel" command reaches the phase countdown
        expect(runner.status, IntervalStatus.idle);
      },
    );

    test('start from a later round (resume after cancel / kill)', () {
      runner.start(fromRound: 4);
      clock.advance(const Duration(seconds: 100));
      expect(runner.sync(), [4, 5]);
      expect(runner.status, IntervalStatus.finished);
    });

    test('upcoming(): absolute phase-change times for the notifications', () {
      runner.start();
      final ahead = runner.upcoming();
      final t0 = clock.now();
      expect(ahead, hasLength(9));
      expect(ahead.first.at, t0.add(const Duration(seconds: 40)));
      expect(ahead.first.next, IntervalSignal.rest);
      expect(ahead[1].next, IntervalSignal.work);
      expect(ahead[1].round, 2);
      expect(ahead.last.at, t0.add(const Duration(seconds: 280)));
      expect(ahead.last.next, IntervalSignal.done);
      runner.pause();
      expect(runner.upcoming(), isEmpty);
    });
  });

  group('persistence (spec 22, 25, 26)', () {
    test('a running routine is saved; restored after a kill at the wall-clock position', () async {
      final clock = FakeClock(DateTime.utc(2026, 10, 15, 16));
      final store = MemoryIntervalStore();
      final runner = IntervalRunner(clock, core);
      final persistence = IntervalPersistence(
        runner: runner,
        store: store,
        sessionId: 's-1',
        exerciseId: 'we-2',
      );
      runner.start();
      clock.advance(const Duration(seconds: 45));
      runner.sync(); // round 1 done → rest
      await Future<void>.delayed(Duration.zero);
      final saved = store.saved!;
      expect(saved.index, 1);
      expect(SavedInterval.tryParse(saved.toJson())!.config, core);
      // kill: nothing is disposed; a new runner starts from the store
      clock.advance(const Duration(seconds: 80)); // now 125 s after start
      final fresh = IntervalRunner(clock, core);
      final passed = IntervalPersistence.restoreInto(
        fresh,
        saved,
        sessionId: 's-1',
        exerciseId: 'we-2',
        clock: clock,
      );
      expect(passed, [2]);
      expect(fresh.current!.round, 3);
      expect(fresh.phase.remainingSeconds, 35);
      persistence.dispose();
      runner.dispose();
      fresh.dispose();
    });

    test(
      'another session / exercise / changed config / long over → not restored',
      () {
        final clock = FakeClock(DateTime.utc(2026, 10, 15, 16));
        final saved = SavedInterval(
          sessionId: 's-1',
          exerciseId: 'we-2',
          config: core,
          index: 0,
          startedAtMs: clock.now().millisecondsSinceEpoch,
          endsAtMs: clock
              .now()
              .add(const Duration(seconds: 40))
              .millisecondsSinceEpoch,
        );
        List<int>? restore(
          IntervalConfig config, {
          String s = 's-1',
          String e = 'we-2',
        }) {
          final r = IntervalRunner(clock, config);
          final out = IntervalPersistence.restoreInto(
            r,
            saved,
            sessionId: s,
            exerciseId: e,
            clock: clock,
          );
          r.dispose();
          return out;
        }

        expect(
          restore(core, s: 's-2'),
          isNull,
        ); // stale message of another session
        expect(restore(core, e: 'we-9'), isNull);
        expect(
          restore(
            const IntervalConfig(rounds: 3, workSeconds: 30, restSeconds: 15),
          ),
          isNull,
        );
        clock.advance(
          const Duration(seconds: 280) +
              kIntervalRestoreGrace +
              const Duration(seconds: 1),
        );
        expect(restore(core), isNull);
      },
    );

    test(
      'paused routine restores paused with the frozen remaining time',
      () async {
        final clock = FakeClock(DateTime.utc(2026, 10, 15, 16));
        final store = MemoryIntervalStore();
        final runner = IntervalRunner(clock, core);
        IntervalPersistence(
          runner: runner,
          store: store,
          sessionId: 's',
          exerciseId: 'e',
        );
        runner.start();
        clock.advance(const Duration(seconds: 12));
        runner.pause();
        await Future<void>.delayed(Duration.zero);
        clock.advance(const Duration(hours: 2));
        final fresh = IntervalRunner(clock, core);
        expect(
          IntervalPersistence.restoreInto(
            fresh,
            store.saved!,
            sessionId: 's',
            exerciseId: 'e',
            clock: clock,
          ),
          isEmpty,
        );
        expect(fresh.status, IntervalStatus.paused);
        expect(fresh.phase.remainingSeconds, 28);
        runner.dispose();
        fresh.dispose();
      },
    );

    test('finishing or cancelling clears the saved routine', () async {
      final clock = FakeClock(DateTime.utc(2026, 10, 15, 16));
      final store = MemoryIntervalStore();
      final runner = IntervalRunner(clock, core);
      IntervalPersistence(
        runner: runner,
        store: store,
        sessionId: 's',
        exerciseId: 'e',
      );
      runner.start();
      await Future<void>.delayed(Duration.zero);
      expect(store.saved, isNotNull);
      runner.cancel();
      await Future<void>.delayed(Duration.zero);
      expect(store.saved, isNull);
      runner.start();
      clock.advance(const Duration(seconds: 280));
      runner.sync();
      await Future<void>.delayed(Duration.zero);
      expect(store.saved, isNull);
      runner.dispose();
    });

    test('corrupt / foreign JSON is ignored', () {
      expect(SavedInterval.tryParse(null), isNull);
      expect(SavedInterval.tryParse({'v': 2}), isNull);
      expect(SavedInterval.tryParse({'v': 1, 'sessionId': 's'}), isNull);
    });
  });

  group('notifications (Core: work→rest, rest→work, done)', () {
    test(
      'series scheduled at start, kept on phase change, cancelled on pause',
      () {
        final clock = FakeClock(DateTime.utc(2026, 10, 15, 16));
        final runner = IntervalRunner(clock, core);
        final scheduler = _Scheduler();
        final binding = IntervalAlertBinding(
          runner: runner,
          scheduler: scheduler,
          texts: (next, round) => (title: next.name, body: '$round'),
        );
        runner.start();
        expect(scheduler.log, ['series:9']);
        expect(scheduler.series.first.title, 'rest');
        expect(scheduler.series[1].title, 'work');
        expect(scheduler.series.last.title, 'done');
        expect(
          scheduler.series.last.at,
          clock.now().add(const Duration(seconds: 280)),
        );
        clock.advance(const Duration(seconds: 40));
        runner.sync();
        expect(scheduler.log, [
          'series:9',
        ]); // a normal phase change does not reschedule
        runner.pause();
        expect(scheduler.log.last, 'cancelSeries');
        clock.advance(const Duration(seconds: 7));
        runner.resume();
        // resumed → the remaining series (8 changes) at the moved times
        expect(scheduler.log.last, 'series:8');
        expect(
          scheduler.series.last.at,
          clock.now().add(const Duration(seconds: 240)),
        );
        binding.dispose();
        expect(
          scheduler.log.last,
          'cancelSeries',
        ); // leaving the screen with an active routine
        runner.dispose();
      },
    );

    test(
      'finishing keeps the last ("done") notification, nothing cancelled',
      () {
        final clock = FakeClock(DateTime.utc(2026, 10, 15, 16));
        final runner = IntervalRunner(clock, core);
        final scheduler = _Scheduler();
        final binding = IntervalAlertBinding(
          runner: runner,
          scheduler: scheduler,
          texts: (next, round) => (title: next.name, body: ''),
        );
        runner.start();
        clock.advance(const Duration(seconds: 280));
        runner.sync();
        expect(scheduler.log, ['series:9']);
        binding.dispose();
        expect(scheduler.log, ['series:9']);
        runner.dispose();
      },
    );

    test('the series never exceeds the platform cap', () {
      expect(
        kMaxSeriesAlerts,
        greaterThanOrEqualTo(intervalPlan(core).phases.length),
      );
    });
  });

  test('every engine uses the same countdown (rest, work and Core phases)', () {
    final clock = FakeClock(DateTime.utc(2026, 10, 15, 16));
    final runner = IntervalRunner(clock, core);
    expect(runner.phase, isA<Countdown>());
    runner.dispose();
  });
}

class _Scheduler implements RestAlertScheduler {
  final log = <String>[];
  List<PlannedAlert> series = const [];

  @override
  Future<void> schedule({
    required DateTime at,
    required String title,
    required String body,
  }) async => log.add('schedule');

  @override
  Future<void> cancel() async => log.add('cancel');

  @override
  Future<void> scheduleSeries(List<PlannedAlert> alerts) async {
    series = alerts;
    log.add('series:${alerts.length}');
  }

  @override
  Future<void> cancelSeries() async => log.add('cancelSeries');
}
