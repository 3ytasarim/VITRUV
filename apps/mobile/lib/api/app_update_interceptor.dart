import 'package:dio/dio.dart';

import '../core/config/app_version.dart';

/// Sprint 8B — turns `426 APP_UPDATE_REQUIRED` into the app-wide "update required" state.
/// The error still reaches the caller (the screen behind shows its error state), but the router
/// switches to the update screen. Never touches tokens.
class AppUpdateInterceptor extends Interceptor {
  AppUpdateInterceptor(this.onUpdateRequired);

  final void Function(AppUpdateRequirement requirement) onUpdateRequired;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final response = err.response;
    final data = response?.data;
    final error = data is Map ? data['error'] : null;
    if (response?.statusCode == 426 &&
        error is Map &&
        error['code'] == 'APP_UPDATE_REQUIRED') {
      String? detail(String path) {
        final details = error['details'];
        if (details is! List) return null;
        for (final d in details) {
          if (d is Map && d['path'] == path && d['message'] is String) {
            final value = d['message'] as String;
            return value.isEmpty ? null : value;
          }
        }
        return null;
      }

      final url = detail('updateUrl');
      onUpdateRequired(
        AppUpdateRequirement(
          minimumVersion: detail('minimumVersion'),
          // only https store links are shown
          updateUrl: url != null && url.startsWith('https://') ? url : null,
        ),
      );
    }
    handler.next(err);
  }
}
