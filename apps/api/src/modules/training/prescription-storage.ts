import {
  CHECKLIST_PRESCRIPTION_FALLBACK,
  INTERVAL_DEFAULTS,
  type TrainingExecutionType,
} from '@vitruv/shared';

const empty = (value: unknown) => value === null || value === undefined;

/** Prescription fields of an assignment as the coach sends them (pure module, no DB). */
export type PrescriptionInput = {
  sets?: number | null;
  reps?: number | null;
  totalReps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  targetWeight?: number | null;
  weightUnit?: 'KG' | null;
  prescriptionText?: string | null;
  instructionsOverride?: string | null;
  executionType?: TrainingExecutionType | null;
  repsMax?: boolean;
};
/**
 * Sprint 2 storage rules applied to the MERGED prescription (after validation):
 * - INTERVAL: empty rounds/work/rest get the Core default 5 × 40 s / 20 s (stored explicitly so
 *   the session snapshot never depends on code defaults)
 * - CHECKLIST: without any text the neutral compatibility prescription is stored, because the
 *   production check `training_assignments_meaningful` stays unchanged (migration plan §Warm-up)
 * Returns only the fields that must be written in addition to the patch.
 */
export function storagePrescription(
  merged: PrescriptionInput,
): Partial<
  Record<'sets' | 'durationSeconds' | 'restSeconds', number> & { prescriptionText: string }
> {
  if (merged.executionType === 'INTERVAL') {
    return {
      ...(empty(merged.sets) ? { sets: INTERVAL_DEFAULTS.rounds } : {}),
      ...(empty(merged.durationSeconds) ? { durationSeconds: INTERVAL_DEFAULTS.workSeconds } : {}),
      ...(empty(merged.restSeconds) ? { restSeconds: INTERVAL_DEFAULTS.restSeconds } : {}),
    };
  }
  if (merged.executionType === 'CHECKLIST' && !merged.prescriptionText) {
    return { prescriptionText: CHECKLIST_PRESCRIPTION_FALLBACK };
  }
  return {};
}
