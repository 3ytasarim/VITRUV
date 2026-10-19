import type { CSSProperties } from 'react';
import { CmsMedia } from '@/components/cms/cms-media';
import { Section, SectionIntro } from '@/components/ui';
import type { SectionProps } from '../section-props';

type Item = SectionProps<'results'>['content']['items'][number];

/** "M., 41 · Vertrieb" → name "M., 41", role "Vertrieb". */
function splitLabel(label: string) {
  const at = label.indexOf(' · ');
  return at < 0
    ? { name: label, role: '' }
    : { name: label.slice(0, at), role: label.slice(at + 3) };
}

/**
 * One endlessly scrolling column — the 21st.dev "testimonials-columns-1" (efferd) as used on
 * PestShield, re-built with CSS: the list is rendered twice and the track moves by exactly one copy
 * (translateY −50 %), so the loop is seamless. The second copy is aria-hidden. Paused on hover;
 * under reduced motion the columns stand still and show every card once.
 */
function TestimonialsColumn({
  items,
  duration,
  className,
}: {
  items: readonly Item[];
  duration: number;
  className?: string;
}) {
  const card = (item: Item, key: string, hidden: boolean) => {
    const { name, role } = splitLabel(item.label);
    return (
      <li key={key} className="vt-tcol__card" aria-hidden={hidden || undefined}>
        {item.description && <p className="vt-tcol__text">„{item.description}“</p>}
        <div className="vt-tcol__who">
          <span aria-hidden className="vt-tcol__avatar">
            {item.media ? <CmsMedia slot={item.media} sizes="40px" /> : name.trim().charAt(0)}
          </span>
          <div className="flex flex-col">
            <span className="vt-tcol__name">{name}</span>
            <span className="vt-tcol__role">{[role, item.value].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
      </li>
    );
  };
  return (
    <div className={className}>
      <ul
        className="vt-tcol__track"
        style={{ '--vt-tcol-duration': `${duration}s` } as CSSProperties}
      >
        {items.map((item) => card(item, item.id, false))}
        {items.map((item) => card(item, `${item.id}-copy`, true))}
      </ul>
    </div>
  );
}

/**
 * Results — client voices in three endlessly scrolling columns at different speeds inside a
 * fading frame (testimonials-columns-1). Items are dealt round-robin into the columns; on phones
 * one column, on tablets two. Everything comes from the CMS; with no items only the intro shows.
 */
export function ResultsSection({ content, id }: SectionProps<'results'>) {
  const titleId = `${id}-title`;
  const cols: Item[][] = [[], [], []];
  content.items.forEach((item, i) => cols[i % 3]?.push(item));
  return (
    <Section id={id} labelledBy={titleId} divider>
      <SectionIntro
        eyebrow={content.eyebrow}
        title={content.title}
        lead={content.intro}
        titleId={titleId}
      />
      {content.items.length > 0 && (
        <div className="vt-tcols mt-14">
          <TestimonialsColumn
            items={content.items.length < 3 ? content.items : cols[0]!}
            duration={17}
          />
          {content.items.length >= 3 && (
            <>
              <TestimonialsColumn items={cols[1]!} duration={22} className="vt-tcol--md" />
              <TestimonialsColumn items={cols[2]!} duration={19} className="vt-tcol--lg" />
            </>
          )}
        </div>
      )}
    </Section>
  );
}
