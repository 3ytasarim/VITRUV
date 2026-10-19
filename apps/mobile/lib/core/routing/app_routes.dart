/// Route paths in one place — deep links and push notifications will target these later.
abstract final class AppRoutes {
  /// Session restore (splash) and the CLIENT login — the only routes without a session.
  static const start = '/start';
  static const login = '/login';

  static const today = '/heute';
  static const training = '/training';
  static const nutrition = '/ernaehrung';
  static const progress = '/fortschritt';
  static const profile = '/profil';

  /// Training day detail (inside the Training tab).
  static String trainingDay(String dayId) => '$training/tag/$dayId';

  /// The live workout of the current session (full screen, no bottom navigation).
  static const workout = '/einheit';
  static const workoutDone = '/einheit/abgeschlossen';

  /// Development-only design gallery (registered only when `designGalleryEnabledProvider`).
  static const designGallery = '/design';
}
