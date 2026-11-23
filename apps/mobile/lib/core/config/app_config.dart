import 'package:flutter/foundation.dart';

/// Build-time configuration, injected with `--dart-define` (never hardcoded secrets).
///
///   flutter run --dart-define=API_BASE_URL=https://api.example.com --dart-define=APP_ENV=staging
///
/// The app holds no credentials: it only knows the public API base URL.
///
/// Sprint 8A — release builds FAIL CLOSED (docs/ios-training-sprint8a-apple-readiness.md §API):
/// a release build (`flutter build ipa/apk --release`) refuses to start unless BOTH
/// `APP_ENV=staging|production` and `API_BASE_URL` are given explicitly and the URL is https,
/// a real public host (no localhost / loopback / private network / emulator alias / reserved
/// test domain), without credentials, query or fragment, and not a placeholder. The real
/// production URL is decided by the owner; it is never guessed or defaulted here.
@immutable
class AppConfig {
  const AppConfig({required this.apiBaseUrl, required this.environment});

  final Uri apiBaseUrl;
  final AppEnvironment environment;

  static const _apiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const _appEnv = String.fromEnvironment('APP_ENV');

  factory AppConfig.fromEnvironment() => AppConfig.resolve(
    apiBaseUrl: _apiBaseUrl,
    appEnv: _appEnv,
    release: kReleaseMode,
    platform: defaultTargetPlatform,
  );

  /// Pure resolution (testable). Throws [AppConfigError] with a message that names the setting,
  /// never a value.
  factory AppConfig.resolve({
    required String apiBaseUrl,
    required String appEnv,
    required bool release,
    required TargetPlatform platform,
  }) {
    final AppEnvironment environment;
    if (release) {
      final parsed = AppEnvironment.tryParse(appEnv);
      if (parsed == null || parsed == AppEnvironment.development) {
        throw AppConfigError(
          'Release builds need --dart-define=APP_ENV=staging or production.',
        );
      }
      if (apiBaseUrl.trim().isEmpty) {
        throw AppConfigError(
          'Release builds need --dart-define=API_BASE_URL (no default).',
        );
      }
      environment = parsed;
    } else {
      environment = AppEnvironment.parse(
        appEnv.isEmpty ? 'development' : appEnv,
      );
    }
    final raw = apiBaseUrl.trim().isNotEmpty
        ? apiBaseUrl.trim()
        : _developmentDefault(platform);
    final uri = Uri.tryParse(raw);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw AppConfigError('API_BASE_URL is not a valid absolute URL.');
    }
    if (environment != AppEnvironment.development || release) {
      final problem = deployedApiUrlProblem(uri);
      if (problem != null) {
        throw AppConfigError(
          'API_BASE_URL is not allowed for ${environment.name}: $problem',
        );
      }
    }
    return AppConfig(apiBaseUrl: uri, environment: environment);
  }

  /// Local API during development. The Android emulator reaches the host machine via 10.0.2.2.
  static String _developmentDefault(TargetPlatform platform) =>
      platform == TargetPlatform.android
      ? 'http://10.0.2.2:4000'
      : 'http://localhost:4000';
}

/// Why [uri] can not be the API of a staging/production build (null = acceptable). Checks the
/// shape only — whether it is the RIGHT server is the owner's release decision.
String? deployedApiUrlProblem(Uri uri) {
  if (uri.scheme != 'https') return 'https required';
  if (uri.userInfo.isNotEmpty) return 'no credentials in the URL';
  if (uri.hasQuery || uri.hasFragment) return 'no query or fragment';
  final host = uri.host.toLowerCase();
  const localNames = {'localhost', 'ip6-localhost', 'ip6-loopback'};
  if (localNames.contains(host) || host.endsWith('.localhost')) {
    return 'local host';
  }
  // Reserved / internal names (RFC 2606/6761/6762) and common placeholders.
  const reservedSuffixes = [
    '.local',
    '.internal',
    '.test',
    '.invalid',
    '.example',
    '.lan',
    '.home.arpa',
  ];
  if (reservedSuffixes.any(host.endsWith)) return 'reserved or internal domain';
  const reservedHosts = {'example.com', 'example.org', 'example.net'};
  if (reservedHosts.contains(host) ||
      reservedHosts.any((d) => host.endsWith('.$d'))) {
    return 'placeholder domain';
  }
  const placeholders = [
    'change-me',
    'changeme',
    'placeholder',
    'your-',
    'todo',
    'xxx',
    'replace',
  ];
  final whole = uri.toString().toLowerCase();
  if (placeholders.any(whole.contains)) return 'placeholder value';
  if (!host.contains('.')) return 'not a public host name';
  final ip = _ipv4(host);
  if (ip != null) {
    final [a, b, _, _] = ip;
    final private =
        a == 10 ||
        a == 127 ||
        a == 0 ||
        (a == 169 && b == 254) ||
        (a == 172 && b >= 16 && b <= 31) ||
        (a == 192 && b == 168) ||
        (a == 100 && b >= 64 && b <= 127);
    return private
        ? 'loopback or private network address'
        : 'use a host name, not an IP address';
  }
  // IPv6 literal
  if (host.contains(':')) return 'use a host name, not an IP address';
  return null;
}

List<int>? _ipv4(String host) {
  final parts = host.split('.');
  if (parts.length != 4) return null;
  final values = parts.map(int.tryParse).toList();
  if (values.any((v) => v == null || v < 0 || v > 255)) return null;
  return values.cast<int>();
}

/// Misconfigured build. The message names the setting, never its value.
class AppConfigError extends StateError {
  AppConfigError(super.message);
}

enum AppEnvironment {
  development,
  staging,
  production;

  static AppEnvironment parse(String value) =>
      tryParse(value) ?? AppEnvironment.development;

  /// Exact name or null (release builds accept no fallback).
  static AppEnvironment? tryParse(String value) {
    for (final e in AppEnvironment.values) {
      if (e.name == value) return e;
    }
    return null;
  }
}
