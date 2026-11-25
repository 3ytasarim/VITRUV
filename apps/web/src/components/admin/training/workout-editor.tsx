'use client';

import {
  createTemplateRequestSchema,
  updateClientWorkoutRequestSchema,
  updateTemplateRequestSchema,
  type AdminExercise,
  type ClientWorkout,
  type ExerciseMedia,
  type WorkoutSection,
  type WorkoutTemplate,
} from '@vitruv/contracts';
import {
  TRAINING_SECTION_TYPES,
  WORKOUT_TEMPLATE_CATEGORIES,
  type TrainingExecutionType,
  type TrainingSectionType,
  type WorkoutTemplateCategory,
} from '@vitruv/shared';
import { ArrowDown, ArrowUp, Plus, Search, Trash2, Video, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';
import { searchExercisesAction } from '@/app/admin/training-actions';
import {
  createTemplateAction,
  saveClientWorkoutAction,
  updateTemplateAction,
} from '@/app/admin/workout-actions';
import { Badge, Button, ButtonLink, Card, cx } from '@/components/ui';
import { callAction } from '@/lib/action-call';
import {
  EXECUTION_TYPE_LABEL,
  SECTION_LABEL,
  TEMPLATE_CATEGORY_LABEL,
  parseClock,
  workoutExerciseSummary,
} from '@/lib/training-format';
import { RowMediaField } from './row-media-field';

/**
 * One editor for both targets — clearly separated by the header and a coloured notice:
 *  - "Vorlage bearbeiten" (Workout-Bibliothek): changes only the template; existing client copies
 *    keep their content (a new template version is stored).
 *  - "Für Teilnehmer bearbeiten": changes only THIS client's copy (one training day); never the
 *    template or another client. Started/finished workouts keep their snapshot.
 * Only the fields of the chosen type are shown; the SAME contract schema as the API validates
 * before sending. Extended types (Core, Warm-up checklist, MAX) are offered only when the server
 * flag allows them — the API enforces it again.
 */

type ExerciseRow = {
  key: string;
  id?: string;
  exerciseId: string;
  name: string;
  hasMedia: boolean;
  /** Sprint 7: this row's own video/image (null = the library medium applies). */
  media: ExerciseMedia | null;
  active: boolean;
  executionType: TrainingExecutionType | null;
  sets: string;
  reps: string;
  repsMax: boolean;
  totalReps: string;
  duration: string;
  rest: string;
  weight: string;
  text: string;
  instructions: string;
};
type SectionRow = {
  key: string;
  id?: string;
  type: TrainingSectionType;
  title: string;
  exercises: ExerciseRow[];
};

let counter = 0;
const nextKey = () => `k${++counter}`;
const str = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value);

function rowsOf(sections: WorkoutSection[]): SectionRow[] {
  return sections.map((section) => ({
    key: nextKey(),
    id: section.id,
    type: section.type,
    title: section.title ?? '',
    exercises: section.exercises.map((e) => ({
      key: nextKey(),
      id: e.id,
      exerciseId: e.exercise.id,
      name: e.exercise.name,
      hasMedia: e.exercise.hasMedia,
      media: e.media ?? null,
      active: e.exercise.active,
      executionType: e.executionType,
      sets: str(e.sets),
      reps: str(e.reps),
      repsMax: e.repsMax,
      totalReps: str(e.totalReps),
      duration: e.durationSeconds === null ? '' : String(e.durationSeconds),
      rest: e.restSeconds === null ? '' : String(e.restSeconds),
      weight: e.targetWeight === null ? '' : String(e.targetWeight).replace('.', ','),
      text: e.prescriptionText ?? '',
      instructions: e.instructionsOverride ?? '',
    })),
  }));
}

const emptySections = (): SectionRow[] =>
  (['WARMUP', 'MAIN', 'FINISHER'] as const).map((type) => ({
    key: nextKey(),
    type,
    title: '',
    exercises: [],
  }));

