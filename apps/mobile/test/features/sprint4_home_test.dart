import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:vitruv_mobile/shared/ui/button.dart';

import '../support/app_harness.dart';
import '../support/fake_backend.dart';

/// Sprint 4: Home with the weekly plan, workout overview and the warm-up checklist — against the
/// fake API (real router, controllers, Dio stack). Fictional data only.
void main() {
  /// Exact text, ignoring case (section titles and buttons render upper case).
  Finder ci(String text) => find.byWidgetPredicate(
    (w) => w is Text && w.data?.toLowerCase() == text.toLowerCase(),
    description: 'text "$text" (any case)',
  );

  Finder open(String title) => find.bySemanticsLabel('Workout öffnen: $title');

  int planReads(AppHarness h) => h.backend.requests
      .where((r) => r == 'GET /v1/client/training/active')
      .length;

  Future<AppHarness> home(
    WidgetTester tester, {
    Map<String, Object?>? program,
    double width = 390,
    double height = 4000,
    double textScale = 1,
  }) async {
    final h = AppHarness();
    h.backend.program = program ?? weekProgram();
    await h.pump(tester, width: width, height: height, textScale: textScale);
    return h;
  }

  Future<AppHarness> startWarmup(
    WidgetTester tester, {
    Map<String, Object?>? program,
    double width = 390,
    double textScale = 1,
  }) async {
    final h = await home(
      tester,
      program: program,
      width: width,
      height: 1600,
      textScale: textScale,
    );
    await tapOn(tester, open('Aufwärmen und Kraft'));
    await tapOn(tester, ci('Training starten'));
    return h;
  }

  group('Home + weekly plan', () {
    testWidgets('current week Mo–So with stats, next training, free days', (
      tester,
    ) async {
      final h = await home(tester);
      expect(ci('Aktuelle Trainingswoche'), findsOneWidget);
      expect(ci('12.10. – 18.10.'), findsOneWidget);
      expect(ci('Nächstes Training'), findsOneWidget);
      // next = today's workout (Thursday 15.10.), shown in the card and in the week
      expect(open('Aufwärmen und Kraft'), findsNWidgets(2));
      expect(
        find.bySemanticsLabel(
          'Diese Woche: 4 geplant, 1 abgeschlossen, 0 in Bearbeitung, 3 offen',
        ),
        findsOneWidget,
      );
      // two workouts on Wednesday, each with its own action
      expect(open('Rücken kurz'), findsOneWidget);
      expect(open('Core kurz'), findsOneWidget);
      // Tu, Fr, Sa, So are free
      expect(find.text('Kein Training geplant'), findsNWidgets(4));
      expect(ci('Abgeschlossen'), findsWidgets); // Monday's status
      // plan from the real (fake) API only — never the legacy client_plans endpoint
      expect(h.backend.requests, contains('GET /v1/client/training/active'));
      expect(
        h.backend.requests,
        isNot(contains('GET /v1/client/training/plan')),
      );
      // capability 2 is announced (informational; the server never trusts it)
      expect(h.backend.lastHeaders['X-Vitruv-App-Capability'].toString(), '2');
    });

    testWidgets('previous / next week navigation', (tester) async {
      await home(tester);
      await tapOn(tester, ci('Nächste Woche'));
      expect(ci('19.10. – 25.10.'), findsOneWidget);
      expect(open('Ganzkörper'), findsOneWidget);
      expect(ci('Aktuelle Trainingswoche'), findsNothing);
      await tapOn(tester, ci('Nächste Woche'));
      expect(ci('26.10. – 01.11.'), findsOneWidget);
      expect(find.text('Kein Training geplant'), findsNWidgets(7));
      await tapOn(tester, ci('Zur aktuellen Woche'));
      expect(ci('12.10. – 18.10.'), findsOneWidget);
      await tapOn(tester, ci('Vorherige Woche'));
      expect(ci('05.10. – 11.10.'), findsOneWidget);
    });

    testWidgets('no active plan: empty state, no fake cards', (tester) async {
      final h = AppHarness();
      h.backend.program = null;
      await h.pump(tester, height: 2000);
      expect(ci('Aktuelle Trainingswoche'), findsNothing);
      expect(find.textContaining('Workout öffnen'), findsNothing);
    });

    testWidgets('timeout: German network message, retry loads the plan', (
      tester,
    ) async {
      final h = AppHarness();
      h.backend
        ..program = weekProgram()
        ..timeoutPlanReads = 1;
      await h.pump(tester, height: 4000);
      expect(
        find.text('Keine Verbindung. Bitte prüfe deine Internetverbindung.'),
        findsWidgets,
      );
      expect(ci('Aktuelle Trainingswoche'), findsNothing);
      await tapOn(tester, ci('Erneut versuchen'));
      expect(ci('Aktuelle Trainingswoche'), findsOneWidget);
    });

    testWidgets('expired session token: pull to refresh renews and reloads', (
      tester,
    ) async {
      final h = await home(tester, height: 1400);
      final before = planReads(h);
      h.backend.expireAccessTokens();
      await tester.drag(find.byType(RefreshIndicator), const Offset(0, 500));
      await tester.pumpAndSettle();
      expect(h.backend.requests, contains('POST /v1/auth/refresh'));
      expect(planReads(h), greaterThan(before));
      expect(ci('Aktuelle Trainingswoche'), findsOneWidget);
    });

    testWidgets('app resume refetches the plan (coach changes appear)', (
      tester,
    ) async {
      final h = await home(tester);
      final before = planReads(h);
      // the coach renames the client's copy meanwhile
      final days =
          (((h.backend.program!['weeks']! as List).first as Map)['days']!
                  as List)
              .cast<Map<String, Object?>>();
      days.firstWhere((d) => d['id'] == 'd-di' || d['id'] == 'd-mi1')['title'] =
          'Rücken lang';
      // background → foreground through the valid lifecycle transitions
      for (final state in [
        AppLifecycleState.inactive,
        AppLifecycleState.hidden,
        AppLifecycleState.paused,
        AppLifecycleState.hidden,
        AppLifecycleState.inactive,
        AppLifecycleState.resumed,
      ]) {
        tester.binding.handleAppLifecycleStateChanged(state);
      }
      await tester.pumpAndSettle();
      expect(planReads(h), greaterThan(before));
      expect(open('Rücken lang'), findsOneWidget);
    });
  });

  group('Workout overview', () {
    testWidgets('date, type, status, warm-up preview and start button', (
      tester,
    ) async {
      await home(tester, program: weekProgram(warmupVideo: true));
      await tapOn(tester, open('Aufwärmen und Kraft'));
      expect(find.textContaining('15.10.'), findsWidgets);
      expect(ci('Nicht begonnen'), findsWidgets);
      expect(find.text('Schulterkreisen'), findsWidgets);
      expect(find.text('Kniebeugen ohne Gewicht'), findsWidgets);
      expect(
        ci('Video'),
        findsWidgets,
      ); // video indicator only on the item with a video
      expect(ci('Training starten'), findsOneWidget);
    });

    testWidgets('a completed workout cannot be started again by accident', (
      tester,
    ) async {
      final h = await home(tester);
      await tapOn(tester, open('Oberkörper A'));
      expect(
        find.text('Dieses Training hast du bereits abgeschlossen.'),
        findsOneWidget,
      );
      expect(ci('Training starten'), findsNothing);
      final done = tester
          .widgetList<VitruvButton>(find.byType(VitruvButton))
          .where((b) => b.label == 'Abgeschlossen');
      expect(done, hasLength(1));
      expect(done.single.onPressed, isNull); // disabled, not a second start
      expect(h.backend.requests, isNot(contains('POST /v1/client/workouts')));
    });
  });

  group('Warm-up checklist', () {
    testWidgets('items with checkbox, no reps, no timer, coach order', (
      tester,
    ) async {
      final h = await startWarmup(tester);
      expect(h.backend.requests, contains('POST /v1/client/workouts'));
      final names = [
        'Schulterkreisen',
        'Armkreisen',
        'Hüftmobilisation',
        'Kniebeugen ohne Gewicht',
      ];
      final ys = [
        for (final n in names)
          tester.getTopLeft(find.bySemanticsLabel('$n abhaken')).dy,
      ];
      expect(ys, orderedEquals([...ys]..sort()));
      expect(find.text('Langsam und kontrolliert.'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      expect(ci('Timer starten'), findsNothing);
      expect(find.textContaining('Pause'), findsNothing);
      expect(
        find.textContaining('Abhaken'),
        findsNothing,
      ); // storage text never shown
      expect(ci('Video ansehen'), findsNothing); // no video → no button
    });

    testWidgets('tick saves via the API, shows progress; untick reopens', (
      tester,
    ) async {
      final h = await startWarmup(tester);
      await tapOn(tester, find.bySemanticsLabel('Schulterkreisen abhaken'));
      expect(h.backend.mutationBodies.last, {'status': 'COMPLETED'});
      expect(
        find.bySemanticsLabel('Schulterkreisen, erledigt'),
        findsOneWidget,
      );
      expect(
        find.textContaining(RegExp('1 von 4 erledigt', caseSensitive: false)),
        findsWidgets,
      );
      final saved = (h.backend.current!['exercises']! as List).first as Map;
      expect(saved['status'], 'COMPLETED');
      await tapOn(tester, find.bySemanticsLabel('Schulterkreisen, erledigt'));
      expect(h.backend.mutationBodies.last, {'status': 'PENDING'});
      expect(find.bySemanticsLabel('Schulterkreisen abhaken'), findsOneWidget);
    });

    testWidgets('failed save is rolled back and reported (never shown saved)', (
      tester,
    ) async {
      final h = await startWarmup(tester);
      h.backend.failMutations = 1;
      await tapOn(tester, find.bySemanticsLabel('Armkreisen abhaken'));
      expect(
        find.text('Keine Verbindung. Bitte prüfe deine Internetverbindung.'),
        findsOneWidget,
      );
      expect(find.bySemanticsLabel('Armkreisen abhaken'), findsOneWidget);
      await tapOn(
        tester,
        find.widgetWithText(SnackBarAction, 'Erneut versuchen'),
      );
      expect(find.bySemanticsLabel('Armkreisen, erledigt'), findsOneWidget);
    });

    testWidgets('409 from the server is reported and rolled back', (
      tester,
    ) async {
      final h = await startWarmup(tester);
      h.backend.conflictMutations = 1;
      await tapOn(tester, find.bySemanticsLabel('Armkreisen abhaken'));
      expect(
        find.text('Nicht gespeichert. Bitte erneut versuchen.'),
        findsOneWidget,
      );
      expect(find.bySemanticsLabel('Armkreisen abhaken'), findsOneWidget);
    });

    testWidgets('all ticked → warm-up done → continue with the next section', (
      tester,
    ) async {
      await startWarmup(tester);
      for (final n in [
        'Schulterkreisen',
        'Armkreisen',
        'Hüftmobilisation',
        'Kniebeugen ohne Gewicht',
      ]) {
        await tapOn(tester, find.bySemanticsLabel('$n abhaken'));
      }
      expect(ci('Aufwärmen abgeschlossen'), findsOneWidget);
      await tapOn(tester, ci('Training fortsetzen').hitTestable());
      expect(ci('Bankdrücken'), findsWidgets);
    });

    testWidgets('warm-up-only workout ends with "Training abschließen"', (
      tester,
    ) async {
      await startWarmup(tester, program: weekProgram(warmupOnly: true));
      for (final n in [
        'Schulterkreisen',
        'Armkreisen',
        'Hüftmobilisation',
        'Kniebeugen ohne Gewicht',
      ]) {
        await tapOn(tester, find.bySemanticsLabel('$n abhaken'));
      }
      expect(
        find.textContaining(
          RegExp(r'^Training abschlie(ß|ss)en$', caseSensitive: false),
        ),
        findsOneWidget,
      );
      expect(ci('Training fortsetzen'), findsNothing);
    });

    testWidgets('ticks survive an app restart (read back from the server)', (
      tester,
    ) async {
      final h = await startWarmup(tester);
      await tapOn(tester, find.bySemanticsLabel('Schulterkreisen abhaken'));
      await tapOn(tester, find.bySemanticsLabel('Armkreisen abhaken'));
      final patches = h.backend.mutationBodies.length;
      // cold start: a fresh ProviderScope, same server
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(h.app());
      await tester.pumpAndSettle();
      await tapOn(tester, ci('Training fortsetzen'));
      expect(
        find.bySemanticsLabel('Schulterkreisen, erledigt'),
        findsOneWidget,
      );
      expect(find.bySemanticsLabel('Armkreisen, erledigt'), findsOneWidget);
      expect(find.bySemanticsLabel('Hüftmobilisation abhaken'), findsOneWidget);
      expect(h.backend.mutationBodies.length, patches); // nothing re-sent
    });

    testWidgets('video button only with a video; WebM on iOS does not crash', (
      tester,
    ) async {
      final program = weekProgram(warmupVideo: true);
      final day =
          ((((program['weeks']! as List).first as Map)['days']! as List)[3]
              as Map);
      final item =
          ((((day['sections']! as List).first as Map)['exercises']! as List)
                  .first
              as Map);
      (item['media']! as Map)['mimeType'] = 'video/webm';
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      try {
        await startWarmup(tester, program: program);
        expect(ci('Video ansehen'), findsOneWidget);
        await tapOn(tester, ci('Video ansehen'));
        expect(
          find.text(
            'Dieses Video kann auf diesem Gerät nicht abgespielt werden.',
          ),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      } finally {
        debugDefaultTargetPlatformOverride = null;
      }
    });

    testWidgets('legacy warm-up without execution type keeps the one-by-one '
        'screen (flag-OFF behaviour)', (tester) async {
      final h = AppHarness(); // demoProgram: no executionType anywhere
      await h.pump(tester, height: 1400);
      await tapOn(tester, find.byIcon(Icons.fitness_center_outlined));
      await tapOn(tester, find.text('Tag 1 · Oberkörper A'));
      await tapOn(tester, ci('Training starten'));
      expect(find.text('1 / 4'), findsOneWidget);
      expect(ci('Aufwärmen abgeschlossen'), findsNothing);
      expect(find.textContaining('abhaken'), findsNothing);
    });
  });

  group('responsive (no overflow)', () {
    for (final (width, scale) in [
      (320.0, 1.0),
      (320.0, 2.0),
      (375.0, 1.5),
      (430.0, 1.0),
      (768.0, 1.0),
    ]) {
      testWidgets('home + warm-up at ${width.toInt()}dp × $scale', (
        tester,
      ) async {
        await startWarmup(tester, width: width, textScale: scale);
        await tapOn(tester, find.bySemanticsLabel('Schulterkreisen abhaken'));
        expect(tester.takeException(), isNull);
      });
    }
  });
}
