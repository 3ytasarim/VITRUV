import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { updateExerciseAction } from '@/app/admin/training-actions';
import { ErrorState } from '@/components/admin/states';
import { ExerciseForm } from '@/components/admin/training/exercise-form';
import { ExerciseRowActions } from '@/components/admin/training/exercise-row-actions';
import { ExerciseStatusToggle } from '@/components/admin/training/exercise-status-toggle';
import { Badge, Card } from '@/components/ui';
import { requirePagePermission } from '@/lib/auth/session';
import { trainingApi } from '@/lib/training-api';

export const metadata: Metadata = { title: 'Übung' };

export default async function ExercisePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const user = await requirePagePermission(
    'training.exercises.read',
    `/admin/training/uebungen/${id}`,
  );
  const [result, categories] = await Promise.all([
    trainingApi.exercise(id),
    trainingApi.categories(),
  ]);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) return <ErrorState message="Die Übung konnte nicht geladen werden." />;
  const exercise = result.data;
  const canWrite = user.permissions.includes('training.exercises.write');
  const saved = (await searchParams).gespeichert === '1';
  return (
    <div className="max-w-measure-display">
      <Link
        href="/admin/training/uebungen"
        className="type-caption mb-4 inline-flex min-h-12 items-center gap-2 text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4" /> Alle Übungen
      </Link>
      <header className="mb-8 flex flex-col gap-3">
        <h1 className="type-h2 break-words">
          {exercise.code && <span className="mr-3 text-accent-text">{exercise.code}</span>}
          {exercise.name}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={exercise.active ? 'success' : 'neutral'} dot>
            {exercise.active ? 'Aktiv' : 'Inaktiv'}
          </Badge>
          <span className="type-body-sm text-fg-muted">
            {exercise.usageCount === 1
              ? '1 Verwendung in Plänen'
              : `${exercise.usageCount} Verwendungen in Plänen`}
          </span>
        </div>
        {saved && (
          <p role="status" className="type-body-sm rounded-xs border border-success px-4 py-3">
            Übung angelegt.
          </p>
        )}
      </header>
      <div className="grid gap-6">
        <Card padding="md">
          <h2 className="type-title mb-4">Übung bearbeiten</h2>
          {canWrite ? (
            <ExerciseForm
              action={updateExerciseAction.bind(null, exercise.id)}
              exercise={exercise}
              categories={categories.ok ? categories.data.items : []}
              submitLabel="Speichern"
            />
          ) : (
            <p className="type-body-sm text-fg-muted">Keine Berechtigung zum Bearbeiten.</p>
          )}
        </Card>
        {canWrite && (
          <Card padding="md">
            <h2 className="type-title mb-4">Status</h2>
            <ExerciseStatusToggle
              exerciseId={exercise.id}
              name={exercise.name}
              active={exercise.active}
              usageCount={exercise.usageCount}
            />
            <div className="mt-6 border-t border-border-subtle pt-6">
              <ExerciseRowActions
                exerciseId={exercise.id}
                name={exercise.name}
                planCount={exercise.planCount}
                variant="page"
                afterDelete="/admin/training/uebungen"
              />
              <p className="type-caption mt-2 text-fg-subtle">
                Löschen geht nur, solange die Übung noch nicht in Trainings verwendet wurde – sonst
                bitte deaktivieren.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
