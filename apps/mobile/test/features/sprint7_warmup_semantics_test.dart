import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';
import '../support/fake_backend.dart';

/// Sprint 7 accessibility fix (Sprint 6 finding): a Warm-up with ONE checklist item was read by
/// VoiceOver as one "header button" (section title + hint + checkbox merged). Heading and every
/// checkbox must be separate elements — for one item and for several.
void main() {
  /// "Core-Tag" with [items] warm-up exercises (fictional plan).
  Map<String, Object?> program(int items) {
    final p = enginesProgram();
    final day = (((p['weeks']! as List).first as Map)['days']! as List)
        .cast<Map<String, Object?>>()
        .firstWhere((d) => d['id'] == 'd-core');
    final warmup = (day['sections']! as List).first as Map<String, Object?>;
    warmup['exercises'] = (warmup['exercises']! as List).take(items).toList();
    return p;
  }

  Future<AppHarness> openWarmup(
    WidgetTester tester,
    int items, {
    double width = 390,
    double textScale = 1,
  }) async {
    final h = AppHarness();
    h.backend
      ..program = program(items)
      ..engines = true;
    await h.pump(tester, width: width, height: 1600, textScale: textScale);
    await tapOn(
      tester,
      find.bySemanticsLabel('Workout öffnen: Core-Tag').first,
    );
    await tapOn(tester, find.text('TRAINING STARTEN'));
    return h;
  }

  void expectSeparate(WidgetTester tester, String item) {
    final box = tester.getSemantics(find.bySemanticsLabel('$item abhaken'));
    final data = box.getSemanticsData();
    expect(
      data.label,
      '$item abhaken',
    ); // nothing else merged into the checkbox
    expect(
      box,
      isSemantics(hasCheckedState: true, isButton: true, isHeader: false),
    );
    final heading = tester.getSemantics(
      find.bySemanticsLabel(RegExp(r'^AUFWÄRMEN')).first,
    );
    expect(heading, isSemantics(isHeader: true));
    expect(heading.getSemanticsData().label, isNot(contains('abhaken')));
  }

  testWidgets('49. one-item warm-up: heading and checkbox are separate', (
    tester,
  ) async {
    await openWarmup(tester, 1);
    expectSeparate(tester, 'Hüftmobilisation');
    // ticking still works and is announced as checked
    await tapOn(tester, find.bySemanticsLabel('Hüftmobilisation abhaken'));
    final ticked = tester.getSemantics(
      find.bySemanticsLabel(RegExp('^Hüftmobilisation, ')),
    );
    expect(ticked, isSemantics(isChecked: true, isHeader: false));
  });

  testWidgets('49. several items: every checkbox is its own element', (
    tester,
  ) async {
    await openWarmup(tester, 2);
    expectSeparate(tester, 'Hüftmobilisation');
    expectSeparate(tester, 'Katze-Kuh');
  });

  testWidgets('50. 320 px + 200 % text: one-item warm-up does not overflow', (
    tester,
  ) async {
    await openWarmup(tester, 1, width: 320, textScale: 2);
    expect(tester.takeException(), isNull);
    expectSeparate(tester, 'Hüftmobilisation');
  });
}
