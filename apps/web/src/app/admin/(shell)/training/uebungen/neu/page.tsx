import type { Metadata } from 'next';
import { createExerciseAction } from '@/app/admin/training-actions';
import { AdminPageHeader } from '@/components/admin/states';
import { ExerciseForm } from '@/components/admin/training/exercise-form';
import { requirePagePermission } from '@/lib/auth/session';
import { trainingApi } from '@/lib/training-api';

export const metadata: Metadata = { title: 'Übung anlegen' };

export default async function NewExercisePage() {
  await requirePagePermission('training.exercises.write', '/admin/training/uebungen/neu');
  const categories = await trainingApi.categories();
  return (
    <>
      <AdminPageHeader
        title="Übung anlegen"
        description="Wie in der Übungsbibliothek: Kategorie, Code, Ausführung, Erfassung, Standard und Einsatz. Wiederholungen und Gewichte trägst du pro Kund:in im Plan als Notiz ein."
      />
      <ExerciseForm
        action={createExerciseAction}
        categories={categories.ok ? categories.data.items : []}
        submitLabel="Übung anlegen"
      />
    </>
  );
}
