import '../api/api_client.dart';
import '../core/json/json_reader.dart';
import 'auth_models.dart';

/// `/v1/auth` — mirrors packages/contracts/src/auth.ts. Uses the PLAIN client (no interceptor):
/// login/refresh/logout carry their credentials explicitly.
class AuthApi {
  const AuthApi(this._client);

  final ApiClient _client;

  Future<({AuthTokens tokens, CurrentUser user})> login(
    String email,
    String password,
  ) async {
    final json = JsonReader(
      await _client.sendJson('POST', '/v1/auth/login', {
        'email': email,
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
