import { brandIcon } from './brand-icon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

/** Home-screen icon (iOS) = the CMS logo (see brand-icon.tsx). */
export default function AppleIcon() {
  return brandIcon(180);
}
