'use client';

import type { AdminExercise, ClientPlan, ExerciseCategory } from '@vitruv/contracts';
import { CLIENT_PLAN_MAX_ITEMS, CLIENT_PLAN_NOTE_MAX } from '@vitruv/contracts';
import { ChevronRight, Dumbbell, GripVertical, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type DragEvent } from 'react';
import { saveClientPlanAction } from '@/app/admin/training-actions';
import { Badge, Button, Card, cx } from '@/components/ui';

type Media = AdminExercise['media'];
type Row = {
  key: string;
  exerciseId: string;
  name: string;
  code: string | null;
  category: string | null;
  /** Category id ('' = uncategorised) — rows are kept grouped by it. */
  categoryKey: string;
  hint: string;
  media: Media;
  inactive: boolean;
  note: string;
};
type Group = { key: string; name: string; items: AdminExercise[] };

const DRAG_EXERCISE = 'application/x-vitruv-exercise';
const DRAG_CATEGORY = 'application/x-vitruv-category';
const DRAG_ROW = 'application/x-vitruv-plan-row';

let counter = 0;
const nextKey = () => `row-${Date.now().toString(36)}-${(counter++).toString(36)}`;
const hintOf = (e: { standard: string | null; captureType: string | null }) =>
  [e.standard, e.captureType].filter(Boolean).join(' · ');

function toRows(plan: ClientPlan): Row[] {
  return plan.items.map((item) => ({
    key: item.id,
    exerciseId: item.exercise.id,
    name: item.exercise.name,
    code: item.exercise.code,
    category: item.exercise.category?.name ?? null,
    categoryKey: item.exercise.category?.id ?? '',
    hint: hintOf(item.exercise),
    media: item.exercise.media,
    inactive: !item.exercise.active,
    note: item.note ?? '',
  }));
}
const snapshot = (rows: Row[], from: string, to: string) =>
  JSON.stringify([from, to, rows.map((r) => [r.exerciseId, r.note.trim()])]);
const rowOf = (exercise: AdminExercise): Row => ({
  key: nextKey(),
  exerciseId: exercise.id,
  name: exercise.name,
  code: exercise.code,
  category: exercise.category?.name ?? null,
  categoryKey: exercise.category?.id ?? '',
  hint: hintOf(exercise),
  media: exercise.media,
  inactive: false,
  note: '',
});

/**
 * Keeps the rows grouped by category (groups in the order their first exercise was placed, rows
 * in their own order) — what the coach sees is exactly the order that is saved.
 */
function grouped(rows: Row[]): Row[] {
  const order: string[] = [];
  const byKey = new Map<string, Row[]>();
  for (const row of rows) {
    if (!byKey.has(row.categoryKey)) {
      order.push(row.categoryKey);
      byKey.set(row.categoryKey, []);
    }
    byKey.get(row.categoryKey)?.push(row);
  }
  return order.flatMap((key) => byKey.get(key) ?? []);
}

function Thumb({ media }: { media: Media }) {
  return (
    <span aria-hidden className="vt-plan__thumb">
      {media?.kind === 'IMAGE' ? (
        <img src={media.url} alt="" loading="lazy" />
      ) : media?.kind === 'VIDEO' ? (
        <video src={`${media.url}#t=0.5`} muted playsInline preload="metadata" />
      ) : (
        <Dumbbell className="size-4" />
      )}
    </span>
  );
}

/**
 * Client training plan (owner requests 2026-10-19 … 2026-10-21): the plan has ONE period
 * (Start – Ende); the exercises come from the library on the right, grouped by category —
 * open a category with its arrow, then drag a single exercise or the whole category onto the
 * plan (or press +). Every exercise gets a coach note the client sees. "Speichern" saves the
 * whole plan (the API re-checks permission + client scope). Rows can be reordered by dragging
 * the handle. Unsaved changes are marked and guarded against leaving the page.
 */
