import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors/app_failure.dart';
import '../../core/routing/app_routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/vitruv_tokens.g.dart';
import '../../core/time/clock.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/format/training_format.dart';
import '../../shared/ui/ui.dart';
import '../../shared/widgets/async_value_view.dart';
import '../../shared/widgets/content_page.dart';
import '../training/exercise_media.dart';
import 'countdown.dart';
import 'countdown_panel.dart';
import 'interval_panel.dart';
import 'interval_runner.dart';
import 'rest_alert.dart';
import 'rest_timer_store.dart';
import 'total_reps_panel.dart';
import 'timer_sync/countdown_sync.dart';
import 'timer_sync/synced_timer.dart';
import 'timer_sync/timer_sync_providers.dart';
import 'warmup_checklist.dart';
import 'workout_controller.dart';
import 'workout_engine.dart';
import 'workout_models.dart';

/// The live workout of the current session.
///
/// - one exercise at a time, explicit "Vorherige/Nächste Übung" buttons (no swipe-only control);
///   a Warm-up of CHECKLIST items is one page: all items below each other, tick off, then
///   "Training fortsetzen" to the next section (or "Training abschließen" if nothing follows)
/// - execution controls by mode: sets (tick each set), total reps, timed, custom (mark done)
/// - Total reps (Sprint 6): unlimited sets until the target; every set is stored first (POST
///   with a client set id — a retry never doubles it) and only THEN the rest starts by itself;
///   none after the set that reaches the target, none when the save failed
/// - Core (Sprint 6): rounds × work/rest run by [IntervalRunner] on absolute times; phases change
///   by themselves, every finished round is stored (idempotent); a running routine survives
///   background and an app kill
/// - Strength (sets × reps): each set records the reps actually done (prefilled with the target;
///   MAX starts empty). The rest timer starts ONLY with "Pause starten" — completing a set offers
///   it, never starts it. Other modes keep the rest after "Übung abschließen". It never blocks
///   the screen
/// - rest and exercise countdowns are mirrored to a paired Apple Watch through [CountdownSync]
///   (no-op without a watch / with the switch off — the iPhone timer works the same either way)
/// - leaving the screen keeps the session IN_PROGRESS on the server ("Training fortsetzen")
/// - every change is saved immediately (optimistic); a failed save is rolled back and offered
///   again — nothing is silently lost
class WorkoutScreen extends ConsumerStatefulWidget {
  const WorkoutScreen({super.key});

  @override
  ConsumerState<WorkoutScreen> createState() => _WorkoutScreenState();
}

class _WorkoutScreenState extends ConsumerState<WorkoutScreen> {
  late final Countdown _rest;
  late final Countdown _work;
  late final CountdownSync _restSync;
  late final CountdownSync _workSync;
  late final AppLifecycleListener _lifecycle;
  late final RestAlertBinding _restAlert;
  late final RestTimerPersistence _restPersistence;
  final Map<String, TextEditingController> _reps = {};
  int? _index;

  /// The exercise whose rest is counting down (for the watch: "Pause nach …").
  WorkoutExercise? _restExercise;

  /// Strength: the exercise whose set was just completed — "Pause starten" is offered for it
  /// until the client starts the rest or completes the next set.
  WorkoutExercise? _restOffer;

  /// Exercise whose active set was submitted without reps (MAX) → inline hint.
  String? _repsMissingFor;

  /// Reps entry per Strength set ("exerciseId/setNumber").
  final Map<String, TextEditingController> _setReps = {};

  /// Total reps: the set being saved / not yet confirmed per exercise. Its client set id is kept
  /// for a retry with the same reps (the server answers with the stored set, never a second).
  final Map<String, ({String id, int reps})> _pendingSet = {};
  String? _savingSetFor;

  /// Client set id whose automatic rest was already started (a replayed answer starts no 2nd).
  String? _restStartedForSet;
  final Random _random = Random.secure();

  /// Core routine (one at a time) with its watch mirror, notifications and persistence.
  IntervalRunner? _core;
  String? _coreExerciseId;
  CountdownSync? _coreSync;
  IntervalAlertBinding? _coreAlert;
  IntervalPersistence? _corePersistence;
  Timer? _coreTicker;
  final Set<int> _unsavedRounds = {};

