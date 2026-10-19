import 'package:flutter/foundation.dart';

import '../core/errors/app_failure.dart';
import 'api_client.dart';

/// Mirrors `healthResponseSchema` in packages/contracts/src/health.ts.
@immutable
class ApiHealth {
  const ApiHealth({required this.status, required this.version});

  factory ApiHealth.fromJson(Map<String, dynamic> json) {
    final status = json['status'];
    final version = json['version'];
    if (status is! String || version is! String) {
      throw const UnknownFailure('Malformed health response');
    }
    return ApiHealth(status: status, version: version);
  }

  final String status;
  final String version;

  bool get isOk => status == 'ok';
}

class HealthApi {
  const HealthApi(this._client);

  final ApiClient _client;

  Future<ApiHealth> fetch() async =>
      ApiHealth.fromJson(await _client.getJson('/health'));
}
