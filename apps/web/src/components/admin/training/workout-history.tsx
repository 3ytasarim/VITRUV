import type { WorkoutSessionSummary } from '@vitruv/contracts';
import { ChevronRight, MessageSquareText } from 'lucide-react';
import { formatDateTime } from '@/components/admin/management/labels';
import { EmptyState, ErrorState } from '@/components/admin/states';
import { Badge, CardLink, type BadgeTone } from '@/components/ui';
import { WORKOUT_STATUS_LABEL, formatWorkoutDuration } from '@/lib/training-format';

const TONE: Record<WorkoutSessionSummary['status'], BadgeTone> = {
  IN_PROGRESS: 'accent',
  COMPLETED: 'success',
  ABANDONED: 'neutral',
};

/**
 * Read-only workout summaries of one client (Sprint 7): what was trained, when, how long and how
 * much of it, and how many notes the client wrote. Each row opens the session (notes per
 * exercise). Values are the session snapshots — later plan edits do not change this list.
 */
export function WorkoutHistory({
  clientId,
  items,
}: {
  clientId: string;
  items: WorkoutSessionSummary[] | null;
}) {
  return (
    <section aria-labelledby="trainingsverlauf" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="trainingsverlauf" className="type-title">
          Trainingsverlauf
        </h2>
        <p className="type-body-sm text-fg-muted">
          Einheiten der Kund:in aus „Mein Training“ – mit ihren Notizen zu den Übungen. Laufende
          Einheiten behalten ihre Vorgaben, auch wenn du den aktiven Plan änderst.
        </p>
      </div>
      {items === null ? (
        <ErrorState message="Der Trainingsverlauf konnte nicht geladen werden." />
      ) : items.length === 0 ? (
        <EmptyState title="Noch keine Trainingseinheit">
          Sobald die Kund:in ein Training startet, erscheint es hier.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {items.map((session) => {
            const open =
              session.exercisesTotal - session.exercisesCompleted - session.exercisesSkipped;
            return (
              <li key={session.id}>
                <CardLink
                  href={`/admin/kunden/${clientId}/training/einheit/${session.id}`}
                  padding="sm"
                  className="flex flex-wrap items-center gap-x-6 gap-y-2"
                >
                  <div className="min-w-0 flex-[1_1_16rem]">
                    <p className="type-body font-semibold break-words">
                      Woche {session.weekOrder + 1} · Tag {session.dayOrder + 1} ·{' '}
                      {session.dayTitle}
                    </p>
                    <p className="type-caption text-fg-subtle break-words">
                      {session.programTitle}
                    </p>
                  </div>
                  <Badge tone={TONE[session.status]} dot>
                    {WORKOUT_STATUS_LABEL[session.status]}
                  </Badge>
                  <p className="type-body-sm text-fg-muted">
                    <time dateTime={session.startedAt}>{formatDateTime(session.startedAt)}</time>
                    {session.durationSeconds !== null
                      ? ` · ${formatWorkoutDuration(session.durationSeconds)}`
                      : ''}
                    {` · ${session.exercisesCompleted} von ${session.exercisesTotal} Übungen`}
                    {session.exercisesSkipped > 0
                      ? ` · ${session.exercisesSkipped} übersprungen`
                      : ''}
                    {session.status !== 'IN_PROGRESS' && open > 0 ? ` · ${open} offen` : ''}
                  </p>
                  {session.notesCount > 0 && (
                    <span className="type-body-sm inline-flex items-center gap-1 font-semibold text-accent-text">
                      <MessageSquareText aria-hidden className="size-4" />
                      {session.notesCount === 1 ? '1 Notiz' : `${session.notesCount} Notizen`}
                    </span>
                  )}
                  <ChevronRight aria-hidden className="ml-auto size-4 shrink-0 text-fg-subtle" />
                </CardLink>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