  @override
  void initState() {
    super.initState();
    final clock = ref.read(clockProvider);
    _rest = Countdown(clock);
    _work = Countdown(clock);
    final transport = ref.read(timerSyncTransportProvider);
    final revisions = ref.read(timerRevisionSourceProvider);
    _restSync = CountdownSync(
      countdown: _rest,
      transport: transport,
      clock: clock,
      revisions: revisions,
      describe: () => _timerContext(
        _restExercise,
        _restExercise?.mode == ExecutionMode.totalReps
            ? SyncedTimerKind.totalRepsRest
            : SyncedTimerKind.strengthRest,
        SyncedTimerPhase.rest,
      ),
    );
    _workSync = CountdownSync(
      countdown: _work,
      transport: transport,
      clock: clock,
      revisions: revisions,
      describe: () {
        final session = ref.read(workoutControllerProvider).value;
        if (session == null || session.exercises.isEmpty) return null;
        return _timerContext(
          session.exercises[_currentIndex(session)],
          SyncedTimerKind.timedExercise,
          SyncedTimerPhase.work,
        );
      },
    );
    // lock screen / background: the OS fires the end-of-rest notification (iOS)
    _restAlert = RestAlertBinding(
      countdown: _rest,
      scheduler: ref.read(restAlertSchedulerProvider),
      texts: () {
        final l10n = AppLocalizations.of(context);
        final name = _restExercise?.name;
        return (
          title: l10n.restNotificationTitle,
          body: name == null
              ? l10n.restNotificationBodyGeneric
              : l10n.restNotificationBody(name),
        );
      },
    );
    // app killed during a rest → restored from the saved absolute end time
    _restPersistence = RestTimerPersistence(
      countdown: _rest,
      store: ref.read(restTimerStoreProvider),
      clock: clock,
      context: () {
        final session = ref.read(workoutControllerProvider).value;
        final exercise = _restExercise;
        return session == null || exercise == null
            ? null
            : (sessionId: session.id, exerciseId: exercise.id);
      },
    );
    unawaited(_restoreRest());
    unawaited(_restoreCore());
    // back from the background: the watch may have missed a change → send the state again;
    // a Core routine catches up with the wall clock (Dart was possibly suspended)
    _lifecycle = AppLifecycleListener(
      onResume: () {
        _syncCore();
        _restSync.republish();
        _workSync.republish();
        _coreSync?.republish();
      },
    );
  }

  Future<void> _restoreRest() async {
    final WorkoutSession? session;
    try {
      session = await ref.read(workoutControllerProvider.future);
    } on Object {
      return;
    }
    if (session == null || !mounted) return;
    final saved = await ref.read(restTimerStoreProvider).load();
    if (!mounted || saved == null) return;
    final index = session.indexOf(saved.exerciseId);
    // context for the restored run (watch + notification text) before it starts
    if (index >= 0) _restExercise = session.exercises[index];
    await _restPersistence.restore(session.id);
  }

