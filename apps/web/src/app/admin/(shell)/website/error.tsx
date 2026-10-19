'use client';

import { ErrorState } from '@/components/admin/states';
import { Button } from '@/components/ui';

/** Unexpected rendering errors in the website admin (expected API failures render inline). */
export default function WebsiteAdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Etwas ist schiefgelaufen"
      message="Die Seite konnte nicht angezeigt werden. Gespeicherte Inhalte sind davon nicht betroffen."
      action={
        <Button variant="secondary" onClick={reset}>
          Erneut versuchen
        </Button>
      }
    />
  );
}
