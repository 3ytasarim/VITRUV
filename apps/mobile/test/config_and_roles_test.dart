import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/auth/user_role.dart';
import 'package:vitruv_mobile/core/config/app_config.dart';

void main() {
  test('UserRole mirrors the backend role names exactly', () {
    expect(UserRole.values.map((r) => r.wireValue), [
      'ADMIN',
      'COACH',
      'CLIENT',
    ]);
    expect(UserRole.fromWire('COACH'), UserRole.coach);
    expect(UserRole.fromWire('coach'), isNull);
    expect(UserRole.fromWire(null), isNull);
  });

  test('AppConfig defaults to a local development API when no dart-define is given', () {
    final config = AppConfig.fromEnvironment();
    expect(config.environment, AppEnvironment.development);
    expect(config.apiBaseUrl.port, 4000);
  });

  test('AppEnvironment falls back to development for unknown values', () {
    expect(AppEnvironment.parse('production'), AppEnvironment.production);
    expect(AppEnvironment.parse('nope'), AppEnvironment.development);
  });

  group('Sprint 8A release config', releaseConfigTests);
}

/// Sprint 8A — release builds fail closed on a missing or unsafe API configuration.
void releaseConfigTests() {
  AppConfig release(String url, [String env = 'production']) =>
      AppConfig.resolve(
        apiBaseUrl: url,
        appEnv: env,
        release: true,
        platform: TargetPlatform.iOS,
      );

  test('release: APP_ENV and API_BASE_URL must be given explicitly', () {
    expect(
      () => release('https://api.illustration-only-host.de', ''),
      throwsA(isA<AppConfigError>()),
    );
    expect(
      () => release('https://api.illustration-only-host.de', 'development'),
      throwsA(isA<AppConfigError>()),
    );
    expect(
      () => release('https://api.illustration-only-host.de', 'prod'),
      throwsA(isA<AppConfigError>()),
    );
    expect(() => release(''), throwsA(isA<AppConfigError>()));
  });

  test('release: localhost, loopback, private networks, placeholders and http are refused', () {
    for (final url in [
      'http://api.illustration-only-host.de',
      'https://localhost:4000',
      'https://api.localhost',
      'https://127.0.0.1',
      'https://10.0.2.2:4000',
      'https://192.168.1.20',
      'https://172.16.0.1',
      'https://[::1]',
      'https://8.8.8.8',
      'https://api',
      'https://api.example.com',
      'https://staging.vitruv.test',
      'https://api.vitruv.invalid',
      'https://nas.local',
      'https://CHANGE-ME.illustration-only-host.de',
      'https://your-api-host.de',
      'https://user:pw@api.illustration-only-host.de',
      'https://api.illustration-only-host.de/?x=1',
      'not a url',
    ]) {
      expect(() => release(url), throwsA(isA<AppConfigError>()), reason: url);
      expect(
        () => release(url, 'staging'),
        throwsA(isA<AppConfigError>()),
        reason: url,
      );
    }
  });

  test('release: a real https host passes (value is only an illustration, not the decided URL)', () {
    final config = release('https://api.illustration-only-host.de');
    expect(config.environment, AppEnvironment.production);
    expect(config.apiBaseUrl.host, 'api.illustration-only-host.de');
    expect(
      release(
        'https://staging-api.illustration-only-host.de',
        'staging',
      ).environment,
      AppEnvironment.staging,
    );
  });

  test('error messages name the setting, never the value', () {
    try {
      release('https://user:secret-pw@api.illustration-only-host.de');
      fail('expected AppConfigError');
    } on AppConfigError catch (error) {
      expect(error.message, isNot(contains('secret-pw')));
      expect(error.message, contains('API_BASE_URL'));
    }
  });

  test('debug/profile development keeps the local default; staging in debug is also checked', () {
    final dev = AppConfig.resolve(
      apiBaseUrl: '',
      appEnv: '',
      release: false,
      platform: TargetPlatform.android,
    );
    expect(dev.apiBaseUrl.toString(), 'http://10.0.2.2:4000');
    expect(
      () => AppConfig.resolve(
        apiBaseUrl: 'http://localhost:4000',
        appEnv: 'staging',
        release: false,
        platform: TargetPlatform.iOS,
      ),
      throwsA(isA<AppConfigError>()),
    );
  });
}
