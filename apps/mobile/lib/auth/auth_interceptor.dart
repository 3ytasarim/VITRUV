import 'package:dio/dio.dart';

import '../core/errors/app_failure.dart';
import 'auth_session.dart';

/// Attaches `Authorization: Bearer <access>` and recovers from an expired access token:
///
/// 1. before a request: if the access token is about to expire, refresh first (single-flight)
/// 2. after a 401 `UNAUTHENTICATED`: refresh once (single-flight — concurrent 401s all wait for the
///    same refresh) and retry the request ONCE with the new token
/// 3. refresh rejected → [AuthSession] clears the session once; the request fails with 401 and the
///    router shows the login
///
/// Tokens are never logged; the retried request gets a fresh header from the session.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({required this.session, required this.retry});

  final AuthSession session;

  /// Re-sends a request (the authenticated Dio's `fetch`).
  final Future<Response<dynamic>> Function(RequestOptions options) retry;

  static const _retried = 'vitruv.auth.retried';

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    String? token;
    try {
      token = await session.freshAccessToken();
    } on NetworkFailure {
      // Offline while refreshing: send with the current token; the request itself will report
      // the network problem.
      token = session.accessToken;
    }
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final options = err.requestOptions;
    if (err.response?.statusCode != 401 ||
        options.extra[_retried] == true ||
        !session.isSignedIn) {
      return handler.next(err);
    }
    final used = (options.headers['Authorization'] as String?)?.replaceFirst(
      'Bearer ',
      '',
    );
    final String? fresh;
    try {
      fresh = await session.freshAccessToken(failedAccessToken: used);
    } on NetworkFailure {
      return handler.next(
        DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
          error: const NetworkFailure(),
        ),
      );
    }
    if (fresh == null) return handler.next(err);
    options.extra[_retried] = true;
    try {
      handler.resolve(await retry(options));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }
}
