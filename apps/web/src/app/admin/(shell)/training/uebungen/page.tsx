import { ImageIcon, Plus, Video } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPageHeader, EmptyState, ErrorState } from '@/components/admin/states';
import { Badge, Button, ButtonLink, Card } from '@/components/ui';
import { ExerciseRowActions } from '@/components/admin/training/exercise-row-actions';
import { requirePagePermission } from '@/lib/auth/session';
import { trainingApi } from '@/lib/training-api';

export const metadata: Metadata = { title: 'Übungen' };

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const STATUS = { aktiv: 'active', inaktiv: 'inactive', alle: 'all' } as const;

/**
 * Shared exercise library (ADMIN + COACH), grouped by category in catalogue order (codes) with
 * Erfassung / Standard per exercise. Search by name or code; inactive ones on demand.
 */
export default async function ExercisesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePagePermission('training.exercises.read', '/admin/training/uebungen');
  const raw = await searchParams;
  const q = one(raw.q)?.slice(0, 100) ?? '';
  const statusKey = (one(raw.status) ?? 'aktiv') as keyof typeof STATUS;
  const status = STATUS[statusKey] ?? 'active';
  const [result, categories] = await Promise.all([
    trainingApi.exercises({ q: q || undefined, status }),
    trainingApi.categories(),
  ]);
  const order = new Map(
    (categories.ok ? categories.data.items : []).map((c, i) => [c.id, i] as const),
  );
  const groups = result.ok
    ? [
        ...result.data.items
          .reduce((map, exercise) => {
            const key = exercise.category?.id ?? '';
            const group = map.get(key) ?? {
              key,
              name: exercise.category?.name ?? 'Ohne Kategorie',
              items: [] as typeof result.data.items,
            };
            group.items.push(exercise);
            return map.set(key, group);
          }, new Map<string, { key: string; name: string; items: typeof result.data.items }>())
          .values(),
      ].sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999))
    : [];
  const canWrite = user.permissions.includes('training.exercises.write');

  return (
    <>
      <AdminPageHeader
        title="Übungen"
        description="Gemeinsame Übungsbibliothek nach Kategorien – mit Code, Ausführung, Erfassung, Standard und Einsatz. Wiederholungen und Gewichte trägst du pro Kund:in im Plan ein."
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
            placeholder="Name oder Code (z. B. OK-01)"
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
          <div className="grid gap-8">
            {groups.map((group) => (
              <section key={group.key || 'none'} aria-labelledby={`kat-${group.key || 'none'}`}>
                <h2
                  id={`kat-${group.key || 'none'}`}
                  className="type-eyebrow mb-3 flex items-center gap-3 text-accent-text"
                >
                  {group.name}
                  <span className="type-caption text-fg-subtle">{group.items.length}</span>
                </h2>
                <ul className="grid gap-3">
                  {group.items.map((exercise) => (
                    <li key={exercise.id}>
                      <Card
                        padding="sm"
                        className="relative flex flex-wrap items-center gap-x-6 gap-y-2"
                      >
                        <span className="type-body-sm w-14 shrink-0 font-semibold text-accent-text tabular-nums">
                          {exercise.code ?? '—'}
                        </span>
                        <span className="flex min-w-0 flex-[1_1_14rem] flex-col">
                          <Link
                            href={`/admin/training/uebungen/${exercise.id}`}
                            className="type-title truncate after:absolute after:inset-0 hover:text-accent-text"
                          >
                            {exercise.name}
                          </Link>
                          {(exercise.captureType || exercise.standard) && (
                            <span className="type-caption truncate text-fg-subtle">
                              {[exercise.captureType, exercise.standard]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          )}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {!exercise.active && (
                            <Badge tone="neutral" dot>
                              Inaktiv
                            </Badge>
                          )}
                          {exercise.planCount > 0 && (
                            <Badge tone="neutral">
                              {exercise.planCount} {exercise.planCount === 1 ? 'Plan' : 'Pläne'}
                            </Badge>
                          )}
                          {exercise.media && (
                            <Badge tone="accent">
                              {exercise.media.kind === 'VIDEO' ? (
                                <Video aria-hidden className="size-3" />
                              ) : (
                                <ImageIcon aria-hidden className="size-3" />
                              )}
                              {exercise.media.kind === 'VIDEO' ? 'Video' : 'Bild'}
                            </Badge>
                          )}
                        </div>
                        {canWrite && (
                          <ExerciseRowActions
                            exerciseId={exercise.id}
                            name={exercise.name}
                            planCount={exercise.planCount}
                          />
                        )}
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
