import 'package:flutter/foundation.dart';

/// Build-time configuration, injected with `--dart-define` (never hardcoded secrets).
///
///   flutter run --dart-define=API_BASE_URL=https://api.example.com --dart-define=APP_ENV=staging
///
/// The app holds no credentials: it only knows the public API base URL.
@immutable
class AppConfig {
  const AppConfig({required this.apiBaseUrl, required this.environment});

  final Uri apiBaseUrl;
  final AppEnvironment environment;

  static const _apiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const _appEnv = String.fromEnvironment(
    'APP_ENV',
    defaultValue: 'development',
  );

  factory AppConfig.fromEnvironment() {
    final environment = AppEnvironment.parse(_appEnv);
    final raw = _apiBaseUrl.isNotEmpty ? _apiBaseUrl : _developmentDefault();
    final uri = Uri.tryParse(raw);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw StateError('API_BASE_URL is not a valid absolute URL.');
    }
    if (environment == AppEnvironment.production && uri.scheme != 'https') {
      throw StateError('Production builds require an https API_BASE_URL.');
    }
    return AppConfig(apiBaseUrl: uri, environment: environment);
  }

  /// Local API during development. The Android emulator reaches the host machine via 10.0.2.2.
  static String _developmentDefault() =>
      defaultTargetPlatform == TargetPlatform.android
      ? 'http://10.0.2.2:4000'
      : 'http://localhost:4000';
}

enum AppEnvironment {
  development,
  staging,
  production;

  static AppEnvironment parse(String value) => AppEnvironment.values.firstWhere(
    (e) => e.name == value,
    orElse: () => AppEnvironment.development,
  );
}
