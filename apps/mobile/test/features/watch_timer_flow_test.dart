import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/features/workout/timer_sync/synced_timer.dart';
import 'package:vitruv_mobile/features/workout/timer_sync/timer_sync_providers.dart';

import '../support/app_harness.dart';
import '../support/fake_watch.dart';

/// The real workout screen with a fake Apple Watch link (no Apple hardware involved).
void main() {
  Finder button(String label) => find.text(label).hitTestable();

  Future<(AppHarness, FakeWatchLink)> restAfterFirstSet(
    WidgetTester tester, {
    bool withWatch = true,
  }) async {
    final h = AppHarness();
    final watch = FakeWatchLink(
      watchNowMs: () => h.clock.now().millisecondsSinceEpoch,
    );
    await h.pump(
      tester,
      height: 1400,
      extra: [
        if (withWatch) timerSyncTransportProvider.overrideWithValue(watch),
      ],
    );
    await tapOn(tester, find.byIcon(Icons.fitness_center_outlined));
    await tapOn(tester, find.text('Tag 1 · Oberkörper A'));
    await tapOn(tester, find.text('TRAINING STARTEN'));
    await tapOn(
      tester,
      button('NÄCHSTE ÜBUNG'),
    ); // Klimmzüge (sets × reps, rest)
    await tapOn(
      tester,
      find.bySemanticsLabel(RegExp('^Satz 1, 12 Wdh\\., Satz 1 abschließen')),
    );
    return (h, watch);
  }

  testWidgets(
    'the Strength rest timer started on the iPhone appears on the watch',
    (tester) async {
      final (h, watch) = await restAfterFirstSet(tester);
      expect(find.text('PAUSE ÜBERSPRINGEN'), findsWidgets);
      final state = watch.watchState!;
      expect(state.kind, SyncedTimerKind.strengthRest);
      expect(state.phase, SyncedTimerPhase.rest);
      expect(state.status, SyncedTimerStatus.running);
      expect(state.exerciseName, 'Klimmzüge');
      expect(state.workoutSessionId, h.backend.current!['id']);
      expect(watch.watchRemainingMs(), state.durationMs);
    },
  );

  testWidgets('"Überspringen" on the watch ends the rest on the iPhone', (
    tester,
  ) async {
    final (_, watch) = await restAfterFirstSet(tester);
    watch.watchCancel();
    await tester.pumpAndSettle();
    expect(find.text('PAUSE ÜBERSPRINGEN'), findsNothing);
    expect(watch.watchState!.status, SyncedTimerStatus.cancelled);
  });

  testWidgets('leaving the workout cancels the watch timer', (tester) async {
    final (_, watch) = await restAfterFirstSet(tester);
    await tapOn(tester, find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(watch.watchState!.status, SyncedTimerStatus.cancelled);
  });

  testWidgets('without a watch the rest timer works exactly as before', (
    tester,
  ) async {
    await restAfterFirstSet(tester, withWatch: false);
    expect(find.text('PAUSE ÜBERSPRINGEN'), findsWidgets);
    expect(
      kWatchTimerSyncEnabled,
      isFalse,
    ); // switched off in every normal build
  });
}
