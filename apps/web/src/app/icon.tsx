import { brandIcon } from './brand-icon';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';
// The logo is CMS content: render per request (the published home data itself is cached).
export const dynamic = 'force-dynamic';

/** Favicon = the CMS logo (see brand-icon.tsx). */
export default function Icon() {
  return brandIcon(64);
}
