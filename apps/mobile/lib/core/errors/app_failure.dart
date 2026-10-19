/// Typed failures surfaced to the UI. Screens map these to localized messages; raw exceptions
/// and server internals are never shown to the user.
sealed class AppFailure implements Exception {
  const AppFailure();
}

/// No connection, DNS failure or timeout.
final class NetworkFailure extends AppFailure {
  const NetworkFailure();
}

/// One `details` entry of the API error envelope (`{ path, message }`).
typedef ApiErrorDetail = ({String path, String message});

/// The API answered with its standard error envelope (`{ error: { code, message } }`).
final class ApiFailure extends AppFailure {
  const ApiFailure({
    required this.statusCode,
    required this.code,
    this.requestId,
    this.details = const [],
  });

  final int statusCode;

  /// Stable machine-readable code from packages/contracts (e.g. `UNAUTHENTICATED`).
  final String code;
  final String? requestId;
  final List<ApiErrorDetail> details;

  bool get isUnauthenticated => code == 'UNAUTHENTICATED';
  bool get isNotFound => statusCode == 404;

  /// The `message` of the detail with [path] (e.g. `sessionId` of WORKOUT_IN_PROGRESS).
  String? detail(String path) {
    for (final d in details) {
      if (d.path == path) return d.message;
    }
    return null;
  }
}

/// Anything unexpected (malformed response, programming error).
final class UnknownFailure extends AppFailure {
  const UnknownFailure([this.cause]);

  final Object? cause;
}
