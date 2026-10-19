// @vitest-environment happy-dom
import type { AdminExercise, AdminProgram } from '@vitruv/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatClock, parseClock, prescriptionSummary } from '@/lib/training-format';

const actions = vi.hoisted(() => ({
  trainingOpAction: vi.fn(),
  activateProgramAction: vi.fn(),
  retireProgramAction: vi.fn(),
  deleteProgramAction: vi.fn(),
  searchExercisesAction: vi.fn(),
  setExerciseActiveAction: vi.fn(),
  listTrainingMediaAction: vi.fn(async () => ({ ok: true, data: { items: [] } })),
}));
vi.mock('@/app/admin/training-actions', () => actions);
vi.mock('@/app/admin/website-actions', () => ({ listMediaAction: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/kunden/c/training/p',
}));

const { ProgramBuilder } = await import('./program-builder');
const { toAssignmentValues } = await import('./assignment-dialog');
const { ExerciseStatusToggle } = await import('./exercise-status-toggle');

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CLIENT = uuid(900);
const disabled = (element: HTMLElement) => (element as HTMLButtonElement).disabled;
const valueOf = (element: HTMLElement) => (element as HTMLInputElement).value;

const exercise = (n: number, name: string): AdminExercise => ({
  id: uuid(100 + n),
  name,
  description: null,
  active: true,
  media: null,
  usageCount: 0,
  createdAt: '2026-10-16T10:00:00.000Z',
  updatedAt: '2026-10-16T10:00:00.000Z',
});
type Assignment =
  AdminProgram['weeks'][number]['days'][number]['sections'][number]['assignments'][number];
const assignment = (n: number, name: string, extra: Partial<Assignment> = {}): Assignment => ({
  id: uuid(500 + n),
  order: n,
  exercise: { id: uuid(100 + n), name, active: true, hasMedia: false },
  sets: 4,
  reps: 12,
  totalReps: null,
  durationSeconds: null,
  restSeconds: 60,
  targetWeight: null,
  weightUnit: null,
  prescriptionText: null,
  instructionsOverride: null,
  ...extra,
});

