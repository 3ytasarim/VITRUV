'use client';

import type { AdminClientDetail } from '@vitruv/contracts';
import { COACHING_STATUSES, INTERNAL_NOTES_MAX_LENGTH } from '@vitruv/shared';
import { useActionState, useEffect, useRef } from 'react';
import type { FormState } from '@/app/admin/management-actions';
import { Button } from '@/components/ui';
import { FormField, FormStatus } from './form-field';
import { COACHING_LABEL } from './labels';

const INITIAL: FormState = { status: 'idle' };

/**
 * Profile edit (name, phone, coaching status, internal notes). Role and e-mail are deliberately
 * not editable here. Simple text edits need no confirmation.
 */
export function ClientProfileForm({
  client,
  action,
}: {
  client: AdminClientDetail;
  action: (prev: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status !== 'idle') statusRef.current?.focus();
  }, [state]);
  const error = (field: string) =>
    state.status === 'error' ? state.fieldErrors?.[field] : undefined;

  return (
    <form action={formAction} noValidate className="flex max-w-measure flex-col gap-5">
      <FormStatus state={state} success="Profil gespeichert." focusRef={statusRef} />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Vorname" required error={error('firstName')}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="firstName"
              required
              maxLength={80}
              defaultValue={client.firstName}
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
              defaultValue={client.lastName}
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="vt-input type-body"
            />
          )}
        </FormField>
      </div>
      <FormField label="Telefon" error={error('phone')}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            name="phone"
            type="tel"
            inputMode="tel"
            maxLength={40}
            defaultValue={client.phone ?? ''}
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className="vt-input type-body"
          />
        )}
      </FormField>
      <FormField label="Coaching-Status" required error={error('coachingStatus')}>
        {({ id, describedBy, invalid }) => (
          <select
            id={id}
            name="coachingStatus"
            defaultValue={client.coachingStatus}
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
      <FormField
        label="Notiz für die Kund:in"
        error={error('internalNotes')}
        hint={`Erscheint im Kundenkonto direkt unter der Begrüßung. Reiner Text, höchstens ${INTERNAL_NOTES_MAX_LENGTH} Zeichen.`}
      >
        {({ id, describedBy, invalid }) => (
          <textarea
            id={id}
            name="internalNotes"
            rows={5}
            maxLength={INTERNAL_NOTES_MAX_LENGTH}
            defaultValue={client.internalNotes ?? ''}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className="vt-input type-body"
          />
        )}
      </FormField>
      <Button type="submit" variant="primary" loading={pending} className="self-start">
        Profil speichern
      </Button>
    </form>
  );
}
