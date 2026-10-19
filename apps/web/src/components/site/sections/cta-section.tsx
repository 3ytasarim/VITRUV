import { ArrowUpRight } from 'lucide-react';
import { CmsMedia } from '@/components/cms/cms-media';
import { ButtonLink, RevealGroup, RevealWords } from '@/components/ui';
import { HarmonyMotif } from '../harmony-motif';
import type { SectionProps } from '../section-props';

/** The last word of the title carries the shine sweep (bold accent of the NextStep card). */
function splitLastWord(title: string) {
  const trimmed = title.trim();
  const at = trimmed.lastIndexOf(' ');
  return at < 0
    ? { head: '', last: trimmed }
    : { head: trimmed.slice(0, at), last: trimmed.slice(at + 1) };
}

/**
 * Closing call to action as a "next step" card (pattern of the Bleibsichtbar redesign
 * NextStepCta, in VITRUV colours): an inset, generously rounded warm-ink card with a soft gold
 * light, a frosted badge (CMS eyebrow), a large light headline whose last word is bold with a
 * gold shine sweep, the CMS copy and the CMS action as a pill button. CMS media, if set, sits
 * behind the card's colour wash. The card rises in when it scrolls into view.
 */
export function CtaSection({ content, id }: SectionProps<'cta'>) {
  const titleId = `${id}-title`;
  const { head, last } = splitLastWord(content.title);
  return (
    <section id={id} aria-labelledby={titleId} className="vt-nextstep-section">
      <div className="vt-wide">
        <RevealGroup className="vt-nextstep vt-on-media">
          {content.media && (
            <div aria-hidden className="vt-nextstep__media">
              <CmsMedia slot={content.media} sizes="100vw" />
            </div>
          )}
          <div aria-hidden className="vt-nextstep__light" />
          <HarmonyMotif className="vt-nextstep__motif" />
          <div className="vt-nextstep__inner">
            {content.eyebrow && <p className="vt-nextstep__badge">{content.eyebrow}</p>}
            <h2 id={titleId} className="vt-nextstep__title">
              {head && (
                <>
                  <RevealWords text={head} />{' '}
                </>
              )}
              <strong className="vt-shine">{last}</strong>
            </h2>
            {content.body && <p className="vt-nextstep__body">{content.body}</p>}
            <div className="vt-nextstep__actions">
              <ButtonLink
                href={content.action.href}
                size="lg"
                icon={<ArrowUpRight />}
                iconPosition="end"
                data-track="cta_click"
                data-track-section="cta"
              >
                {content.action.label}
              </ButtonLink>
            </div>
          </div>
        </RevealGroup>
      </div>
    </section>
  );
}
