import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/auth_models.dart';
import '../../auth/auth_state.dart';
import '../../core/routing/app_routes.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/ui/ui.dart';
import '../../shared/widgets/async_value_view.dart';
import '../../shared/widgets/content_page.dart';
import '../design_gallery/design_gallery_access.dart';
import '../training/training_api.dart';

/// "Profil" — the signed-in client's own account: name, e-mail, coach, coaching status, sign-out.
/// Never internal notes (the API does not send them). Password change UI: later sprint.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.signOutConfirmTitle),
        content: Text(l10n.signOutConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.signOut),
          ),
        ],
      ),
    );
    if (ok ?? false) await ref.read(authControllerProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final profile = ref.watch(clientProfileProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.navProfile)),
      body: ContentPage(
        onRefresh: () async => ref.invalidate(clientProfileProvider),
        children: [
          AsyncValueView(
            value: profile,
            onRetry: () => ref.invalidate(clientProfileProvider),
            data: (p) => _Account(profile: p),
          ),
          const SizedBox(height: VitruvSpace.s8),
          VitruvButton(
            label: l10n.signOut,
            variant: VitruvButtonVariant.secondary,
            leadingIcon: Icons.logout,
            fullWidth: true,
            onPressed: () => _signOut(context, ref),
          ),
          // Developer-only entry to the design gallery (absent in release builds).
          if (ref.watch(designGalleryEnabledProvider)) ...[
            const SizedBox(height: VitruvSpace.s4),
            VitruvButton(
              label: 'Design-Galerie (Entwicklung)',
              variant: VitruvButtonVariant.ghost,
              leadingIcon: Icons.palette_outlined,
              onPressed: () => context.push(AppRoutes.designGallery),
            ),
          ],
        ],
      ),
    );
  }
}

class _Account extends StatelessWidget {
  const _Account({required this.profile});

  final ClientProfile profile;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final coaching = switch (profile.coachingStatus) {
      CoachingStatus.active => l10n.coachingActive,
      CoachingStatus.paused => l10n.coachingPaused,
      CoachingStatus.completed => l10n.coachingCompleted,
      CoachingStatus.unknown => '—',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(profile.fullName, size: SectionTitleSize.h2),
        const SizedBox(height: VitruvSpace.s6),
        VitruvCard(
          padding: VitruvCardPadding.sm,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _Field(label: l10n.profileEmail, value: profile.email),
              const Divider(height: VitruvSpace.s6),
              _Field(
                label: l10n.profileCoach,
                value: profile.coachName ?? l10n.profileNoCoach,
              ),
              const Divider(height: VitruvSpace.s6),
              _Field(label: l10n.profileCoaching, value: coaching),
            ],
          ),
        ),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => MergeSemantics(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        MetaLabel(label),
        const SizedBox(height: VitruvSpace.s1),
        Text(value, style: Theme.of(context).textTheme.bodyLarge),
      ],
    ),
  );
}
