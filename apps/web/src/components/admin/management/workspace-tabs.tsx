'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';

/**
 * Section navigation of the client workspace. Areas of later sprints (Training, Ernährung, …)
 * are announced as disabled items — never dead links.
 */
export function WorkspaceTabs({
  label,
  tabs,
  upcoming,
}: {
  label: string;
  /** prefix: also active on sub-pages (e.g. the training builder below /training). */
  tabs: { href: string; label: string; prefix?: boolean }[];
  upcoming: string[];
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="relative mb-8 overflow-x-auto border-b border-border-subtle">
      <ul className="flex min-w-max gap-1 px-1">
        {tabs.map((tab) => {
          const active =
            pathname === tab.href || (tab.prefix === true && pathname.startsWith(`${tab.href}/`));
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'type-caption flex min-h-12 items-center border-b-2 px-3',
                  active
                    ? 'border-accent text-fg'
                    : 'border-transparent text-fg-muted hover:text-fg',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
        {upcoming.map((item) => (
          <li key={item}>
            <span
              aria-disabled="true"
              title="Folgt in einem späteren Sprint"
              className="type-caption flex min-h-12 items-center px-3 text-fg-disabled"
            >
              {item}
              <span className="sr-only"> (folgt später)</span>
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
