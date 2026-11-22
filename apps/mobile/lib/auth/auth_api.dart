import '../api/api_client.dart';
import '../core/json/json_reader.dart';
import 'auth_models.dart';

/// `/v1/auth` — mirrors packages/contracts/src/auth.ts. Uses the PLAIN client (no interceptor):
/// login/refresh/logout carry their credentials explicitly.
class AuthApi {
  const AuthApi(this._client);

  final ApiClient _client;

  /// [loginId]: e-mail address OR username. The request field is still called `email`
  /// (`loginRequestSchema.email` = `authLoginIdSchema`, kept for compatibility); the server trims
  /// and lowercases it, the app sends it already normalised.
  Future<({AuthTokens tokens, CurrentUser user})> login(
    String loginId,
    String password,
  ) async {
    final json = JsonReader(
      await _client.sendJson('POST', '/v1/auth/login', {
        'email': normalizeLoginId(loginId),
        'password': password,
        'clientType': 'MOBILE',
      }),
    );
    return (
      tokens: AuthTokens.fromJson(json.object('tokens')),
      user: CurrentUser.fromJson(json.object('user')),
    );
  }

  Future<AuthTokens> refresh(String refreshToken) async => AuthTokens.fromJson(
    JsonReader(
      await _client.sendJson('POST', '/v1/auth/refresh', {
        'refreshToken': refreshToken,
      }),
    ).object('tokens'),
  );

  /// Revokes the session server-side (idempotent 204).
  Future<void> logout(String refreshToken) => _client.sendJson(
    'POST',
    '/v1/auth/logout',
    {'refreshToken': refreshToken},
  );
}

/// Same normalisation as `authLoginIdSchema` (packages/contracts/src/auth.ts): trim + lowercase.
String normalizeLoginId(String value) => value.trim().toLowerCase();

final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
final _usernamePattern = RegExp(r'^[a-z0-9][a-z0-9._-]{2,31}$');

/// Client-side mirror of `authLoginIdSchema`: an e-mail address when it contains "@", otherwise a
/// username of 3–32 characters (a–z, 0–9, ".", "_", "-"; starting with a letter or digit).
/// Never stricter than the server — it only saves a round trip for obvious typos.
bool isValidLoginId(String value) {
  final v = normalizeLoginId(value);
  if (v.isEmpty || v.length > 254) return false;
  return v.contains('@')
      ? _emailPattern.hasMatch(v)
      : _usernamePattern.hasMatch(v);
}