export function PlanEditor({
  clientId,
  exercises,
  categories,
  initial,
  canEdit,
}: {
  clientId: string;
  exercises: AdminExercise[];
  categories: ExerciseCategory[];
  initial: ClientPlan;
  canEdit: boolean;
}) {
  const uid = useId();
  const [rows, setRawRows] = useState<Row[]>(() => grouped(toRows(initial)));
  const setRows = (next: (current: Row[]) => Row[]) =>
    setRawRows((current) => grouped(next(current)));
  // plan groups are open by default; this holds the collapsed ones
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [from, setFrom] = useState(initial.startsOn ?? '');
  const [to, setTo] = useState(initial.endsOn ?? '');
  const [saved, setSaved] = useState(() =>
    snapshot(grouped(toRows(initial)), initial.startsOn ?? '', initial.endsOn ?? ''),
  );
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [over, setOver] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const dirty = snapshot(rows, from, to) !== saved;
  const full = rows.length >= CLIENT_PLAN_MAX_ITEMS;
  const periodInvalid = Boolean(from && to && to < from);
  const planned = useMemo(() => new Set(rows.map((r) => r.exerciseId)), [rows]);

  // Library: active exercises grouped by category (category order from the API, then "Ohne").
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (e: AdminExercise) =>
      e.active &&
      (!q || e.name.toLowerCase().includes(q) || (e.code ?? '').toLowerCase().includes(q));
    const list: Group[] = categories.map((c) => ({ key: c.id, name: c.name, items: [] }));
    const byKey = new Map(list.map((g) => [g.key, g]));
    const none: Group = { key: '', name: 'Ohne Kategorie', items: [] };
    for (const e of exercises.filter(match)) {
      (byKey.get(e.category?.id ?? '') ?? none).items.push(e);
    }
    return [...list, none].filter((g) => g.items.length > 0);
  }, [exercises, categories, query]);
  const searching = query.trim() !== '';

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** Adds exercises (before a row or at the end) — never one that is already in the plan. */
  const add = (list: AdminExercise[], beforeKey?: string) => {
    const room = CLIENT_PLAN_MAX_ITEMS - rows.length;
    const fresh = list
      .filter((e) => !planned.has(e.id))
      .slice(0, Math.max(0, room))
      .map(rowOf);
    if (fresh.length === 0) {
      if (list.length === 1) {
        setMessage({ tone: 'error', text: `„${list[0]?.name}“ ist bereits im Plan.` });
      }
      return;
    }
    setMessage(null);
    // a newly added category shows up opened
    setCollapsed((current) => {
      const next = new Set(current);
      for (const row of fresh) next.delete(row.categoryKey);
      return next;
    });
    setRows((current) => {
      const at = beforeKey ? current.findIndex((r) => r.key === beforeKey) : -1;
      return at < 0
        ? [...current, ...fresh]
        : [...current.slice(0, at), ...fresh, ...current.slice(at)];
    });
    if (!beforeKey) {
      requestAnimationFrame(() =>
        document.getElementById(`${uid}-end`)?.scrollIntoView({ block: 'nearest' }),
      );
    }
  };
  const addCategory = (group: Group, beforeKey?: string) => add(group.items, beforeKey);
  const removeGroup = (key: string) =>
    setRows((current) => current.filter((r) => r.categoryKey !== key));
  const toggleGroup = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // plan rows in their category groups (rows are kept grouped, see grouped())
  const planGroups = rows.reduce<{ key: string; name: string; rows: Row[] }[]>((list, row) => {
    const last = list[list.length - 1];
    if (last && last.key === row.categoryKey) last.rows.push(row);
    else list.push({ key: row.categoryKey, name: row.category ?? 'Ohne Kategorie', rows: [row] });
    return list;
  }, []);
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
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** Drop target: a row (insert before it) or the list end (`null`). */
  const dropProps = (target: string | null) => ({
    onDragOver: (event: DragEvent) => {
      if (!canEdit) return;
      const types = event.dataTransfer.types;
      if (![DRAG_EXERCISE, DRAG_CATEGORY, DRAG_ROW].some((t) => types.includes(t))) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = types.includes(DRAG_ROW) ? 'move' : 'copy';
      setOver(target ?? 'end');
    },
    onDragLeave: () => setOver((o) => (o === (target ?? 'end') ? null : o)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setOver(null);
      const before = target ?? undefined;
      const rowKey = event.dataTransfer.getData(DRAG_ROW);
      if (rowKey) return move(rowKey, target);
      if (event.dataTransfer.types.includes(DRAG_CATEGORY)) {
        const categoryKey = event.dataTransfer.getData(DRAG_CATEGORY);
        const group = groups.find((g) => g.key === categoryKey);
        if (group) addCategory(group, before);
        return;
      }
      const exercise = exercises.find((e) => e.id === event.dataTransfer.getData(DRAG_EXERCISE));
      if (exercise) add([exercise], before);
    },
  });

  async function save() {
    setPending(true);
    setMessage(null);
    const result = await saveClientPlanAction(clientId, {
      startsOn: from || null,
      endsOn: to || null,
      items: rows.map((r) => ({ exerciseId: r.exerciseId, note: r.note.trim() || null })),
    });
    setPending(false);
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.message });
      return;
    }
    const next = grouped(toRows(result.data));
    setRawRows(next);
    setFrom(result.data.startsOn ?? '');
    setTo(result.data.endsOn ?? '');
    setSaved(snapshot(next, result.data.startsOn ?? '', result.data.endsOn ?? ''));
    setMessage({
      tone: 'success',
      text: `Gespeichert – ${next.length} ${next.length === 1 ? 'Übung' : 'Übungen'} für die Kund:in sichtbar.`,
    });
  }

  return (
    <Card padding="md" className="vt-plan">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="type-title">Trainingsplan</h2>
          <p className="type-body-sm mt-1 max-w-measure text-fg-muted">
            Zeitraum festlegen, Übungen oder ganze Kategorien aus der Bibliothek rechts in den Plan
            ziehen (oder <strong>+</strong> drücken), Coach-Notiz ergänzen, dann speichern. Die
            Kund:in sieht Zeitraum, Übungen und Notizen.
          </p>
        </div>
        {dirty && <Badge tone="warning">Nicht gespeichert</Badge>}
      </div>

      <div className="vt-plan__grid">
        {/* Plan */}
        <section aria-labelledby={`${uid}-plan`} className="vt-plan__board">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id={`${uid}-plan`} className="type-body-sm font-semibold">
              Plan ({rows.length})
            </h3>
            <div role="group" aria-labelledby={`${uid}-range`} className="vt-plan__range">
              <span id={`${uid}-range`} className="type-caption text-fg-muted">
                Zeitraum
              </span>
              <label className="sr-only" htmlFor={`${uid}-from`}>
                Start
              </label>
              <input
                id={`${uid}-from`}
                type="date"
                className="vt-input type-body-sm"
                value={from}
                disabled={!canEdit}
                onChange={(event) => {
                  const value = event.target.value;
                  setFrom(value);
                  if (value && to && to < value) setTo(value);
                }}
              />
              <span aria-hidden className="text-fg-subtle">
                –
              </span>
              <label className="sr-only" htmlFor={`${uid}-to`}>
                Ende
              </label>
              <input
                id={`${uid}-to`}
                type="date"
                className="vt-input type-body-sm"
                min={from || undefined}
                value={to}
                disabled={!canEdit}
                aria-invalid={periodInvalid || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>
          <ul
            className="vt-plan__rows"
            {...dropProps(null)}
            data-over={over === 'end' || undefined}
          >
            {rows.length === 0 && (
              <li className="vt-plan__empty">
                {canEdit ? 'Übungen oder Kategorien hierher ziehen' : 'Noch keine Übungen geplant.'}
              </li>
            )}
            {planGroups.map((group) => {
              const open = !collapsed.has(group.key);
              const listId = `${uid}-pg-${group.key || 'none'}`;
              return (
                <li key={group.key || 'none'} className="vt-plan__group">
                  <div className="vt-plan__group-head">
                    <button
                      type="button"
                      className="vt-plan__cat-toggle"
                      aria-expanded={open}
                      aria-controls={listId}
                      onClick={() => toggleGroup(group.key)}
                    >
                      <ChevronRight aria-hidden className="vt-plan__chevron size-4" />
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      <span className="type-caption text-fg-subtle">
                        {group.rows.length} {group.rows.length === 1 ? 'Übung' : 'Übungen'}
                      </span>
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        className="vt-plan__icon-btn"
                        aria-label={`Kategorie ${group.name} aus dem Plan entfernen`}
                        title="Ganze Kategorie entfernen"
                        onClick={() => removeGroup(group.key)}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    )}
                  </div>
                  {open && (
                    <ul id={listId} className="vt-plan__group-rows">
                      {group.rows.map((row) => {
                        const index = rows.indexOf(row);
                        return (
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
                            <Thumb media={row.media} />
                            <div className="vt-plan__fields">
                              <p className="type-body-sm font-semibold">
                                {row.code && (
                                  <span className="mr-2 text-accent-text">{row.code}</span>
                                )}
                                {row.name}
                                {row.inactive && (
                                  <span className="type-caption ml-2 text-fg-subtle">
                                    (deaktiviert)
                                  </span>
                                )}
                              </p>
                              {row.hint && (
                                <p className="type-caption text-fg-subtle">{row.hint}</p>
                              )}
                              <label className="vt-plan__note">
                                <span className="sr-only">Coach-Notiz zu {row.name}</span>
                                <textarea
                                  className="vt-input type-body-sm"
                                  rows={1}
                                  maxLength={CLIENT_PLAN_NOTE_MAX}
                                  placeholder="Coach-Notiz für die Kund:in (z. B. 3 × 12, 20 kg)"
                                  value={row.note}
                                  disabled={!canEdit}
                                  onChange={(event) =>
                                    update(row.key, { note: event.target.value })
                                  }
                                />
                              </label>
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
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
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
                {periodInvalid && (
                  <p className="type-body-sm text-error">Das Ende liegt vor dem Start.</p>
                )}
                {full && (
                  <p className="type-caption text-fg-subtle">
                    Höchstens {CLIENT_PLAN_MAX_ITEMS} Übungen pro Plan.
                  </p>
                )}
              </div>
              <Button
                variant="primary"
                icon={<Save />}
                loading={pending}
                disabled={!dirty || pending || periodInvalid}
                onClick={save}
              >
                Speichern
              </Button>
            </div>
          )}
        </section>

        {/* Library: categories → exercises */}
        <section aria-labelledby={`${uid}-lib`} className="vt-plan__library">
          <h3 id={`${uid}-lib`} className="type-body-sm font-semibold">
            Übungsbibliothek
          </h3>
          <label className="vt-plan__search">
            <Search aria-hidden className="size-4 text-fg-subtle" />
            <span className="sr-only">Übung oder Code suchen</span>
            <input
              type="search"
              className="vt-input type-body-sm"
              placeholder="Name oder Code …"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {groups.length === 0 ? (
            <p className="type-body-sm text-fg-muted">
              {exercises.length === 0
                ? 'Noch keine Übungen – lege sie unter Übungen an.'
                : 'Keine Übung gefunden.'}
            </p>
          ) : (
            <ul className="vt-plan__cats">
              {groups.map((group) => {
                const expanded = searching || open.has(group.key);
                const listId = `${uid}-cat-${group.key || 'none'}`;
                const missing = group.items.filter((e) => !planned.has(e.id)).length;
                return (
                  <li key={group.key || 'none'} className="vt-plan__cat">
                    <div
                      className="vt-plan__cat-head"
                      draggable={canEdit && missing > 0 && !full}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(DRAG_CATEGORY, group.key);
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                    >
                      <button
                        type="button"
                        className="vt-plan__cat-toggle"
                        aria-expanded={expanded}
                        aria-controls={listId}
                        onClick={() => toggle(group.key)}
                      >
                        <ChevronRight aria-hidden className="vt-plan__chevron size-4" />
                        <span className="min-w-0 flex-1 truncate">{group.name}</span>
                        <span className="type-caption text-fg-subtle">{group.items.length}</span>
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          className="vt-plan__icon-btn"
                          aria-label={`Ganze Kategorie ${group.name} hinzufügen`}
                          title="Ganze Kategorie hinzufügen"
                          disabled={missing === 0 || full}
                          onClick={() => addCategory(group)}
                        >
                          <Plus aria-hidden className="size-4" />
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <ul id={listId} className="vt-plan__lib-list">
                        {group.items.map((exercise) => (
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
                              <GripVertical
                                aria-hidden
                                className="size-4 shrink-0 text-fg-subtle"
                              />
                            )}
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="type-body-sm truncate">
                                {exercise.code && (
                                  <span className="mr-2 text-accent-text">{exercise.code}</span>
                                )}
                                {exercise.name}
                              </span>
                              {hintOf(exercise) && (
                                <span className="type-caption truncate text-fg-subtle">
                                  {hintOf(exercise)}
                                </span>
                              )}
                            </span>
                            {canEdit && (
                              <button
                                type="button"
                                className="vt-plan__icon-btn"
                                aria-label={`${exercise.name} zum Plan hinzufügen`}
                                disabled={full}
                                onClick={() => add([exercise])}
                              >
                                <Plus aria-hidden className="size-4" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Card>
  );
}
