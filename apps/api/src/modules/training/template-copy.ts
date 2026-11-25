import type { TrainingExecutionType, TrainingSectionType, WeightUnit } from '@vitruv/shared';
import { storagePrescription } from './prescription-storage';

/**
 * Sprint 2 FOUNDATION — turning a workout template into one client's training day (the coach UI
 * and the endpoint that inserts these rows are Sprint 3).
 *
 * ISOLATION BY COPY: the result is a fresh value tree (no shared objects, no template row ids) that
 * becomes NEW training_days / training_sections / training_exercise_assignments rows of exactly one
 * client program. Only the lineage (template id + version) is kept on the day. Editing the template
 * later bumps its version and never reaches an existing copy; sessions snapshot the copy anyway.
 */

export type TemplateExerciseSource = {
  exerciseId: string;
  sortOrder: number;
  executionType: TrainingExecutionType;
  sets: number | null;
  reps: number | null;
  repsMax: boolean;
  totalReps: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  targetWeight: number | null;
  weightUnit: WeightUnit | null;
  prescriptionText: string | null;
  instructionsOverride: string | null;
  /** Sprint 7: the template row's own video (copied by reference; the file is shared, never duplicated). */
  mediaAssetId?: string | null;
};

export type TemplateSource = {
  id: string;
  version: number;
  title: string;
  sections: {
    type: TrainingSectionType;
    title: string | null;
    sortOrder: number;
    exercises: TemplateExerciseSource[];
  }[];
};

export type DayCopy = {
  day: { title: string; sourceTemplateId: string; sourceTemplateVersion: number };
  sections: {
    type: TrainingSectionType;
    title: string | null;
    sortOrder: number;
    assignments: TemplateExerciseSource[];
  }[];
};

/** Deep, order-normalised copy of a template for one client day (pure; no ids are reused). */
export function copyTemplateForDay(template: TemplateSource, dayTitle?: string): DayCopy {
  return {
    day: {
      title: dayTitle ?? template.title,
      sourceTemplateId: template.id,
      sourceTemplateVersion: template.version,
    },
    sections: [...template.sections]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((section, sectionIndex) => ({
        type: section.type,
        title: section.title,
        sortOrder: sectionIndex,
        assignments: [...section.exercises]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((exercise, index) => {
            const copy = { ...exercise, sortOrder: index };
            // Same storage rules as a coach-entered assignment (interval defaults, warm-up shim).
            return { ...copy, ...storagePrescription(copy) };
          }),
      })),
  };
}
