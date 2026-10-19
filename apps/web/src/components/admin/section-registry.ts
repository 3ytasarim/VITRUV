import type { WebsiteSectionSummary } from '@vitruv/contracts';
import type { WebsiteSectionType } from '@vitruv/shared';

/** Human labels for section types (admin UI language: German). */
export const SECTION_LABELS: Readonly<Record<WebsiteSectionType, string>> = {
  hero: 'Hero',
  results: 'Ergebnisse',
  journey: 'Dein Weg (Journey)',
  coaching: 'Coaching',
  packages: 'Pakete',
  about: 'Über Philipp',
  faq: 'FAQ',
  cta: 'Abschluss-CTA',
  footer: 'Footer',
  pillars: 'Drei Säulen',
  situations: 'Lebenssituationen',
  steps: 'Neun Stufen',
  gallery: 'Galerie (Polaroids)',
  theme: 'Farben & Design',
  seo: 'SEO & Link-Vorschau',
};

export type SectionStatusTone = 'success' | 'warning' | 'neutral' | 'accent';

export interface SectionStatus {
  label: string;
  tone: SectionStatusTone;
}

/** Status badges of a section, derived only from API data (never hardcoded per section). */
export function sectionStatuses(section: WebsiteSectionSummary): SectionStatus[] {
  const statuses: SectionStatus[] = [];
  if (section.hasPublished) statuses.push({ label: 'Veröffentlicht', tone: 'success' });
  if (section.hasDraft) statuses.push({ label: 'Entwurf mit Änderungen', tone: 'warning' });
  else if (section.hasPublished) statuses.push({ label: 'Kein Entwurf', tone: 'neutral' });
  if (!section.hasPublished && !section.hasDraft) {
    statuses.push({ label: 'Kein Inhalt', tone: 'neutral' });
  }
  if (!section.enabled) statuses.push({ label: 'Ausgeblendet', tone: 'neutral' });
  return statuses;
}

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Berlin',
});

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateFormat.format(new Date(iso)) : '—';
}
