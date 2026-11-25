import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/app.dart';
import 'package:vitruv_mobile/features/training/media_url_renewal.dart';

import '../support/app_harness.dart';
import '../support/fake_backend.dart';

/// Sprint 8A — signed (private) training video URLs in the app: expiry detection, proactive and
/// error-driven renewal without loops, and the real API call through the Dio stack (fake API).
/// Real AVPlayer playback, Range and seek on an iPhone are Mac-stage tests (handoff doc).
void main() {
  const asset = '00000000-0000-4000-8000-0000000000a1';
  final now = DateTime.utc(2026, 10, 15, 16);
  String signed(DateTime expires, {String sig = 'sig'}) =>
      'https://api.vitruv.invalid/v1/media/training/$asset'
      '?u=u-client&e=${expires.millisecondsSinceEpoch ~/ 1000}&s=$sig';
  const public =
      'https://media.vitruv.invalid/public/training-video/2026/10/x.mp4';

  group('signedMediaExpiry', () {
    test('reads the expiry of signed training URLs only', () {
      final expires = now.add(const Duration(minutes: 15));
      expect(signedMediaExpiry(signed(expires)), expires);
      expect(signedMediaExpiry(public), isNull);
      expect(
        signedMediaExpiry('https://x.invalid/v1/media/training/$asset'),
        isNull,
      );
      expect(signedMediaExpiry('not a url %%%'), isNull);
      expect(
        signedMediaExpiry('https://x.invalid/v1/media/training/a?e=abc'),
        isNull,
      );
    });
  });

  group('MediaUrlRenewal', () {
    late List<String> calls;
    late String? answer;
    MediaUrlRenewal source(String url, {bool throws = false}) =>
        MediaUrlRenewal(
          assetId: asset,
          initialUrl: url,
          now: () => now,
          renewer: (id) async {
            calls.add(id);
            if (throws) throw Exception('offline');
            return answer;
          },
        );
    setUp(() {
      calls = [];
      answer = signed(now.add(const Duration(minutes: 20)), sig: 'fresh');
    });

    test('a fresh signed URL is opened as it is', () async {
      final s = source(signed(now.add(const Duration(minutes: 10))));
      expect(await s.urlForOpen(), contains('s=sig'));
      expect(calls, isEmpty);
    });

    test('an (almost) expired signed URL is renewed BEFORE opening', () async {
      for (final left in [
        const Duration(seconds: 30),
        -const Duration(hours: 1),
      ]) {
        calls.clear();
        final s = source(signed(now.add(left)));
        expect(await s.urlForOpen(), contains('s=fresh'));
        expect(calls, [asset]);
      }
    });

    test('after a failure: renewed once, then no loop until it played or the user retried', () async {
      final s = source(signed(now.add(const Duration(minutes: 10))));
      expect(await s.renewAfterFailure(), contains('s=fresh'));
      expect(await s.renewAfterFailure(), isNull);
      expect(calls, hasLength(1));
      s.markPlaying();
      expect(await s.renewAfterFailure(), isNotNull);
      s.userRetry();
      expect(await s.renewAfterFailure(), isNotNull);
      expect(calls, hasLength(3));
    });

    test('public URLs are never renewed', () async {
      final s = source(public);
      expect(await s.urlForOpen(), public);
      expect(await s.renewAfterFailure(), isNull);
      expect(calls, isEmpty);
    });

    test('refused or failed renewal keeps the old URL (player shows its error state)', () async {
      answer = null;
      final refused = source(signed(now.add(const Duration(minutes: 10))));
      expect(await refused.renewAfterFailure(), isNull);
      expect(refused.url, contains('s=sig'));
      final offline = source(
        signed(now.add(const Duration(minutes: 10))),
        throws: true,
      );
      expect(await offline.renewAfterFailure(), isNull);
      expect(offline.url, contains('s=sig'));
    });

    test('no renewer (e.g. signed out): nothing is requested', () async {
      final s = MediaUrlRenewal(
        assetId: asset,
        initialUrl: signed(now.subtract(const Duration(minutes: 1))),
        renewer: null,
        now: () => now,
      );
      expect(await s.urlForOpen(), contains('s=sig'));
      expect(await s.renewAfterFailure(), isNull);
    });
  });

  testWidgets(
    'API: the client renews through GET /v1/client/training/media/:id/url',
    (tester) async {
      final h = AppHarness();
      final fresh = signed(now.add(const Duration(minutes: 20)), sig: 'api');
      h.backend.mediaUrlFor = (id) => id == asset ? fresh : null;
      await h.pump(tester);
      final renew = ProviderScope.containerOf(
        tester.element(find.byType(VitruvApp)),
      ).read(mediaUrlRenewerProvider)!;
      const unknown = '00000000-0000-4000-8000-0000000000ff';
      await tester.runAsync(() async {
        expect(await renew(asset), fresh);
        // 404 → an error the player treats as "renewal refused"
        await expectLater(renew(unknown), throwsA(anything));
      });
      expect(h.backend.renewedMedia, [asset, unknown]);
    },
  );

  group(
    'player (no video plugin in tests → every open fails: the renewal path)',
    () {
      Map<String, Object?> plan(String url) {
        final p = enginesProgram();
        final day = (((p['weeks']! as List).first as Map)['days']! as List)
            .cast<Map<String, Object?>>()
            .firstWhere((d) => d['title'] == 'Ganzkörper Mix');
        for (final section
            in (day['sections']! as List).cast<Map<String, Object?>>()) {
          for (final e
              in (section['exercises']! as List).cast<Map<String, Object?>>()) {
            if (e['name'] == 'Armkreisen') {
              e['media'] = {
                'assetId': asset,
                'kind': 'VIDEO',
                'url': url,
                'mimeType': 'video/mp4',
                'width': 1280,
                'height': 720,
                'altText': null,
              };
            }
          }
        }
        return p;
      }

      Future<AppHarness> openSheet(WidgetTester tester, String url) async {
        final h = AppHarness();
        h.backend
          ..program = plan(url)
          ..engines = true
          ..mediaUrlFor = (id) =>
              signed(now.add(const Duration(minutes: 20)), sig: 'renewed');
        await h.pump(tester, height: 1800);
        await tapOn(
          tester,
          find.bySemanticsLabel('Workout öffnen: Ganzkörper Mix').first,
        );
        await tapOn(tester, find.text('TRAINING STARTEN'));
        await tapOn(tester, find.bySemanticsLabel('Video ansehen: Armkreisen'));
        return h;
      }

      const failed = 'Video konnte nicht geladen werden.';

      testWidgets(
        'a signed URL that fails is renewed exactly once, then the error state',
        (tester) async {
          final h = await openSheet(
            tester,
            signed(now.add(const Duration(minutes: 10))),
          );
          expect(h.backend.renewedMedia, [asset]);
          expect(find.text(failed), findsOneWidget);
          expect(tester.takeException(), isNull);
          // the retry button allows one more renewal (still never a loop)
          await tapOn(tester, find.bySemanticsLabel('Erneut versuchen'));
          expect(h.backend.renewedMedia, [asset, asset]);
          expect(find.text(failed), findsOneWidget);
        },
      );

      testWidgets(
        'an expired signed URL is renewed before opening (and not again after the failure)',
        (tester) async {
          final h = await openSheet(
            tester,
            signed(now.subtract(const Duration(minutes: 5))),
          );
          expect(h.backend.renewedMedia, [asset]);
          expect(find.text(failed), findsOneWidget);
        },
      );

      testWidgets('a public video URL never asks the API', (tester) async {
        final h = await openSheet(tester, public);
        expect(h.backend.renewedMedia, isEmpty);
        expect(find.text(failed), findsOneWidget);
      });
    },
  );
}
