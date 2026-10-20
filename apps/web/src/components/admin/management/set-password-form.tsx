'use client';

import { PASSWORD_MIN_LENGTH } from '@vitruv/shared';
import { useActionState, useEffect, useRef, useState } from 'react';
import type { FormState } from '@/app/admin/management-actions';
import { Button } from '@/components/ui';
import { FormField, FormStatus } from './form-field';
import { NewPasswordInput } from './new-password-input';

/**
 * Staff sets a new password for a client (told in person). On success every session of the
 * client ends; the form resets (new key) so the typed password does not stay on screen.
 */
export function SetPasswordForm({
  personName,
  action,
}: {
  personName: string;
  action: (prev: FormState, form: FormData) => Promise<FormState>;
}) {
  const [round, setRound] = useState(0);
  return (
    <SetPasswordInner
      key={round}
      personName={personName}
      action={action}
      onDone={() => setRound((n) => n + 1)}
    />
  );
}

function SetPasswordInner({
  personName,
  action,
  onDone,
}: {
  personName: string;
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, { status: 'idle' } as FormState);
  const saved = state.status === 'success';
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === 'success') {
      // show the confirmation, then offer a fresh, empty form again
      const timer = setTimeout(onDone, 4000);
      return () => clearTimeout(timer);
    }
    if (state.status === 'error') statusRef.current?.focus();
  }, [state, onDone]);

  const error = state.status === 'error' ? state.fieldErrors?.password : undefined;
  return (
    <form action={formAction} noValidate className="flex max-w-measure flex-col gap-4">
      <FormStatus
        state={state}
        success={`Neues Passwort gespeichert – ${personName} wurde auf allen Geräten abgemeldet.`}
        focusRef={statusRef}
      />
      {!saved && (
        <>
          <FormField
            label="Neues Passwort"
            required
            error={error}
            hint={`Mindestens ${PASSWORD_MIN_LENGTH} Zeichen. Teile es der Person persönlich mit.`}
          >
            {({ id, describedBy, invalid }) => (
              <NewPasswordInput id={id} describedBy={describedBy} invalid={invalid} />
            )}
          </FormField>
          <Button type="submit" variant="primary" loading={pending} className="self-start">
            Passwort setzen
          </Button>
        </>
      )}
    </form>
  );
}