  TimerSyncContext? _timerContext(
    WorkoutExercise? exercise,
    SyncedTimerKind kind,
    SyncedTimerPhase phase,
  ) {
    final session = ref.read(workoutControllerProvider).value;
    if (session == null) return null;
    return TimerSyncContext(
      workoutSessionId: session.id,
      exerciseId: exercise?.id,
      exerciseName: exercise?.name,
      kind: kind,
      phase: phase,
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    _disposeCore();
    _restAlert.dispose();
    _restPersistence.dispose();
    _restSync.dispose();
    _workSync.dispose();
    _rest.dispose();
    _work.dispose();
    for (final c in [..._reps.values, ..._setReps.values]) {
      c.dispose();
    }
    super.dispose();
  }

  WorkoutController get _controller =>
      ref.read(workoutControllerProvider.notifier);

  int _currentIndex(WorkoutSession session) {
    final explicit = _index;
    if (explicit != null) {
      return explicit.clamp(0, session.exercises.length - 1);
    }
    final current = session.progress.currentExerciseId;
    final i = current == null ? -1 : session.indexOf(current);
    return i < 0 ? 0 : i;
  }

  void _goTo(int index) {
    _work.skip();
    setState(() => _index = index);
  }

  void _startRest(WorkoutExercise exercise) {
    final seconds = exercise.target.restSeconds ?? 0;
    if (seconds <= 0) return;
    _restExercise = exercise;
    if (_restOffer != null) setState(() => _restOffer = null);
    _rest.start(Duration(seconds: seconds));
  }

  // ------------------------------------------------------------------ Total reps

  /// RFC 4122 v4 (the API requires a UUID as client set id).
  String _newClientSetId() {
    final b = List<int>.generate(16, (_) => _random.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = [for (final x in b) x.toRadixString(16).padLeft(2, '0')].join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-'
        '${h.substring(16, 20)}-${h.substring(20)}';
  }

  Future<void> _saveTotalSet(WorkoutExercise exercise) async {
    if (_savingSetFor != null) return; // one at a time — no double submit
    final reps = int.tryParse(_repsController(exercise).text.trim());
    if (reps == null || reps < 1) {
      setState(() => _repsMissingFor = exercise.id);
      return;
    }
    // same reps as the unconfirmed attempt → same id (retry); changed reps → a new set
    final pending = _pendingSet[exercise.id];
    final id = pending != null && pending.reps == reps
        ? pending.id
        : _newClientSetId();
    _pendingSet[exercise.id] = (id: id, reps: reps);
    setState(() {
      _repsMissingFor = null;
      _savingSetFor = exercise.id;
    });
    final result = await _controller.recordTotalSet(
      exercise.id,
      clientSetId: id,
      actualReps: reps,
    );
    if (!mounted) return;
    setState(() => _savingSetFor = null);
    final failure = result.failure;
    final recorded = result.recorded;
    if (failure != null || recorded == null) {
      // NOT stored → no rest, the entry stays; "Erneut versuchen" resends the same set id
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${failure is NetworkFailure ? l10n.errorNetwork : l10n.saveFailed} '
            '${l10n.totalSetNotSaved}',
          ),
          action: SnackBarAction(
            label: l10n.retry,
            onPressed: () => _saveTotalSet(exercise),
          ),
        ),
      );
      return;
    }
    _pendingSet.remove(exercise.id);
    _repsController(exercise).clear();
    unawaited(HapticFeedback.selectionClick());
    final rest = recorded.restSeconds;
    if (rest != null && rest > 0 && _restStartedForSet != id) {
      _restStartedForSet = id;
      _restExercise = recorded.exercise;
      if (_restOffer != null) setState(() => _restOffer = null);
      _rest.start(Duration(seconds: rest));
    }
  }

  // ------------------------------------------------------------------ Core interval

  IntervalRunner _coreFor(WorkoutSession session, WorkoutExercise exercise) {
    final config = exercise.intervalConfig!;
    final existing = _core;
    if (existing != null &&
        _coreExerciseId == exercise.id &&
        existing.config == config) {
      return existing;
    }
    _disposeCore();
    final clock = ref.read(clockProvider);
    final runner = IntervalRunner(clock, config);
    _core = runner;
    _coreExerciseId = exercise.id;
    _coreSync = CountdownSync(
      countdown: runner.phase,
      transport: ref.read(timerSyncTransportProvider),
      clock: clock,
      revisions: ref.read(timerRevisionSourceProvider),
      describe: () => _timerContext(
        exercise,
        SyncedTimerKind.interval,
        runner.current?.kind == IntervalPhaseKind.rest
            ? SyncedTimerPhase.rest
            : SyncedTimerPhase.work,
      ),
    );
    _coreAlert = IntervalAlertBinding(
      runner: runner,
      scheduler: ref.read(restAlertSchedulerProvider),
      texts: (next, round) {
        final l10n = AppLocalizations.of(context);
        return switch (next) {
          IntervalSignal.rest => (
            title: l10n.coreNotifyRestTitle,
            body: l10n.coreNotifyRestBody(round),
          ),
          IntervalSignal.work => (
            title: l10n.coreNotifyWorkTitle,
            body: l10n.coreNotifyWorkBody(round, config.rounds),
          ),
          IntervalSignal.done => (
            title: l10n.coreNotifyDoneTitle,
            body: l10n.coreNotifyDoneBody(exercise.name),
          ),
        };
      },
    );
    _corePersistence = IntervalPersistence(
      runner: runner,
      store: ref.read(intervalStoreProvider),
      sessionId: session.id,
      exerciseId: exercise.id,
    );
    runner.addListener(_onCoreChange);
    return runner;
  }

  void _disposeCore() {
    _coreTicker?.cancel();
    _coreTicker = null;
    final runner = _core;
    if (runner == null) return;
    runner.removeListener(_onCoreChange);
    _coreAlert?.dispose();
    _corePersistence?.dispose();
    _coreSync?.dispose();
    runner.dispose();
    _core = null;
    _coreExerciseId = null;
    _coreSync = null;
    _coreAlert = null;
    _corePersistence = null;
  }

  /// The phase logic runs here (not in the panel) so rounds are stored even while another
  /// exercise is on screen.
  void _onCoreChange() {
    if (_core?.status == IntervalStatus.running) {
      _coreTicker ??= Timer.periodic(
        const Duration(milliseconds: 250),
        (_) => _syncCore(),
      );
    } else {
      _coreTicker?.cancel();
      _coreTicker = null;
    }
  }

  void _syncCore() {
    final runner = _core;
    if (runner == null) return;
    final rounds = runner.sync();
    if (rounds.isNotEmpty) unawaited(_recordRounds(rounds));
  }

  void _startCore(
    WorkoutSession session,
    WorkoutExercise exercise,
    int fromRound,
  ) {
    HapticFeedback.selectionClick();
    if (_rest.isActive) _rest.skip(); // the routine has its own rests
    setState(() => _coreFor(session, exercise).start(fromRound: fromRound));
  }

  /// Stores finished rounds (idempotent on the server). A failed round stays visible as "not
  /// saved" with a retry — it is never shown as stored.
  Future<void> _recordRounds(Iterable<int> rounds) async {
    final exerciseId = _coreExerciseId;
    final runner = _core;
    if (exerciseId == null || runner == null) return;
    for (final round in rounds) {
      final failure = await _controller.completeRound(
        exerciseId,
        round,
        seconds: runner.config.workSeconds,
      );
      if (!mounted) return;
      setState(() {
        if (failure == null) {
          _unsavedRounds.remove(round);
        } else {
          _unsavedRounds.add(round);
        }
      });
    }
  }

  Future<void> _restoreCore() async {
    final WorkoutSession? session;
    try {
      session = await ref.read(workoutControllerProvider.future);
    } on Object {
      return;
    }
    if (session == null || !mounted) return;
    final store = ref.read(intervalStoreProvider);
    final saved = await store.load();
    if (!mounted || saved == null) return;
    final index = session.indexOf(saved.exerciseId);
    final exercise = index < 0 ? null : session.exercises[index];
    if (exercise == null ||
        exercise.mode != ExecutionMode.interval ||
        exercise.status != ExerciseStatus.pending) {
      await store.clear();
      return;
    }
    final runner = _coreFor(session, exercise);
    final passed = IntervalPersistence.restoreInto(
      runner,
      saved,
      sessionId: session.id,
      exerciseId: exercise.id,
      clock: ref.read(clockProvider),
    );
    if (passed == null) {
      await store.clear();
      return;
    }
    setState(() {});
    // rounds that ended while the app was away (each stored at most once on the server)
    final open = {
      for (final s in exercise.sets)
        if (!s.completed) s.setNumber,
    };
    final missing = passed.where(open.contains).toList();
    if (missing.isNotEmpty) await _recordRounds(missing);
  }

  Future<void> _run(Future<AppFailure?> Function() mutation) async {
    final failure = await mutation();
    if (failure == null || !mounted) return;
    final l10n = AppLocalizations.of(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          failure is NetworkFailure ? l10n.errorNetwork : l10n.saveFailed,
        ),
        action: SnackBarAction(
          label: l10n.retry,
          onPressed: () => _run(mutation),
        ),
      ),
    );
  }

  void _toggleSet(
    WorkoutSession session,
    WorkoutExercise exercise,
    WorkoutSet set,
  ) {
    final completing = !set.completed;
    if (!completing) {
      HapticFeedback.selectionClick();
      _run(() => _controller.toggleSet(exercise.id, set.setNumber, false));
      return;
    }
    final reps = int.tryParse(_setRepsController(exercise, set).text.trim());
    if (reps == null) {
      // MAX (or a cleared field): the actual reps are required — nothing is saved.
      setState(() => _repsMissingFor = exercise.id);
      return;
    }
    HapticFeedback.selectionClick();
    _run(
      () => _controller.toggleSet(
        exercise.id,
        set.setNumber,
        true,
        actualReps: reps,
      ),
    );
    final allDone = exercise.sets.every(
      (s) => s.setNumber == set.setNumber || s.completed,
    );
    setState(() {
      _repsMissingFor = null;
      // Rest is offered, never started automatically (Strength).
      _restOffer = (exercise.target.restSeconds ?? 0) > 0 ? exercise : null;
    });
    if (allDone) _advance(session);
  }

  void _complete(WorkoutSession session, WorkoutExercise exercise) {
    HapticFeedback.selectionClick();
    final reps = exercise.mode == ExecutionMode.totalReps
        ? int.tryParse(_repsController(exercise).text.trim())
        : null;
    final seconds = exercise.mode == ExecutionMode.duration
        ? (_work.isActive || _work.phase == CountdownPhase.finished
              ? (_work.total - _work.remaining).inSeconds
              : exercise.target.durationSeconds)
        : null;
    _work.skip();
    _run(
      () => _controller.setStatus(
        exercise.id,
        ExerciseStatus.completed,
        actualReps: reps,
        actualDurationSeconds: seconds,
      ),
    );
    _startRest(exercise);
    _advance(session);
  }

  /// Warm-up checklist tick: no timer, no rest, no reps — only the status is saved. The page
  /// stays put (explicit index) so ticking the last item does not jump away by itself.
  void _toggleChecklist(int index, WorkoutExercise exercise) {
    HapticFeedback.selectionClick();
    if (_index == null) setState(() => _index = index);
    final next = exercise.status == ExerciseStatus.completed
        ? ExerciseStatus.pending
        : ExerciseStatus.completed;
    _run(() => _controller.setStatus(exercise.id, next));
  }

  void _setStatus(
    WorkoutSession session,
    WorkoutExercise exercise,
    ExerciseStatus status,
  ) {
    _run(() => _controller.setStatus(exercise.id, status));
    if (status == ExerciseStatus.skipped) {
      _rest.skip();
      _advance(session);
    }
  }

  /// Next exercise after the current one (wraps to the first still open one), if any.
  void _advance(WorkoutSession session) {
    final current = _currentIndex(session);
    if (current < session.exercises.length - 1) _goTo(current + 1);
  }

  /// Reps actually done in one Strength set: the recorded value, else the target; empty for MAX.
  TextEditingController _setRepsController(
    WorkoutExercise exercise,
    WorkoutSet set,
  ) => _setReps.putIfAbsent(
    '${exercise.id}/${set.setNumber}',
    () => TextEditingController(
      text:
          '${set.actualReps ?? (exercise.target.repsMax ? '' : set.targetReps ?? '')}',
    ),
  );

  /// Total reps entry. Legacy single-field flow: prefilled with the total; per-set flow
  /// (Sprint 6): empty — the client types the reps of THIS set.
  TextEditingController _repsController(WorkoutExercise exercise) =>
      _reps.putIfAbsent(
        exercise.id,
        () => TextEditingController(
          text: exercise.serverTotalReps != null
              ? ''
              : '${exercise.actualReps ?? exercise.target.totalReps ?? ''}',
        ),
      );

  Future<bool> _confirm(String title, String body, String confirm) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) {
          final l10n = AppLocalizations.of(context);
          return AlertDialog(
            title: Text(title),
            content: Text(body),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: Text(l10n.keepTraining),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: Text(confirm),
              ),
            ],
          );
        },
      ) ??
      false;

  Future<void> _finish(WorkoutSession session, {required bool abandon}) async {
    final l10n = AppLocalizations.of(context);
    final open = session.progress.open;
    final ok = abandon
        ? await _confirm(
            l10n.abandonConfirmTitle,
            l10n.abandonConfirmBody,
            l10n.abandonWorkout,
          )
        : open == 0 ||
              await _confirm(
                l10n.finishConfirmTitle,
                l10n.finishConfirmOpen(open),
                l10n.finishWorkout,
              );
    if (!ok || !mounted) return;
    _rest.skip();
    _work.skip();
    final result = await _controller.finish(abandon: abandon);
    if (!mounted) return;
    if (result.failure != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ErrorView.messageFor(l10n, result.failure!)),
          action: SnackBarAction(
            label: l10n.retry,
            onPressed: () => _finish(session, abandon: abandon),
          ),
        ),
      );
      return;
    }
    context.go(AppRoutes.workoutDone);
  }

  /// Sprint 6 engines; null → the generic controls of the mode. Total reps uses the new flow only
  /// when the API sends its progress, Core only with its round rows (an older API keeps the
  /// single "Übung abschließen").
  Widget? _engineFor(WorkoutSession session, WorkoutExercise exercise) {
    if (exercise.mode == ExecutionMode.totalReps &&
        exercise.serverTotalReps != null) {
      return TotalRepsPanel(
        exercise: exercise,
        controller: _repsController(exercise),
        saving: _savingSetFor == exercise.id,
        repsMissing: _repsMissingFor == exercise.id,
        onSave: () => _saveTotalSet(exercise),
      );
    }
    // Core: only with the Sprint 6 contract (timer + one row per round to store into)
    if (exercise.mode == ExecutionMode.interval &&
        exercise.timer != null &&
        exercise.sets.isNotEmpty) {
      final mine = _coreExerciseId == exercise.id ? _core : null;
      return IntervalPanel(
        exercise: exercise,
        runner: mine,
        unsavedRounds: mine == null ? const {} : _unsavedRounds,
        otherRunning: mine == null && (_core?.isActive ?? false),
        onStart: (round) => _startCore(session, exercise, round),
        onSaveRounds: () => _recordRounds([..._unsavedRounds]..sort()),
      );
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final async = ref.watch(workoutControllerProvider);
    final session = async.value;

    if (session == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.navTraining)),
        body: async.isLoading
            ? const LoadingView()
            : async.hasError
            ? Center(
                child: ErrorView(
                  failure: async.error!,
                  onRetry: () => _controller.reload(),
                ),
              )
            : ContentPage(
                children: [
                  InfoState(
                    icon: Icons.fitness_center,
                    title: l10n.noWorkoutRunning,
                    action: VitruvButton(
                      label: l10n.backToTraining,
                      variant: VitruvButtonVariant.secondary,
                      onPressed: () => context.go(AppRoutes.training),
                    ),
                  ),
                ],
              ),
      );
    }

    final index = _currentIndex(session);
    final exercise = session.exercises[index];
    final last = index == session.exercises.length - 1;
    final total = session.exercises.length;
    final group = checklistGroupAt(session, index);

    return PopScope(
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(l10n.workoutLeftHint)));
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: BackButton(
            onPressed: () =>
                context.canPop() ? context.pop() : context.go(AppRoutes.today),
          ),
          title: Text(session.dayTitle),
          actions: [
            PopupMenuButton<String>(
              tooltip: l10n.moreActions,
              onSelected: (value) =>
                  _finish(session, abandon: value == 'abandon'),
              itemBuilder: (context) => [
                PopupMenuItem(value: 'finish', child: Text(l10n.finishWorkout)),
                PopupMenuItem(
                  value: 'abandon',
                  child: Text(l10n.abandonWorkout),
                ),
              ],
            ),
          ],
        ),
        body: ContentPage(
          bottom: group != null
              ? _Navigation(
                  canGoBack: group.start > 0,
                  last: group.end == total - 1,
                  nextLabel: l10n.continueWorkout,
                  onPrevious: () => _goTo(group.start - 1),
                  onNext: () => _goTo(group.end + 1),
                  onFinish: () => _finish(session, abandon: false),
                )
              : _Navigation(
                  canGoBack: index > 0,
                  last: last,
                  onPrevious: () => _goTo(index - 1),
                  onNext: () => _goTo(index + 1),
                  onFinish: () => _finish(session, abandon: false),
                ),
          children: [
            if (group != null) ...[
              VitruvProgress(
                value: total == 0
                    ? 0
                    : (session.progress.completed + session.progress.skipped) /
                          total,
                label: l10n.workoutProgressLabel,
                valueText: l10n.workoutProgressValue(
                  session.progress.completed + session.progress.skipped,
                  total,
                ),
              ),
              const SizedBox(height: VitruvSpace.s6),
              WarmupChecklist(
                exercises: session.exercises.sublist(
                  group.start,
                  group.end + 1,
                ),
                onToggle: (e) => _toggleChecklist(index, e),
              ),
            ] else ...[
              Semantics(
                container: true,
                label: l10n.workoutPositionLabel(index + 1, total),
                excludeSemantics: true,
                child: Row(
                  children: [
                    Expanded(
                      child: Eyebrow(
                        TrainingFormat(l10n).section(exercise.sectionType),
                      ),
                    ),
                    Text(
                      l10n.workoutPosition(index + 1, total),
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: VitruvSpace.s3),
              VitruvProgress(
                value: total == 0
                    ? 0
                    : (session.progress.completed + session.progress.skipped) /
                          total,
                label: l10n.workoutProgressLabel,
                valueText: l10n.workoutProgressValue(
                  session.progress.completed + session.progress.skipped,
                  total,
                ),
              ),
              const SizedBox(height: VitruvSpace.s6),
              _ExerciseHeader(exercise: exercise),
              const SizedBox(height: VitruvSpace.s4),
              ListenableBuilder(
                listenable: _rest,
                builder: (context, _) {
                  final offer = _restOffer;
                  if (_rest.phase != CountdownPhase.idle) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: VitruvSpace.s4),
                      child: CountdownPanel(countdown: _rest),
                    );
                  }
                  if (offer == null) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: VitruvSpace.s4),
                    child: VitruvButton(
                      label: l10n.restStartFor(
                        clock(offer.target.restSeconds ?? 0),
                      ),
                      variant: VitruvButtonVariant.secondary,
                      leadingIcon: Icons.timer_outlined,
                      fullWidth: true,
                      onPressed: () => _startRest(offer),
                    ),
                  );
                },
              ),
              if (exercise.media != null) ...[
                ExerciseMedia(
                  media: exercise.media,
                  exerciseName: exercise.name,
                ),
                const SizedBox(height: VitruvSpace.s4),
              ],
              _Execution(
                exercise: exercise,
                engine: _engineFor(session, exercise),
                work: _work,
                repsController: _repsController(exercise),
                setRepsController: (set) => _setRepsController(exercise, set),
                repsMissing: _repsMissingFor == exercise.id,
                onToggleSet: (set) => _toggleSet(session, exercise, set),
                onComplete: () => _complete(session, exercise),
                onSkip: () =>
                    _setStatus(session, exercise, ExerciseStatus.skipped),
                onReopen: () =>
                    _setStatus(session, exercise, ExerciseStatus.pending),
                onStartRest: () => _startRest(exercise),
              ),
              if (exercise.instructions != null) ...[
                const SizedBox(height: VitruvSpace.s6),
                MetaLabel(l10n.instructionsLabel),
                const SizedBox(height: VitruvSpace.s1),
                Text(exercise.instructions!),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _ExerciseHeader extends StatelessWidget {
  const _ExerciseHeader({required this.exercise});

  final WorkoutExercise exercise;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final format = TrainingFormat(l10n);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final target = format.target(exercise.target);
    final rest = format.rest(exercise.target);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: SectionTitle(exercise.name, size: SectionTitleSize.h3),
            ),
            if (exercise.status == ExerciseStatus.completed)
              VitruvBadge(
                l10n.exerciseDone,
                tone: VitruvTone.success,
                dot: true,
              )
            else if (exercise.status == ExerciseStatus.skipped)
              VitruvBadge(
                l10n.exerciseSkipped,
                tone: VitruvTone.neutral,
                dot: true,
              ),
          ],
        ),
        if (target.isNotEmpty) ...[
          const SizedBox(height: VitruvSpace.s2),
          Text(
            target,
            style: theme.textTheme.headlineSmall?.copyWith(color: c.accentText),
          ),
        ],
        if (rest != null) ...[
          const SizedBox(height: VitruvSpace.s1),
          Text(
            rest,
            style: theme.textTheme.bodyLarge?.copyWith(color: c.fgMuted),
          ),
        ],
      ],
    );
  }
}

