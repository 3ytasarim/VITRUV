import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/time/clock.dart';
import 'countdown.dart';
import 'rest_alert.dart';
import 'workout_engine.dart';

enum IntervalStatus { idle, running, paused, finished }

/// What the client should notice at a phase change (sound/haptic/visual in the screen).
enum IntervalSignal { work, rest, done }

/// Core interval (rounds × work/rest) on top of the ONE countdown engine ([Countdown]).
///
/// - [phase] is the countdown of the current phase; the next phase starts at the previous
///   phase's ABSOLUTE end time (never at "now"), so the phases never drift — after 2 minutes in
///   the background [sync] lands exactly where the wall clock says, completing every round whose
///   WORK phase ended in between. Dart may be suspended in the background: nothing here relies
///   on callbacks firing on time.
/// - starts with WORK, no REST after the last round (5 × 40/20 = 280 s)
/// - pause freezes the current phase; resume continues it (the later phases move with it)
/// - cancel stops the run; rounds already completed stay completed
class IntervalRunner extends ChangeNotifier {
  IntervalRunner(this._clock, this.config)
    : plan = intervalPlan(config),
      phase = Countdown(_clock) {
    phase.addListener(_onPhase);
  }

  final Clock _clock;
  final IntervalConfig config;
  final IntervalPlan plan;

  /// Countdown of the current phase (watch sync and notifications listen to it).
  final Countdown phase;

  IntervalStatus _status = IntervalStatus.idle;
  int _index = 0;
  IntervalSignal? _signal;
  int _signalCount = 0;

  IntervalStatus get status => _status;
  bool get isActive =>
      _status == IntervalStatus.running || _status == IntervalStatus.paused;

  /// Index into [plan] of the current phase.
  int get index => _index;
  IntervalPhase? get current => isActive ? plan.phases[_index] : null;

  /// Last phase-change signal and how many were given (each change = +1).
  IntervalSignal? get signal => _signal;
  int get signalCount => _signalCount;

  /// Starts at the WORK phase of [fromRound] (resume after a cancelled/killed run).
  void start({int fromRound = 1}) {
    final i = plan.workIndexOf(fromRound);
    if (i < 0) return;
    _index = i;
    final now = _clock.now();
    _runPhase(i, startedAt: now);
    _status = IntervalStatus.running;
    _emit(IntervalSignal.work);
  }

  void pause() {
    if (_status != IntervalStatus.running) return;
    phase.pause();
    _status = IntervalStatus.paused;
    notifyListeners();
  }

  void resume() {
    if (_status != IntervalStatus.paused) return;
    phase.resume();
    _status = IntervalStatus.running;
    notifyListeners();
  }

  /// Stops the run (rounds already completed stay completed). Also what a watch "cancel"
  /// command does: it skips [phase] directly — [_onPhase] follows.
  void cancel() {
    if (!isActive) return;
    phase.skip();
  }

  void _onPhase() {
    if (phase.phase == CountdownPhase.idle && isActive) {
      _status = IntervalStatus.idle;
      notifyListeners();
    }
  }

  /// Continues a saved run (app restart) from its absolute times; call [sync] afterwards.
  void restore({
    required int index,
    required DateTime startedAt,
    DateTime? endsAt,
    Duration? pausedRemaining,
  }) {
    if (index < 0 || index >= plan.phases.length || isActive) return;
    _index = index;
    phase.restore(
      startedAt: startedAt,
      total: Duration(seconds: plan.phases[index].seconds),
      endsAt: endsAt,
      pausedRemaining: pausedRemaining,
    );
    _status = endsAt == null ? IntervalStatus.paused : IntervalStatus.running;
    notifyListeners();
  }

  /// Moves past every phase whose absolute end has passed (ticker, app resume, restore).
  /// Returns the rounds whose WORK phase ended in this call (to be recorded).
  List<int> sync() {
    if (_status != IntervalStatus.running) return const [];
    final now = _clock.now();
    var end = phase.endsAt;
    if (end == null || end.isAfter(now)) return const [];
    final rounds = <int>[];
    var i = _index;
    IntervalSignal? signal;
    while (!end!.isAfter(now)) {
      final ended = plan.phases[i];
      if (ended.kind == IntervalPhaseKind.work) rounds.add(ended.round);
      if (i == plan.phases.length - 1) {
        signal = IntervalSignal.done;
        break;
      }
      i++;
      final next = plan.phases[i];
      signal = next.kind == IntervalPhaseKind.work
          ? IntervalSignal.work
          : IntervalSignal.rest;
      end = end.add(Duration(seconds: next.seconds));
    }
    if (signal == IntervalSignal.done) {
      phase.sync(); // → finished (one notification)
      _status = IntervalStatus.finished;
    } else {
      _index = i;
      _runPhase(
        i,
        startedAt: end.subtract(Duration(seconds: plan.phases[i].seconds)),
      );
    }
    _emit(signal!);
    return rounds;
  }