function program(overrides: Partial<AdminProgram> = {}): AdminProgram {
  return {
    id: uuid(1),
    clientId: CLIENT,
    title: 'Kraftaufbau',
    description: null,
    status: 'DRAFT',
    startsOn: null,
    endsOn: null,
    activatedAt: null,
    retiredAt: null,
    weekCount: 1,
    assignmentCount: 2,
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:00:00.000Z',
    weeks: [
      {
        id: uuid(10),
        order: 0,
        title: null,
        notes: null,
        days: [
          {
            id: uuid(20),
            order: 0,
            title: 'Oberkörper A',
            notes: null,
            scheduledWeekday: null,
            sections: [
              { id: uuid(30), order: 0, type: 'WARMUP', title: null, assignments: [] },
              {
                id: uuid(31),
                order: 1,
                type: 'MAIN',
                title: null,
                assignments: [
                  assignment(0, 'Klimmzüge'),
                  assignment(1, 'Goblet Squat', { sets: null, reps: null, totalReps: 70 }),
                ],
              },
              { id: uuid(32), order: 2, type: 'FINISHER', title: null, assignments: [] },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

/** Minimal DataTransfer for drag & drop events in happy-dom. */
function dataTransfer() {
  const store = new Map<string, string>();
  return {
    get types() {
      return [...store.keys()];
    },
    setData: (type: string, value: string) => void store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
    effectAllowed: 'all',
    dropEffect: 'none',
  };
}

const renderBuilder = (p = program(), activeProgram: { id: string; title: string } | null = null) =>
  render(
    <ProgramBuilder
      initial={p}
      clientId={CLIENT}
      activeProgram={activeProgram}
      canUpdate
      canActivate
    />,
  );

beforeEach(() => {
  actions.trainingOpAction.mockImplementation(async () => ({ ok: true, data: program() }));
  actions.searchExercisesAction.mockResolvedValue({
    ok: true,
    data: [exercise(5, 'Plank'), exercise(6, 'Liegestütz')],
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('training formatting', () => {
  it('formats rest as mm:ss and parses seconds or mm:ss input', () => {
    expect(formatClock(60)).toBe('01:00');
    expect(formatClock(150)).toBe('02:30');
    expect(parseClock('90')).toBe(90);
    expect(parseClock('1:30')).toBe(90);
    expect(parseClock('01:00')).toBe(60);
    expect(parseClock('')).toBeNull();
    expect(parseClock('1 Minute')).toBeUndefined();
    expect(parseClock('1:75')).toBeUndefined();
  });

  it('summarises all prescription styles readably', () => {
    const base = {
      sets: null,
      reps: null,
      totalReps: null,
      durationSeconds: null,
      restSeconds: null,
      targetWeight: null,
      weightUnit: null,
      prescriptionText: null,
    } as const;
    expect(prescriptionSummary({ ...base, sets: 4, reps: 12, restSeconds: 60 })).toBe(
      '4 × 12 · Pause 01:00',
    );
    expect(prescriptionSummary({ ...base, totalReps: 70, restSeconds: 60 })).toBe(
      '70 Wdh. gesamt · Pause 01:00',
    );
    expect(prescriptionSummary({ ...base, durationSeconds: 45, restSeconds: 30 })).toBe(
      '45 Sek. · Pause 00:30',
    );
    expect(prescriptionSummary({ ...base, durationSeconds: 300 })).toBe('5 Min.');
    expect(prescriptionSummary({ ...base, prescriptionText: 'AMRAP' })).toBe('AMRAP');
    expect(
      prescriptionSummary({ ...base, sets: 3, reps: 10, targetWeight: 22.5, weightUnit: 'KG' }),
    ).toBe('3 × 10 · 22,5 kg');
  });
});

describe('assignment editor validation (shared contract)', () => {
  const empty = {
    sets: '',
    reps: '',
    totalReps: '',
    duration: '',
    rest: '',
    weight: '',
    prescriptionText: '',
    instructionsOverride: '',
  };

  it('requires an exercise and something meaningful', () => {
    const result = toAssignmentValues(null, empty);
    expect(result.values).toBeUndefined();
    expect(result.errors.exercise).toBeTruthy();
    expect(result.errors.prescription).toMatch(/mindestens/i);
  });

  it('converts mm:ss, decimal comma and kg; rejects bad clocks and negative values', () => {
    const ok = toAssignmentValues(uuid(5), {
      ...empty,
      sets: '3',
      reps: '10',
      rest: '1:30',
      weight: '22,5',
    });
    expect(ok.values).toMatchObject({
      sets: 3,
      reps: 10,
      restSeconds: 90,
      targetWeight: 22.5,
      weightUnit: 'KG',
    });
    const duration = toAssignmentValues(uuid(5), { ...empty, duration: '0:45', rest: '30' });
    expect(duration.values).toMatchObject({ durationSeconds: 45, restSeconds: 30, sets: null });
    expect(
      toAssignmentValues(uuid(5), { ...empty, prescriptionText: 'AMRAP' }).values?.prescriptionText,
    ).toBe('AMRAP');
    expect(
      toAssignmentValues(uuid(5), { ...empty, sets: '3', reps: '10', rest: 'eine Minute' }).errors
        .rest,
    ).toBeTruthy();
    expect(
      toAssignmentValues(uuid(5), { ...empty, sets: '0', reps: '10' }).errors.sets,
    ).toBeTruthy();
    expect(
      toAssignmentValues(uuid(5), { ...empty, sets: '3', reps: '10', weight: '-5' }).errors.weight,
    ).toBeTruthy();
  });
});

describe('ProgramBuilder', () => {
  it('renders the hierarchy with German section labels and prescription summaries', () => {
    renderBuilder();
    expect(screen.getByRole('button', { name: 'Woche 1' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByText('Tag 1 · Oberkörper A')).toBeTruthy();
    for (const label of ['Warm-up', 'Hauptteil', 'Abschluss'])
      expect(screen.getByRole('heading', { name: label })).toBeTruthy();
    expect(screen.getByText('4 × 12 · Pause 01:00')).toBeTruthy();
    expect(screen.getByText('70 Wdh. gesamt · Pause 01:00')).toBeTruthy();
  });

  it('reorders with keyboard-accessible, named buttons and sends the complete new order', async () => {
    const user = userEvent.setup();
    renderBuilder();
    expect(disabled(screen.getByRole('button', { name: 'Klimmzüge nach oben verschieben' }))).toBe(
      true,
    );
    screen.getByRole('button', { name: 'Klimmzüge nach unten verschieben' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(actions.trainingOpAction).toHaveBeenCalled());
    expect(actions.trainingOpAction).toHaveBeenCalledWith({
      type: 'reorderAssignments',
      sectionId: uuid(31),
      input: { ids: [uuid(501), uuid(500)] },
    });
    expect(await screen.findByText('Klimmzüge verschoben.')).toBeTruthy();
  });

  it('blocks activation of an incomplete plan and explains what is missing', () => {
    renderBuilder(program({ weeks: [], weekCount: 0, assignmentCount: 0 }));
    expect(disabled(screen.getByRole('button', { name: 'Plan aktivieren' }))).toBe(true);
    expect(
      screen.getByText(
        /Zum Aktivieren fehlt noch: mindestens eine Woche, mindestens ein Trainingstag, mindestens eine Übung/,
      ),
    ).toBeTruthy();
  });

  it('confirms activation and warns that the current active plan will be archived', async () => {
    const user = userEvent.setup();
    actions.activateProgramAction.mockResolvedValue({
      ok: true,
      data: { program: program({ status: 'ACTIVE' }), retiredProgramId: uuid(77) },
    });
    renderBuilder(program(), { id: uuid(77), title: 'Alter Plan' });
    await user.click(screen.getByRole('button', { name: 'Plan aktivieren' }));
    const dialog = await screen.findByRole('dialog', { name: 'Plan aktivieren?' });
    expect(within(dialog).getByText(/„Alter Plan“ wird archiviert/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Plan aktivieren' }));
    await waitFor(() => expect(actions.activateProgramAction).toHaveBeenCalledWith(uuid(1)));
    expect(
      await screen.findByText('Plan aktiviert. Der bisherige Plan wurde archiviert.'),
    ).toBeTruthy();
    expect(screen.getAllByText('Aktiv').length).toBeGreaterThan(0);
  });

  it('adds an assignment via exercise search + prescription and validates before sending', async () => {
    const user = userEvent.setup();
    renderBuilder();
    const main = screen.getByRole('region', { name: /Hauptteil \(Tag 1/ });
    await user.click(within(main).getByRole('button', { name: 'Übung hinzufügen' }));
    const dialog = await screen.findByRole('dialog', { name: /Übung hinzufügen/ });
    await user.click(within(dialog).getByRole('button', { name: 'Übung hinzufügen' }));
    expect(within(dialog).getByRole('alert').textContent).toMatch(/mindestens/i);
    expect(actions.trainingOpAction).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText('Übung suchen'), 'Pla');
    await waitFor(() => expect(actions.searchExercisesAction).toHaveBeenLastCalledWith('Pla'));
    await user.click(await within(dialog).findByRole('button', { name: 'Plank' }));
    expect(within(dialog).getByRole('button', { name: 'Plank' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await user.type(within(dialog).getByLabelText('Dauer'), '0:45');
    await user.type(within(dialog).getByLabelText('Pause'), '30');
    await user.click(within(dialog).getByRole('button', { name: 'Übung hinzufügen' }));
    await waitFor(() => expect(actions.trainingOpAction).toHaveBeenCalled());
    expect(actions.trainingOpAction).toHaveBeenCalledWith({
      type: 'addAssignment',
      sectionId: uuid(31),
      input: expect.objectContaining({
        exerciseId: uuid(105),
        durationSeconds: 45,
        restSeconds: 30,
        sets: null,
      }),
    });
  });

  it('drag & drop: a library exercise dropped onto a section opens the dialog with it selected', async () => {
    const user = userEvent.setup();
    renderBuilder();
    const library = await screen.findByRole('list', { name: 'Übungen zum Ziehen' });
    const item = await within(library).findByText('Plank');
    const transfer = dataTransfer();
    fireEvent.dragStart(item.closest('li')!, { dataTransfer: transfer });
    const main = screen.getByRole('region', { name: /Hauptteil \(Tag 1/ });
    fireEvent.dragOver(main, { dataTransfer: transfer });
    expect(main.getAttribute('data-drop')).toBe('true');
    fireEvent.drop(main, { dataTransfer: transfer });
    const dialog = await screen.findByRole('dialog', { name: /Übung hinzufügen/ });
    expect(within(dialog).getByText(/Plank/)).toBeTruthy();
    await user.type(within(dialog).getByLabelText('Dauer'), '0:45');
    await user.click(within(dialog).getByRole('button', { name: 'Übung hinzufügen' }));
    await waitFor(() =>
      expect(actions.trainingOpAction).toHaveBeenCalledWith({
        type: 'addAssignment',
        sectionId: uuid(31),
        input: expect.objectContaining({ exerciseId: uuid(105), durationSeconds: 45 }),
      }),
    );
  });

  it('drag & drop: exercises are reordered inside their section (complete new order)', async () => {
    renderBuilder();
    const rows = screen.getAllByText(/Klimmzüge|Goblet Squat/).map((el) => el.closest('li')!);
    const [pull, squat] = [
      rows.find((r) => r.textContent?.includes('Klimmzüge'))!,
      rows.find((r) => r.textContent?.includes('Goblet'))!,
    ];
    const transfer = dataTransfer();
    fireEvent.dragStart(squat, { dataTransfer: transfer });
    fireEvent.dragOver(pull, { dataTransfer: transfer });
    fireEvent.drop(pull, { dataTransfer: transfer });
    await waitFor(() =>
      expect(actions.trainingOpAction).toHaveBeenCalledWith({
        type: 'reorderAssignments',
        sectionId: uuid(31),
        input: { ids: [uuid(501), uuid(500)] },
      }),
    );
  });

  it('asks before discarding unsaved assignment edits', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole('button', { name: 'Klimmzüge bearbeiten' }));
    const dialog = await screen.findByRole('dialog', { name: 'Klimmzüge bearbeiten' });
    expect(valueOf(within(dialog).getByLabelText('Sätze'))).toBe('4');
    expect(valueOf(within(dialog).getByLabelText('Pause'))).toBe('01:00');
    await user.clear(within(dialog).getByLabelText('Sätze'));
    await user.type(within(dialog).getByLabelText('Sätze'), '5');
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(within(dialog).getByText('Ungespeicherte Änderungen verwerfen?')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Weiter bearbeiten' }));
    await user.click(within(dialog).getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() =>
      expect(actions.trainingOpAction).toHaveBeenCalledWith({
        type: 'updateAssignment',
        assignmentId: uuid(500),
        input: expect.objectContaining({
          sets: 5,
          reps: 12,
          restSeconds: 60,
          exerciseId: undefined,
        }),
      }),
    );
  });

  it('adds week/day/section and shows the metadata unsaved state', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole('button', { name: 'Woche hinzufügen' }));
    await waitFor(() =>
      expect(actions.trainingOpAction).toHaveBeenCalledWith({
        type: 'addWeek',
        programId: uuid(1),
        input: {},
      }),
    );
    await user.type(screen.getByLabelText('Neuer Trainingstag'), 'Unterkörper');
    await user.click(screen.getByRole('button', { name: 'Tag hinzufügen' }));
    await waitFor(() =>
      expect(actions.trainingOpAction).toHaveBeenCalledWith({
        type: 'addDay',
        weekId: uuid(10),
        input: { title: 'Unterkörper', withDefaultSections: true },
      }),
    );
    expect(screen.getByText('Alle Änderungen gespeichert')).toBeTruthy();
    await user.type(screen.getByLabelText('Titel'), ' Block 1');
    expect(screen.getByText('Ungespeicherte Änderungen')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Plandaten speichern' }));
    await waitFor(() =>
      expect(actions.trainingOpAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'updateProgram',
          input: expect.objectContaining({ title: 'Kraftaufbau Block 1' }),
        }),
      ),
    );
  });

  it('confirms deletions; archived plans are read-only', async () => {
    const user = userEvent.setup();
    const { unmount } = renderBuilder();
    await user.click(screen.getByRole('button', { name: 'Tag 1 · Oberkörper A löschen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tag 1 · Oberkörper A löschen?' });
    await user.click(within(dialog).getByRole('button', { name: 'Tag löschen' }));
    await waitFor(() =>
      expect(actions.trainingOpAction).toHaveBeenCalledWith({ type: 'deleteDay', dayId: uuid(20) }),
    );
    unmount();
    renderBuilder(program({ status: 'ARCHIVED' }));
    expect(screen.getByText('Dieser Plan ist schreibgeschützt.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /verschieben/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Woche hinzufügen' })).toBeNull();
  });
});

describe('ExerciseStatusToggle', () => {
  it('deactivates only after confirmation and explains the effect on existing plans', async () => {
    const user = userEvent.setup();
    actions.setExerciseActiveAction.mockResolvedValue({ ok: true, data: exercise(1, 'Plank') });
    render(<ExerciseStatusToggle exerciseId={uuid(101)} name="Plank" active usageCount={3} />);
    await user.click(screen.getByRole('button', { name: 'Übung deaktivieren' }));
    const dialog = await screen.findByRole('dialog', { name: 'Übung deaktivieren?' });
    expect(
      within(dialog).getByText(/3 bestehenden Verwendungen in Plänen bleiben unverändert/),
    ).toBeTruthy();
    expect(actions.setExerciseActiveAction).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Deaktivieren' }));
    await waitFor(() =>
      expect(actions.setExerciseActiveAction).toHaveBeenCalledWith(uuid(101), false),
    );
  });
});
