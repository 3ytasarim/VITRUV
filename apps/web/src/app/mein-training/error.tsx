'use client';

import { ErrorState } from '@/components/admin/states';
import { Button } from '@/components/ui';

/** Unexpected rendering errors in the client area (expected API failures render inline). */
export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Etwas ist schiefgelaufen"
      message="Die Seite konnte nicht angezeigt werden. Deine gespeicherten Einträge sind davon nicht betroffen."
      action={
        <Button variant="secondary" onClick={reset}>
          Erneut versuchen
        </Button>
      }
    />
  );
}
