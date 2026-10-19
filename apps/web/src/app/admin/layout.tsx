import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AccessDenied } from '@/components/auth/access-denied';
import { PORTAL_PATH } from '@/lib/auth/cookies';
import { requireAdminUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · VITRUV Admin' },
  robots: { index: false, follow: false },
};

/**
 * Admin root (also wraps the full-width CMS previews outside the `(shell)` group).
 * Access: a valid session (proxy + API-verified user) with the `admin.access` permission —
 * ADMIN and COACH; CLIENT accounts are sent to their own area (/mein-training). This is the UX layer: every admin API call
 * is authorised again by the API with the user's real permissions.
 * Never indexed (metadata + X-Robots-Tag), never cached (proxy sets no-store).
 */
export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const { user, allowed } = await requireAdminUser();
  if (!allowed && user.permissions.includes('training.self.read')) redirect(PORTAL_PATH);
  if (!allowed) return <AccessDenied />;
  return children;
}
