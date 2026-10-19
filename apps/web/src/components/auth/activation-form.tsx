'use client';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@vitruv/shared';
import { CheckCircle2, LinkIcon } from 'lucide-react';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import {
  activateAction,
  checkActivationAction,
  type ActivationCheck,
  type ActivationState,
} from '@/app/aktivieren/actions';
import { Button, ButtonLink } from '@/components/ui';

const INITIAL: ActivationState = { status: 'idle' };

/**
 * Reads the one-time token from the URL fragment (`#t=…` — fragments are never sent to servers
 * or written to access logs), removes it from the address bar and history right away, checks it,
 * then lets the person choose their password. The token stays only in memory.
 */
export function ActivationForm() {
  const id = useId();
  const [token, setToken] = useState<string | null>(null);
  const [check, setCheck] = useState<
    ActivationCheck | { status: 'checking' } | { status: 'missing' }
  >({ status: 'checking' });
  const [state, action, pending] = useActionState(activateAction, INITIAL);
  const focusRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get('t');
    window.history.replaceState(null, '', window.location.pathname);
    const verify = async () => {
      const result: ActivationCheck | { status: 'missing' } = fragment
        ? await checkActivationAction(fragment)
        : { status: 'missing' };
      setToken(fragment);
      setCheck(result);
    };
    void verify();
  }, []);

  useEffect(() => {
    if (state.status === 'error') focusRef.current?.focus();
    if (state.status === 'done' || state.status === 'invalid') headingRef.current?.focus();
  }, [state]);

  if (state.status === 'done') {
    return (
      <div role="status" className="flex flex-col items-start gap-4">
        <CheckCircle2 aria-hidden className="size-8 text-success" />
        <h1 ref={headingRef} tabIndex={-1} className="type-h2">
          Konto aktiviert
        </h1>
        {state.destination === 'PANEL' ? (
          <>
            <p className="type-body text-fg-muted">
              Du kannst dich jetzt mit deinem Passwort anmelden.
            </p>
            <ButtonLink href="/login" variant="primary">
              Zur Anmeldung
            </ButtonLink>
          </>
        ) : (
          <>
            <p className="type-body text-fg-muted">
              Dein Passwort ist gespeichert. Melde dich an, um deinen Trainingsplan zu sehen.
            </p>
            <ButtonLink href="/login?next=%2Fmein-training" variant="primary">
              Zu Mein Training
            </ButtonLink>
          </>
        )}
      </div>
    );
  }

  if (check.status === 'checking') {
    return (
      <p role="status" aria-live="polite" className="type-body text-fg-muted">
        Link wird geprüft …
      </p>
    );
  }

  if (check.status !== 'valid' || state.status === 'invalid' || !token) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4">
        <LinkIcon aria-hidden className="size-8 text-warning" />
        <h1 ref={headingRef} tabIndex={-1} className="type-h2">
          {check.status === 'error' ? 'Gerade nicht erreichbar' : 'Link nicht gültig'}
        </h1>
        <p className="type-body text-fg-muted">
          {check.status === 'error'
            ? 'Die Prüfung ist gerade nicht möglich. Bitte versuche es später erneut.'
            : 'Dieser Aktivierungslink ist ungültig, abgelaufen oder wurde bereits verwendet. Bitte bitte deinen Coach um einen neuen Link.'}
        </p>
      </div>
    );
  }

  const error = (field: 'password' | 'confirm') =>
    state.status === 'error' ? state.fieldErrors?.[field] : undefined;
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <h1 className="type-h2">Konto aktivieren</h1>
      <p className="type-body-sm text-fg-muted">
        Wähle dein eigenes Passwort. Mindestens {PASSWORD_MIN_LENGTH} Zeichen – Leerzeichen und
        Passphrasen sind erlaubt. Der Link funktioniert nur einmal.
      </p>
      <div
        ref={focusRef}
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
      <input type="hidden" name="token" value={token} />
      {/* Lets password managers save the new credential (username unknown here by design). */}
      <input type="text" name="username" autoComplete="username" hidden readOnly value="" />
      {(
        [
          ['password', 'Neues Passwort'],
          ['confirm', 'Passwort wiederholen'],
        ] as const
      ).map(([name, label]) => (
        <div key={name} className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-${name}`} className="type-body-sm font-semibold">
            {label}
          </label>
          <input
            id={`${id}-${name}`}
            name={name}
            type="password"
            autoComplete="new-password"
            required
            maxLength={PASSWORD_MAX_LENGTH}
            aria-invalid={error(name) ? true : undefined}
            aria-describedby={error(name) ? `${id}-${name}-error` : undefined}
            className="vt-input type-body"
          />
          {error(name) && (
            <p id={`${id}-${name}-error`} className="type-body-sm text-error">
              {error(name)}
            </p>
          )}
        </div>
      ))}
      <Button type="submit" variant="primary" fullWidth loading={pending}>
        Passwort festlegen
      </Button>
    </form>
  );
}
