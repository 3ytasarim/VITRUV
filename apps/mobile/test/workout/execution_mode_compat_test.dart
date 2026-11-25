import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/features/workout/workout_models.dart';

/// Sprint 2: the API gained INTERVAL and CHECKLIST. The app must read them (and any later mode)
/// without failing the whole workout.
void main() {
  test('existing modes are unchanged', () {
    expect(ExecutionMode.fromWire('SETS_REPS'), ExecutionMode.setsReps);
    expect(ExecutionMode.fromWire('TOTAL_REPS'), ExecutionMode.totalReps);
    expect(ExecutionMode.fromWire('DURATION'), ExecutionMode.duration);
    expect(ExecutionMode.fromWire('CUSTOM'), ExecutionMode.custom);
  });

  test('Sprint 2 modes are known', () {
    expect(ExecutionMode.fromWire('INTERVAL'), ExecutionMode.interval);
    expect(ExecutionMode.fromWire('CHECKLIST'), ExecutionMode.checklist);
  });

  test('an unknown future mode falls back to tick-off instead of an error', () {
    expect(ExecutionMode.fromWire('SOMETHING_NEW'), ExecutionMode.custom);
  });
}
