import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/core/config/app_config.dart';

import 'ios_release_audit.dart';

/// Sprint 8B — iOS source audit + release preflight.
///
/// On the Mac, before `flutter build ipa` (values from the owner, never committed):
///
///   flutter test test/release/ios_release_preflight_test.dart \
///     --dart-define=VITRUV_RELEASE_PREFLIGHT=true \
///     --dart-define=APP_ENV=production \
///     --dart-define=API_BASE_URL=OWNER_PROVIDED_HTTPS_URL
///
/// The preflight then FAILS while any blocker is open or the API config would not start.
const _preflight = bool.fromEnvironment('VITRUV_RELEASE_PREFLIGHT');
const _apiBaseUrl = String.fromEnvironment('API_BASE_URL');
const _appEnv = String.fromEnvironment('APP_ENV');

void main() {
  final ios = IosProject.load();

  group('iOS project audit (source)', () {
    test('display name, bundle name and German localisation', () {
      expect(ios.plistString(ios.infoPlist, 'CFBundleDisplayName'), 'VITRUV');
      expect(ios.plistString(ios.infoPlist, 'CFBundleName'), 'VITRUV');
      expect(ios.plistArray(ios.infoPlist, 'CFBundleLocalizations'), ['de']);
    });

    test('iPhone-first: device family 1, portrait only, iOS 15+', () {
      expect(ios.buildSetting('TARGETED_DEVICE_FAMILY'), {'1'});
      expect(
        ios.plistArray(ios.infoPlist, 'UISupportedInterfaceOrientations'),
        ['UIInterfaceOrientationPortrait'],
      );
      expect(ios.buildSetting('IPHONEOS_DEPLOYMENT_TARGET'), {'15.0'});
      expect(ios.plistBool(ios.infoPlist, 'LSRequiresIPhoneOS'), isTrue);
    });

    test('version and build number come from pubspec (flutter build)', () {
      expect(
        ios.plistString(ios.infoPlist, 'CFBundleShortVersionString'),
        r'$(FLUTTER_BUILD_NAME)',
      );
      expect(
        ios.plistString(ios.infoPlist, 'CFBundleVersion'),
        r'$(FLUTTER_BUILD_NUMBER)',
      );
    });

    test(
      'network security: no arbitrary loads, only local networking for dev',
      () {
        expect(ios.plistBool(ios.infoPlist, 'NSAllowsArbitraryLoads'), isNull);
        expect(ios.plistBool(ios.infoPlist, 'NSAllowsLocalNetworking'), isTrue);
      },
    );

    test(
      'no permission prompts the app does not need (no usage descriptions)',
      () {
        expect(
          RegExp(r'<key>NS\w+UsageDescription</key>').hasMatch(ios.infoPlist),
          isFalse,
        );
        expect(ios.plistArray(ios.infoPlist, 'UIBackgroundModes'), isEmpty);
      },
    );

    test('privacy manifest: no tracking, no tracking domains', () {
      expect(ios.plistBool(ios.privacyManifest, 'NSPrivacyTracking'), isFalse);
      expect(
        ios.privacyManifest,
        contains('<key>NSPrivacyTrackingDomains</key>\n\t<array/>'),
      );
      for (final type in [
        'NSPrivacyCollectedDataTypeEmailAddress',
        'NSPrivacyCollectedDataTypeUserID',
        'NSPrivacyCollectedDataTypeFitness',
      ]) {
        expect(ios.privacyManifest, contains(type));
      }
    });

    test(
      'release builds hide the Ernährung placeholder unless explicitly enabled',
      () {
        // compile-time default of this test build = the release default
        expect(const bool.fromEnvironment('VITRUV_NUTRITION_TAB'), isFalse);
      },
    );
  });

  test(
    _preflight
        ? 'RELEASE PREFLIGHT: no open blocker, release API config valid'
        : 'release preflight (documentation mode): the known owner blockers are reported',
    () {
      final blockers = ios.blockers();
      if (!_preflight) {
        // Sprint 8B state — update this list when the owner resolves a blocker.
        expect(blockers, [
          IosBlocker.bundleIdProvisional,
          IosBlocker.teamMissing,
          IosBlocker.exportComplianceUndecided,
        ]);
        return;
      }
      expect(blockers, isEmpty, reason: 'open owner blockers: $blockers');
      // throws AppConfigError (names the setting, never the value) if not releasable
      final config = AppConfig.resolve(
        apiBaseUrl: _apiBaseUrl,
        appEnv: _appEnv,
        release: true,
        platform: TargetPlatform.iOS,
      );
      expect(config.environment, AppEnvironment.production);
    },
  );
}
