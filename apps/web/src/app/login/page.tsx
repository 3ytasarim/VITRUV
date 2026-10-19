import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell, authLogo } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';
import { safeLoginNext, safeNextPath, safePortalPath } from '@/lib/auth/cookies';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Anmelden',
  robots: { index: false, follow: false },
};

const NOTICES: Record<string, string> = {
  abgemeldet: 'Du wurdest abgemeldet.',
  alle: 'Alle Sitzungen wurden beendet. Bitte melde dich erneut an.',
};

/**
 * Login for Admin/Coach and clients ("Mein Training") (restrained by design: two fields, one action) in the shared AuthShell split. There is no
 * "forgot password" flow yet — no e-mail provider exists, and nothing fake is offered.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeLoginNext(params.next);
  const user = await getCurrentUser();
  if (user?.permissions.includes('admin.access')) redirect(safeNextPath(next));
  if (user?.permissions.includes('training.self.read')) redirect(safePortalPath(next));
  const notice = typeof params.hinweis === 'string' ? NOTICES[params.hinweis] : undefined;

  return (
    <AuthShell
      logo={await authLogo()}
      statement={{ before: 'Willkommen zurück im ', em: 'Coaching.' }}
    >
      <div className="flex flex-col gap-2">
        <p className="type-eyebrow text-accent-text">VITRUV</p>
        <h1 className="type-h2">Anmelden</h1>
        <p className="type-body-sm text-fg-muted">
          Für Kund:innen (Mein Training) sowie Coach und Administration.
        </p>
      </div>
      {notice && (
        <p
          role="status"
          className="type-body-sm rounded-md border border-border-subtle bg-surface px-4 py-3"
        >
          {notice}
        </p>
      )}
      <LoginForm next={next} />
      <p className="type-caption text-fg-subtle">
        Passwort vergessen? Bitte wende dich an die Administration.
      </p>
    </AuthShell>
  );
}
