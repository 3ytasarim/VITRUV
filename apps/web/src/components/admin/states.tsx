import { AlertTriangle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui';

/** Explicit empty state — never an ambiguous blank area. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card tone="outline" padding="lg" className="vt-empty flex flex-col items-start gap-3">
      <span className="vt-state-icon">
        <Inbox aria-hidden className="size-5" strokeWidth={1.6} />
      </span>
      <p className="type-title">{title}</p>
      {children && <div className="type-body-sm text-fg-muted">{children}</div>}
      {action}
    </Card>
  );
}

/** Error state with the API's message (safe, user-facing) and an optional retry/next step. */
export function ErrorState({
  title = 'Laden fehlgeschlagen',
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div role="alert">
      <Card tone="outline" padding="md" className="flex flex-col items-start gap-3">
        <span className="vt-state-icon vt-state-icon--error">
          <AlertTriangle aria-hidden className="size-5" strokeWidth={1.6} />
        </span>
        <p className="type-title">{title}</p>
        <p className="type-body-sm text-fg-muted">{message}</p>
        {action}
      </Card>
    </div>
  );
}

/** Skeleton rows while server data loads (used by loading.tsx). */
export function LoadingState({
  label = 'Wird geladen …',
  rows = 4,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div role="status" aria-live="polite" className="grid gap-3">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="vt-skeleton h-9 w-56" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="vt-skeleton h-20" />
      ))}
    </div>
  );
}

/** Page heading row for admin pages. */
export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border-subtle pb-6">
      <div className="max-w-measure-display">
        <h1 className="type-h2">{title}</h1>
        {description && <p className="type-body-sm mt-2 text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </header>
  );
}
