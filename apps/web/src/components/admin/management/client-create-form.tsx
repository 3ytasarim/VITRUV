'use client';

import { COACHING_STATUSES } from '@vitruv/shared';
import { useActionState, useEffect, useRef } from 'react';
import {
  createClientAction,
  type ActivationLink,
  type FormState,
} from '@/app/admin/management-actions';
import { Button, ButtonLink } from '@/components/ui';
import { ActivationLinkPanel } from './activation-link-panel';
import { FormField, FormStatus } from './form-field';
import { COACHING_LABEL } from './labels';

type Created = { clientId: string; name: string; activation: ActivationLink };
const INITIAL: FormState<Created> = { status: 'idle' };

/**
 * New client: name, e-mail, optional phone, coaching status and — for ADMIN — the coach.
 * A COACH never chooses: the client is assigned to them (enforced by the API). No password and
 * no sensitive data are collected; the person sets their own password via the activation link.
 */
export function ClientCreateForm({
  coaches,
}: {
  /** ADMIN only: assignable coaches. `null` = the signed-in coach creates for themselves. */
  coaches: { id: string; displayName: string; active: boolean }[] | null;
}) {
  const [state, action, pending] = useActionState(createClientAction, INITIAL);
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === 'error') statusRef.current?.focus();
  }, [state]);

  if (state.status === 'success') {
    return (
      <div className="flex flex-col gap-6">
        <p role="status" className="type-body">
          Kund:in <strong>{state.data.name}</strong> wurde angelegt.
        </p>
        <ActivationLinkPanel
          url={state.data.activation.url}
          expiresAt={state.data.activation.expiresAt}
          personName={state.data.name}
        />
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/admin/kunden/${state.data.clientId}`} variant="primary">
            Zum Kundenprofil
          </ButtonLink>
          <ButtonLink href="/admin/kunden" variant="secondary">
            Zur Kundenliste
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
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="vt-input type-body"
            />
          )}
        </FormField>
      </div>
      <FormField
        label="E-Mail"
        required
        error={error('email')}
        hint="Anmeldename der Person. Später nicht änderbar."
      >
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
        Bitte keine Gesundheitsdaten erfassen. Nach dem Anlegen erhältst du einmalig einen
        Aktivierungslink für die Person.
      </p>
      <Button type="submit" variant="primary" loading={pending} className="self-start">
        Kund:in anlegen
      </Button>
    </form>
  );
}
