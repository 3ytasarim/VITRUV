import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cx } from './cx';
import { RevealGroup } from './reveal-group';

type HeadingLevel = 1 | 2 | 3 | 4;
type HeadingSize = 'display' | 'h1' | 'h2' | 'h3';

/**
 * Small uppercase blue label above a heading ("COACHING", "01 / 04 · ERNÄHRUNG").
 * Renders a `<p>` by default; it is supporting text, never a heading.
 */
export function Eyebrow({
  as: Tag = 'p',
  className,
  children,
}: {
  as?: 'p' | 'span' | 'div';
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={cx('type-eyebrow text-accent-text', className)}>{children}</Tag>;
}

/**
 * A heading whose document level (`level` → h1…h4) is independent of its visual size (`size`),
 * so the outline stays logical while the design can scale freely.
 * `emphasis` gives the prototype's italic treatment (journey stages, final CTA).
 */
export function SectionHeading({
  level = 2,
  size,
  emphasis = false,
  id,
  className,
  children,
}: {
  level?: HeadingLevel;
  size?: HeadingSize;
  emphasis?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const Tag = `h${level}` as ElementType;
  const visual: HeadingSize = size ?? (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3');
  return (
    <Tag id={id} className={cx(`type-${visual}`, 'text-balance', emphasis && 'italic', className)}>
      {children}
    </Tag>
  );
}

/**
 * Splits plain heading text into masked words for the staggered title reveal. Words stay real
 * text (spaces are kept as text nodes), so the heading reads normally for assistive technology.
 */
export function RevealWords({ text, start = 0 }: { text: string; start?: number }) {
  let index = start;
  return (
    <>
      {text.split(/(\s+)/).map((part, i) =>
        /^\s*$/.test(part) ? (
          part
        ) : (
          <span key={i} className="vt-w">
            <span style={{ '--i': index++ } as CSSProperties}>{part}</span>
          </span>
        ),
      )}
    </>
  );
}

/**
 * Standard section opening — one look for every section of the site: gold rule + eyebrow, the
 * heading at one shared size whose words rise out of a mask one after another, then the lead.
 * The entrance plays once when the intro scrolls into view (RevealGroup); without JavaScript or
 * with reduced motion everything is simply shown. Content comes from props (CMS); nothing is
 * hardcoded. Plain-string titles are split here; rich titles (HighlightedTitle) split themselves.
 */
export function SectionIntro({
  eyebrow,
  title,
  lead,
  level = 2,
  size,
  emphasis,
  titleId,
  align = 'center',
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  level?: HeadingLevel;
  size?: HeadingSize;
  emphasis?: boolean;
  /** Pass the id used by the surrounding `<section aria-labelledby>`. */
  titleId?: string;
  /** Centered by default (one site-wide rhythm); 'start' inside two-column layouts. */
  align?: 'start' | 'center';
  className?: string;
}) {
  return (
    <RevealGroup
      className={cx(
        'vt-intro flex flex-col gap-5',
        align === 'center' && 'mx-auto items-center text-center',
        className,
      )}
    >
      {eyebrow && (
        <p className="vt-intro__eyebrow type-eyebrow text-accent-text">
          <span aria-hidden className="vt-intro__rule" />
          <span>{eyebrow}</span>
          {align === 'center' && <span aria-hidden className="vt-intro__rule" />}
        </p>
      )}
      {/* Shine: an identical gold copy over the heading, revealed only through a moving mask
          band (decorative, aria-hidden) — the real heading text is never altered. */}
      <div className="vt-intro__titlewrap max-w-measure-display">
        <SectionHeading
          level={level}
          size={size}
          emphasis={emphasis}
          id={titleId}
          className="vt-intro__title"
        >
          {typeof title === 'string' ? <RevealWords text={title} /> : title}
        </SectionHeading>
        <span
          aria-hidden
          className={cx(
            'vt-intro__title vt-intro__shine text-balance',
            `type-${size ?? (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3')}`,
          )}
        >
          {typeof title === 'string' ? <RevealWords text={title} /> : title}
        </span>
      </div>
      {lead && <p className="vt-intro__lead type-body-lg max-w-measure text-fg-muted">{lead}</p>}
    </RevealGroup>
  );
}
