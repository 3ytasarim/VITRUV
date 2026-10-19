'use client';

import type { AdminCoach } from '@vitruv/contracts';
import { useActionState, useEffect, useRef } from 'react';
import type { FormState } from '@/app/admin/management-actions';
import { Button } from '@/components/ui';
import { FormField, FormStatus } from './form-field';

const INITIAL: FormState = { status: 'idle' };

/** Internal coach profile edit (not the public About text — that stays in the CMS). */
export function CoachProfileForm({
  coach,
  action,
}: {
  coach: AdminCoach;
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
      <FormField label="Anzeigename" required error={error('displayName')}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            name="displayName"
            required
            maxLength={120}
            defaultValue={coach.displayName}
            autoComplete="off"
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
            defaultValue={coach.phone ?? ''}
            autoComplete="off"
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
