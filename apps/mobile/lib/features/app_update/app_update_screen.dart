import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_version.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../training/training_api.dart';
import '../workout/workout_controller.dart';
import '../../shared/ui/ui.dart';

/// Sprint 8B — shown when the server refuses this build (426 APP_UPDATE_REQUIRED).
/// No logout: the session stays, "Erneut prüfen" returns to the app and the next request decides.
/// The store link is shown as copyable text (no url_launcher dependency in 1.0).
class AppUpdateScreen extends ConsumerWidget {
  const AppUpdateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final requirement = ref.watch(appUpdateProvider);
    final minimum = requirement?.minimumVersion;
    final url = requirement?.updateUrl;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(VitruvSpace.s6),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    l10n.appUpdateTitle,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
                const SizedBox(height: VitruvSpace.s4),
                Text(l10n.appUpdateBody, textAlign: TextAlign.center),
                const SizedBox(height: VitruvSpace.s2),
                Text(
                  minimum == null
                      ? l10n.appUpdateInstalled(kAppVersion)
                      : l10n.appUpdateVersions(kAppVersion, minimum),
                  textAlign: TextAlign.center,
                ),
                if (url != null) ...[
                  const SizedBox(height: VitruvSpace.s4),
                  SelectableText(url, textAlign: TextAlign.center),
                  const SizedBox(height: VitruvSpace.s2),
                  VitruvButton(
                    label: l10n.appUpdateCopyLink,
                    variant: VitruvButtonVariant.ghost,
                    onPressed: () =>
                        Clipboard.setData(ClipboardData(text: url)),
                  ),
                ],
                const SizedBox(height: VitruvSpace.s6),
                VitruvButton(
                  label: l10n.appUpdateRetry,
                  onPressed: () {
                    // Data refused with 426 is loaded again (not watched: a still-outdated build
                    // would otherwise loop between 426 and reload).
                    ref
                      ..invalidate(clientProfileProvider)
                      ..invalidate(activeTrainingProvider)
                      ..invalidate(workoutHistoryProvider);
                    ref.read(appUpdateProvider.notifier).clear();
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
