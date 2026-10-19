import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/core/theme/app_theme.dart';
import 'package:vitruv_mobile/core/time/clock.dart';
import 'package:vitruv_mobile/features/workout/countdown.dart';
import 'package:vitruv_mobile/features/workout/countdown_panel.dart';
import 'package:vitruv_mobile/l10n/app_localizations.dart';

/// Rest timer without waiting real time: a FakeClock + fake async pumps.
void main() {
  group('Countdown (absolute target time)', () {
    late FakeClock clock;
    late Countdown c;
    setUp(() {
      clock = FakeClock();
      c = Countdown(clock);
    });

    test('initial duration', () {
      expect(c.phase, CountdownPhase.idle);
      c.start(const Duration(seconds: 60));
      expect(c.phase, CountdownPhase.running);
      expect(c.remainingSeconds, 60);
      expect(c.fraction, 1);
    });

    test('countdown is computed from the end time (no tick counting)', () {
      c.start(const Duration(seconds: 60));
      clock.advance(const Duration(seconds: 15, milliseconds: 400));
      expect(c.remainingSeconds, 45); // 44.6 s → shown as 45
      expect(c.remaining, const Duration(seconds: 44, milliseconds: 600));
    });

    test('background: 20 s away → 20 s less, without any tick in between', () {
      c.start(const Duration(seconds: 60));
      clock.advance(
        const Duration(seconds: 20),
      ); // app in background, nothing ran
      expect(c.remainingSeconds, 40);
    });

    test('pause freezes, resume continues from the frozen value', () {
      c.start(const Duration(seconds: 60));
      clock.advance(const Duration(seconds: 10));
      c.pause();
      clock.advance(const Duration(minutes: 5));
      expect(c.remainingSeconds, 50);
      c.resume();
      clock.advance(const Duration(seconds: 5));
      expect(c.remainingSeconds, 45);
    });

    test('+30 s extends running and paused timers; on a finished timer it restarts', () {
      c.start(const Duration(seconds: 60));
      c.add(const Duration(seconds: 30));
      expect(c.remainingSeconds, 90);
      expect(c.total, const Duration(seconds: 90));
      c.pause();
      c.add(const Duration(seconds: 30));
      expect(c.remainingSeconds, 120);
      c.skip();
      c.start(const Duration(seconds: 5));
      clock.advance(const Duration(seconds: 6));
      expect(c.sync(), isTrue);
      c.add(const Duration(seconds: 30));
      expect(c.phase, CountdownPhase.running);
      expect(c.remainingSeconds, 30);
    });

    test('skip ends early without a finished event', () {
      c.start(const Duration(seconds: 60));
      c.skip();
      expect(c.phase, CountdownPhase.idle);
      expect(c.sync(), isFalse);
      expect(c.remainingSeconds, 0);
    });

    test('zero state: sync reports "finished" exactly once and never goes negative', () {
      c.start(const Duration(seconds: 3));
      clock.advance(const Duration(seconds: 2));
      expect(c.sync(), isFalse);
      clock.advance(const Duration(seconds: 10));
      expect(c.remaining, Duration.zero);
      expect(c.sync(), isTrue);
      expect(c.phase, CountdownPhase.finished);
      expect(c.sync(), isFalse);
      expect(c.remainingSeconds, 0);
    });

    test('a zero or negative duration does not start', () {
      c.start(Duration.zero);
      expect(c.phase, CountdownPhase.idle);
    });
  });

  group('CountdownPanel', () {
    Future<(FakeClock, Countdown, ValueNotifier<int>)> pumpPanel(
      WidgetTester tester, {
      bool reduceMotion = false,
    }) async {
      final clock = FakeClock();
      final countdown = Countdown(clock);
      final parentBuilds = ValueNotifier(0);
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark(),
          locale: const Locale('de'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: MediaQuery(
            data: MediaQueryData(disableAnimations: reduceMotion),
            child: Scaffold(
              body: Builder(
                builder: (context) {
                  parentBuilds.value++;
                  return SingleChildScrollView(
                    child: CountdownPanel(countdown: countdown),
                  );
                },
              ),
            ),
          ),
        ),
      );
      return (clock, countdown, parentBuilds);
    }

    testWidgets('shows the rest, follows elapsed real time, finishes at zero', (
      tester,
    ) async {
      final (clock, countdown, _) = await pumpPanel(tester);
      countdown.start(const Duration(seconds: 60));
      await tester.pump();
      expect(find.text('01:00'), findsOneWidget);

      clock.advance(const Duration(seconds: 20));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('00:40'), findsOneWidget);

      await tester.tap(find.text('+30 SEK.'));
      await tester.pump();
      expect(find.text('01:10'), findsOneWidget);

      clock.advance(const Duration(seconds: 71));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Pause beendet'), findsOneWidget);
      expect(find.text('00:00'), findsOneWidget);
      expect(find.text('WEITER'), findsOneWidget);
      countdown.skip();
      await tester.pump();
    });

    testWidgets('app resume re-reads the end time immediately', (tester) async {
      final (clock, countdown, _) = await pumpPanel(tester);
      countdown.start(const Duration(seconds: 90));
      await tester.pump();
      clock.advance(const Duration(seconds: 30));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(find.text('01:00'), findsOneWidget);
      countdown.skip();
      await tester.pump();
    });

    testWidgets('pause / resume / skip buttons', (tester) async {
      final (clock, countdown, _) = await pumpPanel(tester);
      countdown.start(const Duration(seconds: 60));
      await tester.pump();
      await tester.tap(find.text('ANHALTEN'));
      await tester.pump();
      expect(countdown.phase, CountdownPhase.paused);
      clock.advance(const Duration(minutes: 3));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('01:00'), findsOneWidget);
      await tester.tap(find.text('FORTSETZEN'));
      await tester.pump();
      expect(countdown.phase, CountdownPhase.running);
      await tester.tap(find.text('PAUSE ÜBERSPRINGEN'));
      await tester.pump();
      expect(countdown.phase, CountdownPhase.idle);
    });

    testWidgets('ticks rebuild only the panel, not the surrounding screen', (
      tester,
    ) async {
      final (clock, countdown, parentBuilds) = await pumpPanel(tester);
      countdown.start(const Duration(seconds: 60));
      await tester.pump();
      final before = parentBuilds.value;
      for (var i = 0; i < 10; i++) {
        clock.advance(const Duration(seconds: 1));
        await tester.pump(const Duration(milliseconds: 300));
      }
      expect(find.text('00:50'), findsOneWidget);
      expect(parentBuilds.value, before);
      countdown.skip();
      await tester.pump();
    });

    testWidgets(
      'screen readers: digits are not a live region; one label, no per-second spam',
      (tester) async {
        final handle = tester.ensureSemantics();
        final (clock, countdown, _) = await pumpPanel(tester);
        countdown.start(const Duration(seconds: 60));
        await tester.pump();
        final node = tester.getSemantics(
          find.bySemanticsLabel('Pause, noch 01:00'),
        );
        expect(node.flagsCollection.isLiveRegion, isFalse);
        clock.advance(const Duration(seconds: 5));
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.bySemanticsLabel('Pause, noch 00:55'), findsOneWidget);
        expect(
          tester
              .getSemantics(find.bySemanticsLabel('Pause, noch 00:55'))
              .flagsCollection
              .isLiveRegion,
          isFalse,
        );
        countdown.skip();
        await tester.pump();
        handle.dispose();
      },
    );

    testWidgets('reduced motion: no digit transition animation', (
      tester,
    ) async {
      final (_, countdown, _) = await pumpPanel(tester, reduceMotion: true);
      countdown.start(const Duration(seconds: 10));
      await tester.pump();
      final switcher = tester.widget<AnimatedSwitcher>(
        find.byType(AnimatedSwitcher),
      );
      expect(switcher.duration, Duration.zero);
      countdown.skip();
      await tester.pump();
    });
  });

  test('semantics flags API exists for live regions', () {
    expect(SemanticsFlag.isLiveRegion, isNotNull);
  });
}
