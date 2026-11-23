// @vitest-environment happy-dom
import type {
  ClientTrainingWeek,
  ClientWorkout,
  WorkoutExercise,
  WorkoutTemplate,
} from '@vitruv/contracts';
import type { TrainingExecutionType } from '@vitruv/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const trainingActions = vi.hoisted(() => ({ searchExercisesAction: vi.fn() }));
const workoutActions = vi.hoisted(() => ({
  createTemplateAction: vi.fn(),
  updateTemplateAction: vi.fn(),
  saveClientWorkoutAction: vi.fn(),
  duplicateTemplateAction: vi.fn(),
  setTemplateArchivedAction: vi.fn(),
  searchTemplatesAction: vi.fn(),
  searchClientsAction: vi.fn(),
  assignTemplateAction: vi.fn(),
}));
vi.mock('@/app/admin/training-actions', () => trainingActions);
vi.mock('@/app/admin/workout-actions', () => workoutActions);
// Sprint 7: the editor's row video field uses the media picker (TRAINING + website libraries).
vi.mock('@/app/admin/website-actions', () => ({ listMediaAction: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/training/workouts',
}));

const { WorkoutEditor } = await import('./workout-editor');
const { TrainingWeek } = await import('./training-week');
const { AssignTemplateDialog } = await import('./assign-template-dialog');

