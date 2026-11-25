import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/features/training/exercise_media.dart';
import 'package:vitruv_mobile/features/workout/countdown_panel.dart';

import '../support/app_harness.dart';
import '../support/fake_backend.dart';

/// Sprint 7 — "Video ansehen" on the iPhone workout screen for every exercise type (fake API,
/// no real video decoding: the test environment has no player plugin, so opening a video ends in
/// the error state — which is exactly the "no crash on a network/player error" path). Real
/// playback, codecs and AVPlayer behaviour need a real iPhone (see the Sprint 7 docs).
void main() {
  Finder ci(String text) => find.textContaining(
    RegExp('^${RegExp.escape(text)}\$', caseSensitive: false),
  );

  // VitruvButton shows its label in capitals; the semantics label keeps the original text.
  Finder close() => find.bySemanticsLabel('Schließen');

  Map<String, Object?> video(String id, {String mime = 'video/mp4'}) => {
    'assetId': 'media-$id',
    'kind': 'VIDEO',
    'url': 'https://media.vitruv.invalid/public/training-video/$id.mp4',
    'mimeType': mime,
    'width': 1280,
    'height': 720,
    'altText': null,
  };

  /// "Ganzkörper Mix" (Warm-up, Strength, Total reps, Core) with a video on [withVideo].
  Map<String, Object?> program(
    Set<String> withVideo, {
    String mime = 'video/mp4',
  }) {
    final p = enginesProgram();
    final day = (((p['weeks']! as List).first as Map)['days']! as List)
        .cast<Map<String, Object?>>()
        .firstWhere((d) => d['title'] == 'Ganzkörper Mix');
    for (final section
        in (day['sections']! as List).cast<Map<String, Object?>>()) {
      for (final e
          in (section['exercises']! as List).cast<Map<String, Object?>>()) {
        if (withVideo.contains(e['name'])) {
          e['media'] = video('${e['exerciseId']}', mime: mime);
        }
      }
    }
    return p;
  }

  Future<AppHarness> open(
    WidgetTester tester,
    Map<String, Object?> plan, {
    double width = 390,
    double textScale = 1,
  }) async {
    final h = AppHarness();
    h.backend
      ..program = plan
      ..engines = true;
    await h.pump(tester, width: width, height: 1800, textScale: textScale);
    await tapOn(
      tester,
      find.bySemanticsLabel('Workout öffnen: Ganzkörper Mix').first,
    );
    await tapOn(tester, find.text('TRAINING STARTEN'));
    return h;
  }

  Future<void> finishWarmup(WidgetTester tester) async {
    for (final n in ['Armkreisen', 'Katze-Kuh']) {
      await tapOn(tester, find.bySemanticsLabel('$n abhaken'));
    }
    await tapOn(tester, ci('Training fortsetzen').hitTestable());
  }

  test('videoClock formats position and length', () {
    expect(videoClock(Duration.zero), '0:00');
    expect(videoClock(const Duration(seconds: 7)), '0:07');
    expect(videoClock(const Duration(minutes: 1, seconds: 2)), '1:02');
    expect(
      videoClock(const Duration(hours: 1, minutes: 2, seconds: 3)),
      '1:02:03',
    );
    expect(videoClock(const Duration(seconds: -5)), '0:00');
  });

  test('7. iPhone: MP4 is handed to the player, WebM/Ogg are not', () {
    expect(canPlayVideo('video/mp4', TargetPlatform.iOS), isTrue);
    expect(canPlayVideo('video/webm', TargetPlatform.iOS), isFalse);
    expect(canPlayVideo('video/ogg', TargetPlatform.iOS), isFalse);
    expect(canPlayVideo('video/webm', TargetPlatform.android), isTrue);
  });

  testWidgets(
    '6 + 8. Warm-up item with video has the button, one without has none',
    (tester) async {
      await open(tester, program({'Armkreisen'}));
      expect(
        find.bySemanticsLabel('Video ansehen: Armkreisen'),
        findsOneWidget,
      );
      expect(find.bySemanticsLabel('Video ansehen: Katze-Kuh'), findsNothing);
    },
  );

  testWidgets(
    '6. Strength, Total reps and Core: "Video ansehen" opens a sheet; close returns to the same exercise',
    (tester) async {
      await open(
        tester,
        program({'Bankdrücken', 'Liegestütze', 'Core-Routine'}),
      );
      await finishWarmup(tester);
      // Strength
      expect(find.text('BANKDRÜCKEN'), findsOneWidget);
      await tapOn(tester, find.bySemanticsLabel('Video ansehen: Bankdrücken'));
      expect(close(), findsOneWidget);
      // No player plugin in tests → the error state with retry, never a crash
      expect(find.text('Video konnte nicht geladen werden.'), findsOneWidget);
      expect(find.bySemanticsLabel('Erneut versuchen'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tapOn(tester, close());
      expect(close(), findsNothing);
      expect(
        find.bySemanticsLabel('Video ansehen: Bankdrücken'),
        findsOneWidget,
      );
      // Total reps
      for (final n in [1, 2]) {
        await tapOn(
          tester,
          find.bySemanticsLabel(RegExp('^Satz $n, .*Satz $n abschließen')),
        );
        if (n == 1) {
          await tapOn(tester, find.text('PAUSE STARTEN · 01:30'));
          await tapOn(tester, find.text('PAUSE ÜBERSPRINGEN').hitTestable());
        }
      }
      expect(find.text('LIEGESTÜTZE'), findsOneWidget);
      await tapOn(tester, find.bySemanticsLabel('Video ansehen: Liegestütze'));
      expect(close(), findsOneWidget);
      await tapOn(tester, close());
      await tester.enterText(
        find.widgetWithText(TextField, 'Wiederholungen eintragen'),
        '20',
      );
      await tapOn(tester, find.text('SATZ SPEICHERN'));
      // Core
      await tapOn(tester, ci('Nächste Übung').hitTestable());
      await tapOn(tester, find.bySemanticsLabel('Video ansehen: Core-Routine'));
      expect(close(), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tapOn(tester, close());
      expect(
        find.bySemanticsLabel('Video ansehen: Core-Routine'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    '9. the running rest timer survives opening and closing the video',
    (tester) async {
      final h = await open(tester, program({'Bankdrücken'}));
      await finishWarmup(tester);
      // set 1 done → Strength offers the (manual) rest → start it
      await tapOn(
        tester,
        find.bySemanticsLabel(RegExp(r'^Satz 1, .*Satz 1 abschließen')),
      );
      await tapOn(tester, find.text('PAUSE STARTEN · 01:30'));
      expect(find.byType(CountdownPanel), findsOneWidget);
      expect(find.text('01:30'), findsOneWidget);
      final saved = h.backend.mutationBodies.length;
      await tapOn(tester, find.bySemanticsLabel('Video ansehen: Bankdrücken'));
      await tapOn(tester, close());
      // nothing was sent while the video was open, the timer state is unchanged
      expect(h.backend.mutationBodies.length, saved);
      expect(find.byType(CountdownPanel), findsOneWidget);
      expect(find.text('01:30'), findsOneWidget);
    },
  );

  testWidgets(
    '7. WebM on an iPhone: a clear message instead of a broken player',
    (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      try {
        await open(tester, program({'Bankdrücken'}, mime: 'video/webm'));
        await finishWarmup(tester);
        await tapOn(
          tester,
          find.bySemanticsLabel('Video ansehen: Bankdrücken'),
        );
        expect(
          find.text(
            'Dieses Video kann auf diesem Gerät nicht abgespielt werden.',
          ),
          findsWidgets,
        );
        await tapOn(tester, close());
      } finally {
        debugDefaultTargetPlatformOverride = null;
      }
    },
  );

  testWidgets('8. no video anywhere → no "Video ansehen" button at all', (
    tester,
  ) async {
    await open(tester, program({}));
    expect(find.textContaining('Video ansehen'), findsNothing);
    await finishWarmup(tester);
    expect(find.textContaining('Video ansehen'), findsNothing);
  });

  testWidgets('10. 320 px + 200 % text: the video sheet does not overflow', (
    tester,
  ) async {
    await open(tester, program({'Bankdrücken'}), width: 320, textScale: 2);
    await finishWarmup(tester);
    await tapOn(tester, find.bySemanticsLabel('Video ansehen: Bankdrücken'));
    expect(tester.takeException(), isNull);
    expect(close(), findsOneWidget);
  });
}