const intOrNull = (value: string) => (value.trim() === '' ? null : Number(value.trim()));
const secondsOrNull = (value: string) => {
  const parsed = parseClock(value);
  return parsed === undefined ? Number.NaN : parsed;
};
const textOrNull = (value: string) => (value.trim() === '' ? null : value.trim());

/** Only the fields that belong to the type are sent (others are cleared). */
function payloadOf(row: ExerciseRow, withIds: boolean) {
  const weightText = row.weight.trim().replace(',', '.');
  const weight = weightText === '' ? null : Number(weightText);
  const base = {
    ...(withIds && row.id ? { id: row.id } : {}),
    exerciseId: row.exerciseId,
    executionType: row.executionType,
    instructionsOverride: textOrNull(row.instructions),
    mediaAssetId: row.media?.assetId ?? null,
  };
  switch (row.executionType) {
    case 'STRENGTH':
      return {
        ...base,
        sets: intOrNull(row.sets),
        reps: row.repsMax ? null : intOrNull(row.reps),
        repsMax: row.repsMax,
        restSeconds: secondsOrNull(row.rest),
        targetWeight: weight,
        weightUnit: weight === null ? null : ('KG' as const),
        prescriptionText: textOrNull(row.text),
      };
    case 'TOTAL_REPS':
      return { ...base, totalReps: intOrNull(row.totalReps), restSeconds: secondsOrNull(row.rest) };
    case 'INTERVAL':
      return {
        ...base,
        sets: intOrNull(row.sets),
        durationSeconds: secondsOrNull(row.duration),
        restSeconds: secondsOrNull(row.rest),
      };
    case 'CHECKLIST':
      return { ...base, prescriptionText: textOrNull(row.text) };
    default:
      // Legacy row (no type) — kept as it is in the client copy.
      return {
        ...base,
        sets: intOrNull(row.sets),
        reps: intOrNull(row.reps),
        totalReps: intOrNull(row.totalReps),
        durationSeconds: secondsOrNull(row.duration),
        restSeconds: secondsOrNull(row.rest),
        targetWeight: weight,
        weightUnit: weight === null ? null : ('KG' as const),
        prescriptionText: textOrNull(row.text),
      };
  }
}

type EditorMessage = { tone: 'success' | 'error'; text: string };

/**
 * The pages key the editor by version (a newer version from the server remounts it with fresh
 * state). A successful save bumps the version, so the router.refresh() after it remounts the
 * editor — this one-shot store carries the success message across that remount.
 */
const savedMessages = new Map<string, EditorMessage>();

type Target =
  | { kind: 'template-new' }
  | { kind: 'template'; template: WorkoutTemplate }
  | { kind: 'client'; workout: ClientWorkout; clientName: string };

