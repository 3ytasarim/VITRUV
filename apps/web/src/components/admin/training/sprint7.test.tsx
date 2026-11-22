// @vitest-environment happy-dom
import type {
  AdminMediaAsset,
  ClientWorkout,
  ExerciseComparison,
  ExerciseProgress,
  ExerciseResultDto,
  WorkoutExercise,
  WorkoutSessionSummary,
} from '@vitruv/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const trainingActions = vi.hoisted(() => ({
  searchExercisesAction: vi.fn(),
  listTrainingMediaAction: vi.fn(),
  deleteTrainingMediaAction: vi.fn(),
}));
const workoutActions = vi.hoisted(() => ({
  createTemplateAction: vi.fn(),
  updateTemplateAction: vi.fn(),
  saveClientWorkoutAction: vi.fn(),
}));
vi.mock('@/app/admin/training-actions', () => trainingActions);
vi.mock('@/app/admin/workout-actions', () => workoutActions);
vi.mock('@/app/admin/website-actions', () => ({ listMediaAction: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/kunden/x/training',
}));

const { WorkoutEditor } = await import('./workout-editor');
const { RowMediaField, iphoneIncompatible } = await import('./row-media-field');
const { TrainingProgress, ExerciseProgressChart } = await import('./training-progress');
const { WorkoutHistory, sessionTotals } = await import('./workout-history');
const { chartPoints, comparisonLines, progressSummary, resultLines, signed } =
  await import('@/lib/workout-results');

