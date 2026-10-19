/**
 * CMS vocabulary shared by the DB schema (pg enums), the API and the admin UI.
 * Content shapes live in @vitruv/contracts; only the closed value sets live here.
 */

/** Section types = content schemas. A page places sections of these types under a stable key. */
export const WEBSITE_SECTION_TYPES = [
  'hero',
  'results',
  'journey',
  'coaching',
  'packages',
  'about',
  'faq',
  'cta',
  'footer',
  // Redesign 2026-10-16 (additive): method sections from the owner's reference design
  'pillars', // "Drei Säulen" — Körper · Seele · Geist, each with facets and an illustration
  'situations', // "Lebenssituationen" — icon grid of typical starting points
  'steps', // "Neun Stufen" — three pillars × three steps, icon cards
  'gallery', // Photo carousel (hanging polaroids), 2026-10-19
  'theme', // Website colours (admin-editable design settings, 2026-10-18)
  // Page settings (SEO / sharing): versioned like a section, never rendered as page content.
  'seo',
] as const;
export type WebsiteSectionType = (typeof WEBSITE_SECTION_TYPES)[number];

/**
 * Lifecycle of a section version:
 *   DRAFT     — the single working copy of a section (at most one per section)
 *   PUBLISHED — what the public website renders (at most one per section)
 *   ARCHIVED  — a formerly published version, kept for audit/history
 */
export const WEBSITE_VERSION_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type WebsiteVersionStatus = (typeof WEBSITE_VERSION_STATUSES)[number];

/** Lifecycle of a website inquiry (contact form). Kept deliberately small — not a CRM. */
export const WEBSITE_LEAD_STATUSES = ['NEW', 'HANDLED'] as const;
export type WebsiteLeadStatus = (typeof WEBSITE_LEAD_STATUSES)[number];
