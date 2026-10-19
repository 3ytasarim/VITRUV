import 'package:flutter/material.dart';

import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';

/// Architectural placeholder for a tab whose feature is built in a later sprint.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({
    super.key,
    required this.title,
    required this.icon,
    this.action,
  });

  final String title;
  final IconData icon;

  /// Optional widget below the message (e.g. a developer-only entry point).
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        // Scrollable so large system text sizes never overflow on small phones.
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(VitruvSpace.s8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: VitruvSpace.s12,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(height: VitruvSpace.s4),
              Text(
                AppLocalizations.of(context).placeholderComingSoon,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              if (action != null) ...[
                const SizedBox(height: VitruvSpace.s8),
                action!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}
