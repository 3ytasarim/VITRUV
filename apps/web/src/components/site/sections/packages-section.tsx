import { ArrowUpRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { ButtonLink, RevealGroup, Section, SectionIntro } from '@/components/ui';
import { FeatureCard, type FeatureTone } from '../effects/feature-card';
import type { SectionProps } from '../section-props';

/** Structural label of the CMS "highlighted" flag (state must not be colour-only). */
const HIGHLIGHT_LABEL = 'Empfohlen';
const TONES: readonly FeatureTone[] = ['gold', 'route', 'ink'];

/** Check mark in a ring that draws itself (ring first, then the tick) when the list reveals. */
function AnimatedTick() {
  return (
    <span aria-hidden className="vt-tick">
      <svg viewBox="0 0 24 24" focusable="false">
        <circle className="vt-tick__ring" cx="12" cy="12" r="10.5" pathLength={1} />
        <path className="vt-tick__mark" d="M7.4 12.4l3.1 3.1 6.1-6.4" pathLength={1} />
      </svg>
    </span>
  );
}

/**
 * Packages as animated feature cards (21st.dev "feature-card-1" pattern, see FeatureCard):
 * index, tagline pill, the package illustration from the CMS floating in the middle, and a frosted
 * panel with name, price label, features and the call to action. Editorial display only — the
 * price is CMS text, nothing is calculated or sold here. A highlighted package is marked by text
 * ("Empfohlen") and a stronger frame, never by colour alone.
 */
export function PackagesSection({ content, id }: SectionProps<'packages'>) {
  const titleId = `${id}-title`;
  return (
    <Section id={id} labelledBy={titleId} divider>
      <SectionIntro
        eyebrow={content.eyebrow}
        title={content.title}
        lead={content.intro}
        titleId={titleId}
      />
      {content.packages.length > 0 && (
        <ul className="vt-fcards mt-12 md:mt-16">
          {content.packages.map((pkg, index) => (
            <li key={pkg.id} className="flex">
              <FeatureCard
                index={String(index + 1).padStart(3, '0')}
                tag={pkg.tagline}
                tone={TONES[index % TONES.length]}
                media={pkg.media ?? null}
                className={pkg.highlighted ? 'vt-fcard--highlight' : undefined}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="vt-fcard__title">{pkg.name}</h3>
                  {pkg.highlighted && <span className="vt-fcard__badge">{HIGHLIGHT_LABEL}</span>}
                </div>
                {pkg.priceLabel && <p className="type-h3 tabular-nums">{pkg.priceLabel}</p>}
                {pkg.features.length > 0 && (
                  <RevealGroup className="vt-fcard__reveal">
                    <ul className="vt-fcard__list">
                      {pkg.features.map((feature, i) => (
                        <li key={i} style={{ '--i': i } as CSSProperties}>
                          <AnimatedTick />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </RevealGroup>
                )}
                <ButtonLink
                  href={pkg.cta.href}
                  variant={pkg.highlighted ? 'primary' : 'secondary'}
                  icon={<ArrowUpRight />}
                  iconPosition="end"
                  fullWidth
                  className="mt-auto"
                  data-track="package_cta_click"
                  data-track-section="packages"
                  data-track-label={pkg.id}
                >
                  {pkg.cta.label}
                </ButtonLink>
              </FeatureCard>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