  /// The absolute end of every phase still ahead (for the notification series), with the kind
  /// of what follows it. Empty unless running.
  List<({DateTime at, IntervalSignal next, int round})> upcoming() {
    final end = phase.endsAt;
    if (_status != IntervalStatus.running || end == null) return const [];
    final out = <({DateTime at, IntervalSignal next, int round})>[];
    var at = end;
    for (var i = _index; i < plan.phases.length; i++) {
      if (i > _index) at = at.add(Duration(seconds: plan.phases[i].seconds));
      final p = plan.phases[i];
      final last = i == plan.phases.length - 1;
      out.add((
        at: at,
        next: last
            ? IntervalSignal.done
            : plan.phases[i + 1].kind == IntervalPhaseKind.work
            ? IntervalSignal.work
            : IntervalSignal.rest,
        round: last ? p.round : plan.phases[i + 1].round,
      ));
    }
    return out;
  }

  void _runPhase(int i, {required DateTime startedAt}) {
    final seconds = Duration(seconds: plan.phases[i].seconds);
    phase.restore(
      startedAt: startedAt,
      total: seconds,
      endsAt: startedAt.add(seconds),
    );
  }

  void _emit(IntervalSignal signal) {
    _signal = signal;
    _signalCount++;
    notifyListeners();
  }

  @override
  void dispose() {
    phase.removeListener(_onPhase);
    phase.dispose();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------------------------
// Persistence: a running Core routine survives an app kill (absolute times only)
// ---------------------------------------------------------------------------------------------

@immutable
class SavedInterval {
  const SavedInterval({
    required this.sessionId,
    required this.exerciseId,
    required this.config,
    required this.index,
    required this.startedAtMs,
    this.endsAtMs,
    this.pausedRemainingMs,
  });

  final String sessionId;
  final String exerciseId;
  final IntervalConfig config;
  final int index;
  final int startedAtMs;
  final int? endsAtMs;
  final int? pausedRemainingMs;

  Map<String, Object?> toJson() => {
    'v': 1,
    'sessionId': sessionId,
    'exerciseId': exerciseId,
    'rounds': config.rounds,
    'work': config.workSeconds,
    'rest': config.restSeconds,
    'index': index,
    'startedAtMs': startedAtMs,
    'endsAtMs': endsAtMs,
    'pausedRemainingMs': pausedRemainingMs,
  };

  static SavedInterval? tryParse(Object? json) {
    if (json is! Map || json['v'] != 1) return null;
    final ints = [
      'rounds',
      'work',
      'rest',
      'index',
      'startedAtMs',
    ].map((k) => json[k]).toList();
    final endsAt = json['endsAtMs'];
    final paused = json['pausedRemainingMs'];
    if (json['sessionId'] is! String ||
        json['exerciseId'] is! String ||
        ints.any((v) => v is! int) ||
        (endsAt == null && paused is! int) ||
        (endsAt != null && endsAt is! int)) {
      return null;
    }
    return SavedInterval(
      sessionId: json['sessionId'] as String,
      exerciseId: json['exerciseId'] as String,
      config: IntervalConfig(
        rounds: ints[0]! as int,
        workSeconds: ints[1]! as int,
        restSeconds: ints[2]! as int,
      ),
      index: ints[3]! as int,
      startedAtMs: ints[4]! as int,
      endsAtMs: endsAt as int?,
      pausedRemainingMs: paused is int ? paused : null,
    );
  }
}

abstract interface class IntervalStore {
  Future<SavedInterval?> load();
  Future<void> save(SavedInterval interval);
  Future<void> clear();
}

class MemoryIntervalStore implements IntervalStore {
  SavedInterval? saved;

  @override
  Future<SavedInterval?> load() async => saved;

  @override
  Future<void> save(SavedInterval interval) async => saved = interval;

  @override
  Future<void> clear() async => saved = null;
}

/// Platform secure storage, like the rest timer (the app writes no plain files). Not a secret:
/// ids and times only. Failures are swallowed — the routine never depends on it.
class SecureIntervalStore implements IntervalStore {
  SecureIntervalStore([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock_this_device,
            ),
          );

  static const _key = 'vitruv.workout.interval.v1';
  final FlutterSecureStorage _storage;

  @override
  Future<SavedInterval?> load() async {
    try {
      final raw = await _storage.read(key: _key);
      return raw == null ? null : SavedInterval.tryParse(jsonDecode(raw));
    } on Object {
      return null;
    }
  }

  @override
  Future<void> save(SavedInterval interval) async {
    try {
      await _storage.write(key: _key, value: jsonEncode(interval.toJson()));
    } on Object catch (error) {
      debugPrint('interval not saved: $error');
    }
  }

  @override
  Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } on Object catch (error) {
      debugPrint('interval not cleared: $error');
    }
  }
}

final intervalStoreProvider = Provider<IntervalStore>(
  (ref) => SecureIntervalStore(),
);

