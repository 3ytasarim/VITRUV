import { WORKOUT_TEMPLATE_CATEGORIES, type WorkoutTemplateCategory } from '@vitruv/shared';
import { LayoutGrid, List, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPageHeader, EmptyState, ErrorState } from '@/components/admin/states';
import { TemplateActions } from '@/components/admin/training/template-actions';
import { Badge, Button, ButtonLink, Card, cx } from '@/components/ui';
import { requirePagePermission } from '@/lib/auth/session';
import { trainingApi } from '@/lib/training-api';
import { EXECUTION_TYPE_LABEL, TEMPLATE_CATEGORY_LABEL } from '@/lib/training-format';

export const metadata: Metadata = { title: 'Workout-Bibliothek' };

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const PAGE_SIZE = 24;
const berlinToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' }).format(
    new Date(iso),
  );

/**
 * Trainingsverwaltung → Workout-Bibliothek: the coach's own workout templates (ADMIN: all).
 * Server-side search, type filter and pagination — no artificial limit on the library itself.
 */
export default async function WorkoutLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requirePagePermission('training.templates.read', '/admin/training/workouts');
  const raw = await searchParams;
  const q = one(raw.q)?.slice(0, 120) ?? '';
  const typ = one(raw.typ);
  const category = (WORKOUT_TEMPLATE_CATEGORIES as readonly string[]).includes(typ ?? '')
    ? (typ as WorkoutTemplateCategory)
    : undefined;
  const archived = one(raw.status) === 'archiviert';
  const view = one(raw.ansicht) === 'liste' ? 'liste' : 'karten';
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(raw.seite) ?? '1', 10) || 1));
  const result = await trainingApi.templates({
    q: q || undefined,
    category,
    status: archived ? 'archived' : 'active',
    page,
    pageSize: PAGE_SIZE,
  });
  const canWrite = user.permissions.includes('training.templates.write');
  const canAssign = canWrite && user.permissions.includes('training.programs.update');
  const today = berlinToday();
  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      q: q || undefined,
      typ: category,
      status: archived ? 'archiviert' : undefined,
      ansicht: view === 'liste' ? 'liste' : undefined,
      seite: page > 1 ? String(page) : undefined,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const qs = params.toString();
    return `/admin/training/workouts${qs ? `?${qs}` : ''}`;
  };
  const pages = result.ok ? Math.max(1, Math.ceil(result.data.total / result.data.pageSize)) : 1;

  return (
    <>
      <AdminPageHeader
        title="Workout-Bibliothek"
        description="Deine Workout-Vorlagen: anlegen, duplizieren und Teilnehmer:innen zuweisen. Jede Zuweisung ist eine unabhängige Kopie – du kannst sie pro Teilnehmer:in anpassen, ohne die Vorlage zu ändern."
        actions={
          canWrite ? (
            <ButtonLink
              href="/admin/training/workouts/neu"
              variant="primary"
              icon={<Plus aria-hidden />}
            >
              Neues Workout
            </ButtonLink>
          ) : undefined
        }
      />
      <form
        method="get"
        role="search"
        aria-label="Workouts suchen"
        className="mb-6 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="workouts-q" className="type-body-sm font-semibold">
            Suche
          </label>
          <input
            id="workouts-q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={120}
            placeholder="Name oder Beschreibung"
            className="vt-input type-body"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="workouts-typ" className="type-body-sm font-semibold">
            Typ
          </label>
          <select
            id="workouts-typ"
            name="typ"
            defaultValue={category ?? ''}
            className="vt-input type-body"
          >
            <option value="">Alle Typen</option>
            {WORKOUT_TEMPLATE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {TEMPLATE_CATEGORY_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="workouts-status" className="type-body-sm font-semibold">
            Status
          </label>
          <select
            id="workouts-status"
            name="status"
            defaultValue={archived ? 'archiviert' : ''}
            className="vt-input type-body"
          >
            <option value="">Aktiv</option>
            <option value="archiviert">Archiviert</option>
          </select>
        </div>
        {view === 'liste' && <input type="hidden" name="ansicht" value="liste" />}
        <Button type="submit" variant="secondary">
          Suchen
        </Button>
      </form>

      {!result.ok ? (
        <ErrorState
          message="Die Workout-Bibliothek konnte nicht geladen werden. Bitte versuche es erneut."
          action={
            <ButtonLink href={href({})} variant="secondary">
              Erneut laden
            </ButtonLink>
          }
        />
      ) : result.data.items.length === 0 ? (
        q || category || archived || page > 1 ? (
          <EmptyState
            title="Keine Treffer"
            action={
              <ButtonLink href="/admin/training/workouts" variant="secondary">
                Filter zurücksetzen
              </ButtonLink>
            }
          >
            Für diese Auswahl gibt es keine Workouts.
          </EmptyState>
        ) : (
          <EmptyState
            title="Noch keine Workouts"
            action={
              canWrite ? (
                <ButtonLink
                  href="/admin/training/workouts/neu"
                  variant="primary"
                  icon={<Plus aria-hidden />}
                >
                  Neues Workout
                </ButtonLink>
              ) : undefined
            }
          >
            Lege dein erstes Workout an – z. B. „Oberkörper A“ mit Warm-up, Hauptteil und Abschluss.
          </EmptyState>
        )
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="type-body-sm text-fg-muted" aria-live="polite">
              {result.data.total} {result.data.total === 1 ? 'Workout' : 'Workouts'}
              {pages > 1 ? ` · Seite ${page} von ${pages}` : ''}
            </p>
            <div className="flex gap-1" role="group" aria-label="Ansicht">
              <Link
                href={href({ ansicht: undefined })}
                aria-current={view === 'karten' ? 'true' : undefined}
                className={cx('vt-plan__icon-btn', view === 'karten' && 'text-accent-text')}
                aria-label="Kartenansicht"
                title="Karten"
              >
                <LayoutGrid aria-hidden className="size-4" />
              </Link>
              <Link
                href={href({ ansicht: 'liste' })}
                aria-current={view === 'liste' ? 'true' : undefined}
                className={cx('vt-plan__icon-btn', view === 'liste' && 'text-accent-text')}
                aria-label="Listenansicht"
                title="Liste"
              >
                <List aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
          <ul className={view === 'karten' ? 'vt-workout__cards' : 'grid gap-3'}>
            {result.data.items.map((template) => (
              <li key={template.id}>
                <Card
                  padding="sm"
                  className={cx(
                    'flex h-full flex-col gap-3',
                    view === 'liste' && 'sm:flex-row sm:flex-wrap sm:items-center',
                  )}
                >
                  <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
                    <Link
                      href={`/admin/training/workouts/${template.id}`}
                      className="type-title truncate hover:text-accent-text"
                    >
                      {template.title}
                    </Link>
                    <span className="type-caption text-fg-subtle">
                      {template.exerciseCount} {template.exerciseCount === 1 ? 'Übung' : 'Übungen'}
                      {' · '}Version {template.version} · geändert {formatDate(template.updatedAt)}
                      {!template.ownedByMe ? ` · ${template.ownerName}` : ''}
                    </span>
                    {template.description && view === 'karten' && (
                      <p className="type-body-sm line-clamp-2 text-fg-muted">
                        {template.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {template.category && (
                      <Badge tone="accent">{TEMPLATE_CATEGORY_LABEL[template.category]}</Badge>
                    )}
                    {template.executionTypes.map((type) => (
                      <Badge key={type} tone="neutral">
                        {EXECUTION_TYPE_LABEL[type]}
                      </Badge>
                    ))}
                    {template.archivedAt && <Badge tone="warning">Archiviert</Badge>}
                  </div>
                  {canWrite && (
                    <TemplateActions template={template} today={today} canAssign={canAssign} />
                  )}
                </Card>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Seiten" className="mt-6 flex flex-wrap items-center gap-3">
              {page > 1 && (
                <ButtonLink href={href({ seite: String(page - 1) })} variant="secondary">
                  Zurück
                </ButtonLink>
              )}
              <span className="type-body-sm text-fg-muted">
                Seite {page} von {pages}
              </span>
              {page < pages && (
                <ButtonLink href={href({ seite: String(page + 1) })} variant="secondary">
                  Weiter
                </ButtonLink>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
