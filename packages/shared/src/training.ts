/**
 * Training Engine vocabulary (Sprint 6, docs/TRAINING-ARCHITECTURE.md).
 * Machine values are stable English enums; German UI labels live in the web app.
 */

/** DRAFT (editing, never visible to the client) → ACTIVE (the client's current plan) → COMPLETED / ARCHIVED. */
export const TRAINING_PROGRAM_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export type TrainingProgramStatus = (typeof TRAINING_PROGRAM_STATUSES)[number];

/** Warm-up · Hauptteil · Abschluss. Extendable later without renaming existing values. */
export const TRAINING_SECTION_TYPES = ['WARMUP', 'MAIN', 'FINISHER'] as const;
export type TrainingSectionType = (typeof TRAINING_SECTION_TYPES)[number];

/** Only kilograms for now — no conversion system. */
export const WEIGHT_UNITS = ['KG'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

/** Upper bounds for prescriptions (sanity limits, not coaching rules). */
export const PRESCRIPTION_LIMITS = {
  sets: 50,
  reps: 1000,
  totalReps: 10_000,
  durationSeconds: 24 * 60 * 60,
  restSeconds: 60 * 60,
  targetWeight: 1000,
} as const;
