import '../errors/app_failure.dart';

/// Strict, typed reading of API JSON. A missing or mistyped field is a contract violation and
/// becomes an [UnknownFailure] (shown as a generic error) instead of a runtime type error deep in
/// the UI. Models mirror packages/contracts; nothing is guessed or defaulted silently.
extension type const JsonReader(Map<String, dynamic> json) {
  Never _fail(String key) => throw UnknownFailure('Malformed field "$key"');

  String string(String key) {
    final v = json[key];
    return v is String ? v : _fail(key);
  }

  String? stringOrNull(String key) {
    final v = json[key];
    return v == null ? null : (v is String ? v : _fail(key));
  }

  int integer(String key) {
    final v = json[key];
    return v is int ? v : _fail(key);
  }

  int? intOrNull(String key) {
    final v = json[key];
    return v == null ? null : (v is int ? v : _fail(key));
  }

  double? numberOrNull(String key) {
    final v = json[key];
    return v == null ? null : (v is num ? v.toDouble() : _fail(key));
  }

  bool boolean(String key) {
    final v = json[key];
    return v is bool ? v : _fail(key);
  }

  DateTime dateTime(String key) => DateTime.tryParse(string(key)) ?? _fail(key);

  DateTime? dateTimeOrNull(String key) {
    final v = stringOrNull(key);
    return v == null ? null : (DateTime.tryParse(v) ?? _fail(key));
  }

  JsonReader object(String key) {
    final v = json[key];
    return v is Map<String, dynamic> ? JsonReader(v) : _fail(key);
  }

  JsonReader? objectOrNull(String key) {
    final v = json[key];
    return v == null
        ? null
        : (v is Map<String, dynamic> ? JsonReader(v) : _fail(key));
  }

  List<T> list<T>(String key, T Function(JsonReader item) read) {
    final v = json[key];
    if (v is! List) _fail(key);
    return [
      for (final item in v)
        item is Map<String, dynamic> ? read(JsonReader(item)) : _fail(key),
    ];
  }

  List<String> strings(String key) {
    final v = json[key];
    if (v is! List) _fail(key);
    return [for (final item in v) item is String ? item : _fail(key)];
  }
}
