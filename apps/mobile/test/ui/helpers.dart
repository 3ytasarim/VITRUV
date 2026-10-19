import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/core/theme/app_theme.dart';

import '../support/app_harness.dart';

/// Pumps [child] inside the production dark theme.
Future<void> pumpUi(
  WidgetTester tester,
  Widget child, {
  double width = 390,
  double height = 844,
  double textScale = 1,
  bool scroll = false,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: MediaQuery(
        data: MediaQueryData(
          size: Size(width, height),
          textScaler: TextScaler.linear(textScale),
        ),
        child: Scaffold(
          body: scroll
              ? SingleChildScrollView(child: child)
              : Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: child,
                  ),
                ),
        ),
      ),
    ),
  );
}

/// The whole app, signed in as a fictional client against the in-memory backend
/// (test/support/fake_backend.dart) — never the network.
Widget appUnderTest({List<Override> overrides = const []}) =>
    AppHarness().app(extra: overrides);
