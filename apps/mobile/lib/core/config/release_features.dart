import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Sprint 8B — features that are not complete enough for the first App Store release.
///
/// "Ernährung" (nutrition) is only a placeholder screen today. Placeholder / "coming soon" content
/// is a common App Review rejection (Guideline 2.1 / 4.2), so the tab is HIDDEN by default in every
/// build: the branch is not registered, the bottom navigation has four destinations and a deep link
/// to `/ernaehrung` lands on "Heute". The feature code (`features/nutrition/`) stays in place and
/// can be re-enabled per build with `--dart-define=VITRUV_NUTRITION_TAB=true` once it has real
/// content.
const bool _nutritionTab = bool.fromEnvironment('VITRUV_NUTRITION_TAB');

final nutritionTabEnabledProvider = Provider<bool>((ref) => _nutritionTab);
