import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Sprint 8B — the marketing version of this build, sent to the API on every request so the
/// server can enforce a minimum supported version (packages/shared/src/app-version.ts).
///
/// Must equal the `version:` in pubspec.yaml without the build number (a test enforces it).
/// Bump both together for every store release.
const kAppVersion = '1.0.0';

const kAppVersionHeader = 'X-Vitruv-App-Version';
const kAppPlatformHeader = 'X-Vitruv-App-Platform';

/// `ios` / `android`; null on other platforms (tests on the host, desktop) — the header is
/// then omitted and the server applies its rule for unknown platforms.
String? appPlatformHeaderValue(TargetPlatform platform) => switch (platform) {
  TargetPlatform.iOS => 'ios',
  TargetPlatform.android => 'android',
  _ => null,
};

/// What the server said when it refused this build (HTTP 426 APP_UPDATE_REQUIRED).
@immutable
class AppUpdateRequirement {
  const AppUpdateRequirement({this.minimumVersion, this.updateUrl});

  final String? minimumVersion;
  final String? updateUrl;
}

/// Non-null = the app shows the update screen instead of the client area. Nothing is signed out:
/// tokens stay in the keychain, and after updating the app continues where it was.
class AppUpdateController extends Notifier<AppUpdateRequirement?> {
  @override
  AppUpdateRequirement? build() => null;

  void require(AppUpdateRequirement requirement) => state = requirement;

  /// "Erneut prüfen": leave the update screen; the next client request decides again.
  void clear() => state = null;
}

final appUpdateProvider =
    NotifierProvider<AppUpdateController, AppUpdateRequirement?>(
      AppUpdateController.new,
    );
