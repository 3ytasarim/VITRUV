/// Mirrors USER_ROLES in packages/shared/src/roles.ts.
///
/// The role shown in the app always comes from the API for the authenticated user.
/// It is used for presentation only — every authorization decision is made server-side.
enum UserRole {
  admin('ADMIN'),
  coach('COACH'),
  client('CLIENT');

  const UserRole(this.wireValue);

  final String wireValue;

  static UserRole? fromWire(String? value) {
    for (final role in UserRole.values) {
      if (role.wireValue == value) return role;
    }
    return null;
  }
}
