import { ImageIcon, Plus, Video } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPageHeader, EmptyState, ErrorState } from '@/components/admin/states';
import { Badge, Button, ButtonLink, Card } from '@/components/ui';
import { requirePagePermission } from '@/lib/auth/session';
import { trainingApi } from '@/lib/training-api';

export const metadata: Metadata = { title: 'Übungen' };

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const STATUS = { aktiv: 'active', inaktiv: 'inactive', alle: 'all' } as const;

/** Shared exercise library (ADMIN + COACH). Simple name search; inactive ones on demand. */
export default async function ExercisesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePagePermission('training.exercises.read', '/admin/training/uebungen');
  const raw = await searchParams;
  const q = one(raw.q)?.slice(0, 100) ?? '';
  const statusKey = (one(raw.status) ?? 'aktiv') as keyof typeof STATUS;
  const status = STATUS[statusKey] ?? 'active';
  const result = await trainingApi.exercises({ q: q || undefined, status });
  const canWrite = user.permissions.includes('training.exercises.write');

  return (
    <>
      <AdminPageHeader
        title="Übungen"
        description="Gemeinsame Übungsbibliothek für alle Trainingspläne. Satz-, Wiederholungs- und Pausenvorgaben werden im jeweiligen Plan festgelegt."
        actions={
          canWrite ? (
            <ButtonLink
              href="/admin/training/uebungen/neu"
              variant="primary"
              icon={<Plus aria-hidden />}
            >
              Übung anlegen
            </ButtonLink>
          ) : undefined
        }
      />
      <form
        method="get"
        role="search"
        aria-label="Übungen suchen"
        className="mb-6 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="uebungen-q" className="type-body-sm font-semibold">
            Suche
          </label>
          <input
            id="uebungen-q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder="Name der Übung"
            className="vt-input type-body"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="uebungen-status" className="type-body-sm font-semibold">
            Status
          </label>
          <select
            id="uebungen-status"
            name="status"
            defaultValue={statusKey}
            className="vt-input type-body"
          >
            <option value="aktiv">Aktiv</option>
            <option value="inaktiv">Inaktiv</option>
            <option value="alle">Alle</option>
          </select>
        </div>
        <Button type="submit" variant="secondary">
          Suchen
        </Button>
      </form>
      {!result.ok ? (
        <ErrorState message="Die Übungen konnten nicht geladen werden." />
      ) : result.data.items.length === 0 ? (
        q || status !== 'active' ? (
          <EmptyState
            title="Keine Treffer"
            action={
              <ButtonLink href="/admin/training/uebungen" variant="secondary">
                Filter zurücksetzen
              </ButtonLink>
            }
          >
            Für diese Suche gibt es keine Übungen.
          </EmptyState>
        ) : (
          <EmptyState title="Noch keine Übungen">
            Lege die erste Übung an – sie steht danach allen Trainingsplänen zur Verfügung.
          </EmptyState>
        )
      ) : (
        <>
          <p className="type-body-sm mb-3 text-fg-muted" aria-live="polite">
            {result.data.items.length} {result.data.items.length === 1 ? 'Übung' : 'Übungen'}
          </p>
          <ul className="grid gap-3" aria-label="Übungen">
            {result.data.items.map((exercise) => (
              <li key={exercise.id}>
                <Card padding="sm" className="relative flex flex-wrap items-center gap-x-6 gap-y-2">
                  <Link
                    href={`/admin/training/uebungen/${exercise.id}`}
                    className="type-title min-w-0 flex-[1_1_14rem] truncate after:absolute after:inset-0 hover:text-accent-text"
                  >
                    {exercise.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={exercise.active ? 'success' : 'neutral'} dot>
                      {exercise.active ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                    {exercise.media ? (
                      <Badge tone="accent">
                        {exercise.media.kind === 'VIDEO' ? (
                          <Video aria-hidden className="size-3" />
                        ) : (
                          <ImageIcon aria-hidden className="size-3" />
                        )}
                        {exercise.media.kind === 'VIDEO' ? 'Video' : 'Bild'}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Kein Medium</Badge>
                    )}
                  </div>
                  <p className="type-body-sm text-fg-muted">
                    {exercise.usageCount === 1
                      ? '1 Verwendung'
                      : `${exercise.usageCount} Verwendungen`}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
