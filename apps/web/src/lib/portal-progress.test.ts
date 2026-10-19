import { describe, expect, it } from 'vitest';
import { greetingFor } from '@/components/portal/greeting';
import { isoWeekday, totals } from './portal-progress';

const summary = (startedAt: string, status: string, extra = {}) =>
  ({
    id: startedAt,
    status,
    programTitle: 'P',
    dayTitle: 'D',
    weekOrder: 0,
    dayOrder: 0,
    startedAt,
    completedAt: null,
    abandonedAt: null,
    durationSeconds: 600,
    programId: '00000000-0000-4000-8000-000000000001',
    dayId: null,
    exercisesTotal: 1,
    exercisesCompleted: 1,
    exercisesSkipped: 0,
    notesCount: 1,
    ...extra,
  }) as never;

describe('client dashboard helpers', () => {
  it('greets by local hour', () => {
    expect(greetingFor(6)).toBe('Guten Morgen');
    expect(greetingFor(10)).toBe('Guten Morgen');
    expect(greetingFor(11)).toBe('Guten Tag');
    expect(greetingFor(17)).toBe('Guten Tag');
    expect(greetingFor(18)).toBe('Guten Abend');
    expect(greetingFor(2)).toBe('Guten Abend');
  });

  it('totals count completed sessions per calendar week; notes from every session', () => {
    const now = new Date('2026-10-18T12:00:00Z'); // Sunday
    const t = totals(
      [
        summary('2026-10-12T08:00:00Z', 'COMPLETED'), // Monday this week
        summary('2026-10-11T08:00:00Z', 'COMPLETED'), // Sunday last week
        summary('2026-10-10T08:00:00Z', 'ABANDONED'),
      ],
      now,
      4,
    );
    expect(t.completed).toBe(2);
    expect(t.totalSeconds).toBe(1200);
    expect(t.notes).toBe(3);
    expect(t.perWeek).toEqual([0, 0, 1, 1]);
  });

  it('ISO weekday', () => {
    expect(isoWeekday(new Date(2026, 9, 19))).toBe(1); // Monday
    expect(isoWeekday(new Date(2026, 9, 18))).toBe(7); // Sunday
  });
});
