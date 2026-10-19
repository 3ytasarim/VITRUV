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
import 'workout_controller.dart';
import 'workout_models.dart';

/// The live workout of the current session.
///
/// - one exercise at a time, explicit "Vorherige/Nächste Übung" buttons (no swipe-only control)
/// - execution controls by mode: sets (tick each set), total reps, timed, custom (mark done)
/// - the rest timer starts after a set/exercise with rest; it never blocks the screen
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
  final Map<String, TextEditingController> _reps = {};
  int? _index;

  @override
  void initState() {
    super.initState();
    final clock = ref.read(clockProvider);
    _rest = Countdown(clock);
    _work = Countdown(clock);
  }

  @override
  void dispose() {
    _rest.dispose();
    _work.dispose();
    for (final c in _reps.values) {
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
    if (seconds > 0) _rest.start(Duration(seconds: seconds));
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
    HapticFeedback.selectionClick();
    final completing = !set.completed;
    _run(() => _controller.toggleSet(exercise.id, set.setNumber, completing));
    if (!completing) return;
    final allDone = exercise.sets.every(
      (s) => s.setNumber == set.setNumber || s.completed,
    );
    _startRest(exercise);
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

  TextEditingController _repsController(WorkoutExercise exercise) =>
      _reps.putIfAbsent(
        exercise.id,
        () => TextEditingController(
          text: '${exercise.actualReps ?? exercise.target.totalReps ?? ''}',
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
          bottom: _Navigation(
            canGoBack: index > 0,
            last: last,
            onPrevious: () => _goTo(index - 1),
            onNext: () => _goTo(index + 1),
            onFinish: () => _finish(session, abandon: false),
          ),
          children: [
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
              builder: (context, _) => _rest.phase == CountdownPhase.idle
                  ? const SizedBox.shrink()
                  : Padding(
                      padding: const EdgeInsets.only(bottom: VitruvSpace.s4),
                      child: CountdownPanel(countdown: _rest),
                    ),
            ),
            if (exercise.media != null) ...[
              ExerciseMedia(media: exercise.media, exerciseName: exercise.name),
              const SizedBox(height: VitruvSpace.s4),
            ],
            _Execution(
              exercise: exercise,
              work: _work,
              repsController: _repsController(exercise),
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
    required this.work,
    required this.repsController,
    required this.onToggleSet,
    required this.onComplete,
    required this.onSkip,
    required this.onReopen,
    required this.onStartRest,
  });

  final WorkoutExercise exercise;
  final Countdown work;
  final TextEditingController repsController;
  final void Function(WorkoutSet set) onToggleSet;
  final VoidCallback onComplete;
  final VoidCallback onSkip;
  final VoidCallback onReopen;
  final VoidCallback onStartRest;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final pending = exercise.status == ExerciseStatus.pending;
    final hasRest = (exercise.target.restSeconds ?? 0) > 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (exercise.mode == ExecutionMode.setsReps)
          for (final set in exercise.sets) ...[
            _SetRow(
              exercise: exercise,
              set: set,
              onToggle: () => onToggleSet(set),
            ),
            const SizedBox(height: VitruvSpace.s2),
          ],
        if (exercise.mode == ExecutionMode.totalReps && pending) ...[
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
        if (pending && exercise.mode != ExecutionMode.setsReps)
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
            if (pending)
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
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final format = TrainingFormat(l10n);
    final theme = Theme.of(context);
    final c = VitruvTheme.of(context);
    final detail = [
      if (set.targetReps != null) l10n.rxReps(set.targetReps!),
      if (set.targetDurationSeconds != null)
        format.duration(set.targetDurationSeconds!),
      if (set.targetWeight != null) format.weight(set.targetWeight!),
    ].join(' · ');
    final label = set.completed
        ? l10n.setReopenAction(set.setNumber)
        : l10n.setCompleteAction(set.setNumber);
    return VitruvCard.tappable(
      onTap: onToggle,
      semanticLabel: [
        l10n.setLabel(set.setNumber),
        if (detail.isNotEmpty) detail,
        if (set.completed) l10n.setDoneState,
        label,
      ].join(', '),
      tone: set.completed ? VitruvCardTone.accent : VitruvCardTone.standard,
      padding: VitruvCardPadding.sm,
      child: Row(
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
                    l10n.setDoneState,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: c.success,
                    ),
                  ),
              ],
            ),
          ),
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
  });

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
            label: l10n.nextExercise,
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
