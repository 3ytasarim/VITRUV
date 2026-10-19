'use client';

import type { AdminExercise } from '@vitruv/contracts';
import { GripVertical, ImageIcon, Search, Video } from 'lucide-react';
import { useEffect, useId, useState, type DragEvent } from 'react';
import { searchExercisesAction } from '@/app/admin/training-actions';

/** Drag payload of a library exercise (dropped onto a section of the builder). */
export const EXERCISE_DRAG_TYPE = 'application/x-vitruv-exercise';
export type DraggedExercise = { id: string; name: string; active: boolean };

export function readDraggedExercise(event: DragEvent): DraggedExercise | null {
  try {
    const raw = event.dataTransfer.getData(EXERCISE_DRAG_TYPE);
    const value = raw ? (JSON.parse(raw) as Partial<DraggedExercise>) : null;
    return value && typeof value.id === 'string' && typeof value.name === 'string'
      ? { id: value.id, name: value.name, active: value.active !== false }
      : null;
  } catch {
    return null;
  }
}

export const isExerciseDrag = (event: DragEvent) =>
  event.dataTransfer.types.includes(EXERCISE_DRAG_TYPE);

/**
 * The coach's exercise library next to the builder: search and drag an exercise onto a section
 * (Warm-up / Hauptteil / Abschluss of a day). Dropping opens the prescription dialog with the
 * exercise already selected. Keyboard / touch alternative: "Übung hinzufügen" in each section.
 */
export function ExerciseLibrary() {
  const id = useId();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AdminExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      const result = await searchExercisesAction(query);
      if (!alive) return;
      if (result.ok) {
        setItems(result.data);
        setError(null);
      } else setError(result.message);
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <aside className="vt-exlib" aria-labelledby={`${id}-title`}>
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="type-title">
          Übungen
        </h2>
        <p className="type-body-sm text-fg-muted">
          Ziehe eine Übung in einen Abschnitt eines Tages.
        </p>
      </div>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
        />
        <label htmlFor={`${id}-q`} className="sr-only">
          Übungen durchsuchen
        </label>
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          maxLength={100}
          placeholder="Suchen …"
          onChange={(event) => setQuery(event.target.value)}
          className="vt-input type-body-sm w-full pl-9"
        />
      </div>
      {error && (
        <p role="alert" className="type-body-sm text-error">
          {error}
        </p>
      )}
      {items === null ? (
        <p className="type-body-sm text-fg-subtle" role="status">
          Wird geladen …
        </p>
      ) : items.length === 0 ? (
        <p className="type-body-sm text-fg-subtle">
          {query ? 'Keine Übung gefunden.' : 'Noch keine aktiven Übungen in der Bibliothek.'}
        </p>
      ) : (
        <ul className="vt-exlib__list" aria-label="Übungen zum Ziehen">
          {items.map((exercise) => (
            <li
              key={exercise.id}
              draggable
              className="vt-exlib__item"
              onDragStart={(event) => {
                const payload: DraggedExercise = {
                  id: exercise.id,
                  name: exercise.name,
                  active: exercise.active,
                };
                event.dataTransfer.setData(EXERCISE_DRAG_TYPE, JSON.stringify(payload));
                event.dataTransfer.setData('text/plain', exercise.name);
                event.dataTransfer.effectAllowed = 'copy';
                event.currentTarget.dataset.dragging = 'true';
              }}
              onDragEnd={(event) => delete event.currentTarget.dataset.dragging}
            >
              <GripVertical aria-hidden className="size-4 shrink-0 text-fg-subtle" />
              <span className="type-body-sm min-w-0 flex-1 font-semibold break-words">
                {exercise.name}
              </span>
              {exercise.media?.kind === 'VIDEO' ? (
                <Video aria-label="mit Video" className="size-4 shrink-0 text-fg-subtle" />
              ) : exercise.media ? (
                <ImageIcon aria-label="mit Bild" className="size-4 shrink-0 text-fg-subtle" />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
