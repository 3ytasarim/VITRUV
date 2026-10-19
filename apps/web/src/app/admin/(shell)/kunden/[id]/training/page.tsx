import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ErrorState } from '@/components/admin/states';
import { PlanEditor } from '@/components/admin/training/plan-editor';
import { WorkoutHistory } from '@/components/admin/training/workout-history';
import { requirePagePermission } from '@/lib/auth/session';
import { trainingApi } from '@/lib/training-api';

export const metadata: Metadata = { title: 'Training · Kund:in' };

/**
 * Client workspace → Training: the dated plan (exercises dragged from the library, each with a
 * date and a note the client sees). Owner decision 2026-10-19: this replaces the week/day program
 * screens here (programs and their API stay untouched; existing data is kept). Earlier workout
 * sessions are still listed when there are any.
 */
export default async function ClientTrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePagePermission(
    'training.programs.read',
    `/admin/kunden/${id}/training`,
  );
  const canSeeWorkouts = user.permissions.includes('training.sessions.read');
  const [plan, exercises, workouts] = await Promise.all([
    trainingApi.plan(id),
    user.permissions.includes('training.exercises.read')
      ? trainingApi.exercises({ status: 'active' })
      : null,
    canSeeWorkouts ? trainingApi.workouts(id) : null,
  ]);
  if (!plan.ok && (plan.status === 404 || plan.status === 400)) notFound();
  if (!plan.ok) return <ErrorState message="Der Trainingsplan konnte nicht geladen werden." />;
  const sessions = workouts?.ok ? workouts.data.items : [];
  return (
    <div className="grid gap-8">
      <PlanEditor
        clientId={id}
        exercises={exercises?.ok ? exercises.data.items : []}
        initial={plan.data}
        canEdit={user.permissions.includes('training.programs.update')}
      />
      {sessions.length > 0 && <WorkoutHistory clientId={id} items={sessions} />}
    </div>
  );
}
