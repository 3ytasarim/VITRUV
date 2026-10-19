'use client';

import type { AdminExercise, ClientPlan } from '@vitruv/contracts';
import { CLIENT_PLAN_MAX_ITEMS, CLIENT_PLAN_NOTE_MAX } from '@vitruv/contracts';
import { Dumbbell, GripVertical, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type DragEvent } from 'react';
import { saveClientPlanAction } from '@/app/admin/training-actions';
import { Badge, Button, Card, cx } from '@/components/ui';

type Media = AdminExercise['media'];
type Row = {
  key: string;
  exerciseId: string;
  name: string;
  media: Media;
  inactive: boolean;
  scheduledOn: string;
  /** Last day of the period (same as scheduledOn = a single day). */
  endsOn: string;
  note: string;
};

const DRAG_EXERCISE = 'application/x-vitruv-exercise';
const DRAG_ROW = 'application/x-vitruv-plan-row';

/** Today as YYYY-MM-DD in the browser's time zone. */
function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const weekday = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Intl.DateTimeFormat('de-DE', { weekday: 'short' }).format(new Date(`${date}T12:00:00`))
    : '';

/** "Mo" for one day, "7 Tage" for a period. */
const periodHint = (from: string, to: string) => {
  if (!from || !to || to <= from) return weekday(from);
  const days =
    Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000) + 1;
  return `${days} Tage`;
};

let counter = 0;
const nextKey = () => `row-${Date.now().toString(36)}-${(counter++).toString(36)}`;

function toRows(plan: ClientPlan): Row[] {
  return plan.items.map((item) => ({
    key: item.id,
    exerciseId: item.exercise.id,
    name: item.exercise.name,
    media: item.exercise.media,
    inactive: !item.exercise.active,
    scheduledOn: item.scheduledOn,
    endsOn: item.endsOn ?? item.scheduledOn,
    note: item.note ?? '',
  }));
}
const snapshot = (rows: Row[]) =>
  JSON.stringify(rows.map((r) => [r.exerciseId, r.scheduledOn, r.endsOn, r.note.trim()]));

