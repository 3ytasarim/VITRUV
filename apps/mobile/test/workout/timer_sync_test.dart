import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/core/time/clock.dart';
import 'package:vitruv_mobile/features/workout/countdown.dart';
import 'package:vitruv_mobile/features/workout/timer_sync/countdown_sync.dart';
import 'package:vitruv_mobile/features/workout/timer_sync/synced_timer.dart';
import 'package:vitruv_mobile/features/workout/timer_sync/timer_sync_transport.dart';

import '../support/fake_watch.dart';

/// Apple Watch timer synchronisation — iPhone side + a reference watch receiver, without any
/// Apple hardware (fake WatchConnectivity link). Real device behaviour is Sprint 5.5.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FakeClock clock;
  late Countdown countdown;
  late FakeWatchLink watch;
  late CountdownSync sync;
  late TimerRevisionSource revisions;

  int now() => clock.now().millisecondsSinceEpoch;

  setUp(() {
    clock = FakeClock(DateTime.utc(2026, 11, 22, 10));
    countdown = Countdown(clock);
    watch = FakeWatchLink(watchNowMs: now);
    revisions = TimerRevisionSource(now);
    sync = CountdownSync(
      countdown: countdown,
      transport: watch,
      clock: clock,
      revisions: revisions,
      describe: () => const TimerSyncContext(
        workoutSessionId: 'ws-1',
        exerciseId: 'ex-1',
        exerciseName: 'Bankdrücken',
        kind: SyncedTimerKind.strengthRest,
        phase: SyncedTimerPhase.rest,
      ),
    );
  });

  tearDown(() {
    sync.dispose();
    countdown.dispose();
  });

  SyncedTimerState last() => watch.published.last.state!;

  group('logical timer state', () {
    test(
      'a started rest timer carries all fields; deadline = start + duration',
      () async {
        countdown.start(const Duration(seconds: 90));
        await pumpEventQueue();
        final s = last();
        expect(s.timerId, hasLength(32));
        expect(s.workoutSessionId, 'ws-1');
        expect(s.exerciseName, 'Bankdrücken');
        expect(s.kind, SyncedTimerKind.strengthRest);
        expect(s.phase, SyncedTimerPhase.rest);
        expect(s.status, SyncedTimerStatus.running);
        expect(s.startedAtMs, now());
        expect(s.deadlineMs, now() + 90000);
        expect(s.durationMs, 90000);
        expect(s.revision, greaterThan(0));
        expect(watch.watchState, s);
      },
    );

    test(
      'no message per second: the watch computes the remaining time itself',
      () async {
        countdown.start(const Duration(seconds: 60));
        await pumpEventQueue();
        for (var i = 0; i < 25; i++) {
          clock.advance(const Duration(seconds: 1));
        }
        expect(watch.published, hasLength(1));
        expect(watch.watchRemainingMs(), 35000);
        expect(watch.watchState!.fractionAt(now()), closeTo(35 / 60, 1e-9));
      },
    );

    test(
      '+30 s, pause and resume keep the timer id and raise the revision',
      () async {
        countdown.start(const Duration(seconds: 60));
        await pumpEventQueue();
        final first = last();
        clock.advance(const Duration(seconds: 10));
        countdown.add(const Duration(seconds: 30));
        await pumpEventQueue();
        expect(last().timerId, first.timerId);
        expect(last().deadlineMs, first.deadlineMs! + 30000);
        expect(last().durationMs, 90000);
        expect(last().revision, greaterThan(first.revision));

        countdown.pause();
        await pumpEventQueue();
        expect(last().status, SyncedTimerStatus.paused);
        expect(last().deadlineMs, isNull);
        expect(last().pausedRemainingMs, 80000);
        clock.advance(const Duration(minutes: 3));
        expect(watch.watchRemainingMs(), 80000); // frozen on the watch too

        countdown.resume();
        await pumpEventQueue();
        expect(last().status, SyncedTimerStatus.running);
        expect(last().deadlineMs, now() + 80000);
        expect(last().timerId, first.timerId);
      },
    );

    test(
      'reaching zero → COMPLETED once (completion feedback on the watch)',
      () async {
        countdown.start(const Duration(seconds: 5));
        await pumpEventQueue();
        clock.advance(const Duration(seconds: 6));
        expect(countdown.sync(), isTrue);
        await pumpEventQueue();
        expect(last().status, SyncedTimerStatus.completed);
        expect(watch.completionFeedbacks, 1);
        watch.redeliver(watch.published.last); // duplicate delivery
        expect(watch.completionFeedbacks, 1);
      },
    );

    test('skip on the phone → CANCELLED (no completion feedback)', () async {
      countdown.start(const Duration(seconds: 60));
      await pumpEventQueue();
      countdown.skip();
      await pumpEventQueue();
      expect(last().status, SyncedTimerStatus.cancelled);
      expect(watch.completionFeedbacks, 0);
      expect(watch.watchRemainingMs(), 0);
    });

    test('a new start replaces the old timer: new id, higher revision — no duplicates', () async {
      countdown.start(const Duration(seconds: 60));
      await pumpEventQueue();
      final first = last();
      countdown.start(const Duration(seconds: 90));
      await pumpEventQueue();
      expect(last().timerId, isNot(first.timerId));
      expect(last().revision, greaterThan(first.revision));
      expect(watch.watchState!.timerId, last().timerId);
      // the old state arriving late does not resurrect the old timer
      watch.redeliver(watch.published.first);
      expect(watch.watchState!.timerId, last().timerId);
    });

    test('"+30 Sek." on a finished timer is a new run', () async {
      countdown.start(const Duration(seconds: 5));
      await pumpEventQueue();
      final first = last();
      clock.advance(const Duration(seconds: 6));
      countdown.sync();
      countdown.add(const Duration(seconds: 30));
      await pumpEventQueue();
      expect(last().timerId, isNot(first.timerId));
      expect(last().status, SyncedTimerStatus.running);
    });

    test('leaving the workout (dispose) cancels the watch timer', () async {
      countdown.start(const Duration(seconds: 60));
      await pumpEventQueue();
      sync.dispose();
      await pumpEventQueue();
      expect(last().status, SyncedTimerStatus.cancelled);
      sync = CountdownSync(
        countdown: countdown,
        transport: const NoopTimerSyncTransport(),
        clock: clock,
        revisions: revisions,
        describe: () => null,
      );
    });
  });

  group('connectivity loss and resync', () {
    test('offline: the watch keeps counting from the timestamps; only the latest state is delivered later', () async {
      countdown.start(const Duration(seconds: 60));
      await pumpEventQueue();
      watch.setReachable(false);
      clock.advance(const Duration(seconds: 20));
      expect(watch.watchRemainingMs(), 40000); // still correct without messages
      countdown.add(const Duration(seconds: 30)); // not delivered yet
      countdown.pause();
      countdown.resume();
      await pumpEventQueue();
      expect(
        watch.watchState!.deadlineMs,
        watch.published.first.state!.deadlineMs,
      );
      watch.setReachable(true);
      expect(watch.watchState, last());
      expect(watch.watchRemainingMs(), 70000);
    });

    test(
      'out-of-order and duplicate delivery end at the newest state',
      () async {
        countdown.start(const Duration(seconds: 60));
        countdown.add(const Duration(seconds: 30));
        countdown.pause();
        await pumpEventQueue();
        final all = [...watch.published];
        for (final m in all.reversed) {
          watch.redeliver(m);
        }
        for (final m in all) {
          watch.redeliver(m);
        }
        expect(watch.watchState, all.last.state);
      },
    );

    test(
      'watch "requestState" → the phone republishes the same state',
      () async {
        countdown.start(const Duration(seconds: 60));
        await pumpEventQueue();
        final count = watch.published.length;
        watch.sendFromWatch(
          TimerSyncMessage.command(
            const TimerCommand(TimerCommandType.requestState),
            sentAtMs: now(),
          ),
        );
        await pumpEventQueue();
        expect(watch.published, hasLength(count + 1));
        expect(last(), watch.published[count - 1].state);
      },
    );

    test(
      'a different watch clock is corrected via sentAt (beyond the tolerance)',
      () async {
        final skewed = FakeWatchLink(watchNowMs: () => now() + 120000);
        final s2 = CountdownSync(
          countdown: countdown,
          transport: skewed,
          clock: clock,
          revisions: revisions,
          describe: () => const TimerSyncContext(
            workoutSessionId: 'ws-1',
            kind: SyncedTimerKind.strengthRest,
            phase: SyncedTimerPhase.rest,
          ),
        );
        countdown.start(const Duration(seconds: 60));
        await pumpEventQueue();
        clock.advance(const Duration(seconds: 15));
        expect(skewed.watchRemainingMs(), 45000);
        s2.dispose();
      },
    );
  });

  group('watch commands', () {
    test('cancel for the shown timer skips the phone countdown', () async {
      countdown.start(const Duration(seconds: 60));
      await pumpEventQueue();
      watch.watchCancel();
      await pumpEventQueue();
      expect(countdown.phase, CountdownPhase.idle);
      expect(last().status, SyncedTimerStatus.cancelled);
    });

    test('a stale cancel (older timer id) is ignored', () async {
      countdown.start(const Duration(seconds: 60));
      await pumpEventQueue();
      final old = last();
      countdown.start(const Duration(seconds: 90));
      await pumpEventQueue();
      watch.sendFromWatch(
        TimerSyncMessage.command(
          TimerCommand(
            TimerCommandType.cancel,
            timerId: old.timerId,
            revision: old.revision,
          ),
          sentAtMs: now(),
        ),
      );
      await pumpEventQueue();
      expect(countdown.phase, CountdownPhase.running);
      expect(last().status, SyncedTimerStatus.running);
    });
  });

  group('wire format', () {
    test(
      'state round-trips through JSON; unknown or malformed input is rejected',
      () {
        const state = SyncedTimerState(
          timerId: 'abc',
          workoutSessionId: 'ws-1',
          kind: SyncedTimerKind.interval,
          phase: SyncedTimerPhase.work,
          status: SyncedTimerStatus.running,
          startedAtMs: 1000,
          deadlineMs: 41000,
          durationMs: 40000,
          revision: 7,
        );
        const message = TimerSyncMessage.state(state, sentAtMs: 1000);
        final json =
            jsonDecode(jsonEncode(message.toJson())) as Map<String, dynamic>;
        expect(json['v'], kTimerSyncVersion);
        expect(TimerSyncMessage.tryParse(json)!.state, state);

        expect(
          TimerSyncMessage.tryParse({...json, 'v': kTimerSyncVersion + 1}),
          isNull,
        );
        expect(TimerSyncMessage.tryParse({...json, 'type': 'other'}), isNull);
        final noDeadline = {...state.toJson(), 'deadlineMs': null};
        expect(
          SyncedTimerState.tryParse(noDeadline),
          isNull,
        ); // RUNNING needs a deadline
        expect(
          SyncedTimerState.tryParse({...state.toJson(), 'kind': 'NEW'}),
          isNull,
        );
        expect(SyncedTimerState.tryParse('x'), isNull);
      },
    );

    test('revisions keep increasing across an app restart', () {
      final a = TimerRevisionSource(now);
      final r1 = a.next();
      final r2 = a.next();
      expect(r2, greaterThan(r1));
      clock.advance(const Duration(seconds: 1));
      final restarted = TimerRevisionSource(now); // fresh app process
      expect(restarted.next(), greaterThan(r2));
    });

    test('clock skew below the tolerance counts as latency', () {
      expect(estimateClockSkewMs(sentAtMs: 1000, receivedAtMs: 1800), 0);
      expect(estimateClockSkewMs(sentAtMs: 1000, receivedAtMs: 9000), 8000);
    });
  });

  group('iOS method-channel bridge', () {
    const channel = MethodChannel(MethodChannelTimerSyncTransport.channelName);
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    tearDown(() => messenger.setMockMethodCallHandler(channel, null));

    TimerSyncMessage sample() => const TimerSyncMessage.state(
      SyncedTimerState(
        timerId: 't',
        workoutSessionId: 'ws',
        kind: SyncedTimerKind.strengthRest,
        phase: SyncedTimerPhase.rest,
        status: SyncedTimerStatus.running,
        startedAtMs: 0,
        deadlineMs: 60000,
        durationMs: 60000,
        revision: 1,
      ),
      sentAtMs: 0,
    );

    test(
      'without the native bridge it switches itself off and never throws',
      () async {
        final t = MethodChannelTimerSyncTransport();
        await t.publish(sample());
        expect(t.isAvailable, isFalse);
        await t.publish(sample());
        await t.dispose();
      },
    );

    test(
      'sends the message as a JSON string and receives watch commands',
      () async {
        final calls = <MethodCall>[];
        messenger.setMockMethodCallHandler(channel, (call) async {
          calls.add(call);
          return null;
        });
        final t = MethodChannelTimerSyncTransport();
        await t.publish(sample());
        expect(calls.single.method, 'publish');
        final payload = (calls.single.arguments as Map)['payload'] as String;
        expect(
          TimerSyncMessage.tryParse(jsonDecode(payload))!.state!.timerId,
          't',
        );

        final received = <TimerSyncMessage>[];
        t.incoming.listen(received.add);
        Future<void> fromNative(Object? args) =>
            messenger.handlePlatformMessage(
              MethodChannelTimerSyncTransport.channelName,
              const StandardMethodCodec().encodeMethodCall(
                MethodCall('incoming', args),
              ),
              (_) {},
            );
        await fromNative({
          'payload': jsonEncode(
            const TimerSyncMessage.command(
              TimerCommand(TimerCommandType.cancel, timerId: 't', revision: 1),
              sentAtMs: 5,
            ).toJson(),
          ),
        });
        await fromNative({'payload': 'not json'});
        await fromNative({
          'payload': jsonEncode(sample().toJson()),
        }); // states are not accepted from the watch
        await pumpEventQueue();
        expect(received, hasLength(1));
        expect(received.single.command!.type, TimerCommandType.cancel);
        await t.dispose();
      },
    );
  });
}
