'use client';

import { CalendarDays, History, LayoutDashboard, Salad } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PORTAL_PATH } from '@/lib/auth/cookies';

const ITEMS = [
  { href: PORTAL_PATH, label: 'Übersicht', short: 'Übersicht', icon: LayoutDashboard, exact: true },
  {
    href: `${PORTAL_PATH}/plan`,
    label: 'Trainingsplan',
    short: 'Training',
    icon: CalendarDays,
    extra: '/tag/',
  },
  { href: `${PORTAL_PATH}/ernaehrung`, label: 'Ernährung', short: 'Ernährung', icon: Salad },
  {
    href: `${PORTAL_PATH}/verlauf`,
    label: 'Verlauf',
    short: 'Verlauf',
    icon: History,
    extra: '/einheit/',
  },
] as const;

/**
 * Client area navigation: sidebar list on desktop, compact tabs under the top bar on phones.
 * Day pages count as "Trainingsplan", session pages as "Verlauf".
 */
export function PortalNav({ variant }: { variant: 'sidebar' | 'tabs' }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Mein Training" className={variant === 'sidebar' ? 'vt-pnav' : 'vt-ptabs'}>
      <ul>
        {ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (!('exact' in item) && pathname.startsWith(`${item.href}/`)) ||
            ('extra' in item && pathname.startsWith(`${PORTAL_PATH}${item.extra}`));
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="vt-pnav__link"
                aria-current={active ? 'page' : undefined}
              >
                <Icon aria-hidden className="vt-pnav__icon" />
                <span>{variant === 'tabs' ? item.short : item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
