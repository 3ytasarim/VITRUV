import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/time/clock.dart';
import 'countdown.dart';

/// A rest countdown as absolute times — enough to restore it after the app was killed.
@immutable
class SavedRest {
  const SavedRest({
    required this.sessionId,
    required this.exerciseId,
    required this.startedAtMs,
    required this.totalMs,
    this.endsAtMs,
    this.pausedRemainingMs,
  });

  final String sessionId;
  final String exerciseId;
  final int startedAtMs;
  final int totalMs;

  /// Running: absolute end (UTC epoch ms). Null while paused.
  final int? endsAtMs;
  final int? pausedRemainingMs;

  Map<String, Object?> toJson() => {
    'v': 1,
    'sessionId': sessionId,
    'exerciseId': exerciseId,
    'startedAtMs': startedAtMs,
    'totalMs': totalMs,
    'endsAtMs': endsAtMs,
    'pausedRemainingMs': pausedRemainingMs,
  };

  static SavedRest? tryParse(Object? json) {
    if (json is! Map || json['v'] != 1) return null;
    final sessionId = json['sessionId'];
    final exerciseId = json['exerciseId'];
    final startedAt = json['startedAtMs'];
    final total = json['totalMs'];
    final endsAt = json['endsAtMs'];
    final paused = json['pausedRemainingMs'];
    if (sessionId is! String ||
        exerciseId is! String ||
        startedAt is! int ||
        total is! int ||
        (endsAt == null && paused is! int) ||
        (endsAt != null && endsAt is! int)) {
      return null;
    }
    return SavedRest(
      sessionId: sessionId,
      exerciseId: exerciseId,
      startedAtMs: startedAt,
      totalMs: total,
      endsAtMs: endsAt as int?,
      pausedRemainingMs: paused is int ? paused : null,
    );
  }
}

abstract interface class RestTimerStore {
  Future<SavedRest?> load();
  Future<void> save(SavedRest rest);
  Future<void> clear();
}

class MemoryRestTimerStore implements RestTimerStore {
  SavedRest? saved;

  @override
  Future<SavedRest?> load() async => saved;

  @override
  Future<void> save(SavedRest rest) async => saved = rest;

  @override
  Future<void> clear() async => saved = null;
}

/// One small JSON value in platform secure storage (the app writes no plain files — see the
/// token-store guard test). Not a secret: ids and times only. Every failure is swallowed:
/// persistence is a convenience, the timer never depends on it.
class SecureRestTimerStore implements RestTimerStore {
  SecureRestTimerStore([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock_this_device,
            ),
          );

  static const _key = 'vitruv.workout.rest.v1';
  final FlutterSecureStorage _storage;

  @override
  Future<SavedRest?> load() async {
    try {
      final raw = await _storage.read(key: _key);
      return raw == null ? null : SavedRest.tryParse(jsonDecode(raw));
    } on Object {
      return null;
    }
  }

  @override
  Future<void> save(SavedRest rest) async {
    try {
      await _storage.write(key: _key, value: jsonEncode(rest.toJson()));
    } on Object catch (error) {
      debugPrint('rest timer not saved: $error');
    }
  }

  @override
  Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } on Object catch (error) {
      debugPrint('rest timer not cleared: $error');
    }
  }
}

final restTimerStoreProvider = Provider<RestTimerStore>(
  (ref) => SecureRestTimerStore(),
);

/// A rest that ended longer ago than this is not restored (the client has moved on).
const kRestRestoreGrace = Duration(minutes: 10);

/// Saves every change of the rest [Countdown] and restores it after an app restart.
class RestTimerPersistence {
  RestTimerPersistence({
    required this._countdown,
    required this._store,
    required this._clock,
    required this._context,
  }) {
    _countdown.addListener(_onChange);
  }

  final Countdown _countdown;
  final RestTimerStore _store;
  final Clock _clock;

  /// Session + exercise of the running rest (null → nothing to save).
  final ({String sessionId, String exerciseId})? Function() _context;
  bool _saved = false;

  void _onChange() {
    final c = _countdown;
    switch (c.phase) {
      case CountdownPhase.running:
      case CountdownPhase.paused:
        final context = _context();
        if (context == null) return;
        _saved = true;
        unawaited(
          _store.save(
            SavedRest(
              sessionId: context.sessionId,
              exerciseId: context.exerciseId,
              startedAtMs: (c.startedAt ?? _clock.now()).millisecondsSinceEpoch,
              totalMs: c.total.inMilliseconds,
              endsAtMs: c.endsAt?.millisecondsSinceEpoch,
              pausedRemainingMs: c.phase == CountdownPhase.paused
                  ? c.remaining.inMilliseconds
                  : null,
            ),
          ),
        );
      case CountdownPhase.idle:
      case CountdownPhase.finished:
        if (!_saved) return;
        _saved = false;
        unawaited(_store.clear());
    }
  }

  /// Restores the saved rest of [sessionId] (returns its exercise id), or clears a stale one.
  Future<String?> restore(String sessionId) async {
    final saved = await _store.load();
    if (saved == null) return null;
    final now = _clock.now();
    final endsAt = saved.endsAtMs == null
        ? null
        : DateTime.fromMillisecondsSinceEpoch(saved.endsAtMs!, isUtc: true);
    final stale =
        saved.sessionId != sessionId ||
        (endsAt != null && now.difference(endsAt) > kRestRestoreGrace);
    if (stale || _countdown.phase != CountdownPhase.idle) {
      if (stale) await _store.clear();
      return null;
    }
    _countdown.restore(
      startedAt: DateTime.fromMillisecondsSinceEpoch(
        saved.startedAtMs,
        isUtc: true,
      ),
      total: Duration(milliseconds: saved.totalMs),
      endsAt: endsAt,
      pausedRemaining: saved.pausedRemainingMs == null
          ? null
          : Duration(milliseconds: saved.pausedRemainingMs!),
    );
    return saved.exerciseId;
  }

  /// Leaving the workout discards the rest (an app kill does not call this → it survives).
  void dispose({bool discard = true}) {
    _countdown.removeListener(_onChange);
    if (discard && _saved) unawaited(_store.clear());
  }
}
