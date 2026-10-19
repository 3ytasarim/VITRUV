import 'dart:async';

import '../core/errors/app_failure.dart';
import '../core/time/clock.dart';
import 'auth_models.dart';
import 'token_store.dart';

/// Exchanges a refresh token for a new pair (`POST /v1/auth/refresh`).
typedef RefreshCall = Future<AuthTokens> Function(String refreshToken);

/// The signed-in session's tokens: in memory for requests, persisted in [TokenStore].
///
/// SINGLE-FLIGHT REFRESH: at most one refresh request is ever in flight. Every caller that needs
/// a fresh access token while one is running awaits the SAME future (no refresh storm — a second
/// parallel refresh with the already rotated token would be rejected by the API, and reusing an
/// old refresh token revokes the whole session). A caller whose request failed with an access
/// token that has since been replaced gets the current token without a new refresh.
///
/// A REJECTED refresh (401 or any API error) ends the session exactly once: tokens are cleared
/// and [onExpired] fires. A NETWORK failure keeps the tokens (the user stays signed in and can
/// retry when online) and is passed on to the waiting callers.
class AuthSession {
  AuthSession({
    required TokenStore store,
    required RefreshCall refresh,
    Clock clock = const SystemClock(),
    this.refreshMargin = const Duration(seconds: 30),
  }) : _tokenStore = store,
       _refreshCall = refresh,
       _time = clock;

  final TokenStore _tokenStore;
  final RefreshCall _refreshCall;
  final Clock _time;

  /// Refresh this long before the access token expires (avoids a guaranteed 401).
  final Duration refreshMargin;

  /// Called once when the server rejected the session (refresh failed). Set by the controller.
  void Function()? onExpired;

  AuthTokens? _tokens;
  Future<String?>? _inFlight;

  bool get isSignedIn => _tokens != null;
  String? get accessToken => _tokens?.accessToken;
  String? get refreshToken => _tokens?.refreshToken;

  bool get accessTokenExpiring {
    final tokens = _tokens;
    if (tokens == null) return false;
    return !_time.now().isBefore(
      tokens.accessTokenExpiresAt.subtract(refreshMargin),
    );
  }

  /// Loads persisted tokens at app start. Returns whether a session exists.
  Future<bool> restore() async {
    final stored = await _tokenStore.read();
    if (stored != null && !_time.now().isBefore(stored.refreshTokenExpiresAt)) {
      await _tokenStore.clear();
      _tokens = null;
      return false;
    }
    _tokens = stored;
    return stored != null;
  }

  /// Persist first, then use: a crash between the two never leaves the app with a rotated token
  /// that is not stored.
  Future<void> save(AuthTokens tokens) async {
    await _tokenStore.write(tokens);
    _tokens = tokens;
  }

  /// Local sign-out (no server call). Idempotent.
  Future<void> clear() async {
    _tokens = null;
    await _tokenStore.clear();
  }

  /// A valid access token, refreshing first if needed. [failedAccessToken]: the token a request
  /// was just rejected with (401) — refresh only if it is still the current one.
  Future<String?> freshAccessToken({String? failedAccessToken}) {
    final tokens = _tokens;
    if (tokens == null) return Future.value(null);
    if (failedAccessToken != null && failedAccessToken != tokens.accessToken) {
      return Future.value(tokens.accessToken);
    }
    if (failedAccessToken == null &&
        !accessTokenExpiring &&
        _inFlight == null) {
      return Future.value(tokens.accessToken);
    }
    return _inFlight ??= _refresh(tokens).whenComplete(() => _inFlight = null);
  }

  Future<String?> _refresh(AuthTokens current) async {
    try {
      final next = await _refreshCall(current.refreshToken);
      // A sign-out while the refresh was running wins.
      if (_tokens == null) return null;
      await save(next);
      return next.accessToken;
    } on NetworkFailure {
      rethrow;
    } on Object {
      final wasSignedIn = _tokens != null;
      await clear();
      if (wasSignedIn) onExpired?.call();
      return null;
    }
  }
}
