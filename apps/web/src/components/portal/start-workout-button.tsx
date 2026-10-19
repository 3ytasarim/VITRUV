'use client';

import { Play } from 'lucide-react';
import { useState, useTransition } from 'react';
import { startWorkoutAction } from '@/app/mein-training/actions';
import { Button } from '@/components/ui';

/** Starts (or resumes) the workout of a day; the action opens the session page. */
export function StartWorkoutButton({ dayId, label }: { dayId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="primary"
        size="lg"
        icon={<Play aria-hidden />}
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await startWorkoutAction(dayId);
            if (!result.ok) setError(result.message);
          })
        }
      >
        {label}
      </Button>
      {error && (
        <p role="alert" className="type-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
