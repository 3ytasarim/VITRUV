import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/auth_state.dart';
import '../workout/workout_controller.dart';
import 'training_api.dart';

/// App resume: when the app returns to the foreground (after the coach may have assigned or
/// edited a workout, or the client trained on another device), the ACTIVE plan and the current
/// workout session are read again from the server. Signed out → nothing is requested.
///
/// A failed reload keeps what is on screen (the workout controller keeps a loaded session;
/// the plan view shows its retry state) — no fake "up to date".
class TrainingResumeRefresher extends ConsumerStatefulWidget {
  const TrainingResumeRefresher({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<TrainingResumeRefresher> createState() =>
      _TrainingResumeRefresherState();
}

class _TrainingResumeRefresherState
    extends ConsumerState<TrainingResumeRefresher> {
  late final AppLifecycleListener _listener;

  @override
  void initState() {
    super.initState();
    _listener = AppLifecycleListener(onResume: _refresh);
  }

  void _refresh() {
    if (ref.read(signedInUserIdProvider) == null) return;
    ref.invalidate(activeTrainingProvider);
    ref.read(workoutControllerProvider.notifier).reload();
  }

  @override
  void dispose() {
    _listener.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
