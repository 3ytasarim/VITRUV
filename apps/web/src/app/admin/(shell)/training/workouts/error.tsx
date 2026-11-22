'use client';

import { ErrorState } from '@/components/admin/states';
import { Button } from '@/components/ui';

/** Unexpected rendering errors in the workout library (expected API failures render inline). */
export default function WorkoutLibraryError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Etwas ist schiefgelaufen"
      message="Die Seite konnte nicht angezeigt werden. Gespeicherte Workouts sind davon nicht betroffen."
      action={
        <Button variant="secondary" onClick={reset}>
          Erneut versuchen
        </Button>
      }
    />
  );
}
