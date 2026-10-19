import type {
  TrainingProgramStatus,
  TrainingSectionType,
  WorkoutSessionStatus,
} from '@vitruv/shared';

/** German labels for stable machine values (the enums themselves never change with copy). */
export const SECTION_LABEL: Record<TrainingSectionType, string> = {
  WARMUP: 'Warm-up',
  MAIN: 'Hauptteil',
  FINISHER: 'Abschluss',
};

export const PROGRAM_STATUS_LABEL: Record<TrainingProgramStatus, string> = {
  DRAFT: 'Entwurf',
  ACTIVE: 'Aktiv',
  COMPLETED: 'Abgeschlossen',
  ARCHIVED: 'Archiviert',
};

export const WORKOUT_STATUS_LABEL: Record<WorkoutSessionStatus, string> = {
  IN_PROGRESS: 'Läuft',
  COMPLETED: 'Abgeschlossen',
  ABANDONED: 'Abgebrochen',
};

/** Workout length rounded to whole minutes ("unter 1 Min.", "48 Min.", "1 Std. 5 Min."). */
export function formatWorkoutDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'unter 1 Min.';
  if (minutes < 60) return `${minutes} Min.`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} Std.${rest ? ` ${rest} Min.` : ''}`;
}

export const WEEKDAY_LABEL: Record<number, string> = {
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
  6: 'Samstag',
  7: 'Sonntag',
};

/** 60 → "01:00", 150 → "02:30", 3725 → "62:05". */
export function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Human duration: 45 → "45 Sek.", 300 → "5 Min.", 90 → "1:30 Min.". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} Sek.`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} Min.` : `${minutes}:${String(rest).padStart(2, '0')} Min.`;
}

/**
 * Parses what a coach types for durations/rest: "90" (seconds), "1:30" or "01:30" (mm:ss).
 * Empty → null. Anything else → undefined (invalid).
 */
export function parseClock(input: string): number | null | undefined {
  const value = input.trim();
  if (value === '') return null;
  if (/^\d{1,5}$/.test(value)) return Number(value);
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(value);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

const formatWeight = (value: number) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value);

export interface PrescriptionLike {
  sets: number | null;
  reps: number | null;
  totalReps: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  targetWeight: number | null;
  weightUnit: 'KG' | null;
  prescriptionText: string | null;
}

/** One readable line: "4 × 12 · 22,5 kg · Pause 01:00", "70 Wdh. gesamt", "45 Sek.", "AMRAP". */
export function prescriptionSummary(p: PrescriptionLike): string {
  const parts: string[] = [];
  if (p.sets && p.reps) parts.push(`${p.sets} × ${p.reps}`);
  else if (p.sets) parts.push(`${p.sets} Sätze`);
  else if (p.reps) parts.push(`${p.reps} Wdh.`);
  if (p.totalReps) parts.push(`${p.totalReps} Wdh. gesamt`);
  if (p.durationSeconds) parts.push(formatDuration(p.durationSeconds));
  if (p.prescriptionText) parts.push(p.prescriptionText);
  if (p.targetWeight !== null) parts.push(`${formatWeight(p.targetWeight)} kg`);
  if (p.restSeconds !== null) parts.push(`Pause ${formatClock(p.restSeconds)}`);
  return parts.join(' · ');
}
