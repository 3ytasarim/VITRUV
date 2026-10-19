import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../../shared/widgets/placeholder_screen.dart';

/// "Ernährung" — initially client-specific nutrition PDFs delivered via short-lived signed URLs.
/// Deliberately separate from the structured training model.
class NutritionScreen extends StatelessWidget {
  const NutritionScreen({super.key});

  @override
  Widget build(BuildContext context) => PlaceholderScreen(
    title: AppLocalizations.of(context).navNutrition,
    icon: Icons.restaurant,
  );
}