class _Execution extends StatelessWidget {
  const _Execution({
    required this.exercise,
    required this.engine,
    required this.work,
    required this.repsController,
    required this.setRepsController,
    required this.repsMissing,
    required this.onToggleSet,
    required this.onComplete,
    required this.onSkip,
    required this.onReopen,
    required this.onStartRest,
  });

  final WorkoutExercise exercise;

  /// Sprint 6 engine (Total reps / Core) — replaces the mode controls when set.
  final Widget? engine;
  final Countdown work;
  final TextEditingController repsController;
  final TextEditingController Function(WorkoutSet set) setRepsController;

  /// The active set was submitted without reps (MAX).
  final bool repsMissing;
  final void Function(WorkoutSet set) onToggleSet;
  final VoidCallback onComplete;
  final VoidCallback onSkip;
  final VoidCallback onReopen;
  final VoidCallback onStartRest;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pending = exercise.status == ExerciseStatus.pending;
    final engine = this.engine;
    final hasRest = engine == null && (exercise.target.restSeconds ?? 0) > 0;
    final activeSet = exercise.sets.where((s) => !s.completed).firstOrNull;
    // Engines decide completion themselves (target reached / last round stored); while something
    // is recorded, "skip" and "reopen" would contradict the stored sets/rounds.
    final recorded = engine != null && exercise.sets.any((s) => s.completed);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ?engine,
        if (engine == null && exercise.mode == ExecutionMode.setsReps)
          for (final set in exercise.sets) ...[
            if (set == activeSet)
              _ActiveSet(
                exercise: exercise,
                set: set,
                controller: setRepsController(set),
                repsMissing: repsMissing,
                onComplete: () => onToggleSet(set),
              )
            else
              _SetRow(
                exercise: exercise,
                set: set,
                // completed sets can be reopened; later sets wait for the active one
                onToggle: set.completed ? () => onToggleSet(set) : null,
              ),
            const SizedBox(height: VitruvSpace.s2),
          ],
        if (engine == null &&
            exercise.mode == ExecutionMode.totalReps &&
            pending) ...[
          TextField(
            controller: repsController,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(labelText: l10n.actualRepsLabel),
          ),
          const SizedBox(height: VitruvSpace.s4),
        ],
        if (exercise.mode == ExecutionMode.duration && pending) ...[
          ListenableBuilder(
            listenable: work,
            builder: (context, _) => work.phase == CountdownPhase.idle
                ? VitruvButton(
                    label: l10n.startTimer,
                    variant: VitruvButtonVariant.secondary,
                    leadingIcon: Icons.timer_outlined,
                    fullWidth: true,
                    onPressed: () => work.start(
                      Duration(seconds: exercise.target.durationSeconds ?? 0),
                    ),
                  )
                : CountdownPanel(countdown: work, kind: CountdownKind.work),
          ),
          const SizedBox(height: VitruvSpace.s4),
        ],
        if (engine == null &&
            pending &&
            exercise.mode != ExecutionMode.setsReps)
          VitruvButton(
            label: l10n.completeExercise,
            leadingIcon: Icons.check,
            fullWidth: true,
            onPressed: onComplete,
          ),
        const SizedBox(height: VitruvSpace.s2),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: VitruvSpace.s2,
          runSpacing: VitruvSpace.s2,
          children: [
            if (recorded)
              const SizedBox.shrink()
            else if (pending)
              VitruvButton(
                label: l10n.skipExercise,
                variant: VitruvButtonVariant.ghost,
                onPressed: onSkip,
              )
            else
              VitruvButton(
                label: l10n.reopenExercise,
                variant: VitruvButtonVariant.ghost,
                leadingIcon: Icons.undo,
                onPressed: onReopen,
              ),
            if (hasRest)
              VitruvButton(
                label: l10n.restStart,
                variant: VitruvButtonVariant.ghost,
                leadingIcon: Icons.timer_outlined,
                onPressed: onStartRest,
              ),
          ],
        ),
      ],
    );
  }
}

