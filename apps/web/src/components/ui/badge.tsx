import type { ReactNode } from 'react';
import { chamfer } from './chamfer';
import { cx } from './cx';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error';

/**
 * Short uppercase tag ("BELIEBT", "6 WOCHEN", "OK"). Always carries text — colour is never the
 * only signal. `dot` adds a status dot in the tone colour (decorative).
 */
export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={chamfer('xs', 'vt-badge type-caption', `vt-badge--${tone}`, className)}>
      {dot && <span aria-hidden className="vt-badge__dot" />}
      {children}
    </span>
  );
}

/**
 * Inline metadata ("TEILNEHMER 01 · 6 WOCHEN · ONLINE"). Separators are decorative.
 */
export function MetaRow({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ul
      className={cx(
        'type-caption flex flex-wrap items-center gap-x-2 gap-y-1 text-fg-subtle',
        className,
      )}
    >
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-2">
          {i > 0 && (
            <span aria-hidden className="text-border-strong">
              ·
            </span>
          )}
          {item}
        </li>
      ))}
    </ul>
  );
}
