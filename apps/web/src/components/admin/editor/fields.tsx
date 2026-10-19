'use client';

import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button, cx } from '@/components/ui';
import { optionalValue } from './editor-state';

/**
 * Reusable, accessible field primitives for all section editors: every control has a visible
 * label, an optional hint, and an error linked via aria-describedby + aria-invalid.
 */
interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}

function FieldShell({ label, hint, error, required, children }: FieldShellProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="type-body-sm font-semibold text-fg">
        {label}
        {required ? (
          <span className="text-fg-subtle"> *</span>
        ) : (
          <span className="type-caption ml-2 text-fg-subtle">optional</span>
        )}
      </label>
      {children({ inputId, describedBy })}
      {hint && (
        <p id={hintId} className="type-caption text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="type-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  required = false,
  maxLength,
  multiline = false,
  placeholder,
  inputMode,
}: {
  label: string;
  /** Optional fields use `undefined` for "not set"; the input shows an empty string. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  multiline?: boolean;
  placeholder?: string;
  inputMode?: 'url' | 'email' | 'text';
}) {
  const emit = (raw: string) => onChange(required ? raw : optionalValue(raw));
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      {({ inputId, describedBy }) =>
        multiline ? (
          <textarea
            id={inputId}
            className="vt-input type-body-sm"
            value={value ?? ''}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => emit(event.target.value)}
          />
        ) : (
          <input
            id={inputId}
            className="vt-input type-body-sm"
            value={value ?? ''}
            maxLength={maxLength}
            placeholder={placeholder}
            inputMode={inputMode}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => emit(event.target.value)}
          />
        )
      }
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center gap-3">
      <input
        id={id}
        type="checkbox"
        className="vt-check"
        checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id} className="type-body-sm text-fg">
        {label}
      </label>
      {hint && (
        <span id={`${id}-hint`} className="type-caption text-fg-subtle">
          {hint}
        </span>
      )}
    </div>
  );
}

/** A titled group of fields (rendered as fieldset/legend for screen readers). */
export function FieldGroup({
  legend,
  description,
  actions,
  error,
  className,
  children,
}: {
  legend: ReactNode;
  description?: string;
  actions?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      className={cx('min-w-0 rounded-xs border border-border-subtle p-4 md:p-6', className)}
    >
      {/* The legend names the group for assistive tech; the visible title sits beside actions. */}
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-hidden className="type-title">
            {legend}
          </p>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {description && <p className="type-body-sm -mt-2 text-fg-muted">{description}</p>}
        {error && (
          <p role="alert" className="type-body-sm text-error">
            {error}
          </p>
        )}
        {children}
      </div>
    </fieldset>
  );
}

/** Reorder / remove controls for one array item. Labels name the item for screen readers. */
export function ItemControls({
  itemLabel,
  index,
  count,
  onMove,
  onRemove,
  minItems = 0,
}: {
  itemLabel: string;
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  minItems?: number;
}) {
  return (
    <>
      <Button
        variant="secondary"
        icon={<ArrowUp />}
        aria-label={`${itemLabel} nach oben verschieben`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      />
      <Button
        variant="secondary"
        icon={<ArrowDown />}
        aria-label={`${itemLabel} nach unten verschieben`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      />
      <Button
        variant="secondary"
        icon={<Trash2 />}
        aria-label={`${itemLabel} entfernen`}
        disabled={count <= minItems}
        onClick={onRemove}
      />
    </>
  );
}
