import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_client.dart';
import '../../api/providers.dart';
import '../../auth/auth_models.dart';
import '../../auth/auth_state.dart';
import '../../core/json/json_reader.dart';
import 'training_models.dart';

/// Client self-context reads (no client id — identity comes from the session).
class ClientApi {
  const ClientApi(this._client);

  final ApiClient _client;

  Future<ClientProfile> me() async => ClientProfile.fromJson(
    JsonReader(await _client.getJson('/v1/client/me')),
  );

  /// The ACTIVE plan, or null when the coach has not activated one.
  Future<TrainingProgram?> activeTraining() async {
    final program = JsonReader(
      await _client.getJson('/v1/client/training/active'),
    ).objectOrNull('program');
    return program == null ? null : TrainingProgram.fromJson(program);
  }
}

final clientApiProvider = Provider<ClientApi>(
  (ref) => ClientApi(ref.watch(apiClientProvider)),
);

/// Dropped automatically on sign-out (watches the signed-in user id).
final clientProfileProvider = FutureProvider<ClientProfile>((ref) {
  ref.watch(signedInUserIdProvider);
  return ref.watch(clientApiProvider).me();
}, retry: (retryCount, error) => null);

final activeTrainingProvider = FutureProvider<TrainingProgram?>((ref) {
  ref.watch(signedInUserIdProvider);
  return ref.watch(clientApiProvider).activeTraining();
}, retry: (retryCount, error) => null);