class _SetRow extends StatelessWidget {
  const _SetRow({
    required this.exercise,
    required this.set,
    required this.onToggle,
  });

  final WorkoutExercise exercise;
  final WorkoutSet set;

  /// Null = not tappable (a later set while an earlier one is still open).
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final detail = setTargetDetail(l10n, exercise, set);
    final actual = set.completed && set.actualReps != null
        ? l10n.setActualReps(set.actualReps!)
        : null;
    final semantics = [
      l10n.setLabel(set.setNumber),
      if (detail.isNotEmpty) detail,
      if (set.completed) l10n.setDoneState,
      ?actual,
      if (onToggle != null)
        set.completed
            ? l10n.setReopenAction(set.setNumber)
            : l10n.setCompleteAction(set.setNumber),
    ].join(', ');
    final row = Row(
      children: [
        Icon(
          set.completed ? Icons.check_circle : Icons.radio_button_unchecked,
          color: set.completed ? c.success : c.fgSubtle,
        ),
        const SizedBox(width: VitruvSpace.s3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                [
                  l10n.setLabel(set.setNumber),
                  if (detail.isNotEmpty) detail,
                ].join(' · '),
                style: theme.textTheme.titleMedium,
              ),
              if (set.completed)
                Text(
                  actual ?? l10n.setDoneState,
                  style: theme.textTheme.bodySmall?.copyWith(color: c.success),
                ),
            ],
          ),
        ),
      ],
    );
    final tone = set.completed
        ? VitruvCardTone.accent
        : VitruvCardTone.standard;
    final toggle = onToggle;
    if (toggle == null) {
      return Semantics(
        container: true,
        label: semantics,
        excludeSemantics: true,
        child: VitruvCard(
          tone: tone,
          padding: VitruvCardPadding.sm,
          child: row,
        ),
      );
    }
    return VitruvCard.tappable(
      onTap: toggle,
      semanticLabel: semantics,
      tone: tone,
      padding: VitruvCardPadding.sm,
      child: row,
    );
  }
}

