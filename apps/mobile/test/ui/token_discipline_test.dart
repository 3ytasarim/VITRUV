import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Product UI code must use the generated VITRUV tokens, never raw design values.
/// (Only the generated token file may contain colour literals.)
void main() {
  final files = [
    ...Directory('lib/shared').listSync(recursive: true),
    ...Directory('lib/features').listSync(recursive: true),
    File('lib/core/theme/app_theme.dart'),
    File('lib/core/theme/chamfer_shape.dart'),
  ].whereType<File>().where((f) => f.path.endsWith('.dart')).toList();

  final rules = <String, RegExp>{
    'colour literal': RegExp(r'Color\(0x'),
    // Word boundary: `VitruvColors.dark` is the token API, not Material's palette.
    'Colors.<palette>': RegExp(r'(?<![A-Za-z])Colors\.(?!transparent\b)[a-z]'),
    'numeric EdgeInsets': RegExp(
      r'EdgeInsets\.(all|symmetric|only|fromLTRB)\(\s*(horizontal:|vertical:|left:|top:)?\s*\d',
    ),
    'numeric BorderRadius': RegExp(r'BorderRadius\.circular\(\s*\d'),
    'literal fontSize': RegExp(r'fontSize:\s*\d'),
    // `vitruvTextStyle(...)` is the token helper; only a bare `TextStyle(` is forbidden.
    'raw TextStyle': RegExp(r'(?<![A-Za-z])TextStyle\('),
  };

  test(
    'found the source files to check',
    () => expect(files.length, greaterThan(10)),
  );

  for (final MapEntry(key: name, value: pattern) in rules.entries) {
    test('no $name in product UI code', () {
      final offenders = [
        for (final f in files)
          for (final (i, line) in f.readAsLinesSync().indexed)
            if (pattern.hasMatch(line) && !line.trimLeft().startsWith('//'))
              '${f.path}:${i + 1}: ${line.trim()}',
      ];
      // vitruv_token_types.dart builds the one TextStyle from token roles — it is the exception.
      expect(offenders, isEmpty);
    });
  }
}
