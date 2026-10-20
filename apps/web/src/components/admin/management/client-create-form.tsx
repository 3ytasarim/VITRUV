'use client';

import { COACHING_STATUSES, PASSWORD_MIN_LENGTH, usernameFromName } from '@vitruv/shared';
import { KeyRound } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';
import {
  createClientAction,
  type CreatedClient,
  type FormState,
} from '@/app/admin/management-actions';
import { ButtonLink, Button } from '@/components/ui';
import { FormField, FormStatus } from './form-field';
import { COACHING_LABEL } from './labels';
import { NewPasswordInput } from './new-password-input';

const INITIAL: FormState<CreatedClient> = { status: 'idle' };

/**
 * New client (owner decision 2026-10-20): name, a login name derived from it (editable), a
 * password the coach sets and tells the client in person, optional e-mail and phone, coaching
 * status and — with the coach team — the coach. No activation link and no e-mail is sent; the
 * client signs in at /login with username (or e-mail) + password. No health data is collected.
 */
export function ClientCreateForm({
  coaches,
}: {
  /** ADMIN only: assignable coaches. `null` = the signed-in coach creates for themselves. */
  coaches: { id: string; displayName: string; active: boolean }[] | null;
}) {
  const [state, action, pending] = useActionState(createClientAction, INITIAL);
  const statusRef = useRef<HTMLDivElement>(null);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  // The username follows the name until the coach edits it by hand.
  const [username, setUsername] = useState<string | null>(null);
  const suggested = first.trim() || last.trim() ? usernameFromName(first, last) : '';
  useEffect(() => {
    if (state.status === 'error') statusRef.current?.focus();
  }, [state]);

  if (state.status === 'success') {
    const created = state.data;
    return (
      <div className="flex flex-col gap-6">
        <p role="status" className="type-body">
          Kund:in <strong>{created.name}</strong> wurde angelegt.
        </p>
        <div className="vt-credentials">
          <KeyRound aria-hidden className="size-5 shrink-0 text-accent-text" />
          <div className="flex min-w-0 flex-col gap-2">
            <p className="type-body-sm font-semibold">Zugangsdaten für die Anmeldung</p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
              <dt className="type-body-sm text-fg-muted">Benutzername</dt>
              <dd className="type-body font-semibold break-all">{created.username}</dd>
              {created.email && (
                <>
                  <dt className="type-body-sm text-fg-muted">oder E-Mail</dt>
                  <dd className="type-body break-all">{created.email}</dd>
                </>
              )}
              <dt className="type-body-sm text-fg-muted">Passwort</dt>
              <dd className="type-body-sm text-fg-muted">wie eingegeben</dd>
            </dl>
            <p className="type-caption text-fg-subtle">
              Teile die Daten der Person persönlich mit. Anmeldung unter /login – das Passwort
              kannst du jederzeit im Reiter „Konto“ neu setzen.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/admin/kunden/${created.clientId}/training`} variant="primary">
            Trainingsplan anlegen
          </ButtonLink>
          <ButtonLink href={`/admin/kunden/${created.clientId}`} variant="secondary">
            Zum Kundenprofil
          </ButtonLink>
        </div>
      </div>
    );
  }

  const error = (field: string) =>
    state.status === 'error' ? state.fieldErrors?.[field] : undefined;
  return (
    <form action={action} noValidate className="flex max-w-measure flex-col gap-5">
      <FormStatus state={state} focusRef={statusRef} />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Vorname" required error={error('firstName')}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="firstName"
              required
              maxLength={80}
              autoComplete="off"
              value={first}
              onChange={(event) => setFirst(event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="vt-input type-body"
            />
          )}
        </FormField>
        <FormField label="Nachname" required error={error('lastName')}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="lastName"
              required
              maxLength={80}
              autoComplete="off"
              value={last}
              onChange={(event) => setLast(event.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="vt-input type-body"
            />
          )}
        </FormField>
      </div>
      <FormField
        label="Benutzername"
        required
        error={error('username')}
        hint="Wird aus Vor- und Nachname gebildet; ist er schon vergeben, hängt das System eine Zahl an."
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            name="username"
            required
            maxLength={32}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="vornamenachname"
            value={username ?? suggested}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className="vt-input type-body"
          />
        )}
      </FormField>
      <FormField
        label="Passwort"
        required
        error={error('password')}
        hint={`Mindestens ${PASSWORD_MIN_LENGTH} Zeichen. Du teilst es der Person persönlich mit.`}
      >
        {({ id, describedBy, invalid }) => (
          <NewPasswordInput id={id} describedBy={describedBy} invalid={invalid} />
        )}
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="E-Mail"
          error={error('email')}
          hint="Kann zusätzlich zur Anmeldung dienen."
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="email"
              type="email"
              inputMode="email"
              maxLength={254}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="vt-input type-body"
            />
          )}
        </FormField>
        <FormField label="Telefon" error={error('phone')}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="phone"
              type="tel"
              inputMode="tel"
              maxLength={40}
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="vt-input type-body"
            />
          )}
        </FormField>
      </div>
      {coaches && (
        <FormField
          label="Coach"
          error={error('coachId')}
          hint="Ohne Coach sieht nur die Administration die Person."
        >
          {({ id, describedBy, invalid }) => (
            <select
              id={id}
              name="coachId"
              defaultValue=""
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="vt-input type-body"
            >
              <option value="">Kein Coach</option>
              {coaches
                .filter((coach) => coach.active)
                .map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.displayName}
                  </option>
                ))}
            </select>
          )}
        </FormField>
      )}
      <FormField label="Coaching-Status" required error={error('coachingStatus')}>
        {({ id, describedBy, invalid }) => (
          <select
            id={id}
            name="coachingStatus"
            defaultValue="ACTIVE"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className="vt-input type-body"
          >
            {COACHING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {COACHING_LABEL[status]}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <p className="type-caption text-fg-subtle">
        Bitte keine Gesundheitsdaten erfassen. Es wird keine E-Mail verschickt – die Person meldet
        sich mit Benutzername (oder E-Mail) und Passwort an.
      </p>
      <Button type="submit" variant="primary" loading={pending} className="self-start">
        Kund:in anlegen
      </Button>
    </form>
  );
}
