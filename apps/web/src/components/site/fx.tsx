import type { ReactNode } from 'react';
import { RevealGroup, cx } from '@/components/ui';
import { splitHighlight } from './highlighted-title';

/**
 * Shared building blocks of the public site in the reference design 'Website Funktional':
 * the section introduction (Barlow Condensed eyebrow, Chakra Petch uppercase headline, lead)
 * and the chamfered call-to-action link. Visuals live in public-functional.css.
 */
export function FxIntro({
  eyebrow,
  title,
  lead,
  titleId,
  level = 2,
  align = 'start',
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  titleId?: string;
  level?: 1 | 2;
  align?: 'start' | 'center';
  className?: string;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <RevealGroup className={cx('vf-intro', align === 'center' && 'vf-intro--center', className)}>
      {eyebrow && <p className="vf-eyebrow">{eyebrow}</p>}
      <Heading id={titleId} className="vf-title">
        {title}
      </Heading>
      {lead && <p className="vf-lead">{lead}</p>}
    </RevealGroup>
  );
}

/** Title with the CMS highlight phrase set in the accent colour (the phrase must occur in it). */
export function FxTitle({ title, highlight }: { title: string; highlight?: string }) {
  const parts = splitHighlight(title, highlight);
  return (
    <>
      {parts.before}
      {parts.highlight && <span className="vf-hl">{parts.highlight}</span>}
      {parts.after}
    </>
  );
}

/**
 * Chamfered button link (reference: cut corners top-left / bottom-right). `primary` = accent fill
 * with glow, `ghost` = outline. Analytics attributes pass through.
 */
export function FxButton({
  href,
  variant = 'primary',
  block = false,
  className,
  children,
  ...rest
}: {
  href: string;
  variant?: 'primary' | 'ghost';
  block?: boolean;
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  const external = href.startsWith('https://');
  return (
    <a
      href={href}
      className={cx('vf-btn', `vf-btn--${variant}`, block && 'vf-btn--block', className)}
      {...(external ? { rel: 'noopener noreferrer' } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Two-digit running number ("01"). */
export const nn = (n: number) => String(n).padStart(2, '0');
