import type { AdminProgramSummary } from '@vitruv/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createProgramAction } from '@/app/admin/training-actions';
import { formatDate } from '@/components/admin/management/labels';
import { EmptyState, ErrorState } from '@/components/admin/states';
import { ProgramCreateForm } from '@/components/admin/training/program-create-form';
import { WorkoutHistory } from '@/components/admin/training/workout-history';
import { Badge, Card, type BadgeTone } from '@/components/ui';
import { requirePagePermission } from '@/lib/auth/session';
import { PROGRAM_STATUS_LABEL } from '@/lib/training-format';
import { trainingApi } from '@/lib/training-api';

export const metadata: Metadata = { title: 'Training · Kund:in' };

const TONE: Record<AdminProgramSummary['status'], BadgeTone> = {
  ACTIVE: 'success',
  DRAFT: 'accent',
  COMPLETED: 'neutral',
  ARCHIVED: 'neutral',
};

function ProgramList({
  title,
  items,
  clientId,
}: {
  title: string;
  items: AdminProgramSummary[];
  clientId: string;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={`programme-${title}`} className="flex flex-col gap-3">
      <h2 id={`programme-${title}`} className="type-title">
        {title}
      </h2>
      <ul className="grid gap-3">
        {items.map((program) => (
          <li key={program.id}>
            <Card padding="sm" className="relative flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link
                href={`/admin/kunden/${clientId}/training/${program.id}`}
                className="type-title min-w-0 flex-[1_1_14rem] truncate after:absolute after:inset-0 hover:text-accent-text"
              >
                {program.title}
              </Link>
              <Badge tone={TONE[program.status]} dot>
                {PROGRAM_STATUS_LABEL[program.status]}
              </Badge>
              <p className="type-body-sm text-fg-muted">
                {program.weekCount} {program.weekCount === 1 ? 'Woche' : 'Wochen'} ·{' '}
                {program.assignmentCount} {program.assignmentCount === 1 ? 'Übung' : 'Übungen'}
                {program.activatedAt ? ` · aktiv seit ${formatDate(program.activatedAt)}` : ''}
                {program.status === 'DRAFT' ? ` · geändert ${formatDate(program.updatedAt)}` : ''}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Client workspace → Training: the client's programs by lifecycle + "new draft". */
export default async function ClientTrainingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const user = await requirePagePermission(
    'training.programs.read',
    `/admin/kunden/${id}/training`,
  );
  const canSeeWorkouts = user.permissions.includes('training.sessions.read');
  const [result, workouts] = await Promise.all([
    trainingApi.programs(id),
    canSeeWorkouts ? trainingApi.workouts(id) : null,
  ]);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) return <ErrorState message="Die Trainingspläne konnten nicht geladen werden." />;
  const items = result.data.items;
  const deleted = (await searchParams).hinweis === 'geloescht';
  return (
    <div className="grid gap-8">
      {deleted && (
        <p role="status" className="type-body-sm rounded-xs border border-border-subtle px-4 py-3">
          Entwurf gelöscht.
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState title="Noch kein Trainingsplan">
          Lege einen Entwurf an. Die Kund:in sieht den Plan erst, wenn du ihn aktivierst.
        </EmptyState>
      ) : (
        <>
          <ProgramList
            title="Aktiver Plan"
            items={items.filter((p) => p.status === 'ACTIVE')}
            clientId={id}
          />
          <ProgramList
            title="Entwürfe"
            items={items.filter((p) => p.status === 'DRAFT')}
            clientId={id}
          />
          <ProgramList
            title="Abgeschlossen und archiviert"
            items={items.filter((p) => p.status === 'COMPLETED' || p.status === 'ARCHIVED')}
            clientId={id}
          />
          {!items.some((p) => p.status === 'ACTIVE') && (
            <p className="type-body-sm text-fg-muted">
              Aktuell ist kein Plan aktiv – die Kund:in sieht keinen Trainingsplan.
            </p>
          )}
        </>
      )}
      {workouts && (
        <WorkoutHistory clientId={id} items={workouts.ok ? workouts.data.items : null} />
      )}
      {user.permissions.includes('training.programs.create') && (
        <Card padding="md">
          <h2 className="type-title mb-4">Neuer Trainingsplan</h2>
          <ProgramCreateForm action={createProgramAction.bind(null, id)} />
        </Card>
      )}
    </div>
  );
}
