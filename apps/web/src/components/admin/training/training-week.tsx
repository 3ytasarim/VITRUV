'use client';

import type { ClientTrainingWeek, WeekWorkout, WorkoutTemplateSummary } from '@vitruv/contracts';
import { ChevronLeft, ChevronRight, Pencil, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { searchTemplatesAction } from '@/app/admin/workout-actions';
import { Badge, Button, ButtonLink, Card, cx } from '@/components/ui';
import { callAction } from '@/lib/action-call';
import {
  DAY_STATUS_LABEL,
  EXECUTION_TYPE_LABEL,
  PROGRAM_STATUS_LABEL,
  TEMPLATE_CATEGORY_LABEL,
  WEEKDAY_LABEL,
} from '@/lib/training-format';
import { AssignTemplateDialog } from './assign-template-dialog';

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
const shift = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * "Trainingswoche" of one client — real canonical records (training program → week → day), the
 * same data the app reads from /v1/client/training/active. Per day: the assigned workouts with
 * "Workout bearbeiten" (this client's copy) and "Workout hinzufügen" (Aus Bibliothek wählen →
 * Zuweisen for exactly this client and date).
 */
export function TrainingWeek({
  week,
  clientId,
  clientName,
  today,
  canAssign,
}: {
  week: ClientTrainingWeek;
  clientId: string;
  clientName: string;
  today: string;
  canAssign: boolean;
}) {
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [assign, setAssign] = useState<{ template: WorkoutTemplateSummary; date: string } | null>(
    null,
  );
  const base = `/admin/kunden/${clientId}/training`;
  const fixedClient = { id: clientId, name: clientName };

  const workoutItem = (w: WeekWorkout) => (
    <li key={w.dayId} className="vt-week__workout">
      <span className="type-body-sm font-semibold">{w.title}</span>
      <span className="type-caption text-fg-subtle">
        {w.exerciseCount} {w.exerciseCount === 1 ? 'Übung' : 'Übungen'}
        {w.executionTypes.length > 0 &&
          ` · ${w.executionTypes.map((t) => EXECUTION_TYPE_LABEL[t]).join(', ')}`}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <Badge
          tone={
            w.workoutStatus === 'COMPLETED'
              ? 'success'
              : w.workoutStatus === 'IN_PROGRESS'
                ? 'warning'
                : 'neutral'
          }
        >
          {DAY_STATUS_LABEL[w.workoutStatus]}
        </Badge>
        {w.sourceTemplateId && <Badge tone="accent">Aus Bibliothek</Badge>}
      </span>
      <Link href={`${base}/workout/${w.dayId}`} className="vt-week__edit type-body-sm">
        <Pencil aria-hidden className="size-4" />
        Workout bearbeiten
      </Link>
    </li>
  );

  return (
    <section aria-labelledby="trainingswoche" className="vt-week">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="trainingswoche" className="type-h3">
            Trainingswoche
          </h2>
          <p className="type-body-sm text-fg-muted">
            {shortDate(week.weekStart)} – {shortDate(week.weekEnd)}
            {week.program && (
              <>
                {' · '}Plan „{week.program.title}“ ({PROGRAM_STATUS_LABEL[week.program.status]})
                {week.weekIndex !== null && ` · Woche ${week.weekIndex + 1}`}
              </>
            )}
          </p>
        </div>
        <nav aria-label="Woche wechseln" className="flex items-center gap-2">
          <ButtonLink
            href={`${base}?woche=${shift(week.weekStart, -7)}`}
            variant="secondary"
            icon={<ChevronLeft aria-hidden />}
            aria-label="Vorherige Woche"
          />
          <ButtonLink href={base} variant="ghost">
            Heute
          </ButtonLink>
          <ButtonLink
            href={`${base}?woche=${shift(week.weekStart, 7)}`}
            variant="secondary"
            icon={<ChevronRight aria-hidden />}
            aria-label="Nächste Woche"
          />
        </nav>
      </div>

      {!week.program ? (
        <p className="type-body-sm text-fg-muted">
          Noch kein Trainingsplan. Beim ersten „Workout hinzufügen“ wird ein Entwurf ab dieser Woche
          angelegt.
        </p>
      ) : (
        <>
          {week.program.status === 'DRAFT' && (
            <p role="note" className="vt-workout__notice type-body-sm">
              Dieser Plan ist ein Entwurf und für {clientName} noch nicht sichtbar.{' '}
              <Link href={`${base}/${week.program.id}`} className="underline">
                Plan öffnen und aktivieren
              </Link>
            </p>
          )}
          {!week.program.startsOn && (
            <p role="note" className="vt-workout__notice type-body-sm">
              Der Plan hat kein Startdatum – Workouts lassen sich keinem Datum zuordnen.{' '}
              <Link href={`${base}/${week.program.id}`} className="underline">
                Startdatum festlegen
              </Link>
            </p>
          )}
        </>
      )}

      <ol className="vt-week__days">
        {week.days.map((day) => (
          <li key={day.date}>
            <Card
              padding="sm"
              className={cx('vt-week__day', day.date === today && 'vt-week__day--today')}
            >
              <h3 className="type-body-sm font-semibold">
                {WEEKDAY_LABEL[day.weekday]}{' '}
                <span className="font-normal text-fg-subtle">{shortDate(day.date)}</span>
                {day.date === today && <span className="sr-only"> (heute)</span>}
              </h3>
              {day.workouts.length === 0 ? (
                <p className="type-caption text-fg-subtle">Kein Workout</p>
              ) : (
                <ul className="flex flex-col gap-2">{day.workouts.map(workoutItem)}</ul>
              )}
              {canAssign && (
                <Button
                  variant="ghost"
                  icon={<Plus aria-hidden />}
                  onClick={() => setPickFor(day.date)}
                  aria-label={`Workout hinzufügen am ${WEEKDAY_LABEL[day.weekday]}, ${shortDate(day.date)}`}
                >
                  Workout hinzufügen
                </Button>
              )}
            </Card>
          </li>
        ))}
      </ol>

      {week.unscheduled.length > 0 && (
        <div>
          <h3 className="type-body-sm mb-2 font-semibold">Ohne festen Wochentag</h3>
          <ul className="flex flex-col gap-2">{week.unscheduled.map(workoutItem)}</ul>
        </div>
      )}

      {canAssign && (
        <>
          <TemplatePickerDialog
            open={pickFor !== null}
            onClose={() => setPickFor(null)}
            onPick={(template) => {
              const date = pickFor ?? today;
              setPickFor(null);
              setAssign({ template, date });
            }}
          />
          <AssignTemplateDialog
            open={assign !== null}
            template={assign?.template ?? null}
            fixedClient={fixedClient}
            defaultDate={assign?.date ?? today}
            onClose={() => setAssign(null)}
          />
        </>
      )}
    </section>
  );
}

/** "Aus Bibliothek wählen": search the own active templates and pick one. */
function TemplatePickerDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (template: WorkoutTemplateSummary) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<WorkoutTemplateSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setState('loading');
      const result = await callAction(() =>
        searchTemplatesAction({ q: q.trim() || undefined, pageSize: 30 }),
      );
      if (cancelled) return;
      if (result.ok) {
        setItems(result.data.items);
        setTotal(result.data.total);
        setState('idle');
      } else {
        setItems([]);
        setError(result.message);
        setState('error');
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, q, attempt]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="vt-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="type-h3">
          Aus Bibliothek wählen
        </h2>
        <div className="vt-plan__search">
          <Search aria-hidden className="size-4 text-fg-subtle" />
          <input
            type="search"
            value={q}
            maxLength={120}
            aria-label="Workouts suchen"
            placeholder="Workout suchen"
            onChange={(event) => setQ(event.target.value)}
            className="vt-input type-body-sm w-full"
          />
        </div>
        <div aria-live="polite" className="type-caption text-fg-muted">
          {state === 'loading'
            ? 'Suche …'
            : state === 'error'
              ? error
              : items.length === 0
                ? 'Keine Workouts gefunden.'
                : total > items.length
                  ? `${items.length} von ${total} – Suche verfeinern`
                  : null}
        </div>
        {state === 'error' && (
          <div>
            <Button type="button" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Erneut versuchen
            </Button>
          </div>
        )}
        <ul className="vt-workout__picker-list">
          {items.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                className="vt-plan__lib-item w-full text-left"
                onClick={() => onPick(template)}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="type-body-sm truncate font-semibold">{template.title}</span>
                  <span className="type-caption text-fg-subtle">
                    {template.category ? `${TEMPLATE_CATEGORY_LABEL[template.category]} · ` : ''}
                    {template.exerciseCount} {template.exerciseCount === 1 ? 'Übung' : 'Übungen'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-3">
          <ButtonLink
            href="/admin/training/workouts/neu"
            variant="ghost"
            icon={<Plus aria-hidden />}
          >
            Neues Workout
          </ButtonLink>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
        </div>
      </div>
    </dialog>
  );
}
