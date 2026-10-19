import type { Metadata } from 'next';
import { createExerciseAction } from '@/app/admin/training-actions';
import { AdminPageHeader } from '@/components/admin/states';
import { ExerciseForm } from '@/components/admin/training/exercise-form';
import { requirePagePermission } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Übung anlegen' };

export default async function NewExercisePage() {
  await requirePagePermission('training.exercises.write', '/admin/training/uebungen/neu');
  return (
    <>
      <AdminPageHeader
        title="Übung anlegen"
        description="Nur die Übung selbst – Sätze, Wiederholungen und Pausen legst du im Trainingsplan fest."
      />
      <ExerciseForm action={createExerciseAction} submitLabel="Übung anlegen" />
    </>
  );
}
