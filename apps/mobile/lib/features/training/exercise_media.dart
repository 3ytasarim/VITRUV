import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/ui/ui.dart';
import 'training_models.dart';

/// Whether the platform player can decode [mimeType]. Apple's AVPlayer (iOS/macOS) has no WebM
/// or Ogg support — such a video is announced as unavailable instead of being handed to the
/// player (no failed decode, no crash). Everything else is tried; a failing initialise still
/// ends in "Medium nicht verfügbar".
bool canPlayVideo(String mimeType, TargetPlatform platform) {
  final type = mimeType.toLowerCase().split(';').first.trim();
  final apple =
      platform == TargetPlatform.iOS || platform == TargetPlatform.macOS;
  if (apple && (type == 'video/webm' || type == 'video/ogg')) return false;
  return type.startsWith('video/');
}

/// "0:07" / "1:02:03" — position and length of a video (Sprint 7 player).
String videoClock(Duration value) {
  final total = value.inSeconds < 0 ? 0 : value.inSeconds;
  final h = total ~/ 3600;
  final m = (total % 3600) ~/ 60;
  final sec = (total % 60).toString().padLeft(2, '0');
  return h > 0 ? '$h:${m.toString().padLeft(2, '0')}:$sec' : '$m:$sec';
}

/// How long the player may take to open a video before it shows the error state.
const videoOpenTimeout = Duration(seconds: 20);

/// Exercise demonstration media from the API (resolved delivery URL — never a storage key).
///
/// - IMAGE: network image, fixed frame (no layout jump), alt text from the API
/// - VIDEO, inline: nothing is downloaded or decoded until the client taps "play" (no autoplay)
/// - VIDEO, [controls] (Sprint 7 "Video ansehen" sheet): opens right away (the tap on the button
///   is the request) with loading state, play/pause, seek bar, time, error + retry
/// - the player pauses when the app leaves the foreground and is disposed with its route
class ExerciseMedia extends StatelessWidget {
  const ExerciseMedia({
    super.key,
    required this.media,
    required this.exerciseName,
    this.controls = false,
  });

  final ResolvedMedia? media;
  final String exerciseName;
  final bool controls;

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
      MediaKind.video =>
        canPlayVideo(m.mimeType, defaultTargetPlatform)
            ? _ExerciseVideo(url: m.url, label: label, controls: controls)
            : VitruvMediaFrame(
                semanticLabel: label,
                placeholderLabel: l10n.videoUnsupported,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(VitruvSpace.s4),
                    child: Text(
                      l10n.videoUnsupported,
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              ),
    };
  }
}

class _ExerciseVideo extends StatefulWidget {
  const _ExerciseVideo({
    required this.url,
    required this.label,
    required this.controls,
  });

  final String url;
  final String label;
  final bool controls;

  @override
  State<_ExerciseVideo> createState() => _ExerciseVideoState();
}

class _ExerciseVideoState extends State<_ExerciseVideo>
    with WidgetsBindingObserver {
  VideoPlayerController? _controller;
  bool _failed = false;
  bool _opening = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.controls) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_open(play: true));
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.removeListener(_onValue);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _controller?.pause();
  }

  /// A playback error later on (e.g. network lost) → error state, never a crash.
  void _onValue() {
    final controller = _controller;
    if (!mounted || controller == null) return;
    if (controller.value.hasError && !_failed) {
      setState(() => _failed = true);
    } else if (widget.controls) {
      setState(() {}); // position / buffering for the controls
    }
  }

  Future<VideoPlayerController?> _open({bool play = false}) async {
    if (_opening) return null;
    final old = _controller;
    old?.removeListener(_onValue);
    final controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    setState(() {
      _controller = controller;
      _failed = false;
      _opening = true;
    });
    unawaited(old?.dispose());
    try {
      await controller.initialize().timeout(videoOpenTimeout);
      await controller.setLooping(true);
      controller.addListener(_onValue);
      if (play) await controller.play();
    } on Object {
      if (mounted) setState(() => _failed = true);
      return null;
    } finally {
      if (mounted) setState(() => _opening = false);
    }
    return controller;
  }

  Future<void> _toggle() async {
    var controller = _controller;
    if (controller == null || _failed) {
      controller = await _open();
      if (controller == null) return;
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
    final ready =
        !_failed && controller != null && controller.value.isInitialized;
    final playing = ready && controller.value.isPlaying;
    final loading =
        !_failed && (_opening || (ready && controller.value.isBuffering));
    // The frame is ONE semantics node (its children are excluded), so in the sheet the state is
    // part of its label and the error + retry sit below it, reachable for VoiceOver.
    final sheetError = widget.controls && _failed;
    final frame = VitruvMediaFrame(
      semanticLabel: widget.controls && (loading || _failed)
          ? '${widget.label}, ${_failed ? l10n.videoLoadFailed : l10n.videoLoading}'
          : widget.label,
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
            child: sheetError
                ? Icon(Icons.error_outline, color: c.fgMuted)
                : _failed
                ? Padding(
                    padding: const EdgeInsets.all(VitruvSpace.s3),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Flexible(
                          child: Text(
                            l10n.videoLoadFailed,
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ],
                    ),
                  )
                : loading
                ? Semantics(
                    label: l10n.videoLoading,
                    child: const CircularProgressIndicator(),
                  )
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
    if (sheetError) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          frame,
          const SizedBox(height: VitruvSpace.s3),
          Text(l10n.videoLoadFailed, textAlign: TextAlign.center),
          const SizedBox(height: VitruvSpace.s2),
          VitruvButton(
            label: l10n.retry,
            variant: VitruvButtonVariant.secondary,
            onPressed: () => unawaited(_open(play: true)),
          ),
        ],
      );
    }
    if (!widget.controls || !ready) return frame;
    final position = controller.value.position;
    final duration = controller.value.duration;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        frame,
        const SizedBox(height: VitruvSpace.s2),
        Semantics(
          label: l10n.videoSeek,
          value: l10n.videoPosition(videoClock(position), videoClock(duration)),
          child: SizedBox(
            height: VitruvLayout.tapTarget,
            child: Center(
              child: VideoProgressIndicator(
                controller,
                allowScrubbing: true,
                padding: const EdgeInsets.symmetric(vertical: VitruvSpace.s4),
                colors: VideoProgressColors(
                  playedColor: c.accent,
                  bufferedColor: c.fgMuted,
                  backgroundColor: c.surfaceSunken,
                ),
              ),
            ),
          ),
        ),
        Row(
          children: [
            IconButton(
              onPressed: _toggle,
              tooltip: playing ? l10n.pauseVideo : l10n.playVideo(widget.label),
              constraints: const BoxConstraints(
                minWidth: VitruvLayout.tapTarget,
                minHeight: VitruvLayout.tapTarget,
              ),
              icon: Icon(playing ? Icons.pause : Icons.play_arrow),
            ),
            const SizedBox(width: VitruvSpace.s2),
            Expanded(
              child: ExcludeSemantics(
                child: Text(
                  '${videoClock(position)} / ${videoClock(duration)}',
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
