import { Download, FileText, Salad } from 'lucide-react';
import type { Metadata } from 'next';
import { formatDate } from '@/components/admin/management/labels';
import { ErrorState } from '@/components/admin/states';
import { ButtonLink } from '@/components/ui';
import { PORTAL_PATH } from '@/lib/auth/cookies';
import { portalApi } from '@/lib/portal-api';

export const metadata: Metadata = { title: 'Ernährung' };

const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/**
 * The client's current meal plan (the one ACTIVE PDF released by the coach). The PDF is a
 * private file: it is downloaded through the authorised portal proxy and opens in the device's
 * PDF viewer.
 */
export default async function PortalNutritionPage() {
  const result = await portalApi.nutrition();
  const doc = result.ok ? result.data.document : null;
  return (
    <>
      <div className="vt-phead">
        <p className="type-eyebrow text-accent-text">Ernährung</p>
        <h1 className="vt-phead__title">Dein Ernährungsplan</h1>
        <p className="type-body text-fg-muted">
          Von deinem Coach für dich erstellt. Neue Versionen erscheinen hier automatisch.
        </p>
      </div>
      {!result.ok ? (
        <ErrorState message="Dein Ernährungsplan konnte nicht geladen werden." />
      ) : !doc ? (
        <div className="vt-pcard flex flex-col items-start gap-3">
          <span aria-hidden className="vt-pchip">
            <Salad />
          </span>
          <h2 className="vt-pcard__title">Noch kein Ernährungsplan</h2>
          <p className="type-body text-fg-muted">
            Sobald dein Coach deinen Plan freigibt, kannst du ihn hier öffnen und herunterladen.
          </p>
        </div>
      ) : (
        <section className="vt-pcard vt-pdoc vt-rise" aria-labelledby="ernaehrung-titel">
          <span aria-hidden className="vt-pdoc__icon">
            <FileText />
            <span>PDF</span>
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 id="ernaehrung-titel" className="vt-pnext__title break-words">
              {doc.title}
            </h2>
            <p className="type-body-sm text-fg-muted">
              Version {doc.versionNumber}
              {doc.versionLabel ? ` · ${doc.versionLabel}` : ''}
              {doc.effectiveFrom ? ` · gültig ab ${formatDate(doc.effectiveFrom)}` : ''}
              {` · ${size(doc.file.sizeBytes)}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <ButtonLink
                href={`${PORTAL_PATH}/api/ernaehrung/${doc.id}`}
                variant="primary"
                icon={<Download aria-hidden />}
                prefetch={false}
              >
                PDF öffnen / herunterladen
              </ButtonLink>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
