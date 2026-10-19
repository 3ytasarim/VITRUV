'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setExerciseActiveAction } from '@/app/admin/training-actions';
import { ConfirmDialog } from '@/components/admin/management/confirm-dialog';
import { Button } from '@/components/ui';

/** Deactivate (confirmed) / reactivate. Exercises are never hard-deleted. */
export function ExerciseStatusToggle({
  exerciseId,
  name,
  active,
  usageCount,
}: {
  exerciseId: string;
  name: string;
  active: boolean;
  usageCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  const run = (next: boolean) =>
    startTransition(async () => {
      const result = await setExerciseActiveAction(exerciseId, next);
      setOpen(false);
      setMessage(result.ok ? (next ? 'Übung reaktiviert.' : 'Übung deaktiviert.') : result.message);
      router.refresh();
    });

  return (
    <div className="flex flex-col items-start gap-3">
      <p className="type-body-sm text-fg-muted">
        {active
          ? 'Aktiv – kann neuen Plänen hinzugefügt werden.'
          : 'Inaktiv – bestehende Pläne behalten die Übung, neue Zuweisungen sind nicht möglich.'}
      </p>
      {active ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Übung deaktivieren
        </Button>
      ) : (
        <Button variant="secondary" loading={pending} onClick={() => run(true)}>
          Übung reaktivieren
        </Button>
      )}
      <p role="status" aria-live="polite" className="type-body-sm">
        {message}
      </p>
      <ConfirmDialog
        open={open}
        title="Übung deaktivieren?"
        confirmLabel="Deaktivieren"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => run(false)}
      >
        <p>
          „{name}“ wird in der Auswahl nicht mehr angeboten.
          {usageCount > 0
            ? ` Die ${usageCount} bestehenden Verwendungen in Plänen bleiben unverändert.`
            : ''}
        </p>
      </ConfirmDialog>
    </div>
  );
}