beforeAll(() => {
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

/** Fictional data only. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const video = (n: number, mimeType = 'video/mp4') => ({
  assetId: uuid(800 + n),
  kind: 'VIDEO' as const,
  url: `https://media.vitruv.invalid/public/training/${n}.mp4`,
  fileName: `technik-${n}.mp4`,
  mimeType,
});
const row = (n: number, name: string, patch: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  id: uuid(300 + n),
  order: n,
  exercise: { id: uuid(400 + n), name, active: true, hasMedia: false },
  sets: 3,
  reps: 10,
  repsMax: false,
  totalReps: null,
  durationSeconds: null,
  restSeconds: 90,
  targetWeight: null,
  weightUnit: null,
  prescriptionText: null,
  instructionsOverride: null,
  executionType: 'STRENGTH',
  ...patch,
});
const clientWorkout = (exercises: WorkoutExercise[]): ClientWorkout => ({
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
  sections: [{ id: uuid(201), order: 0, type: 'MAIN', title: null, exercises }],
});
type SavedBody = { sections: { exercises: { id?: string; mediaAssetId?: string | null }[] }[] };
const savedRows = () =>
  (workoutActions.saveClientWorkoutAction.mock.calls[0] as [string, string, SavedBody])[2]
    .sections[0]!.exercises;
const editor = (exercises: WorkoutExercise[]) =>
  render(
    <WorkoutEditor
      target={{
        kind: 'client',
        workout: clientWorkout(exercises),
        clientName: 'Mia Beispiel',
      }}
      extendedTypes
      cancelHref="/admin/kunden/x/training"
    />,
  );

// ------------------------------------------------------------------ coach video per plan row
describe('Sprint 7 — video per plan row (WorkoutEditor)', () => {
  it('keeps an assigned video and sends its asset id; rows without one send null', async () => {
    workoutActions.saveClientWorkoutAction.mockResolvedValue({ ok: true, data: {} });
    editor([row(1, 'Bankdrücken Test', { media: video(1) }), row(2, 'Rudern Test')]);
    expect(screen.getByRole('link', { name: 'technik-1.mp4' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(workoutActions.saveClientWorkoutAction).toHaveBeenCalledTimes(1));
    expect(savedRows().map((e) => e.mediaAssetId)).toEqual([uuid(801), null]);
  });

  it('"Video entfernen" only unlinks (null) — no delete action is called', async () => {
    workoutActions.saveClientWorkoutAction.mockResolvedValue({ ok: true, data: {} });
    editor([row(1, 'Bankdrücken Test', { media: video(1) })]);
    fireEvent.click(screen.getByRole('button', { name: 'Video entfernen: Bankdrücken Test' }));
    expect(screen.queryByRole('link', { name: 'technik-1.mp4' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(workoutActions.saveClientWorkoutAction).toHaveBeenCalledTimes(1));
    expect(savedRows()[0]?.mediaAssetId).toBeNull();
    expect(trainingActions.deleteTrainingMediaAction).not.toHaveBeenCalled();
  });

  it('picks a video from the TRAINING library for one row only', async () => {
    const asset: AdminMediaAsset = {
      id: uuid(805),
      kind: 'VIDEO',
      fileName: 'rudern-technik.mp4',
      mimeType: 'video/mp4',
      url: 'https://media.vitruv.invalid/public/training/805.mp4',
      usageCount: 0,
      focalPoint: null,
    } as AdminMediaAsset;
    trainingActions.listTrainingMediaAction.mockResolvedValue({
      ok: true,
      data: { items: [asset] },
    });
    workoutActions.saveClientWorkoutAction.mockResolvedValue({ ok: true, data: {} });
    editor([row(1, 'Bankdrücken Test'), row(2, 'Rudern Test')]);
    fireEvent.click(screen.getByRole('button', { name: 'Video wählen: Rudern Test' }));
    // the tile itself (the library also offers a separate delete button per file)
    const tile = await screen.findByRole('button', { name: /^rudern-technik\.mp4/ });
    fireEvent.click(tile);
    expect(screen.getByRole('link', { name: 'rudern-technik.mp4' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(workoutActions.saveClientWorkoutAction).toHaveBeenCalledTimes(1));
    expect(savedRows().map((e) => e.mediaAssetId)).toEqual([null, uuid(805)]);
    expect(trainingActions.listTrainingMediaAction).toHaveBeenCalled();
  });

  it('warns that WebM does not play on an iPhone; MP4 has no warning', () => {
    expect(iphoneIncompatible(video(1))).toBe(false);
    expect(iphoneIncompatible(video(1, 'video/webm'))).toBe(true);
    expect(iphoneIncompatible({ kind: 'IMAGE', mimeType: 'image/webp' })).toBe(false);
    // older API without mimeType: no false alarm
    expect(iphoneIncompatible({ kind: 'VIDEO' })).toBe(false);
    render(
      <RowMediaField
        exerciseName="Plank Test"
        media={video(2, 'video/webm')}
        libraryHasMedia={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('note').textContent).toContain('iPhone');
  });

  it('without a row video it says the library medium is used (or none)', () => {
    const { rerender } = render(
      <RowMediaField exerciseName="Plank" media={null} libraryHasMedia onChange={vi.fn()} />,
    );
    expect(screen.getByText(/Medium aus der Übungsbibliothek/)).toBeTruthy();
    rerender(
      <RowMediaField
        exerciseName="Plank"
        media={null}
        libraryHasMedia={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Kein Video zugewiesen.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Video entfernen/ })).toBeNull();
  });

  it('read-only rows show the video but offer no change', () => {
    render(
      <RowMediaField
        exerciseName="Plank"
        media={video(3)}
        libraryHasMedia={false}
        disabled
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: 'technik-3.mp4' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

// ---------------------------------------------------------------------- result formatting
const result = (patch: Partial<ExerciseResultDto>): ExerciseResultDto => ({
  kind: 'REPS',
  totalReps: null,
  setCount: 0,
  roundsCompleted: null,
  totalTarget: null,
  interval: null,
  sets: [],
  ...patch,
});
const set = (n: number, actual: number | null, target: number | null = 10) => ({
  setNumber: n,
  targetReps: target,
  actualReps: actual,
  completed: actual !== null,
});

describe('Sprint 7 — recorded results (coach view)', () => {
  it('Strength: per set "x von y Wdh." + total; open sets are "nicht erledigt", never 0', () => {
    expect(
      resultLines(
        result({ totalReps: 18, setCount: 2, sets: [set(1, 10), set(2, 8), set(3, null)] }),
        false,
      ),
    ).toEqual([
      'Satz 1: 10 von 10 Wdh.',
      'Satz 2: 8 von 10 Wdh.',
      'Satz 3: nicht erledigt',
      'Gesamt: 18 Wiederholungen',
    ]);
  });

  it('MAX: "Satz 1: 17 Wdh. (MAX)"', () => {
    expect(
      resultLines(result({ totalReps: 17, setCount: 1, sets: [set(1, 17, null)] }), true),
    ).toEqual(['Satz 1: 17 Wdh. (MAX)', 'Gesamt: 17 Wiederholungen']);
  });

  it('Total reps: goal, done, sets needed and every set', () => {
    expect(
      resultLines(
        result({
          kind: 'TOTAL_REPS',
          totalTarget: 60,
          totalReps: 65,
          setCount: 2,
          sets: [set(1, 40, null), set(2, 25, null)],
        }),
        false,
      ),
    ).toEqual([
      'Gesamtziel: 60 Wdh.',
      'Geschafft: 65 Wdh.',
      'Benötigte Sätze: 2',
      'Satz 1: 40 Wdh.',
      'Satz 2: 25 Wdh.',
    ]);
  });

  it('Core: configuration and rounds; Warm-up (NONE): no lines', () => {
    expect(
      resultLines(
        result({
          kind: 'ROUNDS',
          roundsCompleted: 4,
          interval: { rounds: 5, workSeconds: 40, restSeconds: 20 },
        }),
        false,
      ),
    ).toEqual(['5 Runden · 40 Sek. Belastung · 20 Sek. Pause', 'Runden geschafft: 4 von 5']);
    expect(resultLines(result({ kind: 'NONE' }), false)).toEqual([]);
  });

  it('nothing recorded yet → no "0 Wiederholungen"', () => {
    expect(resultLines(result({ sets: [set(1, null)] }), false)).toEqual([
      'Satz 1: nicht erledigt',
    ]);
    expect(resultLines(result({ kind: 'TOTAL_REPS', totalTarget: 60 }), false)).toEqual([
      'Gesamtziel: 60 Wdh.',
    ]);
  });
});

const entry = (sessionId: string, date: string, r: ExerciseResultDto) => ({
  sessionId,
  date,
  status: 'COMPLETED' as const,
  result: r,
});
const comparison = (patch: Partial<ExerciseComparison>): ExerciseComparison => ({
  sessionExerciseId: uuid(1),
  exerciseId: uuid(2),
  name: 'Bankdrücken Test',
  executionMode: 'SETS_REPS',
  repsMax: false,
  current: entry(
    uuid(11),
    '2026-11-15T08:00:00.000Z',
    result({ totalReps: 18, sets: [set(1, 10), set(2, 8)] }),
  ),
  previous: null,
  difference: null,
  setDifferences: [],
  configChanged: false,
  ...patch,
});

describe('Sprint 7 — comparison with the previous workout', () => {
  it('per set, total and difference (signed)', () => {
    expect(
      comparisonLines(
        comparison({
          previous: entry(
            uuid(10),
            '2026-11-08T08:00:00.000Z',
            result({ totalReps: 15, sets: [set(1, 8), set(2, 7)] }),
          ),
          difference: 3,
          setDifferences: [
            { setNumber: 1, previous: 8, current: 10, difference: 2 },
            { setNumber: 2, previous: 7, current: 8, difference: 1 },
          ],
        }),
      ),
    ).toEqual([
      'Satz 1: 8 → 10 (+2)',
      'Satz 2: 7 → 8 (+1)',
      'Gesamt: 15 → 18 Wdh.',
      'Differenz: +3',
    ]);
  });

  it('no earlier comparable workout → "Noch keine Vergleichsdaten"; Warm-up → none', () => {
    expect(comparisonLines(comparison({}))).toEqual(['Noch keine Vergleichsdaten']);
    expect(
      comparisonLines(
        comparison({
          executionMode: 'CHECKLIST',
          current: entry(uuid(11), '2026-11-15T08:00:00.000Z', result({ kind: 'NONE' })),
        }),
      ),
    ).toBeNull();
  });

  it('an unrecorded set says "nicht erfasst"; a worse result is negative', () => {
    const lines = comparisonLines(
      comparison({
        previous: entry(
          uuid(10),
          '2026-11-08T08:00:00.000Z',
          result({ totalReps: 20, sets: [set(1, 10), set(2, 10)] }),
        ),
        difference: -10,
        setDifferences: [
          { setNumber: 1, previous: 10, current: 10, difference: 0 },
          { setNumber: 2, previous: 10, current: null, difference: null },
        ],
      }),
    );
    expect(lines).toContain('Satz 1: 10 → 10 (±0)');
    expect(lines).toContain('Satz 2: 10 → nicht erfasst');
    expect(lines).toContain('Differenz: −10');
    expect(signed(-2)).toBe('−2');
  });

  it('Core with other round settings is flagged', () => {
    const lines = comparisonLines(
      comparison({
        executionMode: 'INTERVAL',
        current: entry(
          uuid(11),
          '2026-11-15T08:00:00.000Z',
          result({ kind: 'ROUNDS', roundsCompleted: 5 }),
        ),
        previous: entry(
          uuid(10),
          '2026-11-08T08:00:00.000Z',
          result({ kind: 'ROUNDS', roundsCompleted: 4 }),
        ),
        difference: 1,
        configChanged: true,
      }),
    );
    expect(lines).toEqual([
      'Runden: 4 → 5',
      'Andere Runden-Einstellung als beim letzten Mal',
      'Differenz: +1',
    ]);
  });
});

// ---------------------------------------------------------------------- progress + charts
const progress = (values: number[], kind: ExerciseProgress['kind'] = 'REPS'): ExerciseProgress => ({
  exerciseId: uuid(2),
  name: 'Bankdrücken Test',
  executionMode: 'SETS_REPS',
  repsMax: false,
  kind,
  points: values.map((value, i) => ({
    sessionId: uuid(20 + i),
    date: `2026-11-0${i + 1}T08:00:00.000Z`,
    value,
    setCount: 2,
  })),
});

describe('Sprint 7 — progress chart', () => {
  it('has a text alternative; fewer than 2 points → a hint, never a fake line', () => {
    expect(progressSummary(progress([15]))).toBeNull();
    expect(progressSummary(progress([15, 17, 18]))).toBe(
      '3 Trainings. Erster Wert 15, letzter Wert 18, bester Wert 18 Wiederholungen.',
    );
    expect(progressSummary(progress([3, 5], 'ROUNDS'))).toContain('5 Runden');
    render(<ExerciseProgressChart progress={progress([15, 17, 18])} />);
    expect(
      screen.getByRole('img', {
        name: '3 Trainings. Erster Wert 15, letzter Wert 18, bester Wert 18 Wiederholungen.',
      }),
    ).toBeTruthy();
    cleanup();
    render(<ExerciseProgressChart progress={progress([15])} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Noch zu wenige Daten für einen Verlauf.')).toBeTruthy();
  });

  it('plots only the recorded values inside the box', () => {
    expect(chartPoints([], 100, 50)).toBe('');
    expect(chartPoints([5, 10], 100, 50)).toBe('0,50 100,0');
    expect(chartPoints([7, 7, 7], 100, 50)).toBe('0,25 50,25 100,25');
  });
});

// ---------------------------------------------------------------- coach "Trainingsfortschritt"
const summary = (patch: Partial<WorkoutSessionSummary> = {}): WorkoutSessionSummary => ({
  id: uuid(30),
  programId: uuid(600),
  dayId: uuid(500),
  status: 'COMPLETED',
  programTitle: 'Trainingsplan',
  dayTitle: 'Oberkörper Test',
  weekOrder: 0,
  dayOrder: 1,
  startedAt: '2026-11-20T08:00:00.000Z',
  completedAt: '2026-11-20T08:45:00.000Z',
  abandonedAt: null,
  durationSeconds: 45 * 60,
  exercisesTotal: 4,
  exercisesCompleted: 4,
  exercisesSkipped: 0,
  notesCount: 0,
  ...patch,
});

describe('Sprint 7 — Trainingsfortschritt (coach)', () => {
  it('shows planned / done / open / running of this week and the latest totals', () => {
    render(
      <TrainingProgress
        stats={{ planned: 3, completed: 1, open: 1, inProgress: 1 }}
        latest={summary({ totalReps: 39, setsCompleted: 4, roundsCompleted: 2 })}
      />,
    );
    const tiles = within(screen.getByRole('region', { name: 'Trainingsfortschritt' }));
    const value = (label: string) => tiles.getByText(label).nextElementSibling?.textContent;
    expect(value('Geplant')).toBe('3');
    expect(value('Erledigt')).toBe('1');
    expect(value('Offen')).toBe('1');
    expect(value('Läuft gerade')).toBe('1');
    expect(tiles.getByText(/39 Wiederholungen · 4 Sätze · 2 Runden/)).toBeTruthy();
  });

  it('unknown week counts show "–" (never 0); no workout yet is said plainly', () => {
    render(<TrainingProgress stats={null} latest={null} />);
    expect(screen.getAllByText('–')).toHaveLength(4);
    expect(screen.getByText('Die Wochenzahlen konnten nicht geladen werden.')).toBeTruthy();
    expect(screen.getByText('Noch kein Training durchgeführt.')).toBeTruthy();
  });

  it('history rows carry recorded totals only; older/newest links page the list', () => {
    expect(sessionTotals(summary())).toEqual([]);
    expect(sessionTotals(summary({ totalReps: 0, setsCompleted: 0, roundsCompleted: 0 }))).toEqual([
      '0 Wdh. gesamt',
    ]);
    expect(sessionTotals(summary({ totalReps: 21, setsCompleted: 1 }))).toEqual([
      '21 Wdh. gesamt',
      '1 Satz',
    ]);
    render(
      <WorkoutHistory
        clientId={uuid(900)}
        items={[summary({ totalReps: 21 })]}
        olderHref="/admin/kunden/c/training?verlauf=abc#trainingsverlauf"
        newestHref="/admin/kunden/c/training#trainingsverlauf"
      />,
    );
    expect(screen.getByText(/21 Wdh\. gesamt/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ältere Einheiten' }).getAttribute('href')).toBe(
      '/admin/kunden/c/training?verlauf=abc#trainingsverlauf',
    );
    expect(screen.getByRole('link', { name: 'Neueste Einheiten' })).toBeTruthy();
  });

  it('the last page has no "Ältere Einheiten" link', () => {
    render(<WorkoutHistory clientId={uuid(900)} items={[summary()]} />);
    expect(screen.queryByRole('link', { name: 'Ältere Einheiten' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Trainingsverlauf blättern' })).toBeNull();
  });
});

// --------------------------------------------------------- client assignment (program builder)
describe('Sprint 7 — client assignment video', () => {
  const fields = {
    sets: '3',
    reps: '10',
    totalReps: '',
    duration: '',
    rest: '',
    weight: '',
    prescriptionText: '',
    instructionsOverride: '',
  };

  it('sends the chosen video id, null to unlink, nothing when the dialog does not manage it', async () => {
    const { toAssignmentValues } = await import('./assignment-dialog');
    expect(toAssignmentValues(uuid(5), fields, video(4)).values?.mediaAssetId).toBe(uuid(804));
    const unlinked = toAssignmentValues(uuid(5), fields, null).values;
    expect(unlinked).toHaveProperty('mediaAssetId', null);
    expect(toAssignmentValues(uuid(5), fields).values).not.toHaveProperty('mediaAssetId');
  });
});
