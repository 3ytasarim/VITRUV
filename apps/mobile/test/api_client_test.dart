import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/api/api_client.dart';
import 'package:vitruv_mobile/api/health_api.dart';
import 'package:vitruv_mobile/core/errors/app_failure.dart';

DioException badResponse(int status, Object? body) {
  final options = RequestOptions(path: '/x');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response(requestOptions: options, statusCode: status, data: body),
  );
}

void main() {
  group('mapDioException', () {
    test('maps the API error envelope to ApiFailure with its code', () {
      final failure = mapDioException(
        badResponse(401, {
          'error': {
            'code': 'UNAUTHENTICATED',
            'message': 'x',
            'requestId': 'r1',
          },
        }),
      );
      expect(failure, isA<ApiFailure>());
      failure as ApiFailure;
      expect(failure.statusCode, 401);
      expect(failure.isUnauthenticated, isTrue);
      expect(failure.requestId, 'r1');
    });

    test('maps non-envelope server errors to INTERNAL_ERROR', () {
      final failure = mapDioException(
        badResponse(502, '<html>Bad gateway</html>'),
      );
      expect((failure as ApiFailure).code, 'INTERNAL_ERROR');
    });

    test('maps timeouts and connection errors to NetworkFailure', () {
      for (final type in [
        DioExceptionType.connectionTimeout,
        DioExceptionType.receiveTimeout,
        DioExceptionType.connectionError,
      ]) {
        expect(
          mapDioException(
            DioException(requestOptions: RequestOptions(), type: type),
          ),
          isA<NetworkFailure>(),
        );
      }
    });
  });

  group('ApiHealth.fromJson', () {
    test('parses the contract shape', () {
      final health = ApiHealth.fromJson({
        'status': 'ok',
        'version': '0.0.0',
        'uptimeSeconds': 1,
      });
      expect(health.isOk, isTrue);
    });

    test('rejects malformed payloads', () {
      expect(
        () => ApiHealth.fromJson({'status': 1}),
        throwsA(isA<UnknownFailure>()),
      );
    });
  });
}
