import { CmsMedia } from '@/components/cms/cms-media';
import { RevealGroup, Section, SectionIntro } from '@/components/ui';
import { HighlightedTitle } from '../highlighted-title';
import type { SectionProps } from '../section-props';

/**
 * About (the coach) — calm two-column spread under the shared section intro: a large portrait on
 * the left (stays in view while reading, unveiled when it scrolls in) and the story in ONE text
 * column on the right, all paragraphs at one size; the last paragraph — the invitation — closes as
 * a simple gold-rule quote. Phones: intro, portrait, text. Only published CMS fields.
 */
export function AboutSection({ content, id }: SectionProps<'about'>) {
  const titleId = `${id}-title`;
  const paragraphs = content.paragraphs;
  const closing = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : undefined;
  const story = closing ? paragraphs.slice(0, -1) : paragraphs;

  return (
    <Section id={id} labelledBy={titleId} divider className="vt-about">
      <SectionIntro
        eyebrow={content.eyebrow}
        title={<HighlightedTitle title={content.title} highlight={content.highlight} />}
        titleId={titleId}
      />
      <div
        className="vt-about__spread mt-14 md:mt-20"
        data-portrait={content.media ? '' : undefined}
      >
        {content.media && (
          <RevealGroup className="vt-about__portrait">
            <div className="vt-about__frame">
              <CmsMedia slot={content.media} sizes="(min-width: 1024px) 40vw, 90vw" />
            </div>
          </RevealGroup>
        )}
        <div className="vt-about__text">
          {story.map((paragraph, index) => (
            <p key={index} className="vt-about__p">
              {paragraph}
            </p>
          ))}
          {closing && (
            <blockquote className="vt-about__quote">
              <p>{closing}</p>
            </blockquote>
          )}
          {content.highlights.length > 0 && (
            <dl className="vt-about__facts">
              {content.highlights.map((highlight) => (
                <div key={highlight.id} className="flex flex-col-reverse gap-1">
                  <dt className="type-caption text-fg-subtle">{highlight.label}</dt>
                  <dd className="type-h2 vt-em tabular-nums">{highlight.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </Section>
  );
}
