import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/api/health_api.dart';
import 'package:vitruv_mobile/api/providers.dart';
import 'package:vitruv_mobile/app.dart';
import 'package:vitruv_mobile/auth/token_store.dart';
import 'package:vitruv_mobile/core/config/app_config.dart';
import 'package:vitruv_mobile/core/time/clock.dart';

import 'fake_backend.dart';

/// Test wiring of the real app: real router, auth controller, Dio stack and screens — only the
/// transport ([FakeBackend]), the token store (memory) and the clock are replaced.
class AppHarness {
  AppHarness({FakeBackend? backend, FakeClock? clock, bool signedIn = true})
    : clock = clock ?? FakeClock(DateTime.utc(2026, 10, 15, 16)),
      store = MemoryTokenStore() {
    this.backend = backend ?? FakeBackend(now: this.clock.now);
    if (signedIn) store.tokens = this.backend.issue('kunde@example.invalid');
  }

  final FakeClock clock;
  late final FakeBackend backend;
  final MemoryTokenStore store;

  List<Override> get overrides => [
    appConfigProvider.overrideWithValue(
      AppConfig(
        apiBaseUrl: Uri.parse('http://api.test'),
        environment: AppEnvironment.development,
      ),
    ),
    httpAdapterProvider.overrideWithValue(backend),
    tokenStoreProvider.overrideWithValue(store),
    clockProvider.overrideWithValue(clock),
    apiHealthProvider.overrideWith(
      (ref) async => const ApiHealth(status: 'ok', version: 'test'),
    ),
  ];

  Widget app({List<Override> extra = const []}) => ProviderScope(
    overrides: [...overrides, ...extra],
    child: const VitruvApp(),
  );

  /// Pumps the app at a logical size / text scale and lets it settle (session restore, loads).
  Future<void> pump(
    WidgetTester tester, {
    double width = 390,
    double height = 844,
    double textScale = 1,
    bool disableAnimations = false,
    List<Override> extra = const [],
  }) async {
    tester.view.physicalSize = Size(width, height);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = textScale;
    if (disableAnimations) {
      tester.platformDispatcher.accessibilityFeaturesTestValue =
          const FakeAccessibilityFeatures(disableAnimations: true);
    }
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearAllTestValues);
    await tester.pumpWidget(app(extra: extra));
    await tester.pumpAndSettle();
  }
}

/// Taps the widget found by [finder] (scrolling it into view first) and settles.
Future<void> tapOn(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
  await tester.tap(finder.first);
  await tester.pumpAndSettle();
}
