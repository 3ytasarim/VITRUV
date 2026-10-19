import type { CSSProperties } from 'react';
import { RevealGroup } from '@/components/ui';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export interface MethodGroup {
  name: string;
  /** Pillar display title, e.g. "Corpus" (CMS Drei Säulen). */
  title?: string;
  /** Pillar lead sentence (CMS Drei Säulen). */
  lead?: string;
  steps: readonly string[];
}

/**
 * Method cards under the hero: one card per pillar (roman numeral, name, lead, its steps as
 * chips). The highlight travels from card to card on its own — the active card turns ink-to-gold,
 * a gold progress bar fills along its bottom and its chips light up one after another; hovering a
 * card takes over (cycle paused). Cards rise in when they scroll into view. CSS only, static under
 * reduced motion. All text comes from published CMS content (Drei Säulen + Neun Stufen).
 */
export function MethodStrip({ groups }: { groups: readonly MethodGroup[] }) {
  return (
    <div
      className="vt-mcards-band"
      role="group"
      aria-label="Methode"
      style={{ '--n': groups.length } as CSSProperties}
    >
      <RevealGroup className="vt-mcards">
        {groups.map((group, g) => (
          <article key={group.name} className="vt-mcard" style={{ '--g': g } as CSSProperties}>
            <span aria-hidden className="vt-mcard__roman">
              {ROMAN[g] ?? g + 1}
            </span>
            <p className="vt-mcard__eyebrow">
              {String(g + 1).padStart(2, '0')} · {group.name}
            </p>
            {group.title && <h3 className="vt-mcard__title">{group.title}</h3>}
            {group.lead && <p className="vt-mcard__lead">{group.lead}</p>}
            {group.steps.length > 0 && (
              <ul className="vt-mcard__chips">
                {group.steps.map((step, i) => (
                  <li key={step} className="vt-mcard__chip" style={{ '--i': i } as CSSProperties}>
                    {step}
                  </li>
                ))}
              </ul>
            )}
            <span aria-hidden className="vt-mcard__bar" />
          </article>
        ))}
      </RevealGroup>
    </div>
  );
}
