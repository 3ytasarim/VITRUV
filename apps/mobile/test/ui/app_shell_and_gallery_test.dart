import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:vitruv_mobile/core/routing/app_router.dart';
import 'package:vitruv_mobile/features/design_gallery/design_gallery_access.dart';
import 'package:vitruv_mobile/features/design_gallery/design_gallery_screen.dart';
import 'package:vitruv_mobile/shared/ui/ui.dart';

import 'helpers.dart';

const gallerySections = [
  'colors',
  'typography',
  'spacing',
  'shapes',
  'buttons',
  'cards',
  'media',
  'labels',
  'navigation',
];

GoRouter routerOf(WidgetTester tester) =>
    ProviderScope.containerOf(tester.element(find.byType(NavigationBar).first))
        .read(appRouterProvider);

void main() {
  group('navigation shell', () {
    testWidgets('all five destinations are reachable', (tester) async {
      await tester.pumpWidget(appUnderTest());
      await tester.pumpAndSettle();
      final tabs = {
        Icons.today_outlined: 'Heute',
        Icons.fitness_center_outlined: 'Training',
        Icons.restaurant_outlined: 'Ernährung',
        Icons.insights_outlined: 'Fortschritt',
        Icons.person_outline: 'Profil',
      };
      for (final MapEntry(key: icon, value: label) in tabs.entries) {
        final target = find.byIcon(icon);
        if (target.evaluate().isNotEmpty) {
          await tester.tap(target);
          await tester.pumpAndSettle();
        }
        expect(
          find.descendant(of: find.byType(AppBar), matching: find.text(label)),
          findsOneWidget,
          reason: label,
        );
      }
    });

    testWidgets('design gallery is not a bottom-navigation destination', (
      tester,
    ) async {
      await tester.pumpWidget(appUnderTest());
      await tester.pumpAndSettle();
      final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(bar.destinations, hasLength(5));
      expect(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.textContaining('Design'),
        ),
        findsNothing,
      );
    });

    testWidgets('selection marker is chamfered (not the Material pill)', (
      tester,
    ) async {
      await tester.pumpWidget(appUnderTest());
      await tester.pumpAndSettle();
      final theme = Theme.of(tester.element(find.byType(NavigationBar)));
      expect(
        theme.navigationBarTheme.indicatorShape,
        isA<BeveledRectangleBorder>(),
      );
    });
  });

  group('design gallery access', () {
    testWidgets(
      'development: reachable from Profil and renders every section',
      (tester) async {
        tester.view.physicalSize = const Size(430, 40000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          appUnderTest(
            overrides: [designGalleryEnabledProvider.overrideWithValue(true)],
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byIcon(Icons.person_outline));
        await tester.pumpAndSettle();
        await tester.tap(find.text('DESIGN-GALERIE (ENTWICKLUNG)'));
        // The gallery shows looping loading spinners, so it never "settles".
        await tester.pump(const Duration(seconds: 1));

        expect(find.byType(DesignGalleryScreen), findsOneWidget);
        for (final id in gallerySections) {
          expect(find.byKey(Key('gallery-$id')), findsOneWidget, reason: id);
        }
        expect(find.byType(VitruvButton), findsWidgets);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'release-like config: no entry point and the route does not exist',
      (tester) async {
        await tester.pumpWidget(
          appUnderTest(
            overrides: [designGalleryEnabledProvider.overrideWithValue(false)],
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byIcon(Icons.person_outline));
        await tester.pumpAndSettle();
        expect(find.textContaining('DESIGN-GALERIE'), findsNothing);

        routerOf(tester).go(AppRoutes.designGallery);
        await tester.pumpAndSettle();
        expect(find.byType(DesignGalleryScreen), findsNothing);
      },
    );
  });
}
