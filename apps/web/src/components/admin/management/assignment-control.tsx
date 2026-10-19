'use client';

import type { CoachRef } from '@vitruv/contracts';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';
import type { FormState } from '@/app/admin/management-actions';
import { Button } from '@/components/ui';
import { ConfirmDialog } from './confirm-dialog';
import { FormStatus } from './form-field';

/**
 * ADMIN: change a client's coach. Confirmed deliberately — the previous coach loses access
 * immediately; the history is kept.
 */
export function AssignmentControl({
  current,
  coaches,
  clientName,
  assign,
}: {
  current: CoachRef | null;
  coaches: { id: string; displayName: string; active: boolean }[];
  clientName: string;
  assign: (coachId: string | null) => Promise<FormState>;
}) {
  const id = useId();
  const router = useRouter();
  const [selected, setSelected] = useState(current?.id ?? '');
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({ status: 'idle' });
  const statusRef = useRef<HTMLDivElement>(null);
  const target = coaches.find((coach) => coach.id === selected);
  const unchanged = selected === (current?.id ?? '');

  const run = () =>
    startTransition(async () => {
      const result = await assign(selected === '' ? null : selected);
      setOpen(false);
      setState(result);
      router.refresh();
      statusRef.current?.focus();
    });

  return (
    <div className="flex max-w-measure flex-col gap-4">
      <FormStatus state={state} success="Zuordnung geändert." focusRef={statusRef} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-coach`} className="type-body-sm font-semibold">
          Coach
        </label>
        <select
          id={`${id}-coach`}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="vt-input type-body"
          aria-describedby={`${id}-hint`}
        >
          <option value="">Kein Coach</option>
          {coaches.map((coach) => (
            <option
              key={coach.id}
              value={coach.id}
              disabled={!coach.active && coach.id !== current?.id}
            >
              {coach.displayName}
              {coach.active ? '' : ' (deaktiviert)'}
            </option>
          ))}
        </select>
        <p id={`${id}-hint`} className="type-caption text-fg-subtle">
          Aktuell: {current?.displayName ?? 'kein Coach'}. Der bisherige Coach verliert den Zugriff
          sofort; der Verlauf bleibt erhalten.
        </p>
      </div>
      <Button
        variant="secondary"
        disabled={unchanged}
        onClick={() => setOpen(true)}
        className="self-start"
      >
        Zuordnung ändern
      </Button>
      <ConfirmDialog
        open={open}
        title="Coach-Zuordnung ändern?"
        confirmLabel="Zuordnung ändern"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={run}
      >
        <p>
          {clientName} wird{' '}
          {target ? `${target.displayName} zugeordnet` : 'keinem Coach mehr zugeordnet'}.
          {current ? ` ${current.displayName} verliert den Zugriff sofort.` : ''}
        </p>
      </ConfirmDialog>
    </div>
  );
}
