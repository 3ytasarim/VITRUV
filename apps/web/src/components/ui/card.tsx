import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { type ChamferCut, chamfer } from './chamfer';

export type CardTone = 'default' | 'outline' | 'sunken' | 'accent';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6 md:p-7',
  lg: 'p-7 md:p-10',
};

interface CardStyle {
  /** default: dark surface + hairline · outline: transparent · sunken: darker · accent: blue border (active/featured) */
  tone?: CardTone;
  cut?: ChamferCut;
  padding?: CardPadding;
  /** Blue glow following the chamfer — reserve for featured/active items. */
  glow?: boolean;
  className?: string;
}

function cardClassName(
  { tone = 'default', cut = 'md', padding = 'md', glow, className }: CardStyle,
  interactive: boolean,
) {
  return chamfer(
    cut,
    'vt-card',
    tone !== 'default' && `vt-card--${tone}`,
    interactive && 'vt-card--interactive',
    glow && (tone === 'accent' ? 'vt-glow-strong' : 'vt-glow'),
    PADDING[padding],
    className,
  );
}

/**
 * The VITRUV card surface. A static container: compose any content inside
 * (result, package, milestone, admin info …). For a whole-card link use `CardLink`.
 */
export function Card({
  as: Tag = 'div',
  children,
  ...style
}: CardStyle & { as?: 'div' | 'article' | 'li' | 'aside'; children: ReactNode }) {
  return <Tag className={cardClassName(style, false)}>{children}</Tag>;
}

/**
 * A card that is a single link (keyboard focusable, visible focus outline, hover border).
 * Keep content inside non-interactive — no nested links or buttons.
 */
export function CardLink({
  tone,
  cut,
  padding,
  glow,
  className,
  children,
  ...linkProps
}: CardStyle & Omit<ComponentProps<typeof Link>, 'className'> & { children: ReactNode }) {
  return (
    <Link className={cardClassName({ tone, cut, padding, glow, className }, true)} {...linkProps}>
      {children}
    </Link>
  );
}
