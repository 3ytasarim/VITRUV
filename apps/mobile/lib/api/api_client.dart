import 'package:dio/dio.dart';

import '../core/errors/app_failure.dart';

/// Thin wrapper around Dio for the shared VITRUV API.
///
/// - one place for base URL, timeouts and headers
/// - converts every transport/HTTP error into a typed [AppFailure]
/// - feature APIs (training, workouts, ...) build on [getJson] / [sendJson]
///
/// Authentication is added by the Dio instance's interceptor (lib/auth/auth_interceptor.dart);
/// this class never sees tokens.
class ApiClient {
  ApiClient(this._dio);

  factory ApiClient.create(Uri baseUrl) => ApiClient(createDio(baseUrl));

  /// The base Dio configuration shared by the plain and the authenticated client.
  static Dio createDio(Uri baseUrl) => Dio(
    BaseOptions(
      baseUrl: baseUrl.toString(),
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(seconds: 15),
      headers: {'Accept': 'application/json'},
      responseType: ResponseType.json,
    ),
  );

  final Dio _dio;

  Future<Map<String, dynamic>> getJson(
    String path, {
    Map<String, Object?>? query,
  }) => _run(() => _dio.get<Object?>(path, queryParameters: query));

  /// POST/PATCH/PUT with a JSON body. An empty 204 answer is returned as `{}`.
  Future<Map<String, dynamic>> sendJson(
    String method,
    String path, [
    Map<String, Object?>? body,
  ]) => _run(
    () => _dio.request<Object?>(
      path,
      data: body,
      options: Options(method: method, contentType: Headers.jsonContentType),
    ),
  );

  Future<Map<String, dynamic>> _run(
    Future<Response<Object?>> Function() request,
  ) async {
    try {
      final response = await request();
      final data = response.data;
      if (data is Map<String, dynamic>) return data;
      if (response.statusCode == 204 || data == null || data == '') {
        return const {};
      }
      throw const UnknownFailure('Expected a JSON object');
    } on DioException catch (error) {
      throw mapDioException(error);
    }
  }
}

AppFailure mapDioException(DioException error) {
  if (error.error is AppFailure) return error.error! as AppFailure;
  switch (error.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.transformTimeout:
    case DioExceptionType.connectionError:
      return const NetworkFailure();
    case DioExceptionType.badResponse:
      final response = error.response;
      final body = response?.data;
      final envelope = body is Map<String, dynamic> ? body['error'] : null;
      if (envelope is Map<String, dynamic> && envelope['code'] is String) {
        final rawDetails = envelope['details'];
        return ApiFailure(
          statusCode: response?.statusCode ?? 0,
          code: envelope['code'] as String,
          requestId: envelope['requestId'] as String?,
          details: [
            if (rawDetails is List)
              for (final d in rawDetails)
                if (d is Map && d['path'] is String && d['message'] is String)
                  (path: d['path'] as String, message: d['message'] as String),
          ],
        );
      }
      return ApiFailure(
        statusCode: response?.statusCode ?? 0,
        code: 'INTERNAL_ERROR',
      );
    case DioExceptionType.badCertificate:
    case DioExceptionType.cancel:
    case DioExceptionType.unknown:
      return UnknownFailure(error.type);
  }
}
