import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ErrorState } from '@/components/admin/states';
import { PlanEditor } from '@/components/admin/training/plan-editor';
import { TrainingWeek } from '@/components/admin/training/training-week';
import { WorkoutHistory } from '@/components/admin/training/workout-history';
import { Badge } from '@/components/ui';
import { adminApi } from '@/lib/admin-api';
import { requirePagePermission } from '@/lib/auth/session';
import { trainingApi } from '@/lib/training-api';

export const metadata: Metadata = { title: 'Training · Kund:in' };

const berlinToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

/**
 * Client workspace → Training.
 *  1. "Trainingswoche" (Sprint 3): the canonical program (program → week → day → sections →
 *     exercises) the app executes; workouts come from the Workout-Bibliothek as independent copies.
 *  2. The older dated exercise list (client_plans, owner decision 2026-10-19) stays as it is — shown
 *     separately and clearly labelled; it is never converted silently and can not be started as a
 *     workout.
 *  3. Earlier workout sessions.
 */
export default async function ClientTrainingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const user = await requirePagePermission(
    'training.programs.read',
    `/admin/kunden/${id}/training`,
  );
  const woche =
    typeof query.woche === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.woche)
      ? query.woche
      : undefined;
  const canSeeWorkouts = user.permissions.includes('training.sessions.read');
  const canReadLibrary = user.permissions.includes('training.exercises.read');
  const canAssign =
    user.permissions.includes('training.templates.read') &&
    user.permissions.includes('training.programs.update');
  const [plan, week, client, exercises, categories, workouts] = await Promise.all([
    trainingApi.plan(id),
    trainingApi.clientWeek(id, woche),
    adminApi.client(id),
    canReadLibrary ? trainingApi.exercises({ status: 'active' }) : null,
    canReadLibrary ? trainingApi.categories() : null,
    canSeeWorkouts ? trainingApi.workouts(id) : null,
  ]);
  if (!plan.ok && (plan.status === 404 || plan.status === 400)) notFound();
  if (!plan.ok) return <ErrorState message="Der Trainingsplan konnte nicht geladen werden." />;
  const sessions = workouts?.ok ? workouts.data.items : [];
  const clientName = client.ok
    ? `${client.data.firstName} ${client.data.lastName}`.trim()
    : 'Teilnehmer:in';
  return (
    <div className="grid gap-10">
      {week.ok ? (
        <TrainingWeek
          week={week.data}
          clientId={id}
          clientName={clientName}
          today={berlinToday()}
          canAssign={canAssign}
        />
      ) : (
        <ErrorState message="Die Trainingswoche konnte nicht geladen werden. Bitte lade die Seite neu." />
      )}
      <section aria-labelledby="uebungsliste" className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="uebungsliste" className="type-h3">
            Übungsliste
          </h2>
          <Badge tone="neutral">Bisheriges Format</Badge>
        </div>
        <p className="type-body-sm text-fg-muted">
          Die bisherige Übungsliste mit Zeitraum und Notizen bleibt unverändert erhalten und wird
          separat angezeigt. Sie wird nicht automatisch in Workouts umgewandelt und kann in der App
          nicht als Workout gestartet werden.
        </p>
        <PlanEditor
          clientId={id}
          exercises={exercises?.ok ? exercises.data.items : []}
          categories={categories?.ok ? categories.data.items : []}
          initial={plan.data}
          canEdit={user.permissions.includes('training.programs.update')}
        />
      </section>
      {sessions.length > 0 && <WorkoutHistory clientId={id} items={sessions} />}
    </div>
  );
}
