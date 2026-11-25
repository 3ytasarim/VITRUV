import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/format/training_format.dart';
import '../../shared/ui/ui.dart';
import 'interval_runner.dart';
import 'workout_engine.dart';
import 'workout_models.dart';

/// Core routine (rounds × work/rest): big countdown, round + phase, controls, saved rounds.
///
/// - WORK and REST look clearly different (card tone, colour, label, icon) — never colour alone
/// - every phase change: haptic + VoiceOver announcement (sound: the scheduled notification)
/// - the digits are excluded from semantics (no announcement per second); the label is read on focus
/// - repaints at most every 250 ms while running; the screen owns the phase logic ([IntervalRunner.sync])
class IntervalPanel extends StatefulWidget {
  const IntervalPanel({
    super.key,
    required this.exercise,
    required this.runner,
    required this.unsavedRounds,
    required this.otherRunning,
    required this.onStart,
    required this.onSaveRounds,
  });

  final WorkoutExercise exercise;

  /// The runner of THIS exercise (null = none created yet).
  final IntervalRunner? runner;

  /// Rounds that ended locally but are not stored on the server yet.
  final Set<int> unsavedRounds;

  /// Another Core routine is running (only one at a time).
  final bool otherRunning;
  final void Function(int fromRound) onStart;
  final VoidCallback onSaveRounds;

  @override
  State<IntervalPanel> createState() => _IntervalPanelState();
}

class _IntervalPanelState extends State<IntervalPanel> {
  Timer? _repaint;
  int _signals = 0;

  IntervalRunner? get _r => widget.runner;

  @override
  void initState() {
    super.initState();
    _attach(_r);
  }

  @override
  void didUpdateWidget(IntervalPanel old) {
    super.didUpdateWidget(old);
    if (old.runner != widget.runner) {
      old.runner?.removeListener(_onChange);
      _attach(widget.runner);
    }
  }

  void _attach(IntervalRunner? r) {
    _signals = r?.signalCount ?? 0;
    r?.addListener(_onChange);
    _syncRepaint();
  }

  @override
  void dispose() {
    _r?.removeListener(_onChange);
    _repaint?.cancel();
    super.dispose();
  }

  void _onChange() {
    final r = _r;
    if (r == null || !mounted) return;
    if (r.signalCount != _signals) {
      _signals = r.signalCount;
      _signal(r);
    }
    _syncRepaint();
    setState(() {});
  }

  void _syncRepaint() {
    if (_r?.status == IntervalStatus.running) {
      _repaint ??= Timer.periodic(
        const Duration(milliseconds: 250),
        (_) => mounted ? setState(() {}) : null,
      );
    } else {
      _repaint?.cancel();
      _repaint = null;
    }
  }

