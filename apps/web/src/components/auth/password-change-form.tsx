'use client';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@vitruv/shared';
import { useActionState, useEffect, useId, useRef } from 'react';
import { changePasswordAction, type PasswordChangeState } from '@/app/admin/account-actions';
import { Button } from '@/components/ui';

const INITIAL: PasswordChangeState = { status: 'idle' };
type Field = 'currentPassword' | 'newPassword' | 'confirmPassword';

/** Password change with `current-password` / `new-password` autocomplete for password managers. */
export function PasswordChangeForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, INITIAL);
  const id = useId();
  const statusRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'idle') return;
    if (state.status === 'success') formRef.current?.reset();
    statusRef.current?.focus();
  }, [state]);

  const error = (field: Field) =>
    state.status === 'error' ? state.fieldErrors?.[field] : undefined;
  const field = (name: Field, label: string, autoComplete: string, hint?: string) => {
    const describedBy =
      [hint && `${id}-${name}-hint`, error(name) && `${id}-${name}-error`]
        .filter(Boolean)
        .join(' ') || undefined;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-${name}`} className="type-body-sm font-semibold">
          {label}
        </label>
        <input
          id={`${id}-${name}`}
          name={name}
          type="password"
          autoComplete={autoComplete}
          required
          maxLength={PASSWORD_MAX_LENGTH}
          aria-invalid={error(name) ? true : undefined}
          aria-describedby={describedBy}
          className="vt-input type-body"
        />
        {hint && (
          <p id={`${id}-${name}-hint`} className="type-caption text-fg-subtle">
            {hint}
          </p>
        )}
        {error(name) && (
          <p id={`${id}-${name}-error`} className="type-body-sm text-error">
            {error(name)}
          </p>
        )}
      </div>
    );
  };

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-5">
      <div
        ref={statusRef}
        tabIndex={-1}
        role={state.status === 'error' ? 'alert' : 'status'}
        className={
          state.status === 'idle'
            ? 'sr-only'
            : state.status === 'error'
              ? 'rounded-md border border-error bg-surface px-4 py-3'
              : 'rounded-md border border-success bg-surface px-4 py-3'
        }
      >
        {state.status === 'error' && <p className="type-body-sm font-semibold">{state.message}</p>}
        {state.status === 'success' && (
          <p className="type-body-sm font-semibold">
            Passwort geändert. Alle anderen Sitzungen wurden abgemeldet.
          </p>
        )}
      </div>
      {field('currentPassword', 'Aktuelles Passwort', 'current-password')}
      {field(
        'newPassword',
        'Neues Passwort',
        'new-password',
        `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen. Leerzeichen und Passphrasen sind erlaubt.`,
      )}
      {field('confirmPassword', 'Neues Passwort wiederholen', 'new-password')}
      <Button type="submit" variant="primary" loading={pending} className="self-start">
        Passwort ändern
      </Button>
    </form>
  );
}
