import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/providers.dart';
import '../core/errors/app_failure.dart';
import '../core/json/json_reader.dart';
import 'auth_models.dart';

/// Authentication state of the app (CLIENT accounts only — coaches use the web panel).
sealed class AuthState {
  const AuthState();
}

/// Restoring a stored session at start (splash).
final class AuthRestoring extends AuthState {
  const AuthRestoring();
}

/// A stored session exists but could not be verified (offline at start). Tokens are kept.
final class AuthUnavailable extends AuthState {
  const AuthUnavailable();
}

final class SignedOut extends AuthState {
  const SignedOut({this.reason});

  final SignedOutReason? reason;
}

enum SignedOutReason { sessionExpired, notClient }

final class SignedIn extends AuthState {
  const SignedIn(this.user);

  final CurrentUser user;
}

/// Why a login attempt failed — one generic message for wrong credentials (no account probing).
enum LoginError { invalidCredentials, rateLimited, notClient, network, unknown }

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    final session = ref.watch(authSessionProvider);
    session.onExpired = () =>
        state = const SignedOut(reason: SignedOutReason.sessionExpired);
    unawaited(Future.microtask(restore));
    return const AuthRestoring();
  }

  /// Start-up: stored tokens → verify with `/v1/auth/me` (refreshing if needed).
  Future<void> restore() async {
    state = const AuthRestoring();
    final session = ref.read(authSessionProvider);
    if (!await session.restore()) {
      state = const SignedOut();
      return;
    }
    try {
      final me = await ref.read(apiClientProvider).getJson('/v1/auth/me');
      final user = CurrentUser.fromJson(JsonReader(me).object('user'));
      if (!user.isClient) {
        await _endSession();
        state = const SignedOut(reason: SignedOutReason.notClient);
        return;
      }
      state = SignedIn(user);
    } on NetworkFailure {
      if (session.isSignedIn) state = const AuthUnavailable();
    } on ApiFailure catch (failure) {
      if (failure.isUnauthenticated || !session.isSignedIn) {
        await session.clear();
        state = const SignedOut(reason: SignedOutReason.sessionExpired);
      } else {
        state = const AuthUnavailable();
      }
    } on Object {
      state = const AuthUnavailable();
    }
  }

  /// Returns null on success, otherwise the reason to show.
  Future<LoginError?> login(String email, String password) async {
    try {
      final result = await ref
          .read(authApiProvider)
          .login(email.trim(), password);
      if (!result.user.isClient) {
        // Coaches/admins have no app access: revoke the just-created session right away.
        await _revoke(result.tokens.refreshToken);
        return LoginError.notClient;
      }
      await ref.read(authSessionProvider).save(result.tokens);
      state = SignedIn(result.user);
      return null;
    } on NetworkFailure {
      return LoginError.network;
    } on ApiFailure catch (failure) {
      return switch (failure.code) {
        'UNAUTHENTICATED' ||
        'VALIDATION_FAILED' => LoginError.invalidCredentials,
        'RATE_LIMITED' => LoginError.rateLimited,
        _ => LoginError.unknown,
      };
    } on Object {
      return LoginError.unknown;
    }
  }

  /// Sign-out policy: 1. revoke server-side (best effort, short timeout) 2. ALWAYS clear the local
  /// credentials, even offline 3. state → SignedOut (router shows the login).
  Future<void> logout() async {
    await _endSession();
    state = const SignedOut();
  }

  Future<void> _endSession() async {
    final session = ref.read(authSessionProvider);
    final refreshToken = session.refreshToken;
    if (refreshToken != null) await _revoke(refreshToken);
    await session.clear();
  }

  Future<void> _revoke(String refreshToken) async {
    try {
      await ref
          .read(authApiProvider)
          .logout(refreshToken)
          .timeout(const Duration(seconds: 5));
    } on Object {
      // Offline / server error: the local credentials are removed anyway; the server session
      // expires on its own (idle timeout) and its refresh token is never used again.
    }
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

/// The signed-in client's user id, or null. Data providers watch this, so all cached client data
/// is dropped on sign-out / account switch.
final signedInUserIdProvider = Provider<String?>((ref) {
  final state = ref.watch(authControllerProvider);
  return state is SignedIn ? state.user.id : null;
});
