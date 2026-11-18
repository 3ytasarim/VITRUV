/**
 * The VITRUV logo (mark + wordmark) cropped unchanged from the owner's logo sheet (2026-11-09).
 * Bundled as a system asset (logo glyph, allowed by the CMS media rule) so it shows on every
 * checkout and deployment right after a pull — independent of the CMS media storage. Black ink
 * on transparent; the dark surfaces invert it to white via their logo filter.
 */
export const BRAND_LOGO = { src: '/brand/vitruv-logo.png', width: 526, height: 324 } as const;

/**
 * Link preview (WhatsApp, iMessage, Facebook, X …) when the CMS has no Open Graph image: the
 * owner's new logo (Archiv.zip, 2026-11-18) unchanged, white, centred on black, 1200×630.
 */
export const BRAND_OG_IMAGE = {
  path: '/brand/og-image.png',
  width: 1200,
  height: 630,
  alt: 'VITRUV Logo',
} as const;
