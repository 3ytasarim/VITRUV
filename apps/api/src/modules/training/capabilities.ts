import type { TrainingCapabilities } from '@vitruv/contracts';
import {
  TRAINING_CAPABILITY_LEVEL,
  usesExtendedTraining,
  type TrainingExecutionType,
} from '@vitruv/shared';
import { AppError } from '../../lib/errors';
import type { TrainingDeps } from './exercises.service';

/**
 * Sprint 3 — server-side gate for the extended training types (INTERVAL = Core, CHECKLIST =
 * Warm-up, Strength MAX). Installed apps older than capability level 2 cannot show them (an old
 * app fails on an unknown session mode). There is no reliable per-device app version in the API,
 * so compatibility is NEVER assumed per client: the operator flag TRAINING_EXTENDED_TYPES (default
 * disabled) decides globally and may only be enabled once the level-2 app is the enforced minimum
 * version. Hiding the UI is not enough — every write path calls assertExtendedTypesAllowed().
 */
export const EXTENDED_TYPES_DISABLED_MESSAGE =
  'Core-Intervalle, Warm-up-Checklisten und MAX sind noch nicht freigegeben (ältere App-Versionen könnten sie nicht anzeigen).';

type PrescriptionKind = { executionType?: TrainingExecutionType | null; repsMax?: boolean | null };

export function trainingCapabilities(
  deps: Pick<TrainingDeps, 'extendedTypes'>,
): TrainingCapabilities {
  return {
    extendedExecutionTypes: deps.extendedTypes === true,
    requiredAppCapabilityLevel: TRAINING_CAPABILITY_LEVEL,
  };
}

/** 409 when the flag is off and any row uses an extended type (path points at the first one). */
export function assertExtendedTypesAllowed(
  deps: Pick<TrainingDeps, 'extendedTypes'>,
  rows: readonly (PrescriptionKind & { path?: string })[],
): void {
  if (deps.extendedTypes === true) return;
  const offending = rows.find((row) => usesExtendedTraining(row));
  if (offending) {
    throw AppError.conflict(EXTENDED_TYPES_DISABLED_MESSAGE, [
      { path: offending.path ?? 'executionType', message: EXTENDED_TYPES_DISABLED_MESSAGE },
    ]);
  }
}