beforeAll(() => {
  // happy-dom has no modal dialog implementation.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Fictional exercises and workouts only. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const exercise = (
  n: number,
  name: string,
  executionType: TrainingExecutionType,
  patch: Partial<WorkoutExercise> = {},
): WorkoutExercise => ({
  id: uuid(300 + n),
  order: n,
  exercise: { id: uuid(400 + n), name, active: true, hasMedia: false },
  sets: null,
  reps: null,
  repsMax: false,
  totalReps: null,
  durationSeconds: null,
  restSeconds: null,
  targetWeight: null,
  weightUnit: null,
  prescriptionText: null,
  instructionsOverride: null,
  executionType,
  ...patch,
});
const sections = (extended: boolean): WorkoutTemplate['sections'] => [
  {
    id: uuid(201),
    order: 0,
    type: 'WARMUP',
    title: null,
    exercises: extended ? [exercise(0, 'Mobilisation Test', 'CHECKLIST')] : [],
  },
  {
    id: uuid(202),
    order: 1,
    type: 'MAIN',
    title: null,
    exercises: [
      exercise(1, 'Bankdrücken Test', 'STRENGTH', { sets: 3, reps: 10, restSeconds: 90 }),
      exercise(2, 'Klimmzüge Test', 'TOTAL_REPS', { totalReps: 60, restSeconds: 60 }),
      ...(extended
        ? [
            exercise(3, 'Plank Test', 'INTERVAL', {
              sets: 5,
              durationSeconds: 40,
              restSeconds: 20,
            }),
          ]
        : []),
    ],
  },
];
const template = (extended = true): WorkoutTemplate => ({
  id: uuid(100),
  title: 'Oberkörper Test',
  category: 'UPPER_BODY',
  description: null,
  version: 3,
  archivedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
  exerciseCount: extended ? 4 : 2,
  executionTypes: extended ? ['CHECKLIST', 'STRENGTH', 'TOTAL_REPS', 'INTERVAL'] : [],
  ownerName: 'Coach Test',
  ownedByMe: true,
  sections: sections(extended),
});
const clientWorkout = (): ClientWorkout => ({
  dayId: uuid(500),
  clientId: uuid(900),
  programId: uuid(600),
  programTitle: 'Trainingsplan',
  programStatus: 'ACTIVE',
  weekId: uuid(700),
  weekOrder: 0,
  title: 'Oberkörper Test',
  notes: null,
  scheduledWeekday: 1,
  date: '2026-11-23',
  version: '2026-11-20T10:00:00.000Z',
  editable: true,
  sourceTemplate: { id: uuid(100), version: 3, title: 'Oberkörper Test' },
  sessions: { inProgress: 0, completed: 1 },
  sections: sections(false),
});
const fieldsOf = (name: string) => {
  const legend = screen.getByText(`Vorgaben für ${name}`);
  return within(legend.closest('fieldset') as HTMLElement);
};

describe('WorkoutEditor — fields per execution type', () => {
  it('shows only the fields that belong to each type', () => {
    render(
      <WorkoutEditor
        target={{ kind: 'template', template: template() }}
        extendedTypes
        cancelHref="/admin/training/workouts"
      />,
    );
    const strength = fieldsOf('Bankdrücken Test');
    expect(strength.getByLabelText('Sätze')).toBeTruthy();
    expect(strength.getByLabelText('Wdh.')).toBeTruthy();
    expect(strength.getByLabelText('Pause (Sek. oder mm:ss)')).toBeTruthy();
    expect(strength.queryByLabelText('Ziel (Wdh. gesamt)')).toBeNull();
    expect(strength.queryByLabelText('Runden')).toBeNull();

    const total = fieldsOf('Klimmzüge Test');
    expect(total.getByLabelText('Ziel (Wdh. gesamt)')).toBeTruthy();
    expect(total.getByLabelText('Pause (Sek. oder mm:ss)')).toBeTruthy();
    expect(total.queryByLabelText('Sätze')).toBeNull();
    expect(total.queryByLabelText('Wdh.')).toBeNull();

    const core = fieldsOf('Plank Test');
    expect(core.getByLabelText('Runden')).toBeTruthy();
    expect(core.getByLabelText('Arbeit (Sek.)')).toBeTruthy();
    expect(core.getByLabelText('Pause (Sek. oder mm:ss)')).toBeTruthy();
    expect(core.queryByLabelText('Sätze')).toBeNull();

    const warmup = fieldsOf('Mobilisation Test');
    expect(warmup.queryByLabelText('Sätze')).toBeNull();
    expect(warmup.queryByLabelText('Wdh.')).toBeNull();
    expect(warmup.queryByLabelText('Pause (Sek. oder mm:ss)')).toBeNull();
    expect(warmup.queryByLabelText('Runden')).toBeNull();
    expect(warmup.getByLabelText('Hinweis (optional)')).toBeTruthy();
  });

  it('offers the new types only as "noch nicht freigegeben" while the server flag is off', () => {
    render(
      <WorkoutEditor
        target={{ kind: 'template', template: template(false) }}
        extendedTypes={false}
        cancelHref="/admin/training/workouts"
      />,
    );
    const strength = fieldsOf('Bankdrücken Test');
    const select = strength.getByLabelText('Art') as HTMLSelectElement;
    const options = [...select.options];
    const core = options.find((o) => o.value === 'INTERVAL');
    const checklist = options.find((o) => o.value === 'CHECKLIST');
    expect(core?.disabled).toBe(true);
    expect(core?.textContent).toContain('noch nicht freigegeben');
    expect(checklist?.disabled).toBe(true);
    expect(options.find((o) => o.value === 'TOTAL_REPS')?.disabled).toBe(false);
    expect((strength.getByLabelText('MAX') as HTMLInputElement).disabled).toBe(true);
  });

  it('separates "Vorlage bearbeiten" from "Für Teilnehmer bearbeiten"', () => {
    const { unmount } = render(
      <WorkoutEditor
        target={{ kind: 'template', template: template(false) }}
        extendedTypes={false}
        cancelHref="/admin/training/workouts"
      />,
    );
    expect(screen.getByRole('note').textContent).toContain('Vorlage bearbeiten');
    expect(screen.queryByText(/Für Teilnehmer bearbeiten/)).toBeNull();
    unmount();

    render(
      <WorkoutEditor
        target={{ kind: 'client', workout: clientWorkout(), clientName: 'Mia Beispiel' }}
        extendedTypes={false}
        cancelHref="/admin/kunden/x/training"
      />,
    );
    const notes = screen.getAllByRole('note').map((n) => n.textContent ?? '');
    expect(notes.some((t) => t.includes('Für Teilnehmer bearbeiten: Mia Beispiel'))).toBe(true);
    expect(notes.some((t) => t.includes('Vorlage bearbeiten'))).toBe(false);
  });

  it('saves a client copy only through the client action, with the version token', async () => {
    workoutActions.saveClientWorkoutAction.mockResolvedValue({
      ok: true,
      data: clientWorkout(),
    });
    render(
      <WorkoutEditor
        target={{ kind: 'client', workout: clientWorkout(), clientName: 'Mia Beispiel' }}
        extendedTypes={false}
        cancelHref="/admin/kunden/x/training"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(workoutActions.saveClientWorkoutAction).toHaveBeenCalledTimes(1));
    const [dayId, clientId, body] = workoutActions.saveClientWorkoutAction.mock.calls[0] as [
      string,
      string,
      { expectedVersion: string; sections: { exercises: { id?: string }[] }[] },
    ];
    expect(dayId).toBe(uuid(500));
    expect(clientId).toBe(uuid(900));
    expect(body.expectedVersion).toBe('2026-11-20T10:00:00.000Z');
    // Existing rows keep their ids (updated in place, the session snapshots stay untouched).
    expect(body.sections[1]?.exercises.map((e) => e.id)).toEqual([uuid(301), uuid(302)]);
    expect(workoutActions.updateTemplateAction).not.toHaveBeenCalled();
    expect(workoutActions.createTemplateAction).not.toHaveBeenCalled();
  });

  it('Sprint 7.5 regression: an existing TEMPLATE saves through updateTemplateAction with its version', async () => {
    // Before the fix the strict create schema rejected `expectedVersion` → "Bitte prüfe die
    // markierten Felder." with no marked field, and the action was never called (found by E2E).
    workoutActions.updateTemplateAction.mockResolvedValue({
      ok: true,
      data: { ...template(false), version: 4 },
    });
    render(
      <WorkoutEditor
        target={{ kind: 'template', template: template(false) }}
        extendedTypes={false}
        cancelHref="/admin/training/workouts"
      />,
    );
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Oberkörper Test v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(workoutActions.updateTemplateAction).toHaveBeenCalledTimes(1));
    const [id, body] = workoutActions.updateTemplateAction.mock.calls[0] as [
      string,
      { expectedVersion: number; title: string },
    ];
    expect(id).toBe(uuid(100));
    expect(body.expectedVersion).toBe(3);
    expect(body.title).toBe('Oberkörper Test v2');
    expect(screen.queryByText('Bitte prüfe die markierten Felder.')).toBeNull();
    expect(await screen.findByText(/Vorlage gespeichert \(Version 4\)/)).toBeTruthy();
    expect(workoutActions.createTemplateAction).not.toHaveBeenCalled();
  });

  it('Sprint 7.5: a template saved meanwhile elsewhere answers 409 with "Neu laden"', async () => {
    workoutActions.updateTemplateAction.mockResolvedValue({
      ok: false,
      status: 409,
      message: 'Die Vorlage wurde inzwischen geändert. Bitte neu laden.',
      fieldErrors: { expectedVersion: 'Die Vorlage wurde inzwischen geändert.' },
    });
    render(
      <WorkoutEditor
        target={{ kind: 'template', template: template(false) }}
        extendedTypes={false}
        cancelHref="/admin/training/workouts"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('button', { name: 'Neu laden' })).toBeTruthy();
  });

  it('Sprint 7.5: a network failure in the exercise search shows an error and "Erneut versuchen" works', async () => {
    trainingActions.searchExercisesAction
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({
        ok: true,
        data: [{ id: uuid(450), name: 'Ruderzug', code: 'RZ-1', active: true }],
      });
    render(
      <WorkoutEditor
        target={{ kind: 'template', template: template(false) }}
        extendedTypes={false}
        cancelHref="/admin/training/workouts"
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Übung hinzufügen' })[0] as HTMLElement);
    expect(await screen.findByText(/Keine Verbindung zum Server/)).toBeTruthy();
    expect(screen.queryByText('Suche …')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('button', { name: /Ruderzug/ })).toBeTruthy();
    expect(screen.queryByText(/Keine Verbindung zum Server/)).toBeNull();
  });

  it('Sprint 7.5: a network failure while saving keeps the form and shows an error', async () => {
    workoutActions.updateTemplateAction.mockRejectedValue(new TypeError('Failed to fetch'));
    render(
      <WorkoutEditor
        target={{ kind: 'template', template: template(false) }}
        extendedTypes={false}
        cancelHref="/admin/training/workouts"
      />,
    );
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nicht verlieren' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText(/Keine Verbindung zum Server/)).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Nicht verlieren');
  });

  it('shows "Neu laden" when someone else changed the plan meanwhile (409)', async () => {
    workoutActions.saveClientWorkoutAction.mockResolvedValue({
      ok: false,
      status: 409,
      message: 'Der Plan wurde inzwischen geändert. Bitte neu laden.',
      fieldErrors: { expectedVersion: 'Der Plan wurde inzwischen geändert.' },
    });
    render(
      <WorkoutEditor
        target={{ kind: 'client', workout: clientWorkout(), clientName: 'Mia Beispiel' }}
        extendedTypes={false}
        cancelHref="/admin/kunden/x/training"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('button', { name: 'Neu laden' })).toBeTruthy();
  });

  it('blocks an invalid template on the client with the shared contract rules', async () => {
    render(
      <WorkoutEditor
        target={{ kind: 'template-new' }}
        extendedTypes={false}
        cancelHref="/admin/training/workouts"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(workoutActions.createTemplateAction).not.toHaveBeenCalled();
  });
});

const week = (): ClientTrainingWeek => ({
  clientId: uuid(900),
  weekStart: '2026-11-23',
  weekEnd: '2026-11-29',
  program: {
    id: uuid(600),
    title: 'Trainingsplan',
    status: 'DRAFT',
    startsOn: '2026-11-23',
    endsOn: null,
  },
  weekIndex: 0,
  weekId: uuid(700),
  days: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-11-${23 + i}`,
    weekday: i + 1,
    workouts:
      i === 0
        ? [
            {
              dayId: uuid(500),
              title: 'Oberkörper Test',
              scheduledWeekday: 1,
              sourceTemplateId: uuid(100),
              sourceTemplateVersion: 3,
              exerciseCount: 2,
              executionTypes: ['STRENGTH', 'TOTAL_REPS'],
              workoutStatus: 'COMPLETED',
            },
          ]
        : [],
  })),
  unscheduled: [],
  legacyPlan: { itemCount: 4, startsOn: null, endsOn: null, updatedAt: null },
});

describe('TrainingWeek', () => {
  it('renders the canonical workouts per weekday with edit links and add buttons', () => {
    render(
      <TrainingWeek
        week={week()}
        clientId={uuid(900)}
        clientName="Mia Beispiel"
        today="2026-11-23"
        canAssign
      />,
    );
    expect(screen.getByRole('heading', { name: 'Trainingswoche' })).toBeTruthy();
    expect(screen.getByText('Oberkörper Test')).toBeTruthy();
    expect(screen.getByText('Aus Bibliothek')).toBeTruthy();
    const edit = screen.getByRole('link', { name: 'Workout bearbeiten' });
    expect(edit.getAttribute('href')).toBe(
      `/admin/kunden/${uuid(900)}/training/workout/${uuid(500)}`,
    );
    expect(screen.getAllByText('Kein Workout')).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: /^Workout hinzufügen am/ })).toHaveLength(7);
    // A draft plan is announced honestly: not visible for the client yet.
    expect(screen.getByText(/noch nicht sichtbar/)).toBeTruthy();
    // No fake "start workout" action in the coach view.
    expect(screen.queryByRole('button', { name: /starten/i })).toBeNull();
  });

  it('hides the add actions without assign permission', () => {
    render(
      <TrainingWeek
        week={week()}
        clientId={uuid(900)}
        clientName="Mia Beispiel"
        today="2026-11-23"
        canAssign={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /Workout hinzufügen/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Workout bearbeiten' })).toBeTruthy();
  });

  it('explains an empty week without a plan', () => {
    render(
      <TrainingWeek
        week={{
          ...week(),
          program: null,
          weekIndex: null,
          weekId: null,
          days: week().days.map((d) => ({ ...d, workouts: [] })),
        }}
        clientId={uuid(900)}
        clientName="Mia Beispiel"
        today="2026-11-23"
        canAssign
      />,
    );
    expect(screen.getByText(/Noch kein Trainingsplan/)).toBeTruthy();
    expect(screen.getAllByText('Kein Workout')).toHaveLength(7);
  });
});

describe('AssignTemplateDialog — Sprint 7.5 network failure', () => {
  it('a lost request becomes "Erneut versuchen"; the retry reuses the SAME requestId', async () => {
    const response = {
      created: true,
      clientId: uuid(900),
      programId: uuid(600),
      programTitle: 'Trainingsplan',
      programStatus: 'ACTIVE',
      programCreated: false,
      weekId: uuid(700),
      dayId: uuid(500),
      title: 'Oberkörper Test',
      date: '2026-11-23',
      scheduledWeekday: 1,
      sourceTemplateId: uuid(100),
      sourceTemplateVersion: 3,
    };
    workoutActions.assignTemplateAction
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ ok: true, data: response });
    render(
      <AssignTemplateDialog
        open
        template={{ id: uuid(100), title: 'Oberkörper Test' }}
        fixedClient={{ id: uuid(900), name: 'Mia Beispiel' }}
        defaultDate="2026-11-23"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Zuweisen' }));
    expect(await screen.findByText(/Keine Verbindung zum Server/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await waitFor(() => expect(workoutActions.assignTemplateAction).toHaveBeenCalledTimes(2));
    const calls = workoutActions.assignTemplateAction.mock.calls as [
      string,
      { requestId: string },
    ][];
    expect(calls[1]?.[1].requestId).toBe(calls[0]?.[1].requestId);
    expect(await screen.findByText(/zugewiesen für/)).toBeTruthy();
  });
});
