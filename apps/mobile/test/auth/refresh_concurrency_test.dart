import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/api/api_client.dart';
import 'package:vitruv_mobile/auth/auth_api.dart';
import 'package:vitruv_mobile/auth/auth_interceptor.dart';
import 'package:vitruv_mobile/auth/auth_models.dart';
import 'package:vitruv_mobile/auth/auth_session.dart';
import 'package:vitruv_mobile/auth/token_store.dart';
import 'package:vitruv_mobile/core/errors/app_failure.dart';
import 'package:vitruv_mobile/core/time/clock.dart';

import '../support/fake_backend.dart';

/// The real AuthSession + AuthInterceptor + Dio against the fake backend.
({
  ApiClient api,
  AuthSession session,
  MemoryTokenStore store,
  FakeBackend backend,
  FakeClock clock,
})
wire({Duration refreshDelay = const Duration(milliseconds: 20)}) {
  final clock = FakeClock();
  final backend = FakeBackend(now: clock.now)..refreshDelay = refreshDelay;
  final store = MemoryTokenStore(backend.issue('kunde@example.invalid'));
  Dio dio() =>
      Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = backend;
  final authApi = AuthApi(ApiClient(dio()));
  final session = AuthSession(
    store: store,
    refresh: authApi.refresh,
    clock: clock,
  );
  final authed = dio();
  authed.interceptors.add(
    AuthInterceptor(session: session, retry: authed.fetch),
  );
  return (
    api: ApiClient(authed),
    session: session,
    store: store,
    backend: backend,
    clock: clock,
  );
}

void main() {
  test('expired access token: 5 simultaneous requests → exactly ONE refresh, all succeed', () async {
    final w = wire();
    await w.session.restore();
    final rotatedFrom = w.store.tokens!.refreshToken;
    w.backend
        .expireAccessTokens(); // server-side expiry, the app does not know yet

    final results = await Future.wait([
      for (var i = 0; i < 5; i++) w.api.getJson('/v1/client/me'),
    ]);

    expect(results, hasLength(5));
    expect(results.every((r) => r['firstName'] == 'Erika'), isTrue);
    expect(w.backend.refreshCalls, 1);
    expect(w.store.writes, 1, reason: 'the rotated pair is stored once');
    expect(w.store.tokens!.refreshToken, isNot(rotatedFrom));
    // 5 rejected originals + 5 retries with the new token
    expect(
      w.backend.requests.where((r) => r == 'GET /v1/client/me'),
      hasLength(10),
    );
  });

  test(
    'token about to expire: refreshed BEFORE sending (no 401 round trip), once',
    () async {
      final w = wire();
      await w.session.restore();
      w.clock.advance(
        const Duration(minutes: 14, seconds: 45),
      ); // inside the 30 s margin
      await Future.wait([
        w.api.getJson('/v1/client/me'),
        w.api.getJson('/v1/client/me'),
      ]);
      expect(w.backend.refreshCalls, 1);
      expect(
        w.backend.requests.where((r) => r == 'GET /v1/client/me'),
        hasLength(2),
      );
    },
  );

  test('rejected refresh: every pending call fails with 401, credentials cleared ONCE, onExpired once', () async {
    final w = wire();
    await w.session.restore();
    var expired = 0;
    w.session.onExpired = () => expired++;
    w.backend
      ..expireAccessTokens()
      ..rejectRefresh = true;

    final outcomes = await Future.wait([
      for (var i = 0; i < 4; i++)
        w.api
            .getJson('/v1/client/me')
            .then<Object?>((_) => null, onError: (Object e) => e),
    ]);

    expect(
      outcomes.every((e) => e is ApiFailure && e.isUnauthenticated),
      isTrue,
    );
    expect(w.backend.refreshCalls, 1);
    expect(expired, 1);
    expect(w.store.clears, 1);
    expect(w.store.tokens, isNull);
    expect(w.session.isSignedIn, isFalse);
  });

  test('offline refresh keeps the session (no logout) and reports a network failure', () async {
    final w = wire();
    await w.session.restore();
    var expired = 0;
    w.session.onExpired = () => expired++;
    w.clock.advance(const Duration(minutes: 20)); // access expired locally
    w.backend.offline = true;
    await expectLater(
      w.api.getJson('/v1/client/me'),
      throwsA(isA<NetworkFailure>()),
    );
    expect(expired, 0);
    expect(w.store.tokens, isNotNull);
    w.backend.offline = false;
    expect((await w.api.getJson('/v1/client/me'))['firstName'], 'Erika');
    expect(w.backend.refreshCalls, 1);
  });

  test('a 401 for an already replaced token retries with the current one without refreshing again', () async {
    final w = wire(refreshDelay: Duration.zero);
    await w.session.restore();
    final stale = w.session.accessToken;
    await w.session.freshAccessToken(failedAccessToken: stale); // refresh #1
    expect(w.backend.refreshCalls, 1);
    final token = await w.session.freshAccessToken(failedAccessToken: stale);
    expect(token, w.session.accessToken);
    expect(w.backend.refreshCalls, 1);
  });

  group('AuthSession', () {
    test('restore drops a stored session whose refresh token is past its absolute expiry', () async {
      final clock = FakeClock();
      final store = MemoryTokenStore(
        AuthTokens(
          accessToken: 'a',
          accessTokenExpiresAt: clock.now(),
          refreshToken: 'r',
          refreshTokenExpiresAt: clock.now().subtract(
            const Duration(seconds: 1),
          ),
        ),
      );
      final session = AuthSession(
        store: store,
        refresh: (_) => throw UnimplementedError(),
        clock: clock,
      );
      expect(await session.restore(), isFalse);
      expect(store.tokens, isNull);
    });

    test('tokens never appear in toString (logs)', () {
      final tokens = FakeBackend().issue('kunde@example.invalid');
      expect(tokens.toString(), isNot(contains(tokens.accessToken)));
      expect(tokens.toString(), isNot(contains(tokens.refreshToken)));
    });

    test(
      'sign-out during a running refresh wins (rotated pair is not stored)',
      () async {
        final clock = FakeClock();
        final store = MemoryTokenStore(
          FakeBackend(now: clock.now).issue('kunde@example.invalid'),
        );
        final gate = Completer<AuthTokens>();
        final session = AuthSession(
          store: store,
          refresh: (_) => gate.future,
          clock: clock,
        );
        await session.restore();
        final pending = session.freshAccessToken(
          failedAccessToken: session.accessToken,
        );
        await session.clear();
        gate.complete(FakeBackend().issue('kunde@example.invalid'));
        expect(await pending, isNull);
        expect(store.tokens, isNull);
      },
    );
  });
}
