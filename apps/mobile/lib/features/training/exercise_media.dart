import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/ui/ui.dart';
import 'training_models.dart';

/// Exercise demonstration media from the API (resolved delivery URL — never a storage key).
///
/// - IMAGE: network image, fixed frame (no layout jump), alt text from the API
/// - VIDEO: nothing is downloaded or decoded until the client taps "play" (no autoplay); the
///   player pauses when the app leaves the foreground and is disposed with the screen
class ExerciseMedia extends StatelessWidget {
  const ExerciseMedia({
    super.key,
    required this.media,
    required this.exerciseName,
  });

  final ResolvedMedia? media;
  final String exerciseName;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final m = media;
    if (m == null) return const SizedBox.shrink();
    final label = m.altText ?? exerciseName;
    return switch (m.kind) {
      MediaKind.image => VitruvMediaFrame(
        semanticLabel: label,
        placeholderLabel: l10n.mediaUnavailable,
        child: Image.network(
          m.url,
          fit: BoxFit.cover,
          excludeFromSemantics: true,
          errorBuilder: (context, error, stack) => const SizedBox.shrink(),
        ),
      ),
      MediaKind.video => _ExerciseVideo(url: m.url, label: label),
    };
  }
}

class _ExerciseVideo extends StatefulWidget {
  const _ExerciseVideo({required this.url, required this.label});

  final String url;
  final String label;

  @override
  State<_ExerciseVideo> createState() => _ExerciseVideoState();
}

class _ExerciseVideoState extends State<_ExerciseVideo>
    with WidgetsBindingObserver {
  VideoPlayerController? _controller;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _controller?.pause();
  }

  Future<void> _toggle() async {
    var controller = _controller;
    if (controller == null) {
      controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
      setState(() => _controller = controller);
      try {
        await controller.initialize();
        await controller.setLooping(true);
      } on Object {
        if (mounted) setState(() => _failed = true);
        return;
      }
    }
    if (controller.value.isPlaying) {
      await controller.pause();
    } else {
      await controller.play();
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final c = VitruvTheme.of(context);
    final controller = _controller;
    final ready = controller != null && controller.value.isInitialized;
    final playing = ready && controller.value.isPlaying;
    return VitruvMediaFrame(
      semanticLabel: widget.label,
      placeholderLabel: l10n.mediaUnavailable,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (ready)
            FittedBox(
              fit: BoxFit.cover,
              clipBehavior: Clip.hardEdge,
              child: SizedBox(
                width: controller.value.size.width,
                height: controller.value.size.height,
                child: VideoPlayer(controller),
              ),
            )
          else
            ColoredBox(color: c.surfaceSunken),
          Center(
            child: _failed
                ? Text(l10n.mediaUnavailable)
                : IconButton.filled(
                    onPressed: _toggle,
                    tooltip: playing
                        ? l10n.pauseVideo
                        : l10n.playVideo(widget.label),
                    iconSize: VitruvSpace.s8,
                    style: IconButton.styleFrom(
                      backgroundColor: c.overlay,
                      foregroundColor: c.fg,
                      minimumSize: const Size.square(VitruvLayout.tapTarget),
                    ),
                    icon: Icon(playing ? Icons.pause : Icons.play_arrow),
                  ),
          ),
        ],
      ),
    );
  }
}
