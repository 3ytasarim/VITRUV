import { useId, type ReactNode } from 'react';

/**
 * Uncontrolled form field for server-action forms: visible label, optional hint, error linked
 * via aria-describedby + aria-invalid. `render` receives the ids for the control.
 */
export function FormField({
  label,
  hint,
  error,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (ids: { id: string; describedBy?: string; invalid?: true }) => ReactNode;
}) {
  const id = useId();
  const describedBy =
    [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-body-sm font-semibold text-fg">
        {label}
        {required ? (
          <span className="text-fg-subtle"> *</span>
        ) : (
          <span className="type-caption ml-2 text-fg-subtle">optional</span>
        )}
      </label>
      {children({ id, describedBy, invalid: error ? true : undefined })}
      {hint && (
        <p id={`${id}-hint`} className="type-caption text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="type-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** Form-level status region: announced (alert for errors, status for success), focusable. */
export function FormStatus({
  state,
  success,
  focusRef,
}: {
  state: { status: string; message?: string };
  success?: string;
  focusRef: React.RefObject<HTMLDivElement | null>;
}) {
  const isError = state.status === 'error';
  const isSuccess = state.status === 'success' && success;
  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      role={isError ? 'alert' : 'status'}
      className={
        isError
          ? 'rounded-xs border border-error px-4 py-3'
          : isSuccess
            ? 'rounded-xs border border-success px-4 py-3'
            : 'sr-only'
      }
    >
      {isError && <p className="type-body-sm font-semibold">{state.message}</p>}
      {isSuccess && <p className="type-body-sm font-semibold">{success}</p>}
    </div>
  );
}
