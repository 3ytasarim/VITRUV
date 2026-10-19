'use client';

import { useActionState, useEffect, useRef } from 'react';
import {
  createCoachAction,
  type ActivationLink,
  type FormState,
} from '@/app/admin/management-actions';
import { Button, ButtonLink } from '@/components/ui';
import { ActivationLinkPanel } from './activation-link-panel';
import { FormField, FormStatus } from './form-field';

type Created = { coachId: string; name: string; activation: ActivationLink };
const INITIAL: FormState<Created> = { status: 'idle' };

/** New coach account (role COACH, set by the server). The coach chooses their own password. */
export function CoachCreateForm() {
  const [state, action, pending] = useActionState(createCoachAction, INITIAL);
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === 'error') statusRef.current?.focus();
  }, [state]);

  if (state.status === 'success') {
    return (
      <div className="flex flex-col gap-6">
        <p role="status" className="type-body">
          Coach <strong>{state.data.name}</strong> wurde angelegt.
        </p>
        <ActivationLinkPanel
          url={state.data.activation.url}
          expiresAt={state.data.activation.expiresAt}
          personName={state.data.name}
        />
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/admin/coaches/${state.data.coachId}`} variant="primary">
            Zum Coach
          </ButtonLink>
          <ButtonLink href="/admin/coaches" variant="secondary">
            Zur Coach-Liste
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
      <FormField
        label="Anzeigename"
        required
        error={error('displayName')}
        hint="Intern sichtbar, z. B. in der Kundenliste. Kein öffentlicher Profiltext."
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            name="displayName"
            required
            maxLength={120}
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className="vt-input type-body"
          />
        )}
      </FormField>
      <FormField label="E-Mail" required error={error('email')} hint="Anmeldename des Coaches.">
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            name="email"
            type="email"
            inputMode="email"
            required
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
      <Button type="submit" variant="primary" loading={pending} className="self-start">
        Coach anlegen
      </Button>
    </form>
  );
}
