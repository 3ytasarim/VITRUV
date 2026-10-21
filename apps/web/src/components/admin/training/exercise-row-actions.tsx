'use client';

import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteExerciseAction } from '@/app/admin/training-actions';
import { ConfirmDialog } from '@/components/admin/management/confirm-dialog';
import { Button } from '@/components/ui';

/**
 * Edit / delete for one library exercise (list rows and the detail page). Delete asks first and
 * says when the exercise is part of client plans (it is removed there, too). The API refuses
 * exercises that already have training history — the message suggests deactivating instead.
 */
export function ExerciseRowActions({
  exerciseId,
  name,
  planCount,
  variant = 'row',
  afterDelete,
}: {
  exerciseId: string;
  name: string;
  planCount: number;
  variant?: 'row' | 'page';
  /** Where to go after deleting (detail page → list); rows just refresh. */
  afterDelete?: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const remove = () =>
    start(async () => {
      const result = await deleteExerciseAction(exerciseId);
      if (!result.ok) {
        setConfirm(false);
        setError(result.message);
        return;
      }
      setConfirm(false);
      if (afterDelete) router.push(afterDelete);
      else router.refresh();
    });

  return (
    <div className="vt-exactions">
      {variant === 'row' && (
        <Link
          href={`/admin/training/uebungen/${exerciseId}`}
          className="vt-plan__icon-btn"
          aria-label={`${name} bearbeiten`}
          title="Bearbeiten"
        >
          <Pencil aria-hidden className="size-4" />
        </Link>
      )}
      {variant === 'row' ? (
        <button
          type="button"
          className="vt-plan__icon-btn"
          aria-label={`${name} löschen`}
          title="Löschen"
          onClick={() => {
            setError(null);
            setConfirm(true);
          }}
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      ) : (
        <Button
          variant="secondary"
          icon={<Trash2 aria-hidden />}
          onClick={() => {
            setError(null);
            setConfirm(true);
          }}
        >
          Übung löschen
        </Button>
      )}
      {error && (
        <p role="alert" className="vt-exactions__error type-body-sm text-error">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirm}
        title="Übung löschen?"
        confirmLabel="Endgültig löschen"
        pending={pending}
        onCancel={() => setConfirm(false)}
        onConfirm={remove}
      >
        <p>
          <strong>{name}</strong> wird aus der Übungsbibliothek gelöscht.
          {planCount > 0 &&
            ` Sie ist in ${planCount} ${planCount === 1 ? 'Kundenplan' : 'Kundenplänen'} enthalten und wird dort ebenfalls entfernt.`}
        </p>
      </ConfirmDialog>
    </div>
  );
}
