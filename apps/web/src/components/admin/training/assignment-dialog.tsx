'use client';

import {
  createAssignmentRequestSchema,
  type AdminAssignment,
  type AdminExercise,
} from '@vitruv/contracts';
import { Check, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { searchExercisesAction } from '@/app/admin/training-actions';
import { Button, cx } from '@/components/ui';
import { formatClock, parseClock } from '@/lib/training-format';

export type AssignmentValues = {
  exerciseId: string;
  sets: number | null;
  reps: number | null;
  totalReps: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  targetWeight: number | null;
  weightUnit: 'KG' | null;
  prescriptionText: string | null;
  instructionsOverride: string | null;
};

type Fields = {
  sets: string;
  reps: string;
  totalReps: string;
  duration: string;
  rest: string;
  weight: string;
  prescriptionText: string;
  instructionsOverride: string;
};

const fieldsOf = (a?: AdminAssignment): Fields => ({
  sets: a?.sets?.toString() ?? '',
  reps: a?.reps?.toString() ?? '',
  totalReps: a?.totalReps?.toString() ?? '',
  duration: a?.durationSeconds ? formatClock(a.durationSeconds) : '',
  rest: a?.restSeconds !== null && a?.restSeconds !== undefined ? formatClock(a.restSeconds) : '',
  weight:
    a?.targetWeight !== null && a?.targetWeight !== undefined
      ? String(a.targetWeight).replace('.', ',')
      : '',
  prescriptionText: a?.prescriptionText ?? '',
  instructionsOverride: a?.instructionsOverride ?? '',
});

const intOrNull = (value: string) => (value.trim() === '' ? null : Number(value.trim()));

/**
 * Converts the form strings into the shared contract shape and validates them with the SAME
 * schema the API uses. Returns field errors keyed like the form fields.
 */
export function toAssignmentValues(
  exerciseId: string | null,
  fields: Fields,
): { values?: AssignmentValues; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!exerciseId) errors.exercise = 'Bitte eine Übung auswählen.';
  const duration = parseClock(fields.duration);
  if (duration === undefined)
    errors.duration = 'Format: Sekunden (z. B. 45) oder mm:ss (z. B. 5:00).';
  const rest = parseClock(fields.rest);
  if (rest === undefined) errors.rest = 'Format: Sekunden (z. B. 60) oder mm:ss (z. B. 1:30).';
  const weightText = fields.weight.trim().replace(',', '.');
  const weight = weightText === '' ? null : Number(weightText);
  if (weight !== null && Number.isNaN(weight)) errors.weight = 'Bitte eine Zahl eingeben.';
  const candidate = {
    exerciseId: exerciseId ?? '00000000-0000-4000-8000-000000000000',
    sets: intOrNull(fields.sets),
    reps: intOrNull(fields.reps),
    totalReps: intOrNull(fields.totalReps),
    durationSeconds: duration ?? null,
    restSeconds: rest ?? null,
    targetWeight: weight,
    weightUnit: weight === null ? null : ('KG' as const),
    prescriptionText: fields.prescriptionText.trim() === '' ? null : fields.prescriptionText,
    instructionsOverride:
      fields.instructionsOverride.trim() === '' ? null : fields.instructionsOverride,
  };
  const parsed = createAssignmentRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    const map: Record<string, string> = {
      durationSeconds: 'duration',
      restSeconds: 'rest',
      targetWeight: 'weight',
      weightUnit: 'weight',
    };
    for (const issue of parsed.error.issues) {
      const key = map[String(issue.path[0])] ?? String(issue.path[0]);
      errors[key] ??= issue.message;
    }
  }
  if (Object.keys(errors).length > 0) return { errors };
  return { values: candidate as AssignmentValues, errors };
}

/**
 * Add/edit one exercise assignment: pick from the shared library (search, keyboard), then the
 * plan-specific prescription. Durations/rest accept seconds or mm:ss and are stored as seconds.
 * Cancelling with unsaved changes asks first.
 */
