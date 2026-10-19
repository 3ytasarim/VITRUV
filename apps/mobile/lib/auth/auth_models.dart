import 'package:flutter/foundation.dart';

import '../core/json/json_reader.dart';
import 'user_role.dart';

/// Mirrors `authTokensSchema` (packages/contracts/src/auth.ts). Opaque tokens — never logged.
@immutable
class AuthTokens {
  const AuthTokens({
    required this.accessToken,
    required this.accessTokenExpiresAt,
    required this.refreshToken,
    required this.refreshTokenExpiresAt,
  });

  factory AuthTokens.fromJson(JsonReader json) => AuthTokens(
    accessToken: json.string('accessToken'),
    accessTokenExpiresAt: json.dateTime('accessTokenExpiresAt'),
    refreshToken: json.string('refreshToken'),
    refreshTokenExpiresAt: json.dateTime('refreshTokenExpiresAt'),
  );

  final String accessToken;
  final DateTime accessTokenExpiresAt;
  final String refreshToken;
  final DateTime refreshTokenExpiresAt;

  Map<String, Object> toJson() => {
    'accessToken': accessToken,
    'accessTokenExpiresAt': accessTokenExpiresAt.toUtc().toIso8601String(),
    'refreshToken': refreshToken,
    'refreshTokenExpiresAt': refreshTokenExpiresAt.toUtc().toIso8601String(),
  };

  @override
  String toString() => 'AuthTokens(<redacted>)';
}

/// Mirrors `currentUserSchema` — for presentation only; the API authorises every call.
@immutable
class CurrentUser {
  const CurrentUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.role,
    required this.permissions,
  });

  factory CurrentUser.fromJson(JsonReader json) => CurrentUser(
    id: json.string('id'),
    email: json.string('email'),
    displayName: json.stringOrNull('displayName'),
    role: UserRole.fromWire(json.string('role')),
    permissions: json.strings('permissions'),
  );

  final String id;
  final String email;
  final String? displayName;

  /// `null` for an unknown future role (treated like "not a client").
  final UserRole? role;
  final List<String> permissions;

  bool get isClient => role == UserRole.client;
}

/// Mirrors `clientSelfProfileSchema` (`GET /v1/client/me`) — never internal notes.
@immutable
class ClientProfile {
  const ClientProfile({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.coachingStatus,
    required this.coachName,
  });

  factory ClientProfile.fromJson(JsonReader json) => ClientProfile(
    id: json.string('id'),
    firstName: json.string('firstName'),
    lastName: json.string('lastName'),
    email: json.string('email'),
    coachingStatus: CoachingStatus.fromWire(json.string('coachingStatus')),
    coachName: json.objectOrNull('coach')?.string('displayName'),
  );

  final String id;
  final String firstName;
  final String lastName;
  final String email;
  final CoachingStatus coachingStatus;
  final String? coachName;

  String get fullName => '$firstName $lastName'.trim();
}

/// Mirrors COACHING_STATUSES in packages/shared/src/clients.ts.
enum CoachingStatus {
  active,
  paused,
  completed,
  unknown;

  static CoachingStatus fromWire(String value) => switch (value) {
    'ACTIVE' => active,
    'PAUSED' => paused,
    'COMPLETED' => completed,
    _ => unknown,
  };
}
