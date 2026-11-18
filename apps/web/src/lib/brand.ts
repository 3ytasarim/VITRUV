/**
 * The VITRUV logo (mark + wordmark): the owner's NEW logo (Archiv.zip, confirmed 2026-11-18 —
 * the earlier sharp-cornered crop was wrong), unchanged, only trimmed and scaled.
 * Bundled as a system asset (logo glyph, allowed by the CMS media rule) so it shows on every
 * checkout and deployment right after a pull — independent of the CMS media storage. Black ink
 * on transparent; the dark surfaces invert it to white via their logo filter. New file name so
 * no cache serves the old logo.
 */
export const BRAND_LOGO = { src: '/brand/vitruv-logo-v2.png', width: 704, height: 400 } as const;

/**
 * Link preview (WhatsApp, iMessage, Facebook, X …) when the CMS has no Open Graph image: the
 * owner's share picture (2026-11-18) — white logo centred on black, cropped to 1200×630.
 */
export const BRAND_OG_IMAGE = {
  path: '/brand/og-image.jpg',
  width: 1200,
  height: 630,
  alt: 'VITRUV Logo',
  type: 'image/jpeg',
} as const;
