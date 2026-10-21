// @vitest-environment happy-dom
import type { AdminExercise, ClientPlan, ExerciseCategory } from '@vitruv/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({ saveClientPlanAction: vi.fn() }));
vi.mock('@/app/admin/training-actions', () => actions);

const { PlanEditor } = await import('./plan-editor');
const { DatedPlan, groupByCategory, periodLabel, planStatus } =
  await import('@/components/portal/dated-plan');

/** Fictional exercises, categories and plan entries only. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const warmup: ExerciseCategory = {
  id: uuid(901),
  name: 'Warm-up Test',
  sortOrder: 10,
  exerciseCount: 2,
};
const main: ExerciseCategory = {
  id: uuid(902),
  name: 'Hauptteil Test',
  sortOrder: 20,
  exerciseCount: 1,
};
const exercise = (
  n: number,
  name: string,
  category: ExerciseCategory | null,
  code: string | null,
): AdminExercise => ({
  id: uuid(n),
  name,
  description: null,
  active: true,
  media: null,
  category: category ? { id: category.id, name: category.name } : null,
  code,
  captureType: 'Wdh.',
  standard: '3 Sätze',
  usage: null,
  usageCount: 0,
  planCount: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});
const rotation = exercise(1, 'Schulterrotation', warmup, 'TW-01');
const squat = exercise(2, 'Tiefe Hocke', warmup, 'TW-02');
const pullups = exercise(3, 'Klimmzüge', main, 'TH-01');
const loose = exercise(4, 'Freie Übung', null, null);
const library = [rotation, squat, pullups, loose];
const empty: ClientPlan = { startsOn: null, endsOn: null, items: [], updatedAt: null };
const planItem = (n: number, ex: AdminExercise, note: string | null) => ({
  id: uuid(100 + n),
  note,
  exercise: {
    id: ex.id,
    name: ex.name,
    description: null,
    active: true,
    media: null,
    category: ex.category,
    code: ex.code,
    captureType: ex.captureType,
    standard: ex.standard,
    usage: ex.usage,
  },
});
const editor = (initial: ClientPlan, canEdit = true) =>
  render(
    <PlanEditor
      clientId={uuid(9)}
      exercises={library}
      categories={[warmup, main]}
      initial={initial}
      canEdit={canEdit}
    />,
  );

afterEach(() => {
  cleanup();
  actions.saveClientPlanAction.mockReset();
});

describe('PlanEditor (client training plan)', () => {
  it('categories open with their arrow; a whole category or single exercises are added', async () => {
    type Sent = {
      startsOn: string | null;
      endsOn: string | null;
      items: { exerciseId: string; note: string | null }[];
    };
    actions.saveClientPlanAction.mockImplementation(async (_id: string, plan: Sent) => ({
      ok: true,
      data: {
        startsOn: plan.startsOn,
        endsOn: plan.endsOn,
        items: plan.items.map((item, i) =>
          planItem(i, library.find((e) => e.id === item.exerciseId) ?? loose, item.note),
        ),
        updatedAt: '2026-10-21T10:00:00.000Z',
      },
    }));
    editor(empty);

    // closed by default; the arrow opens the category
    const toggle = screen.getByRole('button', { name: /^Warm-up Test/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(
      screen.queryByRole('button', { name: 'Schulterrotation zum Plan hinzufügen' }),
    ).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Schulterrotation zum Plan hinzufügen' }),
    ).toBeTruthy();

    // whole category → both warm-up exercises; again → nothing new (no duplicates)
    fireEvent.click(
      screen.getByRole('button', { name: 'Ganze Kategorie Warm-up Test hinzufügen' }),
    );
    expect(screen.getByText('Plan (2)')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Ganze Kategorie Warm-up Test hinzufügen' }),
    ).toHaveProperty('disabled', true);

    // single exercise from the other category (opened via search)
    fireEvent.change(screen.getByPlaceholderText('Name oder Code …'), {
      target: { value: 'th-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Klimmzüge zum Plan hinzufügen' }));
    expect(screen.getByText('Plan (3)')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Coach-Notiz zu Klimmzüge'), {
      target: { value: '4 × 6, +10 kg' },
    });
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('Ende'), { target: { value: '2026-12-13' } });
    expect(screen.getByText('Nicht gespeichert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(actions.saveClientPlanAction).toHaveBeenCalledTimes(1));
    expect(actions.saveClientPlanAction).toHaveBeenCalledWith(uuid(9), {
      startsOn: '2026-11-02',
      endsOn: '2026-12-13',
      items: [
        { exerciseId: rotation.id, note: null },
        { exerciseId: squat.id, note: null },
        { exerciseId: pullups.id, note: '4 × 6, +10 kg' },
      ],
    });
    await screen.findByText(/Gespeichert – 3 Übungen/);
    expect(screen.queryByText('Nicht gespeichert')).toBeNull();
  });

  it('plan rows are grouped by category: open/close, remove a group, no duplicates', () => {
    editor({
      ...empty,
      // mixed order on purpose: the warm-up rows end up together in one group
      items: [planItem(1, rotation, null), planItem(2, pullups, null), planItem(3, squat, null)],
    });
    const heads = screen.getAllByRole('button', { name: /Übung(en)?$/ });
    expect(heads.map((b) => b.textContent)).toEqual([
      'Warm-up Test2 Übungen',
      'Hauptteil Test1 Übung',
    ]);
    expect(heads[0]?.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(heads[0] as HTMLElement);
    expect(heads[0]?.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Coach-Notiz zu Schulterrotation')).toBeNull();
    expect(screen.getByLabelText('Coach-Notiz zu Klimmzüge')).toBeTruthy();

    // an exercise that is already planned is not added twice
    fireEvent.change(screen.getByPlaceholderText('Name oder Code …'), {
      target: { value: 'TW-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Schulterrotation zum Plan hinzufügen' }));
    expect(screen.getByText('„Schulterrotation“ ist bereits im Plan.')).toBeTruthy();
    expect(screen.getByText('Plan (3)')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Kategorie Warm-up Test aus dem Plan entfernen' }),
    );
    expect(screen.getByText('Plan (1)')).toBeTruthy();
  });

  it('an end before the start blocks saving; moving the start past the end moves the end', () => {
    editor({
      ...empty,
      startsOn: '2026-11-02',
      endsOn: '2026-11-30',
      items: [planItem(1, squat, null)],
    });
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-12-05' } });
    expect(screen.getByLabelText('Ende')).toHaveProperty('value', '2026-12-05');
    fireEvent.change(screen.getByLabelText('Ende'), { target: { value: '2026-12-01' } });
    expect(screen.getByText('Das Ende liegt vor dem Start.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Speichern' })).toHaveProperty('disabled', true);
  });

  it('removes rows and shows API errors; read-only without edit permission', async () => {
    actions.saveClientPlanAction.mockResolvedValue({
      ok: false,
      message: 'Nicht gefunden oder kein Zugriff.',
      fieldErrors: {},
    });
    const initial: ClientPlan = {
      ...empty,
      items: [planItem(1, rotation, 'Hinweis'), planItem(2, pullups, null)],
      updatedAt: '2026-10-21T10:00:00.000Z',
    };
    const { unmount } = editor(initial);
    fireEvent.click(screen.getByRole('button', { name: 'Klimmzüge (2) entfernen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Nicht gefunden oder kein Zugriff.',
    );
    unmount();

    editor(initial, false);
    expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull();
    expect(screen.queryByRole('button', { name: /hinzufügen/ })).toBeNull();
    expect(screen.getByLabelText('Coach-Notiz zu Schulterrotation')).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('DatedPlan (client portal)', () => {
  const plan: ClientPlan = {
    startsOn: '2026-10-19',
    endsOn: '2026-11-15',
    items: [
      planItem(1, rotation, null),
      planItem(2, pullups, '4 × 6'),
      planItem(3, squat, 'halten 30 s'),
      planItem(4, loose, null),
    ],
    updatedAt: '2026-10-21T10:00:00.000Z',
  };

  it('groups by category in the order the coach placed them', () => {
    expect(groupByCategory(plan.items).map((g) => [g.name, g.items.length])).toEqual([
      ['Warm-up Test', 2],
      ['Hauptteil Test', 1],
      ['Weitere Übungen', 1],
    ]);
    expect(periodLabel('2026-10-19', '2026-11-15')).toBe('19. Oktober 2026 – 15. November 2026');
    expect(periodLabel(null, null)).toBeNull();
    expect(planStatus(plan, '2026-10-01')).toBe('upcoming');
    expect(planStatus(plan, '2026-10-21')).toBe('running');
    expect(planStatus(plan, '2026-12-01')).toBe('finished');
  });

  it('shows the period, the categories and the coach notes', () => {
    render(<DatedPlan plan={plan} now={new Date('2026-10-21T09:00:00Z')} />);
    expect(screen.getByText('19. Oktober 2026 – 15. November 2026')).toBeTruthy();
    expect(screen.getByText('Aktuell')).toBeTruthy();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Warm-up Test', 'Hauptteil Test', 'Weitere Übungen']);
    expect(screen.getByText('4 × 6')).toBeTruthy();
    expect(screen.getAllByText('3 Sätze · Wdh.').length).toBeGreaterThan(0);
  });
});
