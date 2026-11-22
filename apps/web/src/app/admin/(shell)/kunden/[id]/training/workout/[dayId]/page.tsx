import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ErrorState } from '@/components/admin/states';
import { WorkoutEditor } from '@/components/admin/training/workout-editor';
import { Badge } from '@/components/ui';
import { adminApi } from '@/lib/admin-api';
import { requirePagePermission } from '@/lib/auth/session';
import { trainingApi } from '@/lib/training-api';
import { PROGRAM_STATUS_LABEL, WEEKDAY_LABEL } from '@/lib/training-format';

export const metadata: Metadata = { title: 'Für Teilnehmer bearbeiten' };

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** "Für Teilnehmer bearbeiten" — one client's own copy of a workout (never the template). */
export default async function ClientWorkoutPage({
  params,
}: {
  params: Promise<{ id: string; dayId: string }>;
}) {
  const { id, dayId } = await params;
  const user = await requirePagePermission(
    'training.programs.read',
    `/admin/kunden/${id}/training/workout/${dayId}`,
  );
  const [workout, client, capabilities] = await Promise.all([
    trainingApi.clientWorkout(dayId),
    adminApi.client(id),
    trainingApi.capabilities(),
  ]);
  if (!workout.ok && (workout.status === 404 || workout.status === 400)) notFound();
  if (!workout.ok) {
    return (
      <ErrorState message="Das Workout konnte nicht geladen werden. Bitte versuche es erneut." />
    );
  }
  const w = workout.data;
  if (w.clientId !== id) notFound();
  const clientName = client.ok
    ? `${client.data.firstName} ${client.data.lastName}`.trim()
    : 'Teilnehmer:in';
  const canEdit = user.permissions.includes('training.programs.update');
  return (
    <div className="grid gap-4">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow text-accent-text">Workout bearbeiten · {clientName}</p>
        <h2 className="type-h3">{w.title}</h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">
            Plan „{w.programTitle}“ · {PROGRAM_STATUS_LABEL[w.programStatus]}
          </Badge>
          <Badge tone="neutral">
            {w.date
              ? formatDate(w.date)
              : `Woche ${w.weekOrder + 1}${w.scheduledWeekday ? ` · ${WEEKDAY_LABEL[w.scheduledWeekday]}` : ''}`}
          </Badge>
          {w.sourceTemplate && (
            <Badge tone="accent">Kopie aus Vorlage · Version {w.sourceTemplate.version}</Badge>
          )}
        </div>
      </header>
      <WorkoutEditor
        key={w.version}
        target={{ kind: 'client', workout: w, clientName }}
        extendedTypes={capabilities.ok && capabilities.data.extendedExecutionTypes}
        cancelHref={`/admin/kunden/${id}/training`}
        readOnly={!canEdit}
      />
    </div>
  );
}