export function AssignmentDialog({
  open,
  title,
  assignment,
  preset,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  assignment?: AdminAssignment;
  /** Exercise dropped onto a section (drag & drop from the library): already selected. */
  preset?: { id: string; name: string; active: boolean };
  onSubmit: (
    values: AssignmentValues,
  ) => Promise<{ ok: true } | { ok: false; message: string; fieldErrors: Record<string, string> }>;
  onClose: () => void;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initial = useMemo(() => fieldsOf(assignment), [assignment]);
  const [fields, setFields] = useState<Fields>(initial);
  const initialExercise = assignment?.exercise ?? preset ?? null;
  const [exercise, setExercise] = useState<{ id: string; name: string; active: boolean } | null>(
    initialExercise,
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminExercise[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const dirty =
    JSON.stringify(fields) !== JSON.stringify(initial) ||
    (exercise?.id ?? null) !== (initialExercise?.id ?? null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchExercisesAction(query).then((result) => {
        if (!cancelled) setResults(result.ok ? result.data : []);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  const set = (key: keyof Fields) => (event: { target: { value: string } }) =>
    setFields((current) => ({ ...current, [key]: event.target.value }));

  const requestClose = () => {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const submit = async () => {
    const { values, errors: found } = toAssignmentValues(exercise?.id ?? null, fields);
    setErrors(found);
    if (!values) {
      setFormError(found.prescription ?? 'Bitte prüfe die markierten Felder.');
      errorRef.current?.focus();
      return;
    }
    setPending(true);
    const result = await onSubmit(values);
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setFormError(result.fieldErrors.prescription ?? result.message);
      errorRef.current?.focus();
    }
  };

  const field = (
    key: keyof Fields,
    label: string,
    props: {
      inputMode?: 'numeric' | 'decimal' | 'text';
      hint?: string;
      suffix?: string;
      maxLength?: number;
    } = {},
  ) => {
    const errorKey =
      key === 'duration' ? 'duration' : key === 'rest' ? 'rest' : key === 'weight' ? 'weight' : key;
    const error = errors[errorKey];
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-${key}`} className="type-body-sm font-semibold">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-${key}`}
            value={fields[key]}
            onChange={set(key)}
            inputMode={props.inputMode ?? 'numeric'}
            maxLength={props.maxLength ?? 8}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={
              [props.hint && `${id}-${key}-hint`, error && `${id}-${key}-error`]
                .filter(Boolean)
                .join(' ') || undefined
            }
            className="vt-input type-body min-w-0 flex-1"
          />
          {props.suffix && <span className="type-body-sm text-fg-muted">{props.suffix}</span>}
        </div>
        {props.hint && (
          <p id={`${id}-${key}-hint`} className="type-caption text-fg-subtle">
            {props.hint}
          </p>
        )}
        {error && (
          <p id={`${id}-${key}-error`} className="type-body-sm text-error">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      className="vt-dialog"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-4 py-3 md:px-6">
            <h2 id={`${id}-title`} className="type-title">
              {title}
            </h2>
            <Button
              variant="ghost"
              icon={<X aria-hidden />}
              aria-label="Dialog schließen"
              onClick={requestClose}
            />
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className={formError ? 'mb-5 rounded-xs border border-error px-4 py-3' : 'sr-only'}
            >
              {formError && <p className="type-body-sm font-semibold">{formError}</p>}
            </div>

            <section aria-labelledby={`${id}-pick`} className="mb-6 flex flex-col gap-3">
              <h3 id={`${id}-pick`} className="type-body-sm font-semibold">
                Übung
              </h3>
              <p className="type-body-sm" aria-live="polite">
                {exercise ? (
                  <>
                    Ausgewählt: <strong>{exercise.name}</strong>
                    {!exercise.active && ' (inaktiv)'}
                  </>
                ) : (
                  'Noch keine Übung ausgewählt.'
                )}
              </p>
              {errors.exercise || errors.exerciseId ? (
                <p className="type-body-sm text-error">{errors.exercise ?? errors.exerciseId}</p>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-search`} className="type-body-sm font-semibold">
                  Übung suchen
                </label>
                <div className="relative">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
                  />
                  <input
                    id={`${id}-search`}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    maxLength={100}
                    autoComplete="off"
                    className="vt-input type-body w-full pl-9"
                    aria-describedby={`${id}-results-status`}
                  />
                </div>
              </div>
              <p
                id={`${id}-results-status`}
                className="type-caption text-fg-subtle"
                aria-live="polite"
              >
                {results === null
                  ? 'Lade Übungen …'
                  : `${results.length} aktive ${results.length === 1 ? 'Übung' : 'Übungen'}`}
              </p>
              <ul className="grid max-h-56 gap-1 overflow-y-auto" aria-label="Suchergebnisse">
                {(results ?? []).map((item) => {
                  const selected = item.id === exercise?.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setExercise({ id: item.id, name: item.name, active: item.active })
                        }
                        className={cx(
                          'type-body-sm flex min-h-12 w-full items-center justify-between gap-3 rounded-xs border px-3 text-left',
                          selected
                            ? 'border-accent bg-surface text-fg'
                            : 'border-border-subtle hover:bg-surface',
                        )}
                      >
                        <span className="min-w-0 truncate">{item.name}</span>
                        {selected && (
                          <Check aria-hidden className="size-4 shrink-0 text-accent-text" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby={`${id}-rx`} className="flex flex-col gap-4">
              <h3 id={`${id}-rx`} className="type-body-sm font-semibold">
                Vorgabe für diesen Plan
              </h3>
              <p className="type-caption text-fg-subtle">
                Mindestens eine Angabe: Sätze/Wiederholungen, Gesamtwiederholungen, Dauer oder freie
                Vorgabe.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                {field('sets', 'Sätze')}
                {field('reps', 'Wiederholungen')}
                {field('totalReps', 'Wdh. gesamt', { hint: 'z. B. 70' })}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {field('duration', 'Dauer', { inputMode: 'text', hint: 'Sek. oder mm:ss' })}
                {field('rest', 'Pause', { inputMode: 'text', hint: 'Sek. oder mm:ss' })}
                {field('weight', 'Gewicht', {
                  inputMode: 'decimal',
                  suffix: 'kg',
                  hint: 'optional',
                })}
              </div>
              {field('prescriptionText', 'Freie Vorgabe', {
                inputMode: 'text',
                maxLength: 200,
                hint: 'z. B. AMRAP, Bodyweight, bis technisches Versagen',
              })}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-instructions`} className="type-body-sm font-semibold">
                  Eigene Anleitung für diesen Plan
                </label>
                <textarea
                  id={`${id}-instructions`}
                  value={fields.instructionsOverride}
                  onChange={set('instructionsOverride')}
                  rows={3}
                  maxLength={2000}
                  aria-describedby={`${id}-instructions-hint`}
                  className="vt-input type-body"
                />
                <p id={`${id}-instructions-hint`} className="type-caption text-fg-subtle">
                  Optional – sonst gilt die Beschreibung der Übung.
                </p>
              </div>
            </section>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border-subtle px-4 py-3 md:px-6">
            {confirmDiscard ? (
              <>
                <p role="alert" className="type-body-sm mr-auto">
                  Ungespeicherte Änderungen verwerfen?
                </p>
                <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
                  Weiter bearbeiten
                </Button>
                <Button variant="primary" onClick={onClose}>
                  Verwerfen
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={requestClose}>
                  Abbrechen
                </Button>
                <Button variant="primary" loading={pending} onClick={submit}>
                  {assignment ? 'Änderungen speichern' : 'Übung hinzufügen'}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