export function WorkoutEditor({
  target,
  extendedTypes,
  cancelHref,
  readOnly: forcedReadOnly = false,
}: {
  target: Target;
  /** Server flag TRAINING_EXTENDED_TYPES (from GET /capabilities). */
  extendedTypes: boolean;
  cancelHref: string;
  /** No write permission, or an archived template. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const isTemplate = target.kind !== 'client';
  const source =
    target.kind === 'template' ? target.template : target.kind === 'client' ? target.workout : null;
  const [title, setTitle] = useState(source?.title ?? '');
  const [category, setCategory] = useState<WorkoutTemplateCategory | ''>(
    target.kind === 'template' ? (target.template.category ?? '') : '',
  );
  const [description, setDescription] = useState(
    target.kind === 'template' ? (target.template.description ?? '') : '',
  );
  const [sections, setSections] = useState<SectionRow[]>(() =>
    source ? rowsOf(source.sections) : emptySections(),
  );
  const [version, setVersion] = useState<number | string | null>(
    target.kind === 'template'
      ? target.template.version
      : target.kind === 'client'
        ? target.workout.version
        : null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const messageKey =
    target.kind === 'template'
      ? `template:${target.template.id}`
      : target.kind === 'client'
        ? `day:${target.workout.dayId}`
        : null;
  const [message, setMessage] = useState<EditorMessage | null>(() => {
    const carried = messageKey ? savedMessages.get(messageKey) : undefined;
    if (messageKey) savedMessages.delete(messageKey);
    return carried ?? null;
  });
  const [stale, setStale] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const readOnly = forcedReadOnly || (target.kind === 'client' && !target.workout.editable);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = (update: (current: SectionRow[]) => SectionRow[]) => {
    setSections(update);
    setDirty(true);
    setMessage(null);
  };
  const updateRow = (sectionKey: string, rowKey: string, patch: Partial<ExerciseRow>) =>
    change((current) =>
      current.map((s) =>
        s.key !== sectionKey
          ? s
          : {
              ...s,
              exercises: s.exercises.map((e) => (e.key === rowKey ? { ...e, ...patch } : e)),
            },
      ),
    );
  const move = <T,>(list: T[], index: number, delta: number) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    if (item !== undefined) next.splice(index + delta, 0, item);
    return next;
  };

  const addExercise = (sectionKey: string, exercise: AdminExercise) =>
    change((current) =>
      current.map((s) => {
        if (s.key !== sectionKey) return s;
        const warm = s.type === 'WARMUP';
        const type: TrainingExecutionType = warm && extendedTypes ? 'CHECKLIST' : 'STRENGTH';
        return {
          ...s,
          exercises: [
            ...s.exercises,
            {
              key: nextKey(),
              exerciseId: exercise.id,
              name: exercise.name,
              hasMedia: Boolean(exercise.media),
              media: null,
              active: exercise.active,
              executionType: type,
              sets: type === 'STRENGTH' ? (warm ? '1' : '3') : '',
              reps: type === 'STRENGTH' ? '10' : '',
              repsMax: false,
              totalReps: '',
              duration: '',
              rest: type === 'STRENGTH' && !warm ? '90' : '',
              weight: '',
              text: '',
              instructions: '',
            },
          ],
        };
      }),
    );

  const save = () => {
    setErrors({});
    setMessage(null);
    const sectionPayload = sections.map((s) => ({
      ...(target.kind === 'client' && s.id ? { id: s.id } : {}),
      type: s.type,
      title: textOrNull(s.title),
      exercises: s.exercises.map((e) => payloadOf(e, target.kind === 'client')),
    }));
    const local: Record<string, string> = {};
    sections.forEach((s, si) =>
      s.exercises.forEach((e, ei) => {
        for (const field of ['rest', 'duration'] as const) {
          if (e[field].trim() !== '' && parseClock(e[field]) === undefined) {
            local[
              `sections.${si}.exercises.${ei}.${field === 'rest' ? 'restSeconds' : 'durationSeconds'}`
            ] = 'Format: Sekunden (z. B. 60) oder mm:ss (z. B. 1:30).';
          }
        }
      }),
    );
    if (Object.keys(local).length > 0) {
      setErrors(local);
      setMessage({ tone: 'error', text: 'Bitte prüfe die markierten Felder.' });
      return;
    }
    const body =
      target.kind === 'client'
        ? { expectedVersion: String(version), title, sections: sectionPayload }
        : {
            title,
            category: category || null,
            description: textOrNull(description),
            sections: sectionPayload,
            ...(target.kind === 'template' ? { expectedVersion: Number(version) } : {}),
          };
    // Each target is checked against the schema of the request it sends. (Before Sprint 7.5 a
    // template UPDATE was checked against the strict CREATE schema with `expectedVersion:
    // undefined` — Zod 4 reports that key as unrecognized, so every save of an existing template
    // failed with "Bitte prüfe die markierten Felder." and no marked field. Found by the E2E run.)
    const check = (
      target.kind === 'client'
        ? updateClientWorkoutRequestSchema
        : target.kind === 'template'
          ? updateTemplateRequestSchema
          : createTemplateRequestSchema
    ).safeParse(body);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        next[issue.path.map(String).join('.') || 'form'] ??= issue.message;
      }
      setErrors(next);
      setMessage({ tone: 'error', text: 'Bitte prüfe die markierten Felder.' });
      return;
    }
    start(async () => {
      // A network failure keeps the form (and the unsaved changes) and shows an error.
      const result = await callAction(async () => {
        if (target.kind === 'client') {
          return saveClientWorkoutAction(target.workout.dayId, target.workout.clientId, body);
        }
        if (target.kind === 'template') return updateTemplateAction(target.template.id, body);
        return createTemplateAction(body);
      });
      if (!result.ok) {
        setErrors(result.fieldErrors);
        setStale(
          'status' in result && result.status === 409 && 'expectedVersion' in result.fieldErrors,
        );
        setMessage({ tone: 'error', text: result.message });
        return;
      }
      setDirty(false);
      const saved: WorkoutTemplate | ClientWorkout = result.data;
      if (target.kind === 'template-new' && 'id' in saved) {
        router.push(`/admin/training/workouts/${saved.id}?gespeichert=1`);
        return;
      }
      setVersion(saved.version);
      setSections(rowsOf(saved.sections));
      const success: EditorMessage = {
        tone: 'success',
        text:
          'dayId' in saved
            ? 'Gespeichert – nur für diese:n Teilnehmer:in.'
            : `Vorlage gespeichert (Version ${String(saved.version)}). Bereits zugewiesene Workouts bleiben unverändert.`,
      };
      setMessage(success);
      if (messageKey) savedMessages.set(messageKey, success);
      router.refresh();
    });
  };

  const fieldError = (si: number, ei: number, ...fields: string[]) =>
    fields.map((f) => errors[`sections.${si}.exercises.${ei}.${f}`]).find(Boolean);

  return (
    <div className="vt-workout">
      {target.kind === 'client' ? (
        <div role="note" className="vt-workout__notice vt-workout__notice--client">
          <p className="type-body-sm font-semibold">
            Für Teilnehmer bearbeiten: {target.clientName}
          </p>
          <p className="type-body-sm">
            Änderungen gelten nur für diese Kopie. Die Vorlage
            {target.workout.sourceTemplate?.title
              ? ` „${target.workout.sourceTemplate.title}“`
              : ''}{' '}
            und andere Teilnehmer:innen bleiben unverändert.
            {target.workout.sessions.inProgress + target.workout.sessions.completed > 0 &&
              ' Bereits gestartete oder abgeschlossene Workouts behalten ihre ursprünglichen Vorgaben und Ergebnisse.'}
          </p>
          {!target.workout.editable && (
            <p className="type-body-sm font-semibold">
              Dieser Plan ist abgeschlossen oder archiviert und kann nicht mehr bearbeitet werden.
            </p>
          )}
        </div>
      ) : (
        <div role="note" className="vt-workout__notice">
          <p className="type-body-sm font-semibold">
            {target.kind === 'template' ? 'Vorlage bearbeiten' : 'Neues Workout'}{' '}
            (Workout-Bibliothek)
          </p>
          <p className="type-body-sm">
            Änderungen betreffen nur die Vorlage. Bereits zugewiesene Workouts bleiben unverändert –
            sie sind unabhängige Kopien.
          </p>
        </div>
      )}

      {!extendedTypes && (
        <p className="type-caption text-fg-muted">
          Core-Intervalle, Warm-up-Checklisten und MAX sind noch nicht freigegeben, bis alle
          Teilnehmer:innen eine kompatible App-Version haben.
        </p>
      )}

      <form
        id={formId}
        className="vt-workout__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!readOnly) save();
        }}
        noValidate
      >
        <fieldset disabled={readOnly || pending} className="vt-workout__head">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-title`} className="type-body-sm font-semibold">
              Name
            </label>
            <input
              id={`${formId}-title`}
              value={title}
              maxLength={120}
              onChange={(event) => {
                setTitle(event.target.value);
                setDirty(true);
              }}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? `${formId}-title-error` : undefined}
              className="vt-input type-body"
              placeholder="z. B. Oberkörper A"
              required
            />
            {errors.title && (
              <p id={`${formId}-title-error`} className="type-caption text-error">
                {errors.title}
              </p>
            )}
          </div>
          {isTemplate && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${formId}-category`} className="type-body-sm font-semibold">
                  Typ
                </label>
                <select
                  id={`${formId}-category`}
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value as WorkoutTemplateCategory | '');
                    setDirty(true);
                  }}
                  className="vt-input type-body"
                >
                  <option value="">Ohne Typ</option>
                  {WORKOUT_TEMPLATE_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {TEMPLATE_CATEGORY_LABEL[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor={`${formId}-description`} className="type-body-sm font-semibold">
                  Beschreibung / Notizen{' '}
                  <span className="font-normal text-fg-subtle">(optional)</span>
                </label>
                <textarea
                  id={`${formId}-description`}
                  value={description}
                  maxLength={2000}
                  rows={2}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setDirty(true);
                  }}
                  className="vt-input type-body"
                />
              </div>
            </>
          )}
        </fieldset>

        {errors.sections && (
          <p role="alert" className="type-body-sm text-error">
            {errors.sections}
          </p>
        )}

        <ol className="vt-workout__sections">
          {sections.map((section, si) => (
            <li key={section.key}>
              <Card padding="sm" className="vt-workout__section">
                <div className="vt-workout__section-head">
                  <h3 className="type-title">
                    {section.title.trim() || SECTION_LABEL[section.type]}
                    <span className="type-caption ml-2 text-fg-subtle">
                      {section.exercises.length}{' '}
                      {section.exercises.length === 1 ? 'Übung' : 'Übungen'}
                    </span>
                  </h3>
                  {!readOnly && (
                    <div className="flex items-center gap-1">
                      <select
                        aria-label={`Art von Abschnitt ${si + 1}`}
                        value={section.type}
                        onChange={(event) =>
                          change((current) =>
                            current.map((s) =>
                              s.key === section.key
                                ? { ...s, type: event.target.value as TrainingSectionType }
                                : s,
                            ),
                          )
                        }
                        className="vt-input type-body-sm"
                      >
                        {TRAINING_SECTION_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {SECTION_LABEL[type]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="vt-plan__icon-btn"
                        aria-label="Abschnitt nach oben"
                        disabled={si === 0}
                        onClick={() => change((current) => move(current, si, -1))}
                      >
                        <ArrowUp aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="vt-plan__icon-btn"
                        aria-label="Abschnitt nach unten"
                        disabled={si === sections.length - 1}
                        onClick={() => change((current) => move(current, si, 1))}
                      >
                        <ArrowDown aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="vt-plan__icon-btn"
                        aria-label={`Abschnitt ${SECTION_LABEL[section.type]} entfernen`}
                        disabled={sections.length === 1}
                        onClick={() =>
                          change((current) => current.filter((s) => s.key !== section.key))
                        }
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>
                  )}
                </div>

                {section.exercises.length === 0 ? (
                  <p className="type-body-sm text-fg-muted">
                    Noch keine Übungen in diesem Abschnitt.
                  </p>
                ) : (
                  <ol className="vt-workout__rows">
                    {section.exercises.map((row, ei) => (
                      <li key={row.key} className="vt-workout__row">
                        <div className="vt-workout__row-head">
                          <span className="type-caption w-6 text-fg-subtle tabular-nums">
                            {ei + 1}.
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="type-body font-semibold">{row.name}</span>
                            <span className="type-caption block text-fg-subtle">
                              {workoutExerciseSummary({
                                executionType: row.executionType,
                                repsMax: row.repsMax,
                                sets: intOrNull(row.sets),
                                reps: intOrNull(row.reps),
                                totalReps: intOrNull(row.totalReps),
                                durationSeconds: parseClock(row.duration) ?? null,
                                restSeconds: parseClock(row.rest) ?? null,
                                targetWeight: null,
                                weightUnit: null,
                                prescriptionText: textOrNull(row.text),
                              })}
                            </span>
                          </span>
                          {(row.media !== null || row.hasMedia) && (
                            <Badge tone="accent">
                              <Video aria-hidden className="size-3" />
                              Video
                            </Badge>
                          )}
                          {!row.active && <Badge tone="warning">Deaktiviert</Badge>}
                          {!readOnly && (
                            <span className="flex items-center">
                              <button
                                type="button"
                                className="vt-plan__icon-btn"
                                aria-label={`${row.name} nach oben`}
                                disabled={ei === 0}
                                onClick={() =>
                                  change((current) =>
                                    current.map((s) =>
                                      s.key === section.key
                                        ? { ...s, exercises: move(s.exercises, ei, -1) }
                                        : s,
                                    ),
                                  )
                                }
                              >
                                <ArrowUp aria-hidden className="size-4" />
                              </button>
                              <button
                                type="button"
                                className="vt-plan__icon-btn"
                                aria-label={`${row.name} nach unten`}
                                disabled={ei === section.exercises.length - 1}
                                onClick={() =>
                                  change((current) =>
                                    current.map((s) =>
                                      s.key === section.key
                                        ? { ...s, exercises: move(s.exercises, ei, 1) }
                                        : s,
                                    ),
                                  )
                                }
                              >
                                <ArrowDown aria-hidden className="size-4" />
                              </button>
                              <button
                                type="button"
                                className="vt-plan__icon-btn"
                                aria-label={`${row.name} entfernen`}
                                onClick={() =>
                                  change((current) =>
                                    current.map((s) =>
                                      s.key === section.key
                                        ? {
                                            ...s,
                                            exercises: s.exercises.filter((e) => e.key !== row.key),
                                          }
                                        : s,
                                    ),
                                  )
                                }
                              >
                                <Trash2 aria-hidden className="size-4" />
                              </button>
                            </span>
                          )}
                        </div>
                        <fieldset disabled={readOnly || pending} className="vt-workout__fields">
                          <legend className="sr-only">Vorgaben für {row.name}</legend>
                          <Field
                            label="Art"
                            error={fieldError(si, ei, 'executionType', 'prescription')}
                          >
                            {(fid) => (
                              <select
                                id={fid}
                                value={row.executionType ?? ''}
                                onChange={(event) =>
                                  updateRow(section.key, row.key, {
                                    executionType:
                                      (event.target.value as TrainingExecutionType) || null,
                                    repsMax: false,
                                  })
                                }
                                className="vt-input type-body-sm"
                              >
                                {row.executionType === null && (
                                  <option value="">Frei (bisheriges Format)</option>
                                )}
                                {(['STRENGTH', 'TOTAL_REPS', 'INTERVAL', 'CHECKLIST'] as const).map(
                                  (type) => (
                                    <option
                                      key={type}
                                      value={type}
                                      disabled={
                                        !extendedTypes &&
                                        (type === 'INTERVAL' || type === 'CHECKLIST') &&
                                        row.executionType !== type
                                      }
                                    >
                                      {EXECUTION_TYPE_LABEL[type]}
                                      {!extendedTypes &&
                                      (type === 'INTERVAL' || type === 'CHECKLIST')
                                        ? ' – noch nicht freigegeben'
                                        : ''}
                                    </option>
                                  ),
                                )}
                              </select>
                            )}
                          </Field>
                          {(row.executionType === 'STRENGTH' || row.executionType === null) && (
                            <>
                              <NumberField
                                label="Sätze"
                                value={row.sets}
                                error={fieldError(si, ei, 'sets')}
                                onChange={(v) => updateRow(section.key, row.key, { sets: v })}
                              />
                              <NumberField
                                label="Wdh."
                                value={row.repsMax ? '' : row.reps}
                                disabled={row.repsMax}
                                placeholder={row.repsMax ? 'MAX' : undefined}
                                error={fieldError(si, ei, 'reps')}
                                onChange={(v) => updateRow(section.key, row.key, { reps: v })}
                              />
                              {row.executionType === 'STRENGTH' && (
                                <label className="vt-workout__check type-body-sm">
                                  <input
                                    type="checkbox"
                                    checked={row.repsMax}
                                    disabled={!extendedTypes && !row.repsMax}
                                    onChange={(event) =>
                                      updateRow(section.key, row.key, {
                                        repsMax: event.target.checked,
                                        reps: event.target.checked ? '' : row.reps,
                                      })
                                    }
                                  />
                                  MAX
                                </label>
                              )}
                            </>
                          )}
                          {(row.executionType === 'TOTAL_REPS' || row.executionType === null) && (
                            <NumberField
                              label={
                                row.executionType === null ? 'Gesamt-Wdh.' : 'Ziel (Wdh. gesamt)'
                              }
                              value={row.totalReps}
                              error={fieldError(si, ei, 'totalReps')}
                              onChange={(v) => updateRow(section.key, row.key, { totalReps: v })}
                            />
                          )}
                          {row.executionType === 'INTERVAL' && (
                            <>
                              <NumberField
                                label="Runden"
                                value={row.sets}
                                placeholder="5"
                                error={fieldError(si, ei, 'sets')}
                                onChange={(v) => updateRow(section.key, row.key, { sets: v })}
                              />
                              <TextField
                                label="Arbeit (Sek.)"
                                value={row.duration}
                                placeholder="40"
                                error={fieldError(si, ei, 'durationSeconds')}
                                onChange={(v) => updateRow(section.key, row.key, { duration: v })}
                              />
                            </>
                          )}
                          {row.executionType === null && (
                            <TextField
                              label="Dauer (Sek. oder mm:ss)"
                              value={row.duration}
                              error={fieldError(si, ei, 'durationSeconds')}
                              onChange={(v) => updateRow(section.key, row.key, { duration: v })}
                            />
                          )}
                          {row.executionType !== 'CHECKLIST' && (
                            <TextField
                              label="Pause (Sek. oder mm:ss)"
                              value={row.rest}
                              placeholder={row.executionType === 'INTERVAL' ? '20' : undefined}
                              error={fieldError(si, ei, 'restSeconds')}
                              onChange={(v) => updateRow(section.key, row.key, { rest: v })}
                            />
                          )}
                          {(row.executionType === 'STRENGTH' || row.executionType === null) && (
                            <TextField
                              label="Gewicht (kg, optional)"
                              value={row.weight}
                              error={fieldError(si, ei, 'targetWeight', 'weightUnit')}
                              onChange={(v) => updateRow(section.key, row.key, { weight: v })}
                            />
                          )}
                          {(row.executionType === 'CHECKLIST' ||
                            row.executionType === null ||
                            row.executionType === 'STRENGTH') && (
                            <TextField
                              label={
                                row.executionType === 'CHECKLIST'
                                  ? 'Hinweis (optional)'
                                  : 'Freie Vorgabe (optional)'
                              }
                              value={row.text}
                              maxLength={200}
                              error={fieldError(si, ei, 'prescriptionText')}
                              onChange={(v) => updateRow(section.key, row.key, { text: v })}
                            />
                          )}
                        </fieldset>
                        <RowMediaField
                          exerciseName={row.name}
                          media={row.media}
                          libraryHasMedia={row.hasMedia}
                          disabled={readOnly || pending}
                          error={fieldError(si, ei, 'mediaAssetId')}
                          onChange={(media) => updateRow(section.key, row.key, { media })}
                        />
                      </li>
                    ))}
                  </ol>
                )}
                {!readOnly && (
                  <ExercisePicker
                    label={`Übung zu ${section.title.trim() || SECTION_LABEL[section.type]} hinzufügen`}
                    onPick={(exercise) => addExercise(section.key, exercise)}
                  />
                )}
              </Card>
            </li>
          ))}
        </ol>
        {!readOnly && sections.length < 10 && (
          <div>
            <Button
              type="button"
              variant="ghost"
              icon={<Plus aria-hidden />}
              onClick={() =>
                change((current) => [
                  ...current,
                  { key: nextKey(), type: 'MAIN', title: '', exercises: [] },
                ])
              }
            >
              Abschnitt hinzufügen
            </Button>
          </div>
        )}

        {message && (
          <div
            role={message.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'vt-workout__message type-body-sm',
              message.tone === 'error' ? 'text-error' : 'text-success',
            )}
          >
            {message.text}
            {stale && (
              <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
                Neu laden
              </Button>
            )}
          </div>
        )}

        <div className="vt-workout__actions">
          {!readOnly && (
            <Button type="submit" variant="primary" loading={pending}>
              Speichern
            </Button>
          )}
          <ButtonLink href={cancelHref} variant="secondary">
            {readOnly ? 'Zurück' : 'Abbrechen'}
          </ButtonLink>
          {dirty && !pending && (
            <span className="type-caption text-fg-muted">Ungespeicherte Änderungen</span>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="type-caption font-semibold">
        {label}
      </label>
      {children(id)}
      {error && <span className="type-caption text-error">{error}</span>}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  error,
  placeholder,
  maxLength = 12,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <Field label={label} error={error}>
      {(id) => (
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          className="vt-input type-body-sm"
        />
      )}
    </Field>
  );
}

function NumberField({
  label,
  value,
  onChange,
  error,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} error={error}>
      {(id) => (
        <input
          id={id}
          inputMode="numeric"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={5}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ''))}
          className="vt-input type-body-sm"
        />
      )}
    </Field>
  );
}

/** Inline exercise search (active library exercises) for one section. */
function ExercisePicker({ label, onPick }: { label: string; onPick: (e: AdminExercise) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<AdminExercise[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await callAction(() => searchExercisesAction(q));
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setItems(result.data.slice(0, 30));
        setError(null);
      } else {
        // never show results of an older query next to an error
        setItems([]);
        setError(result.message);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, q, attempt]);

  if (!open) {
    return (
      <div>
        <Button
          type="button"
          variant="ghost"
          icon={<Plus aria-hidden />}
          onClick={() => setOpen(true)}
        >
          Übung hinzufügen
        </Button>
      </div>
    );
  }
  return (
    <div className="vt-workout__picker">
      <div className="vt-plan__search">
        <Search aria-hidden className="size-4 text-fg-subtle" />
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <input
          ref={inputRef}
          id={id}
          type="search"
          value={q}
          maxLength={100}
          placeholder="Übung suchen (Name oder Code)"
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
          className="vt-input type-body-sm w-full"
        />
        <button
          type="button"
          className="vt-plan__icon-btn"
          aria-label="Suche schließen"
          onClick={() => setOpen(false)}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div aria-live="polite" className="type-caption text-fg-muted">
        {loading
          ? 'Suche …'
          : error
            ? error
            : items.length === 0
              ? 'Keine Übungen gefunden.'
              : null}
      </div>
      {error && !loading && (
        <div>
          <Button type="button" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Erneut versuchen
          </Button>
        </div>
      )}
      {items.length > 0 && (
        <ul className="vt-workout__picker-list">
          {items.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                className="vt-plan__lib-item w-full text-left"
                onClick={() => {
                  onPick(exercise);
                  setOpen(false);
                  setQ('');
                }}
              >
                <span className="type-caption w-12 shrink-0 text-accent-text">
                  {exercise.code ?? ''}
                </span>
                <span className="type-body-sm min-w-0 flex-1 truncate">{exercise.name}</span>
                {exercise.media?.kind === 'VIDEO' && <Video aria-hidden className="size-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="type-caption text-fg-subtle">
        Fehlt eine Übung?{' '}
        <Link href="/admin/training/uebungen/neu" className="underline" target="_blank">
          Neue Übung anlegen
        </Link>
      </p>
    </div>
  );
}
