import type { Metadata } from 'next';
import { AdminPageHeader } from '@/components/admin/states';
import { WorkoutEditor } from '@/components/admin/training/workout-editor';
import { requirePagePermission } from '@/lib/auth/session';
import { trainingApi } from '@/lib/training-api';

export const metadata: Metadata = { title: 'Neues Workout' };

export default async function NewWorkoutPage() {
  await requirePagePermission('training.templates.write', '/admin/training/workouts/neu');
  const capabilities = await trainingApi.capabilities();
  return (
    <>
      <AdminPageHeader
        title="Neues Workout"
        description="Name, Typ, Warm-up und Übungsblöcke mit Sätzen, Wiederholungen, MAX, Pausen oder Gesamtziel. Das Workout landet in deiner Workout-Bibliothek."
      />
      <WorkoutEditor
        target={{ kind: 'template-new' }}
        extendedTypes={capabilities.ok && capabilities.data.extendedExecutionTypes}
        cancelHref="/admin/training/workouts"
      />
    </>
  );
}