/// A routine that ended longer ago than this is not restored.
const kIntervalRestoreGrace = Duration(minutes: 10);

/// Saves every state of a running/paused routine and clears it when it ends or is cancelled.
class IntervalPersistence {
  IntervalPersistence({
    required this._runner,
    required this._store,
    required this._sessionId,
    required this._exerciseId,
  }) {
    _runner.addListener(_onChange);
  }

  final IntervalRunner _runner;
  final IntervalStore _store;
  final String _sessionId;
  final String _exerciseId;
  bool _saved = false;

  void _onChange() {
    final r = _runner;
    if (r.isActive) {
      _saved = true;
      unawaited(
        _store.save(
          SavedInterval(
            sessionId: _sessionId,
            exerciseId: _exerciseId,
            config: r.config,
            index: r.index,
            startedAtMs:
                (r.phase.startedAt ?? DateTime.now()).millisecondsSinceEpoch,
            endsAtMs: r.phase.endsAt?.millisecondsSinceEpoch,
            pausedRemainingMs: r.status == IntervalStatus.paused
                ? r.phase.remaining.inMilliseconds
                : null,
          ),
        ),
      );
    } else if (_saved) {
      _saved = false;
      unawaited(_store.clear());
    }
  }

  /// Restores [saved] into the runner when it belongs to this session/exercise/config and is not
  /// long over; otherwise drops it. Returns the rounds completed while the app was away.
  static List<int>? restoreInto(
    IntervalRunner runner,
    SavedInterval saved, {
    required String sessionId,
    required String exerciseId,
    required Clock clock,
  }) {
    if (saved.sessionId != sessionId ||
        saved.exerciseId != exerciseId ||
        saved.config != runner.config) {
      return null;
    }
    final startedAt = DateTime.fromMillisecondsSinceEpoch(
      saved.startedAtMs,
      isUtc: true,
    );
    final endsAt = saved.endsAtMs == null
        ? null
        : DateTime.fromMillisecondsSinceEpoch(saved.endsAtMs!, isUtc: true);
    if (endsAt != null) {
      // the end of the whole routine, from the saved phase end
      var routineEnd = endsAt;
      for (var i = saved.index + 1; i < runner.plan.phases.length; i++) {
        routineEnd = routineEnd.add(
          Duration(seconds: runner.plan.phases[i].seconds),
        );
      }
      if (clock.now().difference(routineEnd) > kIntervalRestoreGrace) {
        return null;
      }
    }
    runner.restore(
      index: saved.index,
      startedAt: startedAt,
      endsAt: endsAt,
      pausedRemaining: saved.pausedRemainingMs == null
          ? null
          : Duration(milliseconds: saved.pausedRemainingMs!),
    );
    return runner.sync();
  }

  /// Leaving the workout discards the routine (an app kill does not call this → it survives).
  void dispose() {
    _runner.removeListener(_onChange);
    if (_saved) unawaited(_store.clear());
  }
}

// ---------------------------------------------------------------------------------------------
// Lock screen: one notification per upcoming phase change (iOS), scheduled at absolute times
// ---------------------------------------------------------------------------------------------

/// Keeps the phase-change notifications in step with the routine: (re)scheduled when it starts,
/// resumes or is restored; cancelled when paused, cancelled or left. Phase changes themselves do
/// not reschedule — the series was planned from absolute times. When it finishes nothing is
/// cancelled (the last notification is the "done" signal).
class IntervalAlertBinding {
  IntervalAlertBinding({
    required this._runner,
    required this._scheduler,
    required this._texts,
  }) {
    _runner.addListener(_onChange);
  }

  final IntervalRunner _runner;
  final RestAlertScheduler _scheduler;
  final ({String title, String body}) Function(IntervalSignal next, int round)
  _texts;
  IntervalStatus _last = IntervalStatus.idle;
  DateTime? _anchor;

  void _onChange() {
    final status = _runner.status;
    switch (status) {
      case IntervalStatus.running:
        final ahead = _runner.upcoming();
        // the anchor = absolute end of the whole routine; unchanged by a normal phase change
        final anchor = ahead.isEmpty ? null : ahead.last.at;
        if (_last != IntervalStatus.running || anchor != _anchor) {
          _anchor = anchor;
          unawaited(
            _scheduler.scheduleSeries([
              for (final a in ahead)
                (
                  at: a.at,
                  title: _texts(a.next, a.round).title,
                  body: _texts(a.next, a.round).body,
                ),
            ]),
          );
        }
      case IntervalStatus.paused:
      case IntervalStatus.idle:
        if (_anchor != null) {
          _anchor = null;
          unawaited(_scheduler.cancelSeries());
        }
      case IntervalStatus.finished:
        _anchor = null;
    }
    _last = status;
  }

  void dispose() {
    _runner.removeListener(_onChange);
    if (_runner.isActive) unawaited(_scheduler.cancelSeries());
  }
}
