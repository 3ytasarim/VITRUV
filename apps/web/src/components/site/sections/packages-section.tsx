import { CmsMedia } from '@/components/cms/cms-media';
import { Container, cx } from '@/components/ui';
import { FxButton, FxIntro } from '../fx';
import type { SectionProps } from '../section-props';

/** Structural label of the CMS "highlighted" flag (state must not be colour-only). */
const HIGHLIGHT_LABEL = 'Empfohlen';

/**
 * Packages — reference 'Pakete': rounded package cards side by side; name with the CMS price
 * label at the top right, tagline, "+" feature lines and the CMS action as a chamfered button
 * (outline, or the accent fill on the highlighted package, which also glows and carries the
 * text badge "Empfohlen" — never colour alone). The package's CMS image, if set, sits on top.
 * Editorial display only — the price is CMS text, nothing is calculated or sold here.
 */
export function PackagesSection({ content, id }: SectionProps<'packages'>) {
  const titleId = `${id}-title`;
  const count = content.packages.length;
  return (
    <section id={id} aria-labelledby={titleId} className="vf-section vf-section--rule">
      <Container>
        <FxIntro
          eyebrow={content.eyebrow}
          title={content.title}
          lead={content.intro}
          titleId={titleId}
        />
        {count > 0 && (
          <ul className={cx('vf-grid vf-mt', count >= 3 ? 'vf-grid--3' : 'vf-grid--2')}>
            {content.packages.map((pkg) => (
              <li key={pkg.id} className="vf-package" data-highlight={pkg.highlighted || undefined}>
                {pkg.media && (
                  <div className="vf-package__media">
                    <CmsMedia slot={pkg.media} sizes="(min-width: 1024px) 400px, 90vw" />
                  </div>
                )}
                <div className="vf-package__head">
                  <h3 className="vf-package__name">{pkg.name}</h3>
                  {pkg.highlighted ? (
                    <span className="vf-badge">{HIGHLIGHT_LABEL}</span>
                  ) : (
                    pkg.priceLabel && <span className="vf-meta">{pkg.priceLabel}</span>
                  )}
                </div>
                {pkg.highlighted && pkg.priceLabel && <p className="vf-meta">{pkg.priceLabel}</p>}
                {pkg.tagline && <p className="vf-package__tagline">{pkg.tagline}</p>}
                {pkg.features.length > 0 && (
                  <ul className="vf-package__features">
                    {pkg.features.map((feature, index) => (
                      <li key={index}>
                        <span aria-hidden>+ </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                )}
                <FxButton
                  href={pkg.cta.href}
                  variant={pkg.highlighted ? 'primary' : 'ghost'}
                  block
                  className="vf-package__cta"
                  data-track="package_cta_click"
                  data-track-section="packages"
                  data-track-label={pkg.id}
                >
                  {pkg.cta.label} →
                </FxButton>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}