function Thumb({ media, name }: { media: Media; name: string }) {
  return (
    <span aria-hidden className="vt-plan__thumb">
      {media?.kind === 'IMAGE' ? (
        <img src={media.url} alt="" loading="lazy" />
      ) : media?.kind === 'VIDEO' ? (
        <video src={`${media.url}#t=0.5`} muted playsInline preload="metadata" />
      ) : (
        <Dumbbell className="size-4" />
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}

/**
 * Dated client plan: drag exercises from the library (or press +) onto the plan, give each a
 * date and a note the client sees, then "Speichern" saves the whole list (the API re-checks
 * permission + client scope). Rows can be reordered by dragging the handle; the saved plan comes
 * back sorted by date. Unsaved changes are marked and guarded against leaving the page.
 */
export function PlanEditor({
  clientId,
  exercises,
  initial,
  canEdit,
}: {
  clientId: string;
  exercises: AdminExercise[];
  initial: ClientPlan;
  canEdit: boolean;
}) {
  const uid = useId();
  const [rows, setRows] = useState<Row[]>(() => toRows(initial));
  const [saved, setSaved] = useState(() => snapshot(toRows(initial)));
  const [query, setQuery] = useState('');
  const [defaultFrom, setDefaultFrom] = useState(today);
  const [defaultTo, setDefaultTo] = useState(today);
  const [over, setOver] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const dirty = snapshot(rows) !== saved;
  const full = rows.length >= CLIENT_PLAN_MAX_ITEMS;

  const library = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((e) => e.active && (!q || e.name.toLowerCase().includes(q)));
  }, [exercises, query]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const add = (exercise: AdminExercise, beforeKey?: string) => {
    if (full) return;
    setMessage(null);
    const row: Row = {
      key: nextKey(),
      exerciseId: exercise.id,
      name: exercise.name,
      media: exercise.media,
      inactive: false,
      scheduledOn: defaultFrom,
      endsOn: defaultTo < defaultFrom ? defaultFrom : defaultTo,
      note: '',
    };
    setRows((current) => {
      const at = beforeKey ? current.findIndex((r) => r.key === beforeKey) : -1;
      return at < 0 ? [...current, row] : [...current.slice(0, at), row, ...current.slice(at)];
    });
    if (!beforeKey)
      requestAnimationFrame(() =>
        document.getElementById(`${uid}-end`)?.scrollIntoView({ block: 'nearest' }),
      );
  };
  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((current) => current.filter((r) => r.key !== key));
  const move = (key: string, beforeKey: string | null) =>
    setRows((current) => {
      const row = current.find((r) => r.key === key);
      if (!row || key === beforeKey) return current;
      const rest = current.filter((r) => r.key !== key);
      const at = beforeKey ? rest.findIndex((r) => r.key === beforeKey) : -1;
      return at < 0 ? [...rest, row] : [...rest.slice(0, at), row, ...rest.slice(at)];
    });

  /** Drop target: a row (insert before it) or the list end (`null`). */
  const dropProps = (target: string | null) => ({
    onDragOver: (event: DragEvent) => {
      if (!canEdit) return;
      const types = event.dataTransfer.types;
      if (!types.includes(DRAG_EXERCISE) && !types.includes(DRAG_ROW)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = types.includes(DRAG_ROW) ? 'move' : 'copy';
      setOver(target ?? 'end');
    },
    onDragLeave: () => setOver((o) => (o === (target ?? 'end') ? null : o)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setOver(null);
      const rowKey = event.dataTransfer.getData(DRAG_ROW);
      if (rowKey) return move(rowKey, target);
      const exercise = exercises.find((e) => e.id === event.dataTransfer.getData(DRAG_EXERCISE));
      if (exercise) add(exercise, target ?? undefined);
    },
  });

  async function save() {
    setPending(true);
    setMessage(null);
    setFieldErrors({});
    const result = await saveClientPlanAction(
      clientId,
      rows.map((r) => ({
        exerciseId: r.exerciseId,
        scheduledOn: r.scheduledOn,
        endsOn: r.endsOn && r.endsOn !== r.scheduledOn ? r.endsOn : null,
        note: r.note.trim() || null,
      })),
    );
    setPending(false);
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.message });
      setFieldErrors(result.fieldErrors);
      return;
    }
    const next = toRows(result.data);
    setRows(next);
    setSaved(snapshot(next));
    setMessage({
      tone: 'success',
      text: `Gespeichert – ${next.length} ${next.length === 1 ? 'Übung' : 'Übungen'} für die Kund:in sichtbar.`,
    });
  }

  return (
    <Card padding="md" className="vt-plan">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="type-title">Trainingsplan mit Datum</h2>
          <p className="type-body-sm mt-1 max-w-measure text-fg-muted">
            Übungen aus der Bibliothek in den Plan ziehen (oder <strong>+</strong> drücken),
            Zeitraum (von – bis) und Notiz eintragen, dann speichern. Die Kund:in sieht Zeitraum,
            Übung und Notiz.
          </p>
        </div>
        {dirty && <Badge tone="warning">Nicht gespeichert</Badge>}
      </div>

      <div className="vt-plan__grid">
        {/* Library */}
        <section aria-labelledby={`${uid}-lib`} className="vt-plan__library">
          <h3 id={`${uid}-lib`} className="type-body-sm font-semibold">
            Übungen ({library.length})
          </h3>
          <label className="vt-plan__search">
            <Search aria-hidden className="size-4 text-fg-subtle" />
            <span className="sr-only">Übung suchen</span>
            <input
              type="search"
              className="vt-input type-body-sm"
              placeholder="Suchen …"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {library.length === 0 ? (
            <p className="type-body-sm text-fg-muted">
              {exercises.length === 0
                ? 'Noch keine Übungen – lege sie unter Training → Übungen an.'
                : 'Keine Übung gefunden.'}
            </p>
          ) : (
            <ul className="vt-plan__lib-list">
              {library.map((exercise) => (
                <li
                  key={exercise.id}
                  className="vt-plan__lib-item"
                  draggable={canEdit && !full}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_EXERCISE, exercise.id);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  {canEdit && (
                    <GripVertical aria-hidden className="size-4 shrink-0 text-fg-subtle" />
                  )}
                  <Thumb media={exercise.media} name={exercise.name} />
                  <span className="type-body-sm min-w-0 flex-1 truncate">{exercise.name}</span>
                  {canEdit && (
                    <button
                      type="button"
                      className="vt-plan__icon-btn"
                      aria-label={`${exercise.name} zum Plan hinzufügen`}
                      disabled={full}
                      onClick={() => add(exercise)}
                    >
                      <Plus aria-hidden className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Plan */}
        <section aria-labelledby={`${uid}-plan`} className="vt-plan__board">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id={`${uid}-plan`} className="type-body-sm font-semibold">
              Plan ({rows.length})
            </h3>
            {canEdit && (
              <div role="group" aria-labelledby={`${uid}-range`} className="vt-plan__range">
                <span id={`${uid}-range`} className="type-caption text-fg-muted">
                  Zeitraum für neue Übungen
                </span>
                <label className="sr-only" htmlFor={`${uid}-from`}>
                  Von (neue Übungen)
                </label>
                <input
                  id={`${uid}-from`}
                  type="date"
                  className="vt-input type-body-sm"
                  value={defaultFrom}
                  onChange={(event) => {
                    const from = event.target.value || today();
                    setDefaultFrom(from);
                    if (defaultTo < from) setDefaultTo(from);
                  }}
                />
                <span aria-hidden className="text-fg-subtle">
                  –
                </span>
                <label className="sr-only" htmlFor={`${uid}-to`}>
                  Bis (neue Übungen)
                </label>
                <input
                  id={`${uid}-to`}
                  type="date"
                  className="vt-input type-body-sm"
                  min={defaultFrom}
                  value={defaultTo}
                  onChange={(event) => setDefaultTo(event.target.value || defaultFrom)}
                />
              </div>
            )}
          </div>
          <ul
            className="vt-plan__rows"
            {...dropProps(null)}
            data-over={over === 'end' || undefined}
          >
            {rows.length === 0 && (
              <li className="vt-plan__empty">
                {canEdit ? 'Übungen hierher ziehen' : 'Noch keine Übungen geplant.'}
              </li>
            )}
            {rows.map((row, index) => (
              <li
                key={row.key}
                className={cx('vt-plan__row', over === row.key && 'vt-plan__row--over')}
                {...dropProps(row.key)}
              >
                {canEdit && (
                  <span
                    className="vt-plan__handle"
                    draggable
                    title="Ziehen zum Verschieben"
                    onDragStart={(event) => {
                      event.dataTransfer.setData(DRAG_ROW, row.key);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <GripVertical aria-hidden className="size-4" />
                  </span>
                )}
                <Thumb media={row.media} name={row.name} />
                <div className="vt-plan__fields">
                  <p className="type-body-sm font-semibold">
                    {row.name}
                    {row.inactive && (
                      <span className="type-caption ml-2 text-fg-subtle">(deaktiviert)</span>
                    )}
                  </p>
                  <div className="vt-plan__inputs">
                    <div className="vt-plan__date">
                      <label htmlFor={`${uid}-${row.key}-from`} className="sr-only">
                        Von für {row.name}
                      </label>
                      <input
                        id={`${uid}-${row.key}-from`}
                        type="date"
                        required
                        className="vt-input type-body-sm"
                        value={row.scheduledOn}
                        disabled={!canEdit}
                        aria-invalid={Boolean(fieldErrors.items) && !row.scheduledOn}
                        onChange={(event) => {
                          const from = event.target.value;
                          update(row.key, {
                            scheduledOn: from,
                            ...(from && row.endsOn < from ? { endsOn: from } : {}),
                          });
                        }}
                      />
                      <span aria-hidden className="text-fg-subtle">
                        –
                      </span>
                      <label htmlFor={`${uid}-${row.key}-to`} className="sr-only">
                        Bis für {row.name}
                      </label>
                      <input
                        id={`${uid}-${row.key}-to`}
                        type="date"
                        required
                        className="vt-input type-body-sm"
                        min={row.scheduledOn}
                        value={row.endsOn}
                        disabled={!canEdit}
                        onChange={(event) => update(row.key, { endsOn: event.target.value })}
                      />
                      <span aria-hidden className="type-caption text-fg-subtle">
                        {periodHint(row.scheduledOn, row.endsOn)}
                      </span>
                    </div>
                    <label className="vt-plan__note">
                      <span className="sr-only">Notiz für die Kund:in zu {row.name}</span>
                      <textarea
                        className="vt-input type-body-sm"
                        rows={1}
                        maxLength={CLIENT_PLAN_NOTE_MAX}
                        placeholder="Notiz für die Kund:in (z. B. 3 × 12, langsam)"
                        value={row.note}
                        disabled={!canEdit}
                        onChange={(event) => update(row.key, { note: event.target.value })}
                      />
                    </label>
                  </div>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    className="vt-plan__icon-btn"
                    aria-label={`${row.name} (${index + 1}) entfernen`}
                    onClick={() => remove(row.key)}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                )}
              </li>
            ))}
            <li id={`${uid}-end`} aria-hidden className="vt-plan__end" />
          </ul>

          {canEdit && (
            <div className="vt-plan__footer">
              <div role={message?.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
                {message && (
                  <p
                    className={
                      message.tone === 'error'
                        ? 'type-body-sm text-error'
                        : 'type-body-sm text-success'
                    }
                  >
                    {message.text}
                  </p>
                )}
                {full && (
                  <p className="type-caption text-fg-subtle">
                    Höchstens {CLIENT_PLAN_MAX_ITEMS} Einträge pro Plan.
                  </p>
                )}
              </div>
              <Button
                variant="primary"
                icon={<Save />}
                loading={pending}
                disabled={
                  !dirty ||
                  pending ||
                  rows.some((r) => !r.scheduledOn || !r.endsOn || r.endsOn < r.scheduledOn)
                }
                onClick={save}
              >
                Speichern
              </Button>
            </div>
          )}
        </section>
      </div>
    </Card>
  );
}
