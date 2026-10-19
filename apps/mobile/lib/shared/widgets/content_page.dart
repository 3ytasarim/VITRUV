import 'package:flutter/material.dart';

import '../../core/theme/vitruv_tokens.g.dart';

/// Standard scrolling page body: gutters, a readable max width on tablets and room for large
/// text (everything scrolls, nothing is clipped at 200 % text size).
class ContentPage extends StatelessWidget {
  const ContentPage({
    super.key,
    required this.children,
    this.onRefresh,
    this.bottom,
  });

  final List<Widget> children;
  final Future<void> Function()? onRefresh;

  /// Fixed area below the scroll view (e.g. the primary action of a screen).
  final Widget? bottom;

  @override
  Widget build(BuildContext context) {
    Widget list = ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        VitruvSpace.s5,
        VitruvSpace.s4,
        VitruvSpace.s5,
        VitruvSpace.s10,
      ),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: VitruvLayout.measure),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          ),
        ),
      ],
    );
    if (onRefresh != null) {
      list = RefreshIndicator(onRefresh: onRefresh!, child: list);
    }
    final fixed = bottom;
    if (fixed == null) return list;
    return Column(
      children: [
        Expanded(child: list),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              VitruvSpace.s5,
              VitruvSpace.s3,
              VitruvSpace.s5,
              VitruvSpace.s4,
            ),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: VitruvLayout.measure,
                ),
                child: fixed,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Compact title + body empty/info state inside a card-free column.
class InfoState extends StatelessWidget {
  const InfoState({
    super.key,
    required this.icon,
    required this.title,
    this.body,
    this.action,
  });

  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: VitruvSpace.s8),
      child: Column(
        children: [
          Icon(icon, size: VitruvSpace.s10, color: theme.colorScheme.primary),
          const SizedBox(height: VitruvSpace.s4),
          Text(
            title,
            textAlign: TextAlign.center,
            style: theme.textTheme.titleLarge,
          ),
          if (body != null && body!.isNotEmpty) ...[
            const SizedBox(height: VitruvSpace.s2),
            Text(
              body!,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
          if (action != null) ...[
            const SizedBox(height: VitruvSpace.s6),
            action!,
          ],
        ],
      ),
    );
  }
}
