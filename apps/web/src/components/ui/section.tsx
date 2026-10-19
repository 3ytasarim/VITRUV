import type { ReactNode } from 'react';
import { Container } from './container';
import { cx } from './cx';

/**
 * Page section with the VITRUV vertical rhythm (`--section-space`: 72 → 110 px) and the content
 * container (1240 px max, fluid gutters). Label it with the id of its heading.
 */
export function Section({
  id,
  labelledBy,
  tone = 'default',
  divider = false,
  contained = true,
  className,
  children,
}: {
  id?: string;
  /** id of the heading that names this section (accessible landmark name). */
  labelledBy?: string;
  /** default = page background · sunken = slightly darker band */
  tone?: 'default' | 'sunken';
  /** Hairline separator at the top, as between prototype sections. */
  divider?: boolean;
  /** Wrap children in `Container`. Disable for full-bleed media. */
  contained?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cx(
        'py-(--section-space)',
        tone === 'sunken' && 'bg-surface-sunken',
        divider && 'border-t border-border-subtle',
        className,
      )}
    >
      {contained ? <Container>{children}</Container> : children}
    </section>
  );
}
