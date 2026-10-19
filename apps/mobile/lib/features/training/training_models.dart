import 'package:flutter/foundation.dart';

import '../../core/errors/app_failure.dart';
import '../../core/json/json_reader.dart';

/// Mirrors `clientActiveTrainingResponseSchema` (packages/contracts/src/training.ts).
/// Arrays arrive in display order (the API orders them); the app never re-sorts.

enum SectionType {
  warmup,
  main,
  finisher;

  static SectionType fromWire(String value) => switch (value) {
    'WARMUP' => warmup,
    'MAIN' => main,
    'FINISHER' => finisher,
    _ => throw const UnknownFailure('Unknown section type'),
  };
}

enum MediaKind { image, video }

/// Mirrors `resolvedMediaSchema` — a delivery URL, never a storage key.
@immutable
class ResolvedMedia {
  const ResolvedMedia({
    required this.assetId,
    required this.kind,
    required this.url,
    required this.mimeType,
    required this.width,
    required this.height,
    required this.altText,
  });

  static ResolvedMedia? fromJson(JsonReader? json) {
    if (json == null) return null;
    final kind = json.string('kind');
    if (kind != 'IMAGE' && kind != 'VIDEO') return null;
    return ResolvedMedia(
      assetId: json.string('assetId'),
      kind: kind == 'IMAGE' ? MediaKind.image : MediaKind.video,
      url: json.string('url'),
      mimeType: json.string('mimeType'),
      width: json.intOrNull('width'),
      height: json.intOrNull('height'),
      altText: json.stringOrNull('altText'),
    );
  }

  final String assetId;
  final MediaKind kind;
  final String url;
  final String mimeType;
  final int? width;
  final int? height;
  final String? altText;
}

/// The structured prescription — shared by plan exercises and workout snapshots.
@immutable
class Prescription {
  const Prescription({
    this.sets,
    this.reps,
    this.totalReps,
    this.durationSeconds,
    this.restSeconds,
    this.targetWeight,
    this.weightUnit,
    this.prescriptionText,
  });

  factory Prescription.fromJson(JsonReader json) => Prescription(
    sets: json.intOrNull('sets'),
    reps: json.intOrNull('reps'),
    totalReps: json.intOrNull('totalReps'),
    durationSeconds: json.intOrNull('durationSeconds'),
    restSeconds: json.intOrNull('restSeconds'),
    targetWeight: json.numberOrNull('targetWeight'),
    weightUnit: json.stringOrNull('weightUnit'),
    prescriptionText: json.stringOrNull('prescriptionText'),
  );

  final int? sets;
  final int? reps;
  final int? totalReps;
  final int? durationSeconds;
  final int? restSeconds;
  final double? targetWeight;
  final String? weightUnit;
  final String? prescriptionText;
}

@immutable
class TrainingExercise {
  const TrainingExercise({
    required this.assignmentId,
    required this.name,
    required this.description,
    required this.media,
    required this.prescription,
    required this.instructions,
  });

  factory TrainingExercise.fromJson(JsonReader json) => TrainingExercise(
    assignmentId: json.string('assignmentId'),
    name: json.string('name'),
    description: json.stringOrNull('description'),
    media: ResolvedMedia.fromJson(json.objectOrNull('media')),
    prescription: Prescription.fromJson(json),
    instructions: json.stringOrNull('instructions'),
  );

  final String assignmentId;
  final String name;
  final String? description;
  final ResolvedMedia? media;
  final Prescription prescription;

  /// Plan-specific instructions, else the exercise's default description (resolved by the API).
  final String? instructions;
}

@immutable
class TrainingSection {
  const TrainingSection({
    required this.id,
    required this.type,
    required this.title,
    required this.exercises,
  });

  factory TrainingSection.fromJson(JsonReader json) => TrainingSection(
    id: json.string('id'),
    type: SectionType.fromWire(json.string('type')),
    title: json.stringOrNull('title'),
    exercises: json.list('exercises', TrainingExercise.fromJson),
  );

  final String id;
  final SectionType type;
  final String? title;
  final List<TrainingExercise> exercises;
}

@immutable
class TrainingDay {
  const TrainingDay({
    required this.id,
    required this.order,
    required this.title,
    required this.notes,
    required this.scheduledWeekday,
    required this.sections,
  });

  factory TrainingDay.fromJson(JsonReader json) => TrainingDay(
    id: json.string('id'),
    order: json.integer('order'),
    title: json.string('title'),
    notes: json.stringOrNull('notes'),
    scheduledWeekday: json.intOrNull('scheduledWeekday'),
    sections: json.list('sections', TrainingSection.fromJson),
  );

  final String id;
  final int order;
  final String title;
  final String? notes;

  /// ISO weekday 1 (Mo) … 7 (So) — a planning hint from the coach, or null.
  final int? scheduledWeekday;
  final List<TrainingSection> sections;

  int get exerciseCount =>
      sections.fold(0, (sum, section) => sum + section.exercises.length);
}

@immutable
class TrainingWeek {
  const TrainingWeek({
    required this.id,
    required this.order,
    required this.title,
    required this.notes,
    required this.days,
  });

  factory TrainingWeek.fromJson(JsonReader json) => TrainingWeek(
    id: json.string('id'),
    order: json.integer('order'),
    title: json.stringOrNull('title'),
    notes: json.stringOrNull('notes'),
    days: json.list('days', TrainingDay.fromJson),
  );

  final String id;
  final int order;
  final String? title;
  final String? notes;
  final List<TrainingDay> days;
}

@immutable
class TrainingProgram {
  const TrainingProgram({
    required this.id,
    required this.title,
    required this.description,
    required this.currentWeekId,
    required this.weeks,
  });

  factory TrainingProgram.fromJson(JsonReader json) => TrainingProgram(
    id: json.string('id'),
    title: json.string('title'),
    description: json.stringOrNull('description'),
    currentWeekId: json.stringOrNull('currentWeekId'),
    weeks: json.list('weeks', TrainingWeek.fromJson),
  );

  final String id;
  final String title;
  final String? description;

  /// Only set when the plan has a start date (then it is a real calendar week).
  final String? currentWeekId;
  final List<TrainingWeek> weeks;

  ({TrainingWeek week, TrainingDay day})? findDay(String dayId) {
    for (final week in weeks) {
      for (final day in week.days) {
        if (day.id == dayId) return (week: week, day: day);
      }
    }
    return null;
  }
}
