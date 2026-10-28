import { CmsMedia } from '@/components/cms/cms-media';
import { Container } from '@/components/ui';
import { FxIntro, FxTitle } from '../fx';
import type { SectionProps } from '../section-props';

/**
 * About (the coach) — reference 'Coach': a large rounded panel with the intro, the CMS portrait
 * on the left (highlights as small meta lines under it, the optional detail image below) and the
 * story on the right; the last paragraph — the invitation — is set in the full text colour.
 * Phones: intro, portrait, text. Only published CMS fields.
 */
export function AboutSection({ content, id }: SectionProps<'about'>) {
  const titleId = `${id}-title`;
  const paragraphs = content.paragraphs;
  const closing = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : undefined;
  const story = closing ? paragraphs.slice(0, -1) : paragraphs;
  const hasAside = Boolean(content.media || content.detailMedia || content.highlights.length > 0);
  return (
    <section id={id} aria-labelledby={titleId} className="vf-section">
      <Container>
        <div className="vf-panel">
          <FxIntro
            eyebrow={content.eyebrow}
            title={<FxTitle title={content.title} highlight={content.highlight} />}
            titleId={titleId}
          />
          <div className="vf-about vf-mt-sm" data-aside={hasAside || undefined}>
            {hasAside && (
              <div className="vf-about__aside">
                {content.media && (
                  <div className="vf-about__portrait">
                    <CmsMedia slot={content.media} sizes="(min-width: 1024px) 320px, 90vw" />
                  </div>
                )}
                {content.highlights.length > 0 && (
                  <dl className="vf-about__facts">
                    {content.highlights.map((highlight) => (
                      <div key={highlight.id}>
                        <dt>{highlight.label}</dt>
                        <dd>{highlight.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {content.detailMedia && (
                  <div className="vf-about__detail">
                    <CmsMedia slot={content.detailMedia} sizes="(min-width: 1024px) 320px, 90vw" />
                  </div>
                )}
              </div>
            )}
            <div className="vf-about__text">
              {story.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {closing && <p className="vf-about__closing">{closing}</p>}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