  void _signal(IntervalRunner r) {
    final l10n = AppLocalizations.of(context);
    final (message, haptic) = switch (r.signal) {
      IntervalSignal.work => (
        l10n.coreAnnounceWork(r.current?.round ?? 1),
        HapticFeedback.heavyImpact,
      ),
      IntervalSignal.rest => (
        l10n.coreAnnounceRest,
        HapticFeedback.mediumImpact,
      ),
      IntervalSignal.done ||
      null => (l10n.coreDone, HapticFeedback.heavyImpact),
    };
    unawaited(haptic());
    unawaited(
      SemanticsService.sendAnnouncement(
        View.of(context),
        message,
        Directionality.of(context),
        assertiveness: Assertiveness.assertive,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final exercise = widget.exercise;
    final config = exercise.intervalConfig!;
    final r = _r;
    final saved = exercise.sets.where((s) => s.completed).length;
    final done = exercise.status == ExerciseStatus.completed;
    final active = r != null && r.isActive;
    final finished = done || r?.status == IntervalStatus.finished;

    final rounds = _RoundMarks(
      config: config,
      savedRounds: {
        for (final s in exercise.sets)
          if (s.completed) s.setNumber,
      },
      current: active ? r.current?.round : null,
    );

    final children = <Widget>[];
    if (active) {
      final phase = r.current!;
      final work = phase.kind == IntervalPhaseKind.work;
      final paused = r.status == IntervalStatus.paused;
      final seconds = r.phase.remainingSeconds;
      final digits = clock(seconds);
      final label = work ? l10n.corePhaseWork : l10n.corePhaseRest;
      children.addAll([
        // wraps on small screens / large text instead of overflowing
        Wrap(
          spacing: VitruvSpace.s2,
          runSpacing: VitruvSpace.s2,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  work ? Icons.bolt : Icons.self_improvement,
                  color: work ? c.accentText : VitruvTheme.sparkOf(context),
                  size: VitruvSpace.s6,
                ),
                const SizedBox(width: VitruvSpace.s2),
                Flexible(
                  child: Text(
                    l10n.coreRoundOf(phase.round, config.rounds),
                    style: theme.textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            VitruvBadge(
              paused ? l10n.corePaused : label,
              tone: work ? VitruvTone.accent : VitruvTone.neutral,
              dot: true,
            ),
          ],
        ),
        const SizedBox(height: VitruvSpace.s3),
        Semantics(
          container: true,
          liveRegion: false,
          label: l10n.coreRemainingSemantics(
            paused ? l10n.corePaused : label,
            phase.round,
            config.rounds,
            digits,
          ),
          excludeSemantics: true,
          child: Column(
            children: [
              Text(
                label,
                style: theme.textTheme.titleLarge?.copyWith(
                  color: work ? c.accentText : c.fgMuted,
                  letterSpacing: VitruvSpace.s1 / 2,
                ),
              ),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  digits,
                  style: theme.textTheme.displayMedium?.copyWith(
                    color: work ? c.fg : c.fgMuted,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
              // REST: what comes next (the rest after round n leads to round n + 1)
              if (!work)
                Text(
                  '${l10n.coreNextRound}: '
                  '${l10n.coreRoundOf(phase.round + 1, config.rounds)}',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleMedium,
                ),
            ],
          ),
        ),
        const SizedBox(height: VitruvSpace.s2),
        ExcludeSemantics(
          child: LinearProgressIndicator(
            value: phase.seconds == 0
                ? 0
                : (r.phase.remaining.inMilliseconds / (phase.seconds * 1000))
                      .clamp(0.0, 1.0),
            minHeight: VitruvSpace.s1,
            color: work ? c.accent : VitruvTheme.sparkOf(context),
            backgroundColor: c.borderSubtle,
          ),
        ),
        const SizedBox(height: VitruvSpace.s3),
        rounds,
        const SizedBox(height: VitruvSpace.s3),
        Wrap(
          spacing: VitruvSpace.s2,
          runSpacing: VitruvSpace.s2,
          alignment: WrapAlignment.center,
          children: [
            VitruvButton(
              label: paused ? l10n.coreResume : l10n.corePause,
              variant: VitruvButtonVariant.secondary,
              leadingIcon: paused ? Icons.play_arrow : Icons.pause,
              onPressed: paused ? r.resume : r.pause,
            ),
            VitruvButton(
              label: l10n.coreCancel,
              variant: VitruvButtonVariant.ghost,
              onPressed: r.cancel,
            ),
          ],
        ),
      ]);
    } else {
      final format = TrainingFormat(l10n);
      final nextRound = _firstOpenRound(exercise, config);
      children.addAll([
        Text(
          l10n.corePlan(
            config.rounds,
            format.duration(config.workSeconds),
            format.duration(config.restSeconds),
          ),
          style: theme.textTheme.bodyLarge?.copyWith(color: c.fgMuted),
        ),
        const SizedBox(height: VitruvSpace.s3),
        rounds,
        const SizedBox(height: VitruvSpace.s3),
        if (finished)
          Row(
            children: [
              Icon(Icons.check_circle, color: c.success),
              const SizedBox(width: VitruvSpace.s2),
              Expanded(
                child: Text(l10n.coreDone, style: theme.textTheme.titleMedium),
              ),
            ],
          )
        else if (widget.otherRunning)
          Text(l10n.coreOtherRunning, style: theme.textTheme.bodyMedium)
        else if (nextRound != null)
          VitruvButton(
            label: nextRound == 1
                ? l10n.coreStart
                : l10n.coreStartFrom(nextRound),
            leadingIcon: Icons.play_arrow,
            fullWidth: true,
            onPressed: () => widget.onStart(nextRound),
          ),
      ]);
    }
    children.addAll([
      const SizedBox(height: VitruvSpace.s2),
      Text(
        l10n.coreRoundsSaved(saved, config.rounds),
        textAlign: TextAlign.center,
        style: theme.textTheme.bodySmall?.copyWith(color: c.fgMuted),
      ),
      if (widget.unsavedRounds.isNotEmpty) ...[
        const SizedBox(height: VitruvSpace.s2),
        Text(
          l10n.coreRoundsUnsaved(widget.unsavedRounds.length),
          style: theme.textTheme.bodyMedium?.copyWith(color: c.error),
        ),
        const SizedBox(height: VitruvSpace.s2),
        VitruvButton(
          label: l10n.coreSaveRounds,
          variant: VitruvButtonVariant.secondary,
          leadingIcon: Icons.cloud_upload_outlined,
          fullWidth: true,
          onPressed: widget.onSaveRounds,
        ),
      ],
    ]);

    final work = active && r.current?.kind == IntervalPhaseKind.work;
    return VitruvCard(
      tone: !active
          ? VitruvCardTone.standard
          : work
          ? VitruvCardTone.accent
          : VitruvCardTone.sunken,
      padding: VitruvCardPadding.sm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    );
  }

  /// First round not stored yet (null = all stored).
  static int? _firstOpenRound(WorkoutExercise e, IntervalConfig config) {
    final saved = {
      for (final s in e.sets)
        if (s.completed) s.setNumber,
    };
    for (var n = 1; n <= config.rounds; n++) {
      if (!saved.contains(n)) return n;
    }
    return null;
  }
}

/// One mark per round: saved ✓, current ●, open ○ (with a text label for VoiceOver).
class _RoundMarks extends StatelessWidget {
  const _RoundMarks({
    required this.config,
    required this.savedRounds,
    required this.current,
  });

  final IntervalConfig config;
  final Set<int> savedRounds;
  final int? current;

  @override
  Widget build(BuildContext context) {
    final c = VitruvTheme.of(context);
    final l10n = AppLocalizations.of(context);
    return Semantics(
      container: true,
      label: l10n.coreRoundsSaved(savedRounds.length, config.rounds),
      excludeSemantics: true,
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: VitruvSpace.s2,
        runSpacing: VitruvSpace.s2,
        children: [
          for (var n = 1; n <= config.rounds; n++)
            Icon(
              savedRounds.contains(n)
                  ? Icons.check_circle
                  : n == current
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              size: VitruvSpace.s5,
              color: savedRounds.contains(n)
                  ? c.success
                  : n == current
                  ? c.accentText
                  : c.fgSubtle,
            ),
        ],
      ),
    );
  }
}
