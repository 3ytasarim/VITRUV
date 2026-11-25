import type { WorkoutSessionExercise } from '@vitruv/contracts';
import { ArrowLeft, LineChart, MessageSquareText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDateTime } from '@/components/admin/management/labels';
import { ErrorState } from '@/components/admin/states';
import { ExerciseProgressChart } from '@/components/admin/training/training-progress';
import { Badge, Card, type BadgeTone } from '@/components/ui';
import { requirePagePermission } from '@/lib/auth/session';
import {
  SECTION_LABEL,
  WORKOUT_STATUS_LABEL,
  formatDuration,
  formatWorkoutDuration,
  prescriptionSummary,
} from '@/lib/training-format';
import { trainingApi } from '@/lib/training-api';
import { comparisonLines, resultLines } from '@/lib/workout-results';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: 'Trainingseinheit · Kund:in' };

const STATUS_TONE: Record<WorkoutSessionExercise['status'], BadgeTone> = {
  COMPLETED: 'success',
  SKIPPED: 'neutral',
  PENDING: 'warning',
};
const STATUS_LABEL: Record<WorkoutSessionExercise['status'], string> = {
  COMPLETED: 'Erledigt',
  SKIPPED: 'Übersprungen',
  PENDING: 'Offen',
};

/** What the client recorded for one exercise, in one line. */
function recorded(exercise: WorkoutSessionExercise): string | null {
  if (exercise.executionMode === 'SETS_REPS' && exercise.sets.length > 0) {
    const done = exercise.sets.filter((s) => s.completed).length;
    return `${done} von ${exercise.sets.length} Sätzen`;
  }
  if (exercise.actualReps !== null) return `${exercise.actualReps} Wdh.`;
  if (exercise.actualDurationSeconds !== null)
    return formatDuration(exercise.actualDurationSeconds);
  return null;
}

/**
 * One workout session of a client, read-only for Coach/Admin: which note the client wrote under
 * which exercise, the note on the whole session, and what was recorded. Values are the session
 * snapshot. Client scope is enforced by the API (other clients' sessions answer 404).
 * Sprint 7: the recorded values per set/round, the comparison with the previous comparable
 * workout and — on request (`?verlauf=<exerciseId>`) — the progress of one exercise.
 */
