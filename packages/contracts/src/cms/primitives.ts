import { z } from 'zod';

/**
 * Building blocks for CMS section schemas.
 *
 * CMS content is structured plain text — no HTML, no Markdown. Frontends render it as text
 * (React escapes it), so no sanitizer is needed. Rich text would get its own sanitization
 * architecture if it is ever required.
 */

// Control characters other than tab and line feed have no place in editorial text.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/;

/** Required, trimmed plain text with a length limit. */
export const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Darf nicht leer sein.')
    .max(max, `Höchstens ${max} Zeichen.`)
    .refine((value) => !CONTROL_CHARS.test(value), 'Enthält unzulässige Steuerzeichen.');

/** Optional plain text. Absent means "not shown"; editors drop empty strings before saving. */
export const optionalText = (max: number) => plainText(max).optional();

/** Stable item ID inside arrays (FAQ entries, Journey stages …) — never the array index. */
export const itemIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Ungültige ID (a–z, 0–9, Bindestrich).');

/** Adds a "duplicate ID" issue for every repeated `id` in an array of items. */
export function uniqueIds<T extends { id: string }>(items: T[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'Doppelte ID.' });
    }
    seen.add(item.id);
  });
}

// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const WHITESPACE_OR_CONTROL = /[\s\u0000-\u001F\u007F]/;
const INTERNAL_PATH = /^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/;
const ANCHOR = /^#[A-Za-z][A-Za-z0-9_-]*$/;
const MAILTO = /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TEL = /^tel:\+?[0-9()./-]{3,30}$/;

/**
 * Link targets editors may enter: internal paths (`/kontakt`), in-page anchors (`#faq`),
 * `https://` URLs, `mailto:` and `tel:`. Everything else — `javascript:`, `data:`, `vbscript:`,
 * `http:`, protocol-relative `//host`, credentials in URLs, whitespace tricks — is rejected.
 */
export function isSafeHref(value: string): boolean {
  if (value.length === 0 || value.length > 2048 || WHITESPACE_OR_CONTROL.test(value)) return false;
  if (value.startsWith('/')) return INTERNAL_PATH.test(value);
  if (value.startsWith('#')) return ANCHOR.test(value);
  const lower = value.toLowerCase();
  if (lower.startsWith('mailto:')) return MAILTO.test(value);
  if (lower.startsWith('tel:')) return TEL.test(value);
  if (!lower.startsWith('https://')) return false;
  return isSafeHttpsUrl(value);
}

/** Absolute `https://` URL with a host and without embedded credentials. */
export function isSafeHttpsUrl(value: string): boolean {
  if (WHITESPACE_OR_CONTROL.test(value) || !value.toLowerCase().startsWith('https://')) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0 && !url.username && !url.password;
  } catch {
    return false;
  }
}

export const safeHrefSchema = z
  .string()
  .trim()
  .refine(isSafeHref, 'Nur interne Pfade (/…), #Anker, https://, mailto: oder tel: erlaubt.');

export const httpsUrlSchema = z
  .string()
  .trim()
  .refine(isSafeHttpsUrl, 'Nur vollständige https://-Adressen erlaubt.');

/** Call to action: visible label + safe link target. */
export const ctaSchema = z.object({
  label: plainText(40),
  href: safeHrefSchema,
});
export type Cta = z.infer<typeof ctaSchema>;

export const linkItemSchema = z.object({
  id: itemIdSchema,
  label: plainText(40),
  href: safeHrefSchema,
});
export type LinkItem = z.infer<typeof linkItemSchema>;
