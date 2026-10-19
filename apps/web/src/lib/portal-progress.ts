import type { ClientTrainingProgram, WorkoutSessionSummary } from '@vitruv/contracts';

/**
 * Pure read-model helpers for the client dashboard — derived only from the API's DTOs (the
 * ACTIVE plan + the own session summaries); nothing is stored or computed twice in the API.
 */
type Week = ClientTrainingProgram['weeks'][number];
type Day = Week['days'][number];

/** Day ids of the plan that have a COMPLETED session. */
export function doneDayIds(program: ClientTrainingProgram, items: WorkoutSessionSummary[]) {
  return new Set(
    items
      .filter((s) => s.status === 'COMPLETED' && s.programId === program.id && s.dayId)
      .map((s) => s.dayId as string),
  );
}

/** The week for today (calendar based, when the plan has a start date), else the first week. */
export function currentWeek(program: ClientTrainingProgram): Week | null {
  const sorted = [...program.weeks].sort((a, b) => a.order - b.order);
  return sorted.find((w) => w.id === program.currentWeekId) ?? sorted[0] ?? null;
}

export const exerciseCount = (day: Day) => day.sections.reduce((n, s) => n + s.exercises.length, 0);

/**
 * Next training of the current week: the day scheduled for today (ISO weekday 1–7) if it is not
 * done yet, otherwise the first open day in order. null when the week is complete or empty.
 */
export function nextDay(week: Week | null, done: Set<string>, isoWeekday: number): Day | null {
  if (!week) return null;
  const open = [...week.days]
    .sort((a, b) => a.order - b.order)
    .filter((d) => !done.has(d.id) && exerciseCount(d) > 0);
  return open.find((d) => d.scheduledWeekday === isoWeekday) ?? open[0] ?? null;
}

const DAY_MS = 86_400_000;
/** Monday 00:00 (UTC) of the week containing `date`. */
function weekStart(date: Date): number {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const iso = (new Date(day).getUTCDay() + 6) % 7;
  return day - iso * DAY_MS;
}

export interface PortalTotals {
  completed: number;
  totalSeconds: number;
  notes: number;
  /** Completed sessions per calendar week, oldest → newest (the last entry is this week). */
  perWeek: number[];
}

export function totals(items: WorkoutSessionSummary[], now: Date, weeks = 8): PortalTotals {
  const thisWeek = weekStart(now);
  const perWeek = Array.from({ length: weeks }, () => 0);
  let completed = 0;
  let totalSeconds = 0;
  let notes = 0;
  for (const s of items) {
    notes += s.notesCount;
    if (s.status !== 'COMPLETED') continue;
    completed += 1;
    totalSeconds += s.durationSeconds ?? 0;
    const ago = Math.round((thisWeek - weekStart(new Date(s.startedAt))) / (7 * DAY_MS));
    if (ago >= 0 && ago < weeks) perWeek[weeks - 1 - ago]! += 1;
  }
  return { completed, totalSeconds, notes, perWeek };
}

/** ISO weekday (1 = Monday … 7 = Sunday). */
export const isoWeekday = (date: Date) => ((date.getDay() + 6) % 7) + 1;
