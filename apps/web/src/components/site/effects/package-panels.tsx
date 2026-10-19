'use client';

import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { ArrowUpRight, Plus } from 'lucide-react';
import { useEffect, useId, useState, type CSSProperties } from 'react';
import { CmsMedia } from '@/components/cms/cms-media';
import { ButtonLink } from '@/components/ui';

export type PackagePanel = {
  id: string;
  name: string;
  tagline?: string;
  priceLabel?: string;
  features: string[];
  cta: { label: string; href: string };
  highlighted: boolean;
  media?: ResolvedMediaSlot | null;
};

/** Structural label of the CMS "highlighted" flag (state must not be colour-only). */
const HIGHLIGHT_LABEL = 'Empfohlen';
const pad = (n: number) => String(n).padStart(2, '0');

/** Check mark in a ring that draws itself (ring first, then the tick) when the panel opens. */
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
 * Packages as expanding photo panels.
 *
 * Desktop (≥1024px): the packages stand side by side at full height, each photo filling its panel.
 * One panel is open (the highlighted package first): it widens, its photo turns to colour and
 * name, price, the features (staggered, self-drawing ticks) and the call to action slide in.
 * Hovering, focusing or clicking another panel opens it — the others stay narrow and monochrome
 * with their big number and name. Each panel head is a real button (aria-expanded); closed
 * bodies are `inert`, so keyboard and screen-reader users only meet the open package's links.
 * Below 1024px every package is a complete card (photo band + all content), nothing hidden.
 * Reduced motion: instant changes, no zoom. Editorial display only — prices are CMS text.
 */
export function PackagePanels({ packages }: { packages: PackagePanel[] }) {
  const baseId = useId();
  const initial = Math.max(
    0,
    packages.findIndex((p) => p.highlighted),
  );
  const [open, setOpen] = useState(initial);
  // Panels only collapse on wide screens; below that every package is shown in full.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return (
    <ul className="vt-pk" style={{ '--pk-count': packages.length } as CSSProperties}>
      {packages.map((pkg, index) => {
        const isOpen = index === open;
        const headId = `${baseId}-${pkg.id}-head`;
        const bodyId = `${baseId}-${pkg.id}-body`;
        return (
          <li
            key={pkg.id}
            className="vt-pk__panel"
            data-open={isOpen || undefined}
            data-highlight={pkg.highlighted || undefined}
            onMouseEnter={() => setOpen(index)}
          >
            {pkg.media && (
              <span aria-hidden className="vt-pk__photo">
                <CmsMedia slot={pkg.media} sizes="(min-width: 1024px) 60vw, 100vw" />
              </span>
            )}
            <span aria-hidden className="vt-pk__shade" />
            <span aria-hidden className="vt-pk__bar" />

            <h3 className="vt-pk__head">
              <button
                type="button"
                id={headId}
                className="vt-pk__toggle"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => setOpen(index)}
                onFocus={() => setOpen(index)}
              >
                <span aria-hidden className="vt-pk__num">
                  {pad(index + 1)}
                </span>
                <span className="vt-pk__name">{pkg.name}</span>
                <span aria-hidden className="vt-pk__plus">
                  <Plus className="size-5" strokeWidth={1.6} />
                </span>
              </button>
            </h3>

            <div
              id={bodyId}
              role="region"
              aria-labelledby={headId}
              className="vt-pk__body"
              // closed bodies are skipped by keyboard/AT on desktop (mobile shows them all)
              inert={wide && !isOpen}
            >
              <div className="vt-pk__meta">
                {pkg.highlighted && <span className="vt-pk__badge">{HIGHLIGHT_LABEL}</span>}
                {pkg.tagline && <span className="vt-pk__tag">{pkg.tagline}</span>}
              </div>
              {pkg.priceLabel && <p className="vt-pk__price">{pkg.priceLabel}</p>}
              {pkg.features.length > 0 && (
                <ul className="vt-pk__list">
                  {pkg.features.map((feature, i) => (
                    <li key={i} style={{ '--i': i } as CSSProperties}>
                      <AnimatedTick />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              )}
              <ButtonLink
                href={pkg.cta.href}
                variant={pkg.highlighted ? 'primary' : 'secondary'}
                icon={<ArrowUpRight />}
                iconPosition="end"
                className="vt-pk__cta"
                data-track="package_cta_click"
                data-track-section="packages"
                data-track-label={pkg.id}
              >
                {pkg.cta.label}
              </ButtonLink>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
