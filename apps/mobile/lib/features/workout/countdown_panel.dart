import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/format/training_format.dart';
import '../../shared/ui/ui.dart';
import 'countdown.dart';

enum CountdownKind { rest, work }

/// Visual countdown for a [Countdown] (rest between sets/exercises, or a timed exercise).
///
/// PERFORMANCE: the ticker lives here — only this panel rebuilds, at most once per displayed
/// second; the workout screen around it never rebuilds for a tick.
/// ACCESSIBILITY: the ticking digits are excluded from semantics updates (no announcement per
/// second). Start and end are announced once; the current value is read on focus.
/// LIFECYCLE: on app resume the panel re-reads the absolute end time immediately.
class CountdownPanel extends StatefulWidget {
  const CountdownPanel({
    super.key,
    required this.countdown,
    this.kind = CountdownKind.rest,
    this.onFinished,
  });

  final Countdown countdown;
  final CountdownKind kind;
  final VoidCallback? onFinished;

  @override
  State<CountdownPanel> createState() => _CountdownPanelState();
}

class _CountdownPanelState extends State<CountdownPanel>
    with WidgetsBindingObserver {
  Timer? _ticker;
  int _shownSeconds = -1;
  CountdownPhase _phase = CountdownPhase.idle;

  Countdown get _c => widget.countdown;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _phase = _c.phase;
    _shownSeconds = _c.remainingSeconds;
    _c.addListener(_onChange);
    _syncTicker();
  }

  @override
  void didUpdateWidget(CountdownPanel old) {
    super.didUpdateWidget(old);
    if (old.countdown != widget.countdown) {
      old.countdown.removeListener(_onChange);
      widget.countdown.addListener(_onChange);
      _onChange();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _c.removeListener(_onChange);
    _ticker?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _tick();
  }

  void _onChange() {
    final previous = _phase;
    _phase = _c.phase;
    if (previous != CountdownPhase.running &&
        previous != CountdownPhase.paused &&
        _phase == CountdownPhase.running) {
      _announce(
        widget.kind == CountdownKind.rest
            ? AppLocalizations.of(context)
                  .restStarted(clock(_c.remainingSeconds))
            : AppLocalizations.of(context).startTimer,
      );
    }
    if (previous != CountdownPhase.finished &&
        _phase == CountdownPhase.finished) {
      _announce(
        widget.kind == CountdownKind.rest
            ? AppLocalizations.of(context).restFinished
            : AppLocalizations.of(context).timerReached,
        assertive: true,
      );
      HapticFeedback.mediumImpact();
      widget.onFinished?.call();
    }
    _syncTicker();
    if (mounted) {
      setState(() => _shownSeconds = _c.remainingSeconds);
    }
  }

  void _syncTicker() {
    if (_c.phase == CountdownPhase.running) {
      _ticker ??= Timer.periodic(
        const Duration(milliseconds: 250),
        (_) => _tick(),
      );
    } else {
      _ticker?.cancel();
      _ticker = null;
    }
  }

  void _tick() {
    if (_c.sync()) return; // listener handles the finished transition
    final seconds = _c.remainingSeconds;
    if (seconds != _shownSeconds && mounted) {
      setState(() => _shownSeconds = seconds);
    }
  }

  void _announce(String message, {bool assertive = false}) {
    if (!mounted) return;
    unawaited(
      SemanticsService.sendAnnouncement(
        View.of(context),
        message,
        Directionality.of(context),
        assertiveness: assertive
            ? Assertiveness.assertive
            : Assertiveness.polite,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final finished = _c.phase == CountdownPhase.finished;
    final rest = widget.kind == CountdownKind.rest;
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final digits = clock(_shownSeconds < 0 ? 0 : _shownSeconds);

    return VitruvCard(
      tone: finished ? VitruvCardTone.outline : VitruvCardTone.accent,
      padding: VitruvCardPadding.sm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(
                rest ? Icons.timer_outlined : Icons.av_timer,
                color: c.accentText,
                size: VitruvSpace.s5,
              ),
              const SizedBox(width: VitruvSpace.s2),
              Expanded(
                child: Text(
                  finished
                      ? (rest ? l10n.restFinished : l10n.timerReached)
                      : (rest ? l10n.restTitle : l10n.startTimer),
                  style: theme.textTheme.titleMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: VitruvSpace.s2),
          Semantics(
            container: true,
            label: l10n.restRemainingSemantics(digits),
            excludeSemantics: true,
            child: AnimatedSwitcher(
              duration: reduceMotion ? Duration.zero : VitruvMotion.micro,
              child: Text(
                digits,
                key: ValueKey(finished),
                textAlign: TextAlign.center,
                style: theme.textTheme.displaySmall?.copyWith(
                  color: finished ? c.fgMuted : c.fg,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),
          const SizedBox(height: VitruvSpace.s2),
          ExcludeSemantics(
            child: LinearProgressIndicator(
              value: _c.total == Duration.zero
                  ? 0
                  : (_shownSeconds * 1000 / _c.total.inMilliseconds).clamp(
                      0.0,
                      1.0,
                    ),
              minHeight: VitruvSpace.s1,
              color: c.accent,
              backgroundColor: c.borderSubtle,
            ),
          ),
          const SizedBox(height: VitruvSpace.s3),
          Wrap(
            spacing: VitruvSpace.s2,
            runSpacing: VitruvSpace.s2,
            alignment: WrapAlignment.center,
            children: [
              if (!finished)
                VitruvButton(
                  label: _c.phase == CountdownPhase.paused
                      ? l10n.restResume
                      : l10n.restPause,
                  variant: VitruvButtonVariant.secondary,
                  leadingIcon: _c.phase == CountdownPhase.paused
                      ? Icons.play_arrow
                      : Icons.pause,
                  onPressed: _c.phase == CountdownPhase.paused
                      ? _c.resume
                      : _c.pause,
                ),
              if (rest)
                VitruvButton(
                  label: l10n.restAdd,
                  semanticLabel: l10n.restAddSemantics,
                  variant: VitruvButtonVariant.secondary,
                  onPressed: () => _c.add(const Duration(seconds: 30)),
                ),
              VitruvButton(
                label: rest
                    ? (finished ? l10n.restContinue : l10n.restSkip)
                    : l10n.stopTimer,
                variant: finished
                    ? VitruvButtonVariant.primary
                    : VitruvButtonVariant.ghost,
                onPressed: _c.skip,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
