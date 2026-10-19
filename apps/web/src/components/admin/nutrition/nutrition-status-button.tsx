'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setNutritionStatusAction } from '@/app/admin/nutrition-actions';
import { Button } from '@/components/ui';

/** "Freigeben" / "Archivieren" for one meal-plan version. */
export function NutritionStatusButton({
  clientId,
  documentId,
  target,
}: {
  clientId: string;
  documentId: string;
  target: 'activate' | 'archive';
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={target === 'activate' ? 'primary' : 'ghost'}
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await setNutritionStatusAction(clientId, documentId, target);
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {target === 'activate' ? 'Freigeben' : 'Archivieren'}
      </Button>
      {error && (
        <span role="alert" className="type-body-sm text-error">
          {error}
        </span>
      )}
    </span>
  );
}