/// "12 Wdh." / "MAX" (+ duration, weight) of one planned set.
String setTargetDetail(
  AppLocalizations l10n,
  WorkoutExercise exercise,
  WorkoutSet set,
) {
  final format = TrainingFormat(l10n);
  return [
    if (exercise.target.repsMax && set.targetReps == null)
      l10n.rxMax
    else if (set.targetReps != null)
      l10n.rxReps(set.targetReps!),
    if (set.targetDurationSeconds != null)
      format.duration(set.targetDurationSeconds!),
    if (set.targetWeight != null) format.weight(set.targetWeight!),
  ].join(' · ');
}

/// The set to do now: target, reps actually done (−/+ or typed), "Satz N abschließen".
class _ActiveSet extends StatelessWidget {
  const _ActiveSet({
    required this.exercise,
    required this.set,
    required this.controller,
    required this.repsMissing,
    required this.onComplete,
  });

  static const _maxReps = 9999;

  final WorkoutExercise exercise;
  final WorkoutSet set;
  final TextEditingController controller;
  final bool repsMissing;
  final VoidCallback onComplete;

  void _step(int delta) {
    final current = int.tryParse(controller.text.trim()) ?? 0;
    final next = (current + delta).clamp(0, _maxReps);
    controller.text = '$next';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final detail = setTargetDetail(l10n, exercise, set);
    return VitruvCard(
      tone: VitruvCardTone.outline,
      padding: VitruvCardPadding.sm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            [
              l10n.setLabel(set.setNumber),
              if (detail.isNotEmpty) detail,
            ].join(' · '),
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: VitruvSpace.s3),
          Row(
            children: [
              IconButton(
                tooltip: l10n.repsDecrease,
                constraints: const BoxConstraints(
                  minWidth: VitruvSpace.s12,
                  minHeight: VitruvSpace.s12,
                ),
                icon: const Icon(Icons.remove),
                onPressed: () => _step(-1),
              ),
              const SizedBox(width: VitruvSpace.s2),
              Expanded(
                child: TextField(
                  controller: controller,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(4),
                  ],
                  style: theme.textTheme.headlineSmall,
                  decoration: InputDecoration(
                    labelText: l10n.setRepsFor(set.setNumber),
                    errorText: repsMissing ? l10n.setRepsRequired : null,
                  ),
                ),
              ),
              const SizedBox(width: VitruvSpace.s2),
              IconButton(
                tooltip: l10n.repsIncrease,
                constraints: const BoxConstraints(
                  minWidth: VitruvSpace.s12,
                  minHeight: VitruvSpace.s12,
                ),
                icon: const Icon(Icons.add),
                onPressed: () => _step(1),
              ),
            ],
          ),
          const SizedBox(height: VitruvSpace.s3),
          VitruvButton(
            label: l10n.setCompleteAction(set.setNumber),
            semanticLabel: [
              l10n.setLabel(set.setNumber),
              if (detail.isNotEmpty) detail,
              l10n.setCompleteAction(set.setNumber),
            ].join(', '),
            leadingIcon: Icons.check,
            fullWidth: true,
            onPressed: onComplete,
          ),
          if (exercise.target.repsMax) ...[
            const SizedBox(height: VitruvSpace.s1),
            Text(
              l10n.rxMax,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(color: c.fgMuted),
            ),
          ],
        ],
      ),
    );
  }
}

