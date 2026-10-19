import type { AdminNutritionDocument } from '@vitruv/contracts';
import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatDate, formatDateTime } from '@/components/admin/management/labels';
import { NutritionStatusButton } from '@/components/admin/nutrition/nutrition-status-button';
import { NutritionUploadForm } from '@/components/admin/nutrition/nutrition-upload-form';
import { EmptyState, ErrorState } from '@/components/admin/states';
import { Badge, ButtonLink, Card, type BadgeTone } from '@/components/ui';
import { requirePagePermission } from '@/lib/auth/session';
import { nutritionApi } from '@/lib/nutrition-api';

export const metadata: Metadata = { title: 'Ernährung · Kund:in' };

const TONE: Record<AdminNutritionDocument['status'], BadgeTone> = {
  ACTIVE: 'success',
  DRAFT: 'accent',
  ARCHIVED: 'neutral',
};
const LABEL: Record<AdminNutritionDocument['status'], string> = {
  ACTIVE: 'Freigegeben',
  DRAFT: 'Entwurf',
  ARCHIVED: 'Archiviert',
};
const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/**
 * Meal plans (PDF) of one client: upload, release ("Freigeben" — exactly one ACTIVE plan; the
 * previous one is archived), withdraw, and every version as history. The client sees only the
 * ACTIVE plan in "Mein Training". Files are PRIVATE (served only through the authorised proxy).
 */
export default async function ClientNutritionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePagePermission(
    'nutrition.documents.read',
    `/admin/kunden/${id}/ernaehrung`,
  );
  const result = await nutritionApi.documents(id);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  const canWrite = user.permissions.includes('nutrition.documents.write');
  const canAssign = user.permissions.includes('nutrition.documents.assign');
  const items = result.ok ? result.data.items : null;
  const active = items?.find((d) => d.status === 'ACTIVE') ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="type-h3">Ernährungsplan</h2>
        <p className="type-body-sm text-fg-muted">
          Lade den Ernährungsplan als PDF hoch. Die Kund:in sieht nur den freigegebenen Plan in
          „Mein Training“ und kann ihn dort öffnen oder herunterladen.
        </p>
      </div>

      {active && (
        <Card tone="accent" padding="md" className="flex flex-wrap items-center gap-4">
          <FileText aria-hidden className="size-8 shrink-0 text-accent-text" />
          <div className="min-w-0 flex-[1_1_14rem]">
            <p className="type-body font-semibold break-words">
              Aktuell freigegeben: {active.title}
            </p>
            <p className="type-body-sm text-fg-muted">
              Version {active.versionNumber}
              {active.versionLabel ? ` · ${active.versionLabel}` : ''}
              {active.effectiveFrom ? ` · gültig ab ${formatDate(active.effectiveFrom)}` : ''}
            </p>
          </div>
          <ButtonLink
            href={`/admin/api/nutrition/file/${active.id}`}
            variant="secondary"
            prefetch={false}
          >
            PDF öffnen
          </ButtonLink>
        </Card>
      )}

      {canWrite && (
        <Card padding="md" className="flex flex-col gap-4">
          <h3 className="type-title">Neuen Plan hochladen</h3>
          <NutritionUploadForm clientId={id} canActivate={canAssign} />
        </Card>
      )}

      <section aria-labelledby="ernaehrung-versionen" className="flex flex-col gap-3">
        <h3 id="ernaehrung-versionen" className="type-title">
          Alle Versionen
        </h3>
        {items === null ? (
          <ErrorState message="Die Ernährungspläne konnten nicht geladen werden." />
        ) : items.length === 0 ? (
          <EmptyState title="Noch kein Ernährungsplan">Lade oben das erste PDF hoch.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {items.map((doc) => (
              <li key={doc.id}>
                <Card padding="sm" className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="min-w-0 flex-[1_1_16rem]">
                    <p className="type-body font-semibold break-words">
                      {doc.title}{' '}
                      <span className="type-body-sm font-normal text-fg-subtle">
                        · Version {doc.versionNumber}
                        {doc.versionLabel ? ` (${doc.versionLabel})` : ''}
                      </span>
                    </p>
                    <p className="type-body-sm text-fg-muted break-words">
                      {doc.file.fileName} · {size(doc.file.sizeBytes)} · hochgeladen{' '}
                      <time dateTime={doc.createdAt}>{formatDateTime(doc.createdAt)}</time>
                      {doc.uploadedBy ? ` von ${doc.uploadedBy.displayName}` : ''}
                      {doc.effectiveFrom ? ` · gültig ab ${formatDate(doc.effectiveFrom)}` : ''}
                    </p>
                  </div>
                  <Badge tone={TONE[doc.status]} dot>
                    {LABEL[doc.status]}
                  </Badge>
                  <div className="flex flex-wrap items-center gap-2">
                    <ButtonLink
                      href={`/admin/api/nutrition/file/${doc.id}`}
                      variant="ghost"
                      prefetch={false}
                    >
                      Öffnen
                    </ButtonLink>
                    {canAssign && doc.status !== 'ACTIVE' && (
                      <NutritionStatusButton clientId={id} documentId={doc.id} target="activate" />
                    )}
                    {canAssign && doc.status !== 'ARCHIVED' && (
                      <NutritionStatusButton clientId={id} documentId={doc.id} target="archive" />
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
