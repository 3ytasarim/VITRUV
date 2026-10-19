'use client';

import type { AdminProgram } from '@vitruv/contracts';
import { useActionState, useEffect, useRef } from 'react';
import type { TrainingResult } from '@/app/admin/training-actions';
import { FormField } from '@/components/admin/management/form-field';
import { Button } from '@/components/ui';

/** New DRAFT program for one client (title + optional start/end date); opens the builder. */
export function ProgramCreateForm({
  action,
}: {
  action: (
    prev: TrainingResult<AdminProgram> | null,
    form: FormData,
  ) => Promise<TrainingResult<AdminProgram>>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state && !state.ok) alertRef.current?.focus();
  }, [state]);
  const error = (field: string) => (state && !state.ok ? state.fieldErrors[field] : undefined);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div
        ref={alertRef}
        tabIndex={-1}
        role="alert"
        className={state && !state.ok ? 'rounded-xs border border-error px-4 py-3' : 'sr-only'}
      >
        {state && !state.ok && <p className="type-body-sm font-semibold">{state.message}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <FormField label="Titel des Plans" required error={error('title')}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="title"
              required
              maxLength={160}
              autoComplete="off"
              placeholder="z. B. Kraftaufbau Block 1"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="vt-input type-body"
            />
          )}
        </FormField>
        <FormField
          label="Start"
          error={error('startsOn')}
          hint="Optional – ab hier zählt die aktuelle Woche."
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="startsOn"
              type="date"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="vt-input type-body"
            />
          )}
        </FormField>
        <FormField label="Ende" error={error('endsOn')} hint="Optional – letzter Tag des Plans.">
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="endsOn"
              type="date"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="vt-input type-body"
            />
          )}
        </FormField>
      </div>
      <Button type="submit" variant="primary" loading={pending} className="self-start">
        Plan als Entwurf anlegen
      </Button>
    </form>
  );
}