export default async function AdminWorkoutDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; sessionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, sessionId } = await params;
  const query = (await searchParams) ?? {};
  const verlauf =
    typeof query.verlauf === 'string' && UUID.test(query.verlauf) ? query.verlauf : null;
  await requirePagePermission(
    'training.sessions.read',
    `/admin/kunden/${id}/training/einheit/${sessionId}`,
  );
  const [result, comparison, progress] = await Promise.all([
    trainingApi.workout(id, sessionId),
    trainingApi.workoutComparison(id, sessionId),
    verlauf ? trainingApi.exerciseProgress(id, verlauf) : null,
  ]);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) return <ErrorState message="Die Trainingseinheit konnte nicht geladen werden." />;
  const session = result.data;
  const withNotes = session.exercises.filter((e) => e.clientNote).length;
  // The comparison is an addition: if it fails, the recorded summary below still shows.
  const compared = new Map(
    comparison.ok ? comparison.data.items.map((item) => [item.sessionExerciseId, item]) : [],
  );
  const base = `/admin/kunden/${id}/training/einheit/${sessionId}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/admin/kunden/${id}/training`}
          className="type-caption inline-flex min-h-12 items-center gap-2 self-start text-fg-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" /> Zurück zum Training
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="type-h3 break-words">
            Woche {session.weekOrder + 1} · Tag {session.dayOrder + 1} · {session.dayTitle}
          </h2>
          <Badge
            tone={
              session.status === 'COMPLETED'
                ? 'success'
                : session.status === 'IN_PROGRESS'
                  ? 'accent'
                  : 'neutral'
            }
            dot
          >
            {WORKOUT_STATUS_LABEL[session.status]}
          </Badge>
        </div>
        <p className="type-body-sm text-fg-muted">
          {session.programTitle} · gestartet{' '}
          <time dateTime={session.startedAt}>{formatDateTime(session.startedAt)}</time>
          {session.durationSeconds !== null
            ? ` · ${formatWorkoutDuration(session.durationSeconds)}`
            : ''}
          {` · ${session.progress.completed} von ${session.progress.total} Übungen erledigt`}
        </p>
        <p className="type-caption text-fg-subtle">
          Notizen der Kund:in – nur lesbar. {withNotes} von {session.exercises.length} Übungen haben
          eine Notiz.
        </p>
      </div>

      <Card padding="md" className="flex flex-col gap-2">
        <h3 className="type-title inline-flex items-center gap-2">
          <MessageSquareText aria-hidden className="size-5 text-accent-text" />
          Notiz zum ganzen Training
        </h3>
        {session.clientNote ? (
          <blockquote className="vt-note-quote type-body whitespace-pre-line break-words">
            {session.clientNote}
          </blockquote>
        ) : (
          <p className="type-body-sm text-fg-subtle">Keine Notiz.</p>
        )}
      </Card>

      <ol className="flex flex-col gap-3">
        {session.exercises.map((exercise, index) => {
          const previous = session.exercises[index - 1];
          const newSection =
            !previous ||
            previous.sectionOrder !== exercise.sectionOrder ||
            previous.sectionType !== exercise.sectionType;
          const done = recorded(exercise);
          const item = compared.get(exercise.id);
          const lines = item ? resultLines(item.current.result, item.repsMax) : [];
          const compare = item ? comparisonLines(item) : null;
          const showChart = item !== undefined && verlauf === item.exerciseId;
          return (
            <li
              key={exercise.id}
              id={`uebung-${exercise.id}`}
              className="flex scroll-mt-24 flex-col gap-3"
            >
              {newSection && (
                <h3 className="type-caption pt-2 text-accent-text">
                  {SECTION_LABEL[exercise.sectionType]}
                  {exercise.sectionTitle ? ` · ${exercise.sectionTitle}` : ''}
                </h3>
              )}
              <Card padding="sm" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <p className="type-body min-w-0 flex-[1_1_14rem] font-semibold break-words">
                    {exercise.name}
                  </p>
                  <Badge tone={STATUS_TONE[exercise.status]}>{STATUS_LABEL[exercise.status]}</Badge>
                </div>
                <p className="type-body-sm text-fg-muted">
                  Vorgabe: {prescriptionSummary(exercise.target) || '–'}
                  {done ? ` · Erfasst: ${done}` : ''}
                </p>
                {lines.length > 0 && (
                  <ul className="type-body-sm flex flex-col gap-0.5">
                    {lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                {compare && (
                  <div className="flex flex-col gap-1">
                    <p className="type-caption text-fg-subtle">
                      Vergleich
                      {item?.previous && (
                        <>
                          {' '}
                          mit{' '}
                          <time dateTime={item.previous.date}>
                            {formatDateTime(item.previous.date)}
                          </time>
                        </>
                      )}
                    </p>
                    <ul className="type-body-sm flex flex-col gap-0.5">
                      {compare.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {compare && item && !showChart && (
                  <Link
                    href={`${base}?verlauf=${item.exerciseId}#uebung-${exercise.id}`}
                    className="type-body-sm inline-flex min-h-12 items-center gap-2 self-start font-semibold text-accent-text underline"
                  >
                    <LineChart aria-hidden className="size-4" /> Verlauf anzeigen
                    <span className="sr-only">: {exercise.name}</span>
                  </Link>
                )}
                {showChart &&
                  (progress?.ok ? (
                    <ExerciseProgressChart progress={progress.data} />
                  ) : (
                    <p role="alert" className="type-body-sm text-error">
                      Der Verlauf konnte nicht geladen werden.
                    </p>
                  ))}
                {exercise.clientNote ? (
                  <div className="flex flex-col gap-1">
                    <p className="type-caption inline-flex items-center gap-1 text-fg-subtle">
                      <MessageSquareText aria-hidden className="size-4" /> Notiz der Kund:in
                      {exercise.clientNoteUpdatedAt && (
                        <>
                          {' · '}
                          <time dateTime={exercise.clientNoteUpdatedAt}>
                            {formatDateTime(exercise.clientNoteUpdatedAt)}
                          </time>
                        </>
                      )}
                    </p>
                    <blockquote className="vt-note-quote type-body-sm whitespace-pre-line break-words">
                      {exercise.clientNote}
                    </blockquote>
                  </div>
                ) : (
                  <p className="type-caption text-fg-subtle">Keine Notiz.</p>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
