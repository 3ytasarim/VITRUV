'use client';

import { UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import type { FormState } from '@/app/admin/management-actions';
import { Button } from '@/components/ui';
import { ConfirmDialog } from './confirm-dialog';
import { FormStatus } from './form-field';
import { formatDateTime } from './labels';

/**
 * "Kund:in entfernen" (owner request 2026-11-18, e.g. test clients): disables the account, ends
 * the coaching and hides the client from the list. Nothing is deleted — users are never
 * hard-deleted — so a removed client can be restored here.
 */
export function ArchiveControls({
  archivedAt,
  personName,
  setArchived,
}: {
  archivedAt: string | null;
  personName: string;
  setArchived: (archived: boolean) => Promise<FormState>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [state, setState] = useState<FormState>({ status: 'idle' });
  const statusRef = useRef<HTMLDivElement>(null);
  const removed = archivedAt !== null;

  const run = (archived: boolean) =>
    startTransition(async () => {
      const result = await setArchived(archived);
      setConfirm(false);
      if (result.status === 'success' && archived) {
        router.push('/admin/kunden');
        return;
      }
      setState(result);
      router.refresh();
      statusRef.current?.focus();
    });

  return (
    <div className="flex flex-col gap-4">
      {removed ? (
        <p className="type-body">
          Aus der Liste entfernt am {formatDateTime(archivedAt)}. Das Konto ist deaktiviert, alle
          Daten sind erhalten.
        </p>
      ) : (
        <p className="type-body-sm text-fg-muted">
          Z. B. für Test-Konten: {personName} wird abgemeldet, kann sich nicht mehr anmelden und
          verschwindet aus der Kundenliste. Trainingspläne, Ernährung und Verlauf bleiben
          gespeichert und lassen sich wiederherstellen.
        </p>
      )}
      <FormStatus
        state={state.status === 'error' ? state : { status: state.status }}
        success="Kund:in wiederhergestellt."
        focusRef={statusRef}
      />
      <div>
        {removed ? (
          <Button variant="secondary" loading={pending} onClick={() => run(false)}>
            Wiederherstellen
          </Button>
        ) : (
          <Button variant="secondary" icon={<UserX />} onClick={() => setConfirm(true)}>
            Kund:in entfernen
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title="Kund:in entfernen?"
        confirmLabel="Entfernen"
        pending={pending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => run(true)}
      >
        <p>
          {personName} wird sofort auf allen Geräten abgemeldet, das Konto deaktiviert und aus der
          Liste entfernt. Die Daten bleiben erhalten; unter „Entfernte Kund:innen“ lässt sich das
          rückgängig machen.
        </p>
      </ConfirmDialog>
    </div>
  );
}
