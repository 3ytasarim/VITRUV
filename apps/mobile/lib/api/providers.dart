import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_api.dart';
import '../auth/auth_interceptor.dart';
import '../auth/auth_session.dart';
import '../auth/token_store.dart';
import '../core/config/app_config.dart';
import '../core/time/clock.dart';
import 'api_client.dart';
import 'health_api.dart';

/// Dependency graph for API access. Tests override [appConfigProvider], [tokenStoreProvider],
/// [apiClientProvider]/[publicApiClientProvider] or the feature providers — never the network.
final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromEnvironment(),
);

/// Tests replace the network transport (Dio adapter); null = the real HTTP client.
final httpAdapterProvider = Provider<HttpClientAdapter?>((ref) => null);

Dio _dio(Ref ref) {
  final dio = ApiClient.createDio(ref.watch(appConfigProvider).apiBaseUrl);
  final adapter = ref.watch(httpAdapterProvider);
  if (adapter != null) dio.httpClientAdapter = adapter;
  return dio;
}

/// No credentials: health and the auth endpoints themselves (login/refresh/logout).
final publicApiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(_dio(ref)),
);

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

final authApiProvider = Provider<AuthApi>(
  (ref) => AuthApi(ref.watch(publicApiClientProvider)),
);

/// The one session object of the app (tokens + single-flight refresh).
final authSessionProvider = Provider<AuthSession>(
  (ref) => AuthSession(
    store: ref.watch(tokenStoreProvider),
    refresh: (token) => ref.read(authApiProvider).refresh(token),
    clock: ref.watch(clockProvider),
  ),
);

/// Authenticated client for every `/v1/client/*` call.
final apiClientProvider = Provider<ApiClient>((ref) {
  final dio = _dio(ref);
  dio.interceptors.add(
    AuthInterceptor(session: ref.watch(authSessionProvider), retry: dio.fetch),
  );
  return ApiClient(dio);
});

final healthApiProvider = Provider<HealthApi>(
  (ref) => HealthApi(ref.watch(publicApiClientProvider)),
);

final apiHealthProvider = FutureProvider<ApiHealth>(
  (ref) => ref.watch(healthApiProvider).fetch(),
  // Surface failures immediately; the UI offers an explicit retry.
  retry: (retryCount, error) => null,
);
