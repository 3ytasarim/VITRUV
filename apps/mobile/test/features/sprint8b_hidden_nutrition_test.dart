import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/core/config/release_features.dart';
import 'package:vitruv_mobile/core/routing/app_router.dart';

import '../support/app_harness.dart';

/// Sprint 8B — "Ernährung" is a placeholder and must not reach App Review: hidden by default,
/// unreachable by deep link, the other tabs keep their order and behaviour.
void main() {
  ProviderContainer containerOf(WidgetTester tester) =>
      ProviderScope.containerOf(tester.element(find.byType(NavigationBar)));

  testWidgets('default build: flag off, four destinations in release order', (
    tester,
  ) async {
    final h = AppHarness();
    await h.pump(tester);
    expect(containerOf(tester).read(nutritionTabEnabledProvider), isFalse);
    final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
    final labels = bar.destinations
        .map((d) => (d as NavigationDestination).label)
        .toList();
    expect(labels, ['Heute', 'Training', 'Fortschritt', 'Profil']);
    expect(find.byIcon(Icons.restaurant_outlined), findsNothing);
  });

  testWidgets('a deep link to /ernaehrung lands on "Heute"', (tester) async {
    final h = AppHarness();
    await h.pump(tester);
    final router = containerOf(tester).read(appRouterProvider);
    router.go(AppRoutes.nutrition);
    await tester.pumpAndSettle();
    expect(
      router.routerDelegate.currentConfiguration.uri.path,
      AppRoutes.today,
    );
    expect(find.text('HALLO ERIKA'), findsOneWidget);
    expect(
      find.text('Dieser Bereich folgt in einem der nächsten Sprints.'),
      findsNothing,
    );
    router.go('${AppRoutes.nutrition}/irgendwas');
    await tester.pumpAndSettle();
    expect(
      router.routerDelegate.currentConfiguration.uri.path,
      AppRoutes.today,
    );
  });

  testWidgets(
    'the remaining tabs map to the right branches after the removal',
    (tester) async {
      final h = AppHarness();
      await h.pump(tester);
      final router = containerOf(tester).read(appRouterProvider);
      final expected = {
        Icons.fitness_center_outlined: AppRoutes.training,
        Icons.insights_outlined: AppRoutes.progress,
        Icons.person_outline: AppRoutes.profile,
        Icons.today_outlined: AppRoutes.today,
      };
      for (final MapEntry(key: icon, value: path) in expected.entries) {
        await tapOn(tester, find.byIcon(icon));
        expect(
          router.routerDelegate.currentConfiguration.uri.path,
          path,
          reason: path,
        );
      }
    },
  );

  testWidgets('signed out, the hidden path still goes to the login', (
    tester,
  ) async {
    final h = AppHarness(signedIn: false);
    await h.pump(tester);
    final router = ProviderScope.containerOf(
      tester.element(find.byType(Scaffold).first),
    ).read(appRouterProvider);
    router.go(AppRoutes.nutrition);
    await tester.pumpAndSettle();
    expect(
      router.routerDelegate.currentConfiguration.uri.path,
      AppRoutes.login,
    );
  });

  testWidgets('re-enabled build: the tab and its placeholder come back', (
    tester,
  ) async {
    final h = AppHarness();
    await h.pump(
      tester,
      extra: [nutritionTabEnabledProvider.overrideWithValue(true)],
    );
    final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(bar.destinations, hasLength(5));
    await tapOn(tester, find.byIcon(Icons.restaurant_outlined));
    expect(
      find.text('Dieser Bereich folgt in einem der nächsten Sprints.'),
      findsOneWidget,
    );
  });
}
