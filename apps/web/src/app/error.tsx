'use client';

import { Button } from '@/components/ui';

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto grid max-w-measure-narrow place-content-center gap-6 px-4 py-(--section-space) text-center"
    >
      <h1 className="type-h2">Etwas ist schiefgelaufen.</h1>
      <p className="type-body text-fg-muted">Bitte versuche es erneut.</p>
      <Button onClick={reset} className="mx-auto">
        Erneut versuchen
      </Button>
    </div>
  );
}
