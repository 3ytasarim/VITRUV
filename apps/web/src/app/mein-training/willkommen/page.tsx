import { Clapperboard } from 'lucide-react';
import type { Metadata } from 'next';
import { ErrorState } from '@/components/admin/states';
import { WelcomeVideos } from '@/components/portal/welcome-videos';
import { portalApi } from '@/lib/portal-api';

export const metadata: Metadata = { title: 'Willkommen' };

/** Welcome videos for every client, grouped in the categories the admin created. */
export default async function PortalWelcomePage() {
  const result = await portalApi.welcome();
  const categories = result.ok ? result.data.categories : [];
  return (
    <>
      <div className="vt-phead">
        <p className="type-eyebrow text-accent-text">Willkommen</p>
        <h1 className="vt-phead__title">Schön, dass du da bist</h1>
        <p className="type-body text-fg-muted">
          Kurze Videos rund um dein Coaching – wähle oben eine Kategorie.
        </p>
      </div>
      {!result.ok ? (
        <ErrorState message="Die Videos konnten nicht geladen werden." />
      ) : categories.length === 0 ? (
        <div className="vt-pcard flex flex-col items-start gap-3">
          <span aria-hidden className="vt-pchip">
            <Clapperboard />
          </span>
          <h2 className="vt-pcard__title">Noch keine Videos</h2>
          <p className="type-body text-fg-muted">
            Sobald dein Coach Willkommensvideos bereitstellt, findest du sie hier.
          </p>
        </div>
      ) : (
        <WelcomeVideos categories={categories} />
      )}
    </>
  );
}
