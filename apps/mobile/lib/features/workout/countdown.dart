import 'package:flutter/foundation.dart';

import '../../core/time/clock.dart';

enum CountdownPhase { idle, running, paused, finished }

/// Local countdown (rest timer, timed exercises). Lives only in the app — the backend never ticks.
///
/// ABSOLUTE TARGET TIME: while running, only the end time is stored and the remaining time is
/// `endsAt − now`. There is no per-second decrement, so background time, a locked screen or a
/// dropped frame can not make it drift: after 20 s in the background it shows 20 s less.
/// [sync] turns a run that reached zero into `finished` (called by the view's ticker and on app
/// resume).
class Countdown extends ChangeNotifier {
  Countdown(this._clock);

  final Clock _clock;

  CountdownPhase _phase = CountdownPhase.idle;
  DateTime? _endsAt;
  Duration _pausedRemaining = Duration.zero;
  Duration _total = Duration.zero;

  CountdownPhase get phase => _phase;
  Duration get total => _total;
  bool get isActive =>
      _phase == CountdownPhase.running || _phase == CountdownPhase.paused;

  Duration get remaining => switch (_phase) {
    CountdownPhase.running => _positive(_endsAt!.difference(_clock.now())),
    CountdownPhase.paused => _pausedRemaining,
    CountdownPhase.idle || CountdownPhase.finished => Duration.zero,
  };

  /// Whole seconds as displayed (rounded up: 0.4 s left still shows 00:01).
  int get remainingSeconds => (remaining.inMilliseconds / 1000).ceil();

  /// 0..1 of the total still remaining.
  double get fraction => _total == Duration.zero
      ? 0
      : (remaining.inMilliseconds / _total.inMilliseconds).clamp(0, 1);

  void start(Duration duration) {
    if (duration <= Duration.zero) return;
    _total = duration;
    _endsAt = _clock.now().add(duration);
    _phase = CountdownPhase.running;
    notifyListeners();
  }

  void pause() {
    if (_phase != CountdownPhase.running) return;
    _pausedRemaining = remaining;
    _phase = CountdownPhase.paused;
    notifyListeners();
  }

  void resume() {
    if (_phase != CountdownPhase.paused) return;
    _endsAt = _clock.now().add(_pausedRemaining);
    _phase = CountdownPhase.running;
    notifyListeners();
  }

  /// "+30 Sek." — extends a running/paused countdown, or restarts a finished one.
  void add(Duration extra) {
    switch (_phase) {
      case CountdownPhase.running:
        _endsAt = _endsAt!.add(extra);
        _total += extra;
      case CountdownPhase.paused:
        _pausedRemaining += extra;
        _total += extra;
      case CountdownPhase.finished:
        start(extra);
        return;
      case CountdownPhase.idle:
        return;
    }
    notifyListeners();
  }

  /// Ends the countdown early (no "finished" event).
  void skip() {
    if (_phase == CountdownPhase.idle) return;
    _phase = CountdownPhase.idle;
    _endsAt = null;
    notifyListeners();
  }

  /// Returns true exactly once, when a running countdown has reached zero.
  bool sync() {
    if (_phase != CountdownPhase.running || remaining > Duration.zero) {
      return false;
    }
    _phase = CountdownPhase.finished;
    notifyListeners();
    return true;
  }

  static Duration _positive(Duration d) => d.isNegative ? Duration.zero : d;
}
