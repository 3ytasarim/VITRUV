'use client';

import { Archive, ArchiveRestore, Copy, Pencil, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { duplicateTemplateAction, setTemplateArchivedAction } from '@/app/admin/workout-actions';
import { ConfirmDialog } from '@/components/admin/management/confirm-dialog';
import { Button, ButtonLink } from '@/components/ui';
import { AssignTemplateDialog } from './assign-template-dialog';

/**
 * Actions of one library template (card, list row and detail page): Vorlage bearbeiten,
 * Duplizieren, Teilnehmer zuweisen, Archivieren / Wiederherstellen. Archiving asks first and says
 * that assigned workouts stay untouched.
 */
export function TemplateActions({
  template,
  today,
  canAssign,
  variant = 'row',
}: {
  template: { id: string; title: string; archivedAt: string | null };
  today: string;
  canAssign: boolean;
  variant?: 'row' | 'page';
}) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [pending, start] = useTransition();
  const archived = Boolean(template.archivedAt);

  const duplicate = () =>
    start(async () => {
      setFeedback(null);
      const result = await duplicateTemplateAction(template.id);
      if (!result.ok) {
        setFeedback({ tone: 'error', text: result.message });
        return;
      }
      router.push(`/admin/training/workouts/${result.data.id}?dupliziert=1`);
    });

  const setArchived = (next: boolean) =>
    start(async () => {
      setFeedback(null);
      const result = await setTemplateArchivedAction(template.id, next);
      setConfirmArchive(false);
      if (!result.ok) {
        setFeedback({ tone: 'error', text: result.message });
        return;
      }
      setFeedback({
        tone: 'success',
        text: next ? 'Vorlage archiviert.' : 'Vorlage wiederhergestellt.',
      });
      router.refresh();
    });

  const size = variant === 'row' ? undefined : 'md';
  return (
    <div className="vt-workout__card-actions">
      {variant === 'row' && !archived && (
        <ButtonLink
          href={`/admin/training/workouts/${template.id}`}
          variant="ghost"
          size={size}
          icon={<Pencil aria-hidden />}
        >
          Vorlage bearbeiten
        </ButtonLink>
      )}
      <Button
        variant="ghost"
        icon={<Copy aria-hidden />}
        onClick={duplicate}
        loading={pending && !confirmArchive}
        aria-label={`${template.title} duplizieren`}
      >
        Duplizieren
      </Button>
      {canAssign && !archived && (
        <Button
          variant={variant === 'page' ? 'primary' : 'ghost'}
          icon={<UserPlus aria-hidden />}
          onClick={() => setAssignOpen(true)}
          aria-label={`${template.title} Teilnehmer zuweisen`}
        >
          Teilnehmer zuweisen
        </Button>
      )}
      {archived ? (
        <Button
          variant="ghost"
          icon={<ArchiveRestore aria-hidden />}
          onClick={() => setArchived(false)}
          disabled={pending}
        >
          Wiederherstellen
        </Button>
      ) : (
        <Button
          variant="ghost"
          icon={<Archive aria-hidden />}
          onClick={() => setConfirmArchive(true)}
          disabled={pending}
          aria-label={`${template.title} archivieren`}
        >
          Archivieren
        </Button>
      )}
      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`type-body-sm basis-full ${feedback.tone === 'error' ? 'text-error' : 'text-success'}`}
        >
          {feedback.text}
        </p>
      )}
      <ConfirmDialog
        open={confirmArchive}
        title="Vorlage archivieren?"
        confirmLabel="Archivieren"
        pending={pending}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => setArchived(true)}
      >
        <p>
          <strong>{template.title}</strong> wird aus der Bibliothek ausgeblendet und kann nicht mehr
          zugewiesen werden. Bereits zugewiesene Workouts und alle Trainingsergebnisse bleiben
          unverändert. Du kannst die Vorlage jederzeit wiederherstellen.
        </p>
      </ConfirmDialog>
      {canAssign && (
        <AssignTemplateDialog
          open={assignOpen}
          template={template}
          defaultDate={today}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </div>
  );
}
