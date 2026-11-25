import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/api/api_client.dart';
import 'package:vitruv_mobile/core/config/app_version.dart';
import 'package:vitruv_mobile/core/routing/app_router.dart';

import '../support/app_harness.dart';

/// Sprint 8B — minimum app version, app side: the build announces its version, a 426 from the
/// server shows the update screen, nobody is signed out, "Erneut prüfen" returns to the app.
void main() {
  test('kAppVersion equals the pubspec version (without build number)', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    final match = RegExp(
      r'^version:\s*([0-9]+\.[0-9]+\.[0-9]+)\+',
      multiLine: true,
    ).firstMatch(pubspec);
    expect(match, isNotNull);
    expect(kAppVersion, match!.group(1));
  });

  test('every request carries version, platform and capability', () {
    final ios = ApiClient.createDio(
      Uri.parse('http://api.test'),
      platform: TargetPlatform.iOS,
    ).options.headers;
    expect(ios[kAppVersionHeader], kAppVersion);
    expect(ios[kAppPlatformHeader], 'ios');
    expect(ios[kCapabilityHeader], '2');
    final android = ApiClient.createDio(
      Uri.parse('http://api.test'),
      platform: TargetPlatform.android,
    ).options.headers;
    expect(android[kAppPlatformHeader], 'android');
    final host = ApiClient.createDio(
      Uri.parse('http://api.test'),
      platform: TargetPlatform.windows,
    ).options.headers;
    expect(host.containsKey(kAppPlatformHeader), isFalse);
    expect(host[kAppVersionHeader], kAppVersion);
  });

  testWidgets('the version header reaches the API on real calls', (
    tester,
  ) async {
    final h = AppHarness();
    await h.pump(tester);
    expect(h.backend.lastHeaders[kAppVersionHeader], kAppVersion);
  });

  testWidgets(
    '426 APP_UPDATE_REQUIRED → update screen; tokens stay; retry returns',
    (tester) async {
      final h = AppHarness();
      h.backend.requireUpdate = true;
      await h.pump(tester);
      expect(find.text('Update erforderlich'), findsOneWidget);
      expect(
        find.text('Installiert: $kAppVersion · Mindestens: 9.0.0'),
        findsOneWidget,
      );
      expect(
        find.text('https://apps.apple.com/app/id0000000000'),
        findsOneWidget,
      );
      // not signed out: the session is still in the (secure) store
      expect(await h.store.read(), isNotNull);
      expect(find.byType(NavigationBar), findsNothing);

      // the app was updated (server accepts again) → back into the app, still signed in
      h.backend.requireUpdate = false;
      await tapOn(tester, find.bySemanticsLabel('Erneut prüfen'));
      expect(find.text('Update erforderlich'), findsNothing);
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.text('HALLO ERIKA'), findsOneWidget);
    },
  );

  testWidgets('while the server still refuses, retry shows the screen again', (
    tester,
  ) async {
    final h = AppHarness();
    h.backend.requireUpdate = true;
    await h.pump(tester);
    await tapOn(tester, find.bySemanticsLabel('Erneut prüfen'));
    expect(find.text('Update erforderlich'), findsOneWidget);
  });

  testWidgets(
    'the update route is not reachable while the build is supported',
    (tester) async {
      final h = AppHarness();
      await h.pump(tester);
      final router = ProviderScope.containerOf(
        tester.element(find.byType(NavigationBar)),
      ).read(appRouterProvider);
      router.go(AppRoutes.appUpdate);
      await tester.pumpAndSettle();
      expect(
        router.routerDelegate.currentConfiguration.uri.path,
        AppRoutes.today,
      );
    },
  );

  testWidgets('update screen fits 320 px at 200 % text', (tester) async {
    final h = AppHarness();
    h.backend.requireUpdate = true;
    await h.pump(tester, width: 320, height: 640, textScale: 2);
    expect(find.text('Update erforderlich'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
