'use client';

import { Plus } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { moveItem, removeItem, replaceItem, type FieldErrors } from './editor-state';
import { FieldGroup, ItemControls, TextField } from './fields';

/**
 * Ordered list of items with stable IDs (stages, FAQ entries, packages, links …):
 * heading with count, add button, and one card per item with keyboard-accessible
 * move up / move down / remove controls. Item identity is the `id`, never the index.
 */
export function RepeatableList<T extends { id: string }>({
  heading,
  items,
  onChange,
  createItem,
  itemLabel,
  renderItem,
  addLabel,
  max,
  min = 0,
  error,
  emptyText = 'Noch keine Einträge.',
}: {
  heading: string;
  items: readonly T[];
  onChange: (items: T[]) => void;
  /** Creates a new, empty item (must use a fresh, unique ID). */
  createItem: (existing: readonly T[]) => T;
  /** Visible + accessible name of an item, e.g. "Paket 2 · Basis". */
  itemLabel: (item: T, index: number) => string;
  renderItem: (item: T, index: number, update: (patch: Partial<T>) => void) => ReactNode;
  addLabel: string;
  max: number;
  min?: number;
  /** Array-level error (e.g. "Mindestens eine Frage."). */
  error?: string;
  emptyText?: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="type-h3">
          {heading} <span className="type-body text-fg-muted">({items.length})</span>
        </h2>
        <Button
          variant="secondary"
          icon={<Plus />}
          disabled={items.length >= max}
          onClick={() => onChange([...items, createItem(items)])}
        >
          {addLabel}
        </Button>
      </div>
      {error && (
        <p role="alert" className="type-body-sm text-error">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="type-body-sm text-fg-subtle">{emptyText}</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {items.map((item, index) => {
            const label = itemLabel(item, index);
            const update = (patch: Partial<T>) =>
              onChange(replaceItem(items, index, { ...item, ...patch }));
            return (
              <li key={item.id}>
                <FieldGroup
                  legend={label}
                  actions={
                    <ItemControls
                      itemLabel={label}
                      index={index}
                      count={items.length}
                      minItems={min}
                      onMove={(direction) => onChange(moveItem(items, index, direction))}
                      onRemove={() => onChange(removeItem(items, index))}
                    />
                  }
                >
                  {renderItem(item, index, update)}
                </FieldGroup>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * Ordered list of plain strings (package features, about paragraphs). Strings have no IDs in the
 * contract, so rows are positional; each row has its own label and move/remove controls.
 */
export function TextListField({
  legend,
  items,
  onChange,
  itemLabel,
  addLabel,
  max,
  min = 0,
  maxLength,
  multiline = false,
  errors = {},
}: {
  legend: string;
  items: readonly string[];
  onChange: (items: string[]) => void;
  itemLabel: (index: number) => string;
  addLabel: string;
  max: number;
  min?: number;
  maxLength: number;
  multiline?: boolean;
  /** Errors scoped to this array: `_` for the array, `<index>` per row. */
  errors?: FieldErrors;
}) {
  return (
    <FieldGroup legend={legend} error={errors._}>
      {items.length === 0 && <p className="type-body-sm text-fg-subtle">Noch keine Einträge.</p>}
      {items.map((text, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <TextField
            label={itemLabel(index)}
            required
            multiline={multiline}
            maxLength={maxLength}
            value={text}
            error={errors[String(index)]}
            onChange={(v) => onChange(replaceItem(items, index, v ?? ''))}
          />
          <div className="flex gap-2 sm:pt-7">
            <ItemControls
              itemLabel={itemLabel(index)}
              index={index}
              count={items.length}
              minItems={min}
              onMove={(direction) => onChange(moveItem(items, index, direction))}
              onRemove={() => onChange(removeItem(items, index))}
            />
          </div>
        </div>
      ))}
      <div>
        <Button
          variant="secondary"
          icon={<Plus />}
          disabled={items.length >= max}
          onClick={() => onChange([...items, ''])}
        >
          {addLabel}
        </Button>
      </div>
    </FieldGroup>
  );
}
