'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui';

/**
 * Deliberate confirmation for consequential actions (disable account, reassign coach).
 * Native modal <dialog>: focus is trapped, Escape cancels, focus starts on "Abbrechen" so Enter
 * never confirms by accident.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="vt-dialog vt-dialog--compact"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="flex flex-col gap-5 p-6">
        <h2 id={titleId} className="type-h3">
          {title}
        </h2>
        <div id={bodyId} className="type-body text-fg-muted">
          {children}
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={pending}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
