import type { ReactNode } from 'react';
import { requirePagePermission } from '@/lib/auth/session';

/**
 * Website CMS area — ADMIN only. Other panel users (COACH) get 404; the navigation never links
 * here for them, and the API independently refuses every /v1/admin/website + /v1/admin/media call.
 */
export default async function WebsiteAdminLayout({ children }: { children: ReactNode }) {
  await requirePagePermission('website.content.read', '/admin/website');
  return children;
}
