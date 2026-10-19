import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/vitruv_tokens.g.dart';
import '../../core/errors/app_failure.dart';
import '../../l10n/app_localizations.dart';

/// Standard loading / error / data rendering for any [AsyncValue], so every screen handles the
/// three states the same way (and accessibly).
class AsyncValueView<T> extends StatelessWidget {
  const AsyncValueView({
    super.key,
    required this.value,
    required this.data,
    this.onRetry,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return value.when(
      data: data,
      loading: () => const LoadingView(),
      error: (error, _) => ErrorView(failure: error, onRetry: onRetry),
    );
  }
}

class LoadingView extends StatelessWidget {
  const LoadingView({super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: AppLocalizations.of(context).loading,
      liveRegion: true,
      child: const Center(
        child: Padding(
          padding: EdgeInsets.all(VitruvSpace.s6),
          child: CircularProgressIndicator(),
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.failure, this.onRetry});

  final Object failure;
  final VoidCallback? onRetry;

  static String messageFor(AppLocalizations l10n, Object failure) =>
      switch (failure) {
        NetworkFailure() => l10n.errorNetwork,
        ApiFailure() => l10n.errorServer,
        _ => l10n.errorUnknown,
      };

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.all(VitruvSpace.s6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(messageFor(l10n, failure), textAlign: TextAlign.center),
          if (onRetry != null) ...[
            const SizedBox(height: VitruvSpace.s4),
            FilledButton(onPressed: onRetry, child: Text(l10n.retry)),
          ],
        ],
      ),
    );
  }
}
