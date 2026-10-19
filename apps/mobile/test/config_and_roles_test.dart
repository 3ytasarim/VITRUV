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
}
