'use client';

import {
  Gauge,
  Dumbbell,
  FileText,
  Images,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Permission } from '@vitruv/shared';
import { cx } from '@/components/ui';
import { COACH_TEAM_ENABLED } from '@/lib/team';

interface NavItem {
  href?: string;
  label: string;
  icon: LucideIcon;
  /** Exact match only (for section roots). */
  exact?: boolean;
}

/** Each group/item is shown only with its permission — no links that would answer 403/404. */
const GROUPS: {
  label: string;
  permission?: Permission;
  items: (NavItem & { permission?: Permission })[];
}[] = [
  {
    label: 'Start',
    items: [{ href: '/admin', label: 'Dashboard', icon: Gauge, exact: true }],
  },
  {
    label: 'Website',
    permission: 'website.content.read',
    items: [
      { href: '/admin/website', label: 'Übersicht', icon: LayoutDashboard, exact: true },
      { href: '/admin/website/inhalte', label: 'Startseite', icon: FileText },
      { href: '/admin/website/medien', label: 'Medien & Galerie', icon: Images },
      { href: '/admin/website/einstellungen', label: 'Einstellungen', icon: Settings2 },
    ],
  },
  {
    label: 'Coaching & Training',
    items: [
      { href: '/admin/kunden', label: 'Kund:innen', icon: Users, permission: 'clients.read' },
      {
        href: '/admin/training/uebungen',
        label: 'Übungen',
        icon: Dumbbell,
        permission: 'training.exercises.read',
      },
      ...(COACH_TEAM_ENABLED
        ? [
            {
              href: '/admin/coaches',
              label: 'Coaches',
              icon: UserCog,
              permission: 'coaches.read' as const,
            },
          ]
        : []),
    ],
  },
  {
    label: 'Konto',
    items: [{ href: '/admin/konto', label: 'Konto & Sicherheit', icon: ShieldCheck }],
  },
];

function isActive(pathname: string, item: NavItem) {
  if (!item.href) return false;
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/**
 * Admin navigation: grouped vertical list with Lucide icons, used in the desktop sidebar and in
 * the mobile drawer. `collapsed` (desktop rail) keeps the icons and moves labels to the
 * accessible name + tooltip. Items of later sprints are shown disabled, not as dead links.
 */
export function AdminNav({
  permissions,
  collapsed = false,
  onNavigate,
}: {
  permissions: readonly Permission[];
  collapsed?: boolean;
  /** Called after a link is followed (closes the mobile drawer). */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const allowed = (permission?: Permission) => !permission || permissions.includes(permission);
  const groups = GROUPS.filter((group) => allowed(group.permission))
    .map((group) => ({ ...group, items: group.items.filter((item) => allowed(item.permission)) }))
    .filter((group) => group.items.length > 0);
  return (
    <nav aria-label="Admin-Navigation" className="px-3 pb-6">
      <ul className="flex flex-col gap-6">
        {groups.map((group) => (
          <li key={group.label}>
            <p className={cx('type-caption px-3 pb-2 text-fg-subtle', collapsed && 'sr-only')}>
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        onClick={onNavigate}
                        className={cx('vt-admin-navlink', collapsed && 'vt-admin-navlink--rail')}
                      >
                        <Icon aria-hidden className="size-4.5 shrink-0" strokeWidth={1.6} />
                        <span className={cx('truncate', collapsed && 'sr-only')}>{item.label}</span>
                      </Link>
                    ) : (
                      <span
                        aria-disabled="true"
                        title="Folgt in einem späteren Sprint"
                        className="vt-admin-navlink text-fg-disabled"
                      >
                        <Icon aria-hidden className="size-4.5 shrink-0" strokeWidth={1.6} />
                        <span className={cx('truncate', collapsed && 'sr-only')}>{item.label}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
