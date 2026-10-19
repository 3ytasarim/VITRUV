import 'package:flutter_test/flutter_test.dart';
import 'package:vitruv_mobile/features/training/training_models.dart';
import 'package:vitruv_mobile/l10n/app_localizations_de.dart';
import 'package:vitruv_mobile/shared/format/training_format.dart';

void main() {
  final f = TrainingFormat(AppLocalizationsDe());

  test('structured prescriptions → one consistent presentation', () {
    expect(f.target(const Prescription(sets: 4, reps: 12)), '4 × 12');
    expect(f.target(const Prescription(totalReps: 70)), '70 Wdh. gesamt');
    expect(f.target(const Prescription(durationSeconds: 45)), '45 Sek.');
    expect(f.target(const Prescription(durationSeconds: 90)), '1:30 Min.');
    expect(f.target(const Prescription(durationSeconds: 300)), '5 Min.');
    expect(
      f.target(const Prescription(sets: 3, durationSeconds: 30)),
      '3 × 30 Sek.',
    );
    expect(f.target(const Prescription(sets: 3)), '3 Sätze');
    expect(f.target(const Prescription(reps: 12)), '12 Wdh.');
    expect(f.target(const Prescription(prescriptionText: 'AMRAP')), 'AMRAP');
    expect(
      f.target(
        const Prescription(
          sets: 4,
          reps: 12,
          targetWeight: 20,
          prescriptionText: 'langsam',
        ),
      ),
      '4 × 12 · 20 kg · langsam',
    );
  });

  test('custom text is shown verbatim, never parsed into structure', () {
    expect(
      f.target(const Prescription(prescriptionText: '3 × 10 bis Versagen')),
      '3 × 10 bis Versagen',
    );
  });

  test('rest, weight and workout duration', () {
    expect(f.rest(const Prescription(restSeconds: 60)), 'Pause 01:00');
    expect(f.rest(const Prescription(restSeconds: 150)), 'Pause 02:30');
    expect(f.rest(const Prescription(restSeconds: 0)), isNull);
    expect(f.rest(const Prescription()), isNull);
    expect(f.weight(20), '20 kg');
    expect(f.weight(7.5), '7,5 kg');
    expect(f.workoutDuration(2880), '48 Min.');
    expect(f.workoutDuration(20), 'unter 1 Min.');
    expect(f.workoutDuration(3900), '1 Std. 5 Min.');
    expect(clock(0), '00:00');
    expect(clock(-5), '00:00');
    expect(clock(3725), '62:05');
  });

  test('section and weekday labels', () {
    expect(f.section(SectionType.warmup), 'Warm-up');
    expect(f.section(SectionType.main), 'Hauptteil');
    expect(f.section(SectionType.finisher), 'Abschluss');
    expect(f.weekday(1), 'Montag');
    expect(f.weekday(7), 'Sonntag');
  });
}
