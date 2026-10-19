// @vitest-environment happy-dom
import type { AdminExercise, ClientPlan } from '@vitruv/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({ saveClientPlanAction: vi.fn() }));
vi.mock('@/app/admin/training-actions', () => actions);

const { PlanEditor } = await import('./plan-editor');
const { DatedPlan, currentOrNext, groupByPeriod } = await import('@/components/portal/dated-plan');

/** Fictional exercises and plan entries only. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const exercise = (n: number, name: string): AdminExercise => ({
  id: uuid(n),
  name,
  description: null,
  active: true,
  media: null,
  usageCount: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});
const squat = exercise(1, 'Kniebeuge');
const plank = exercise(2, 'Unterarmstütz');
const empty: ClientPlan = { items: [], updatedAt: null };
const planItem = (
  n: number,
  ex: AdminExercise,
  scheduledOn: string,
  note: string | null,
  endsOn: string | null = null,
) => ({
  id: uuid(100 + n),
  scheduledOn,
  endsOn,
  note,
  exercise: { id: ex.id, name: ex.name, description: null, active: true, media: null },
});

afterEach(() => {
  cleanup();
  actions.saveClientPlanAction.mockReset();
});

describe('PlanEditor (dated client plan)', () => {
  it('adds exercises with the default period, edits period + note and saves the whole list', async () => {
    type Sent = {
      exerciseId: string;
      scheduledOn: string;
      endsOn: string | null;
      note: string | null;
    };
    actions.saveClientPlanAction.mockImplementation(async (_clientId: string, items: unknown) => ({
      ok: true,
      data: {
        items: (items as Sent[]).map((item, i) =>
          planItem(
            i,
            item.exerciseId === squat.id ? squat : plank,
            item.scheduledOn,
            item.note,
            item.endsOn,
          ),
        ),
        updatedAt: '2026-10-19T10:00:00.000Z',
      },
    }));
    render(<PlanEditor clientId={uuid(9)} exercises={[squat, plank]} initial={empty} canEdit />);

    const save = screen.getByRole('button', { name: 'Speichern' });
    expect(save).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Von (neue Übungen)'), {
      target: { value: '2026-11-02' },
    });
    fireEvent.change(screen.getByLabelText('Bis (neue Übungen)'), {
      target: { value: '2026-11-08' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kniebeuge zum Plan hinzufügen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unterarmstütz zum Plan hinzufügen' }));
    expect(screen.getByText('Nicht gespeichert')).toBeTruthy();
    expect(screen.getAllByText('7 Tage')).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Notiz für die Kund:in zu Kniebeuge'), {
      target: { value: '3 × 12, langsam' },
    });
    // a single day: "bis" equals "von" → sent as endsOn null
    fireEvent.change(screen.getByLabelText('Von für Unterarmstütz'), {
      target: { value: '2026-11-04' },
    });
    fireEvent.change(screen.getByLabelText('Bis für Unterarmstütz'), {
      target: { value: '2026-11-04' },
    });
    fireEvent.click(save);

    await waitFor(() => expect(actions.saveClientPlanAction).toHaveBeenCalledTimes(1));
    expect(actions.saveClientPlanAction).toHaveBeenCalledWith(uuid(9), [
      {
        exerciseId: squat.id,
        scheduledOn: '2026-11-02',
        endsOn: '2026-11-08',
        note: '3 × 12, langsam',
      },
      { exerciseId: plank.id, scheduledOn: '2026-11-04', endsOn: null, note: null },
    ]);
    await screen.findByText(/Gespeichert – 2 Übungen/);
    expect(screen.queryByText('Nicht gespeichert')).toBeNull();
  });

  it('moving "von" past "bis" moves "bis" along; save stays blocked for an inverted period', () => {
    const initial: ClientPlan = {
      items: [planItem(1, squat, '2026-11-02', null, '2026-11-05')],
      updatedAt: '2026-10-19T10:00:00.000Z',
    };
    render(<PlanEditor clientId={uuid(9)} exercises={[squat]} initial={initial} canEdit />);
    fireEvent.change(screen.getByLabelText('Von für Kniebeuge'), {
      target: { value: '2026-11-09' },
    });
    expect(screen.getByLabelText('Bis für Kniebeuge')).toHaveProperty('value', '2026-11-09');
    fireEvent.change(screen.getByLabelText('Bis für Kniebeuge'), {
      target: { value: '2026-11-01' },
    });
    expect(screen.getByRole('button', { name: 'Speichern' })).toHaveProperty('disabled', true);
  });

  it('removes rows and shows API errors; read-only without edit permission', async () => {
    actions.saveClientPlanAction.mockResolvedValue({
      ok: false,
      message: 'Nicht gefunden oder kein Zugriff.',
      fieldErrors: {},
    });
    const initial: ClientPlan = {
      items: [planItem(1, squat, '2026-11-02', 'Hinweis'), planItem(2, plank, '2026-11-02', null)],
      updatedAt: '2026-10-19T10:00:00.000Z',
    };
    const { unmount } = render(
      <PlanEditor clientId={uuid(9)} exercises={[squat, plank]} initial={initial} canEdit />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unterarmstütz (2) entfernen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Nicht gefunden oder kein Zugriff.',
    );
    unmount();

    render(<PlanEditor clientId={uuid(9)} exercises={[squat]} initial={initial} canEdit={false} />);
    expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull();
    expect(screen.queryByRole('button', { name: /zum Plan hinzufügen/ })).toBeNull();
    expect(screen.getByLabelText('Notiz für die Kund:in zu Kniebeuge')).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('DatedPlan (client portal)', () => {
  const plan: ClientPlan = {
    items: [
      planItem(1, squat, '2026-10-12', 'Letzte Woche', '2026-10-18'),
      planItem(2, squat, '2026-10-19', 'Diese Woche: 3 × 12', '2026-10-25'),
      planItem(3, plank, '2026-10-19', null, '2026-10-25'),
      planItem(4, plank, '2026-10-28', 'Einzeltag'),
    ],
    updatedAt: '2026-10-19T10:00:00.000Z',
  };

  it('groups items by period and finds the running one', () => {
    const periods = groupByPeriod(plan.items);
    expect(periods.map((p) => [p.from, p.to, p.items.length])).toEqual([
      ['2026-10-12', '2026-10-18', 1],
      ['2026-10-19', '2026-10-25', 2],
      ['2026-10-28', '2026-10-28', 1],
    ]);
    expect(currentOrNext(periods, '2026-10-21')).toMatchObject({ now: true });
    expect(currentOrNext(periods, '2026-10-21').periods).toHaveLength(1);
    const next = currentOrNext(periods, '2026-10-26');
    expect(next.now).toBe(false);
    expect(next.periods[0]?.from).toBe('2026-10-28');
  });

  it('shows running and upcoming periods first with the coach notes; past ones collapsed', () => {
    render(<DatedPlan plan={plan} now={new Date('2026-10-21T09:00:00Z')} />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toMatch(/19\. Okt\. – .*25\. Okt\./);
    expect(headings[1]).toMatch(/28\. Oktober/);
    expect(screen.getByText('Aktuell')).toBeTruthy();
    expect(screen.getByText('Diese Woche: 3 × 12')).toBeTruthy();
    expect(screen.getByText('Vergangene Zeiträume (1)')).toBeTruthy();
  });
});
