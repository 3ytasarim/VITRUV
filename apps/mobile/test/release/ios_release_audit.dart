import 'dart:io';

/// Sprint 8B — source audit of the iOS project (Windows-safe: reads text files only; no Xcode).
/// Used by `ios_release_preflight_test.dart` in two modes:
///   normal test run  → documents the current state (known open blockers)
///   Mac preflight    → `--dart-define=VITRUV_RELEASE_PREFLIGHT=true` fails on ANY blocker
///
/// A blocker is something only the owner can resolve (Apple account, legal decision). The audit
/// never "fixes" them by inventing values.
const kProvisionalBundleId = 'com.vitruv.vitruvMobile';

enum IosBlocker {
  /// Provisional Flutter default bundle id — final id needs the owner's Apple account.
  bundleIdProvisional,

  /// No DEVELOPMENT_TEAM — the Team ID comes from the owner's Apple Developer account.
  teamMissing,

  /// ITSAppUsesNonExemptEncryption not declared — export compliance decision open.
  exportComplianceUndecided,
}

class IosProject {
  IosProject._(this.infoPlist, this.pbxproj, this.privacyManifest);

  factory IosProject.load([String root = 'ios']) => IosProject._(
    File('$root/Runner/Info.plist').readAsStringSync(),
    File('$root/Runner.xcodeproj/project.pbxproj').readAsStringSync(),
    File('$root/Runner/PrivacyInfo.xcprivacy').readAsStringSync(),
  );

  final String infoPlist;
  final String pbxproj;
  final String privacyManifest;

  /// Value of `<key>name</key><string>value</string>` (first match) in a plist.
  String? plistString(String plist, String key) =>
      RegExp('<key>${RegExp.escape(key)}</key>\\s*<string>([^<]*)</string>')
          .firstMatch(plist)
          ?.group(1);

  bool? plistBool(String plist, String key) {
    final m = RegExp('<key>${RegExp.escape(key)}</key>\\s*<(true|false)\\s*/>')
        .firstMatch(plist);
    return m == null ? null : m.group(1) == 'true';
  }

  List<String> plistArray(String plist, String key) {
    final m = RegExp(
      '<key>${RegExp.escape(key)}</key>\\s*<array>([\\s\\S]*?)</array>',
    ).firstMatch(plist);
    if (m == null) return const [];
    return RegExp('<string>([^<]*)</string>')
        .allMatches(m.group(1)!)
        .map((x) => x.group(1)!)
        .toList();
  }

  /// All values of a build setting in the project (every configuration).
  Set<String> buildSetting(String name) =>
      RegExp('\\b${RegExp.escape(name)} = ([^;]+);')
          .allMatches(pbxproj)
          .map((m) => m.group(1)!.trim())
          .toSet();

  /// The app target's bundle ids (tests target excluded).
  Set<String> get appBundleIds =>
      buildSetting('PRODUCT_BUNDLE_IDENTIFIER')
          .where((id) => !id.endsWith('.RunnerTests'))
          .toSet();

  List<IosBlocker> blockers() => [
    if (appBundleIds.contains(kProvisionalBundleId))
      IosBlocker.bundleIdProvisional,
    if (buildSetting('DEVELOPMENT_TEAM').where((t) => t.isNotEmpty).isEmpty)
      IosBlocker.teamMissing,
    if (plistBool(infoPlist, 'ITSAppUsesNonExemptEncryption') == null)
      IosBlocker.exportComplianceUndecided,
  ];
}
