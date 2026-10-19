import type { Metadata } from 'next';
import { ActivationForm } from '@/components/auth/activation-form';
import { AuthShell, authLogo } from '@/components/auth/auth-shell';

export const metadata: Metadata = {
  title: 'Konto aktivieren',
  robots: { index: false, follow: false },
  // The page never forwards anything, but keep referrers off for defence in depth.
  referrer: 'no-referrer',
};

/** Public account activation (Coach and Client). Requires JavaScript to read the link fragment. */
export default async function ActivationPage() {
  return (
    <AuthShell
      logo={await authLogo()}
      statement={{ before: 'Dein Weg beginnt mit dem ', em: 'ersten Schritt.' }}
    >
      <ActivationForm />
      <noscript>
        <p className="type-body-sm text-fg-muted">Für die Aktivierung wird JavaScript benötigt.</p>
      </noscript>
    </AuthShell>
  );
}
