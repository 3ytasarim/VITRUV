import { clientListQuerySchema, type AdminClientListItem } from '@vitruv/contracts';
import { ACTIVATION_STATES, COACHING_STATUSES } from '@vitruv/shared';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountBadge, CoachingBadge } from '@/components/admin/management/status-badges';
import { ACTIVATION_LABEL, COACHING_LABEL, formatDate } from '@/components/admin/management/labels';
import { AdminPageHeader, EmptyState, ErrorState } from '@/components/admin/states';
import { Button, ButtonLink, Card } from '@/components/ui';
import { adminApi } from '@/lib/admin-api';
import { requirePagePermission } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Kund:innen' };

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

/**
 * Client list. ADMIN: everyone, with a coach filter. COACH: only their assigned clients (the API
 * scopes the query — the filter UI is a convenience, not the boundary). Offset pagination.
 */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePagePermission('clients.read', '/admin/kunden');
  const isAdmin = user.permissions.includes('clients.assign');
  const raw = await searchParams;
  const parsed = clientListQuerySchema.safeParse({
    q: one(raw.q) || undefined,
    coachingStatus: one(raw.status) || undefined,
    activation: one(raw.aktivierung) || undefined,
    coach: isAdmin ? one(raw.coach) || undefined : undefined,
    page: one(raw.seite) || undefined,
    pageSize: 20,
  });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: 20 };
  const [result, coaches] = await Promise.all([
    adminApi.clients(query),
    isAdmin ? adminApi.coachOptions() : Promise.resolve(null),
  ]);
  const filtered = Boolean(
    'q' in query && (query.q || query.coachingStatus || query.activation || query.coach),
  );

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const key of ['q', 'status', 'aktivierung', 'coach'] as const) {
      const value = one(raw[key]);
      if (value) params.set(key, value);
    }
    if (page > 1) params.set('seite', String(page));
    const qs = params.toString();
    return `/admin/kunden${qs ? `?${qs}` : ''}`;
  };

  return (
    <>
      <AdminPageHeader
        title="Kund:innen"
        description={
          isAdmin
            ? 'Alle Kund:innen mit Coach-Zuordnung, Coaching- und Kontostatus.'
            : 'Deine zugeordneten Kund:innen.'
        }
        actions={
          user.permissions.includes('clients.create') ? (
            <ButtonLink href="/admin/kunden/neu" variant="primary" icon={<Plus aria-hidden />}>
              Kund:in anlegen
            </ButtonLink>
          ) : undefined
        }
      />

      <form
        method="get"
        role="search"
        aria-label="Kund:innen filtern"
        className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kunden-q" className="type-body-sm font-semibold">
            Suche
          </label>
          <input
            id="kunden-q"
            name="q"
            type="search"
            defaultValue={one(raw.q)}
            maxLength={100}
            placeholder="Name oder E-Mail"
            className="vt-input type-body"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kunden-status" className="type-body-sm font-semibold">
            Coaching-Status
          </label>
          <select
            id="kunden-status"
            name="status"
            defaultValue={one(raw.status) ?? ''}
            className="vt-input type-body"
          >
            <option value="">Alle</option>
            {COACHING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {COACHING_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kunden-aktivierung" className="type-body-sm font-semibold">
            Aktivierung
          </label>
          <select
            id="kunden-aktivierung"
            name="aktivierung"
            defaultValue={one(raw.aktivierung) ?? ''}
            className="vt-input type-body"
          >
            <option value="">Alle</option>
            {ACTIVATION_STATES.map((state) => (
              <option key={state} value={state}>
                {ACTIVATION_LABEL[state]}
              </option>
            ))}
          </select>
        </div>
        {coaches?.ok && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="kunden-coach" className="type-body-sm font-semibold">
              Coach
            </label>
            <select
              id="kunden-coach"
              name="coach"
              defaultValue={one(raw.coach) ?? ''}
              className="vt-input type-body"
            >
              <option value="">Alle</option>
              <option value="none">Ohne Coach</option>
              {coaches.data.items.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" variant="secondary">
          Filtern
        </Button>
      </form>

      {!result.ok ? (
        <ErrorState message="Die Kundenliste konnte nicht geladen werden." />
      ) : result.data.total === 0 ? (
        filtered ? (
          <EmptyState
            title="Keine Treffer"
            action={
              <ButtonLink href="/admin/kunden" variant="secondary">
                Filter zurücksetzen
              </ButtonLink>
            }
          >
            Für diese Suche oder diesen Filter gibt es keine Kund:innen.
          </EmptyState>
        ) : (
          <EmptyState
            title={isAdmin ? 'Noch keine Kund:innen' : 'Dir sind noch keine Kund:innen zugeordnet'}
          >
            {user.permissions.includes('clients.create')
              ? 'Lege die erste Kund:in an – du erhältst danach einen einmaligen Aktivierungslink.'
              : 'Sobald dir die Administration Kund:innen zuordnet, erscheinen sie hier.'}
          </EmptyState>
        )
      ) : (
        <>
          <p className="type-body-sm mb-3 text-fg-muted" aria-live="polite">
            {result.data.total} {result.data.total === 1 ? 'Kund:in' : 'Kund:innen'}
          </p>
          <ul className="grid gap-3" aria-label="Kund:innen">
            {result.data.items.map((client) => (
              <ClientRow key={client.id} client={client} showCoach={isAdmin} />
            ))}
          </ul>
          <Pagination
            page={result.data.page}
            pageCount={Math.max(1, Math.ceil(result.data.total / result.data.pageSize))}
            href={pageHref}
          />
        </>
      )}
    </>
  );
}

function ClientRow({ client, showCoach }: { client: AdminClientListItem; showCoach: boolean }) {
  return (
    <li>
      <Card padding="sm" className="relative flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-[1_1_16rem]">
          <Link
            href={`/admin/kunden/${client.id}`}
            className="type-title block truncate after:absolute after:inset-0 hover:text-accent-text"
          >
            {client.firstName} {client.lastName}
          </Link>
          <p className="type-body-sm truncate text-fg-muted">{client.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CoachingBadge status={client.coachingStatus} />
          <AccountBadge account={client.account} />
        </div>
        <dl className="type-body-sm grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-fg-muted">
          {showCoach && (
            <>
              <dt>Coach</dt>
              <dd className="truncate text-fg">{client.coach?.displayName ?? 'Ohne Coach'}</dd>
            </>
          )}
          <dt>Angelegt</dt>
          <dd className="text-fg">{formatDate(client.createdAt)}</dd>
          <dt>Letzte Anmeldung</dt>
          <dd className="text-fg">{formatDate(client.account.lastLoginAt)}</dd>
        </dl>
      </Card>
    </li>
  );
}

function Pagination({
  page,
  pageCount,
  href,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Seiten" className="mt-6 flex flex-wrap items-center gap-3">
      {page > 1 && (
        <ButtonLink href={href(page - 1)} variant="secondary">
          Zurück
        </ButtonLink>
      )}
      <p className="type-body-sm text-fg-muted" aria-current="page">
        Seite {page} von {pageCount}
      </p>
      {page < pageCount && (
        <ButtonLink href={href(page + 1)} variant="secondary">
          Weiter
        </ButtonLink>
      )}
    </nav>
  );
}
