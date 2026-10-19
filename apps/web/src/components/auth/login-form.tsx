'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import { loginAction, type LoginState } from '@/app/login/actions';
import { Button } from '@/components/ui';

const INITIAL: LoginState = { status: 'idle' };

/**
 * Admin/Coach login. Works without JavaScript (server action). Password managers are supported:
 * `username` + `current-password` autocomplete, no paste blocking, no length cap below the policy.
 * Errors are announced (role="alert") and focus moves to them.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);
  const id = useId();
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === 'error') alertRef.current?.focus();
  }, [state]);

  const fieldError = (field: 'email' | 'password') =>
    state.status === 'error' ? state.fieldErrors?.[field] : undefined;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <div
        ref={alertRef}
        tabIndex={-1}
        role="alert"
        className={
          state.status === 'error'
            ? 'rounded-md border border-error bg-surface px-4 py-3'
            : 'sr-only'
        }
      >
        {state.status === 'error' && <p className="type-body-sm font-semibold">{state.message}</p>}
      </div>
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className="type-body-sm font-semibold">
          E-Mail oder Benutzername
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
          defaultValue={state.status === 'error' ? state.email : undefined}
          aria-invalid={fieldError('email') ? true : undefined}
          aria-describedby={fieldError('email') ? `${id}-email-error` : undefined}
          className="vt-input type-body"
        />
        {fieldError('email') && (
          <p id={`${id}-email-error`} className="type-body-sm text-error">
            {fieldError('email')}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-password`} className="type-body-sm font-semibold">
          Passwort
        </label>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          aria-invalid={fieldError('password') ? true : undefined}
          aria-describedby={fieldError('password') ? `${id}-password-error` : undefined}
          className="vt-input type-body"
        />
        {fieldError('password') && (
          <p id={`${id}-password-error`} className="type-body-sm text-error">
            {fieldError('password')}
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" fullWidth loading={pending}>
        Anmelden
      </Button>
    </form>
  );
}
