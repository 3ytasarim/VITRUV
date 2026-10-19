import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Development-only access to the design gallery (`/design`).
///
/// * Debug & profile builds: enabled.
/// * Release builds: disabled — the route is not registered at all, so it cannot be reached by
///   navigation or deep link. An internal release build can opt in explicitly with
///   `--dart-define=VITRUV_DESIGN_GALLERY=true`.
///
/// Never part of the bottom navigation; the only entry is a developer button on the Profil
/// placeholder that follows the same switch.
const bool _forceEnabled = bool.fromEnvironment('VITRUV_DESIGN_GALLERY');

final designGalleryEnabledProvider = Provider<bool>(
  (ref) => !kReleaseMode || _forceEnabled,
);