class _Navigation extends StatelessWidget {
  const _Navigation({
    required this.canGoBack,
    required this.last,
    required this.onPrevious,
    required this.onNext,
    required this.onFinish,
    this.nextLabel,
  });

  /// Replaces "Nächste Übung" (Warm-up: "Training fortsetzen").
  final String? nextLabel;
  final bool canGoBack;
  final bool last;
  final VoidCallback onPrevious;
  final VoidCallback onNext;
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final previous = VitruvButton(
      label: l10n.previousExercise,
      variant: VitruvButtonVariant.secondary,
      leadingIcon: Icons.chevron_left,
      fullWidth: true,
      onPressed: canGoBack ? onPrevious : null,
    );
    final forward = last
        ? VitruvButton(
            label: l10n.finishWorkout,
            leadingIcon: Icons.flag_outlined,
            fullWidth: true,
            onPressed: onFinish,
          )
        : VitruvButton(
            label: nextLabel ?? l10n.nextExercise,
            trailingIcon: Icons.chevron_right,
            fullWidth: true,
            onPressed: onNext,
          );
    return LayoutBuilder(
      builder: (context, constraints) {
        // Side by side only when each label fits on one line; otherwise stacked (small phones,
        // large system text) — never letter-by-letter wrapping.
        final scale = MediaQuery.textScalerOf(context).scale(1);
        if (constraints.maxWidth / scale >= 340) {
          return Row(
            children: [
              Expanded(child: previous),
              const SizedBox(width: VitruvSpace.s3),
              Expanded(child: forward),
            ],
          );
        }
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            forward,
            const SizedBox(height: VitruvSpace.s2),
            previous,
          ],
        );
      },
    );
  }
}
