import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ErrorState } from '@/components/admin/states';
import { formatDateTime } from '@/components/admin/management/labels';
import { WorkoutSessionView } from '@/components/portal/workout-session-view';
import { Badge } from '@/components/ui';
import { PORTAL_PATH } from '@/lib/auth/cookies';
import { portalApi } from '@/lib/portal-api';
import { WORKOUT_STATUS_LABEL, formatWorkoutDuration } from '@/lib/training-format';

export const metadata: Metadata = { title: 'Training' };

const NOTICES: Record<string, string> = {
  laeuft:
    'Dieses Training läuft noch. Schließe es ab oder brich es ab, bevor du ein neues startest.',
  fertig: 'Training abgeschlossen – stark! Notizen kannst du weiterhin ergänzen.',
  abgebrochen: 'Training abgebrochen. Notizen kannst du weiterhin ergänzen.',
};

/** One own workout session (running or finished). Someone else's id answers 404. */
export default async function PortalSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ sessionId }, query] = await Promise.all([params, searchParams]);
  const result = await portalApi.workout(sessionId);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) return <ErrorState message="Das Training konnte nicht geladen werden." />;
  const session = result.data;
  const notice = typeof query.hinweis === 'string' ? NOTICES[query.hinweis] : undefined;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link
          href={session.dayId ? `${PORTAL_PATH}/tag/${session.dayId}` : PORTAL_PATH}
          className="type-caption inline-flex min-h-12 items-center gap-2 self-start text-fg-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" />{' '}
          {session.dayId ? 'Zum Trainingstag' : 'Zur Übersicht'}
        </Link>
        <p className="type-eyebrow text-accent-text">
          Woche {session.weekOrder + 1} · Tag {session.dayOrder + 1} · {session.programTitle}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="type-h2 break-words">{session.dayTitle}</h1>
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
          Gestartet <time dateTime={session.startedAt}>{formatDateTime(session.startedAt)}</time>
          {session.durationSeconds !== null
            ? ` · Dauer ${formatWorkoutDuration(session.durationSeconds)}`
            : ''}
        </p>
        {notice && (
          <p
            role="status"
            className="type-body-sm rounded-md border border-border-subtle bg-surface px-4 py-3"
          >
            {notice}
          </p>
        )}
      </div>
      <WorkoutSessionView key={session.id} session={session} />
    </>
  );
}
