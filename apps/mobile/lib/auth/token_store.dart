import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/json/json_reader.dart';
import 'auth_models.dart';

/// Persistent storage of the session tokens. The ONLY implementation used in the app is
/// [SecureTokenStore] (platform secure storage) — never SharedPreferences or plain files.
abstract class TokenStore {
  Future<AuthTokens?> read();

  /// Replaces the stored pair. Both tokens are written as ONE value, so a rotated refresh token
  /// can never be stored without its access token (or the other way round).
  Future<void> write(AuthTokens tokens);

  Future<void> clear();
}

/// flutter_secure_storage:
/// - Android: values encrypted with AES-GCM; the key is wrapped by an RSA key that lives in the
///   Android Keystore (package default). App backup is disabled in AndroidManifest.xml, so the
///   encrypted blob is never restored onto another device whose Keystore can not decrypt it.
/// - iOS: Keychain item, `first_unlock_this_device` — readable after the first unlock following a
///   reboot (needed for a refresh while the app resumes), never synced to iCloud, never migrated
///   to a new device by a backup.
class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock_this_device,
            ),
          );

  static const _key = 'vitruv.auth.session.v1';
  final FlutterSecureStorage _storage;

  @override
  Future<AuthTokens?> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) throw const FormatException();
      return AuthTokens.fromJson(JsonReader(decoded));
    } on Object {
      // Corrupt or from an incompatible version: drop it — the user simply signs in again.
      await clear();
      return null;
    }
  }

  @override
  Future<void> write(AuthTokens tokens) =>
      _storage.write(key: _key, value: jsonEncode(tokens.toJson()));

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

/// Tests only (never registered in the app).
class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([this.tokens]);

  AuthTokens? tokens;
  int writes = 0;
  int clears = 0;

  @override
  Future<AuthTokens?> read() async => tokens;

  @override
  Future<void> write(AuthTokens value) async {
    writes++;
    tokens = value;
  }

  @override
  Future<void> clear() async {
    clears++;
    tokens = null;
  }
}
