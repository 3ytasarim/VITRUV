import type { WebsiteSectionType } from '@vitruv/shared';
import { z } from 'zod';
import { mediaSlotSchema, resolvedMediaSlotSchema } from './media';
import {
  ctaSchema,
  httpsUrlSchema,
  itemIdSchema,
  linkItemSchema,
  optionalText,
  plainText,
  safeHrefSchema,
  uniqueIds,
} from './primitives';

/**
 * Typed content schema per website section type.
 *
 * Every schema is built twice from one definition:
 *   - stored  (`sectionContentSchemas`)       — media as references ({ assetId … })
 *   - public  (`publicSectionContentSchemas`) — media resolved to URLs by the API
 * so the editable model and the rendered model can never drift apart.
 *
 * Media fields are always `slot | null`: null = no media chosen (frontends render a fallback).
 */
function defineSectionSchemas<Slot extends z.ZodType>(slot: Slot) {
  const media = slot.nullable();

  const hero = z.object({
    eyebrow: optionalText(60),
    title: plainText(120),
    /** Part of the title that is visually emphasised (must appear in the title). */
    highlight: optionalText(60),
    body: optionalText(400),
    primaryCta: ctaSchema,
    secondaryCta: ctaSchema.optional(),
    media,
  });

  const results = z.object({
    eyebrow: optionalText(60),
    title: plainText(120),
    intro: optionalText(400),
    items: z
      .array(
        z.object({
          id: itemIdSchema,
          /** Headline figure, e.g. "−12 kg" or "8 Wochen". */
          value: plainText(24),
          label: plainText(80),
          description: optionalText(300),
          media,
        }),
      )
      .max(12)
      .superRefine(uniqueIds),
  });

  /** Journey ("Dein Weg") — rendered by the production `JourneyMapSection` component. */
  const journey = z.object({
    eyebrow: plainText(60),
    title: plainText(120),
    lead: optionalText(400),
    stages: z
      .array(
        z.object({
          id: itemIdSchema,
          name: plainText(40),
          title: plainText(120),
          description: plainText(600),
          media,
          enabled: z.boolean(),
        }),
      )
      .min(1, 'Mindestens eine Etappe.')
      .max(8, 'Höchstens 8 Etappen.')
      .superRefine(uniqueIds)
      .refine((stages) => stages.some((stage) => stage.enabled), {
        message: 'Mindestens eine Etappe muss sichtbar sein.',
      }),
  });

  const coaching = z.object({
    eyebrow: optionalText(60),
    title: plainText(120),
    intro: optionalText(400),
    features: z
      .array(
        z.object({
          id: itemIdSchema,
          title: plainText(80),
          description: plainText(400),
          /** Optional line icon (image, e.g. transparent PNG/SVG) — additive 2026-10-16. */
          icon: media.optional(),
          /** Optional card image (colour-change card, grey until hover) — additive 2026-10-17. */
          media: media.optional(),
        }),
      )
      .max(12)
      .superRefine(uniqueIds),
    media,
  });

  /** Display content only — no prices are calculated or charged from this data. */
  const packages = z.object({
    eyebrow: optionalText(60),
    title: plainText(120),
    intro: optionalText(400),
    packages: z
      .array(
        z.object({
          id: itemIdSchema,
          name: plainText(60),
          tagline: optionalText(160),
          /** Free text shown as-is, e.g. "ab 149 € / Monat". */
          priceLabel: optionalText(40),
          features: z.array(plainText(160)).max(20),
          cta: ctaSchema,
          highlighted: z.boolean(),
          /** Optional portrait image of the offer — additive 2026-10-16. */
          media: media.optional(),
        }),
      )
      .max(6)
      .superRefine(uniqueIds),
  });

  const about = z.object({
    eyebrow: optionalText(60),
    title: plainText(120),
    paragraphs: z.array(plainText(1200)).min(1).max(8),
    highlights: z
      .array(z.object({ id: itemIdSchema, value: plainText(24), label: plainText(80) }))
      .max(8)
      .superRefine(uniqueIds),
    media,
    /** Part of the title set in the gold serif accent (must appear in the title). */
    highlight: optionalText(60),
    /** Optional second, smaller detail image (training, nature, ritual) — additive 2026-10-16. */
    detailMedia: media.optional(),
  });

  /** "Drei Säulen": Körper · Seele · Geist — each pillar with facets and an illustration. */
  const pillars = z.object({
    eyebrow: optionalText(60),
    title: plainText(120),
    highlight: optionalText(60),
    intro: optionalText(600),
    pillars: z
      .array(
        z.object({
          id: itemIdSchema,
          /** Short name shown in the switcher, e.g. "Körper". */
          name: plainText(40),
          /** Display title, e.g. "Corpus". */
          title: plainText(80),
          /** Keyword line, e.g. "Vitalität · Kraft · Balance". */
          keywords: optionalText(120),
          lead: optionalText(400),
          paragraphs: z.array(plainText(1200)).max(6),
          facets: z
            .array(
              z.object({ id: itemIdSchema, label: plainText(40), description: plainText(400) }),
            )
            .max(6)
            .superRefine(uniqueIds),
          media,
        }),
      )
      .min(1, 'Mindestens eine Säule.')
      .max(3, 'Höchstens drei Säulen.')
      .superRefine(uniqueIds),
  });

  /** "Lebenssituationen": icon grid of typical starting points. */
  const situations = z.object({
    eyebrow: optionalText(60),
    title: plainText(160),
    highlight: optionalText(60),
    intro: optionalText(600),
    items: z
      .array(
        z.object({
          id: itemIdSchema,
          title: plainText(80),
          description: optionalText(300),
          icon: media,
        }),
      )
      .max(16)
      .superRefine(uniqueIds),
    /** Closing line under the grid, e.g. "Du musst dich nicht einordnen können …". */
    outro: optionalText(400),
  });

  /** Photo gallery: kinetic photo reel (owner request 2026-10-19, redesigned 2026-10-19). */
  const gallery = z.object({
    eyebrow: optionalText(60),
    title: plainText(160),
    highlight: optionalText(60),
    intro: optionalText(400),
    items: z
      .array(
        z.object({
          id: itemIdSchema,
          media,
          /** Short title on the photo (optional). */
          title: optionalText(60),
          caption: optionalText(160),
        }),
      )
      .max(24, 'Höchstens 24 Fotos.')
      .superRefine(uniqueIds),
    /** Moves on by itself (paused on hover/focus and under reduced motion). */
    autoplay: z.boolean(),
  });

  /** "Neun Stufen": steps grouped by pillar, each an icon card. */
  const steps = z.object({
    eyebrow: optionalText(60),
    title: plainText(120),
    highlight: optionalText(60),
    intro: optionalText(600),
    items: z
      .array(
        z.object({
          id: itemIdSchema,
          /** Group label, e.g. "Körper". */
          group: plainText(40),
          title: plainText(80),
          description: plainText(400),
          icon: media,
        }),
      )
      .max(12)
      .superRefine(uniqueIds),
  });

  const faq = z.object({
    eyebrow: optionalText(60),
    title: plainText(120),
    items: z
      .array(z.object({ id: itemIdSchema, question: plainText(200), answer: plainText(2000) }))
      .min(1, 'Mindestens eine Frage.')
      .max(40)
      .superRefine(uniqueIds),
  });

  const cta = z.object({
    eyebrow: optionalText(60),
    title: plainText(120),
    body: optionalText(400),
    action: ctaSchema,
    media,
  });

  const footer = z.object({
    tagline: optionalText(200),
    navigation: z.array(linkItemSchema).max(12).superRefine(uniqueIds),
    legal: z.array(linkItemSchema).max(6).superRefine(uniqueIds),
    contact: z.object({
      email: z.email('Ungültige E-Mail-Adresse.').optional(),
      phone: optionalText(40),
      location: optionalText(120),
    }),
    social: z
      .array(
        z.object({
          id: itemIdSchema,
          platform: z.enum(['instagram', 'youtube', 'tiktok', 'facebook', 'linkedin', 'x']),
          href: httpsUrlSchema,
        }),
      )
      .max(8)
      .superRefine(uniqueIds),
  });

  /**
   * Page settings for search and sharing (title, description, site name, Open Graph image).
   * Versioned and published like a section; never rendered as page content. Lengths are
   * practical safety limits — the admin shows the usual search-result guidance separately.
   */
  /**
   * Website colours (design settings): admin-editable roles of the public site. Strict #rrggbb
   * values only (no CSS injection possible); the web renders them as CSS variables.
   */
  const hex = z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Farbe als #rrggbb angeben.');
  const theme = z.object({
    /** Page background. */
    background: hex,
    /** Cards and raised surfaces. */
    surface: hex,
    /** Alternating bands / sunken areas. */
    surfaceSunken: hex,
    /** Section titles and headings. */
    heading: hex,
    /** Main text colour. */
    text: hex,
    /** Body copy (muted). */
    textMuted: hex,
    /** Captions, meta, numbering. */
    textSubtle: hex,
    /** Small titles above headings (eyebrows) and links. */
    eyebrow: hex,
    /** Primary buttons: fill and label. */
    button: hex,
    buttonText: hex,
    /** Gold accent: italic accent words, rules, decorative details. */
    accent: hex,
    /** Second accent: Journey route, highlights. */
    accentSecondary: hex,
    /** Dark areas (CTA card, footer details, coaching cards). */
    dark: hex,
  });

  const seo = z.object({
    title: plainText(120),
    description: plainText(320),
    /** Brand/site name for og:site_name and the WebSite / Organization structured data. */
    siteName: plainText(80),
    /** Open Graph / social preview image (Media Library; alt text required like any image). */
    ogImage: media,
    /** Emit FAQPage structured data from the visible, published FAQ section. */
    faqStructuredData: z.boolean(),
    /** Site logo (raster/vector image) for the header — additive 2026-10-16; wordmark if unset. */
    logo: media.optional(),
  });

  /**
   * The reference homepage `Website Funktional.dc.html` 1:1 as ONE section (owner decision
   * 2026-10-28): every text block and every image/video slot of the prototype, in its order.
   * Lists carry stable ids (media roles and editor keys).
   */
  const idList = <T extends z.ZodRawShape>(shape: T, max: number) =>
    z
      .array(z.object({ id: itemIdSchema, ...shape }))
      .max(max)
      .superRefine((items, ctx) => uniqueIds(items as { id: string }[], ctx));
  const home = z.object({
    hero: z.object({
      eyebrow: optionalText(80),
      /** Headline lines; the last one is set in the glowing accent colour. */
      lines: z.array(plainText(60)).min(1, 'Mindestens eine Zeile.').max(4),
      body: optionalText(400),
      primary: ctaSchema,
      secondary: ctaSchema.optional(),
      note: optionalText(400),
      media,
    }),
    intro: z.object({ caption: optionalText(160), media }),
    results: z.object({
      eyebrow: optionalText(60),
      title: plainText(120),
      videos: idList({ quote: plainText(300), who: plainText(60), media }, 4),
      swipeHint: optionalText(40),
      gallery: idList({ who: plainText(60), media }, 24),
    }),
    journey: z.object({
      eyebrow: optionalText(60),
      title: plainText(120),
      stages: idList(
        { name: plainText(40), title: plainText(120), text: plainText(600), media },
        8,
      ).refine((s) => s.length > 0, { message: 'Mindestens eine Etappe.' }),
    }),
    voices: z.object({
      eyebrow: optionalText(60),
      items: idList({ quote: plainText(600), who: plainText(60) }, 12),
    }),
    doubts: z.object({
      eyebrow: optionalText(60),
      title: plainText(160),
      items: idList({ text: plainText(200) }, 12),
      outro: optionalText(800),
      /** Part of the outro set in the accent colour (must occur in it). */
      outroHighlight: optionalText(60),
    }),
    included: z.object({
      eyebrow: optionalText(60),
      title: plainText(120),
      lead: optionalText(400),
      items: idList({ title: plainText(80), text: plainText(400) }, 12),
    }),
    packages: z.object({
      eyebrow: optionalText(60),
      title: plainText(120),
      lead: optionalText(400),
      items: idList(
        {
          name: plainText(60),
          /** Small label at the top right ("6 Wochen"); the featured package shows it as badge. */
          label: optionalText(40),
          featured: z.boolean(),
          text: optionalText(400),
          features: z.array(plainText(160)).max(20),
          note: optionalText(160),
          cta: ctaSchema,
        },
        4,
      ),
    }),
    steps: z.object({
      eyebrow: optionalText(60),
      title: plainText(120),
      items: idList({ title: plainText(80), text: plainText(400) }, 12),
    }),
    training: z.object({
      eyebrow: optionalText(60),
      title: plainText(120),
      lead: optionalText(400),
      items: idList({ label: plainText(40), text: plainText(160), media }, 8),
    }),
    coach: z.object({
      eyebrow: optionalText(60),
      name: plainText(80),
      facts: z.array(plainText(80)).max(6),
      paragraphs: z.array(plainText(1200)).max(8),
      /** Last line, set in the full text colour. */
      closing: optionalText(400),
      media,
    }),
    faq: z.object({
      eyebrow: optionalText(60),
      title: plainText(120),
      items: idList({ question: plainText(200), answer: plainText(2000) }, 40),
    }),
    cta: z.object({
      eyebrow: optionalText(60),
      title: plainText(160),
      body: optionalText(400),
      action: ctaSchema,
      media,
    }),
    apply: z.object({
      eyebrow: optionalText(60),
      title: plainText(120),
      lead: optionalText(400),
      channels: idList(
        {
          /** Short tag in the square, e.g. "IG", "WA", "@". */
          tag: plainText(4),
          title: plainText(40),
          text: optionalText(300),
          cta: plainText(40),
          href: safeHrefSchema,
        },
        6,
      ),
    }),
    /** Glass button in the header centre (appears after the intro video). */
    headerCta: ctaSchema,
    /** Phone menu (opened with the logo). */
    menu: z.array(linkItemSchema).max(5).superRefine(uniqueIds),
  });

  return {
    hero,
    results,
    journey,
    coaching,
    packages,
    about,
    faq,
    cta,
    footer,
    pillars,
    situations,
    steps,
    gallery,
    home,
    theme,
    seo,
  } satisfies Record<WebsiteSectionType, z.ZodType>;
}

export const sectionContentSchemas = defineSectionSchemas(mediaSlotSchema);
export const publicSectionContentSchemas = defineSectionSchemas(resolvedMediaSlotSchema);

export type SectionContentSchemas = typeof sectionContentSchemas;
/** Stored (editable) content of a section type. */
export type SectionContent<T extends WebsiteSectionType> = z.infer<SectionContentSchemas[T]>;
/** Content of a section type as delivered by the public API (media resolved). */
export type PublicSectionContent<T extends WebsiteSectionType> = z.infer<
  (typeof publicSectionContentSchemas)[T]
>;

export type HeroContent = SectionContent<'hero'>;
export type JourneyCmsContent = SectionContent<'journey'>;
export type FaqContent = SectionContent<'faq'>;

/**
 * Which media kinds a section's slots accept (desktop/mobile). Posters are always images and a
 * mobile variant must have the same kind as its desktop asset — enforced by the API.
 */
export const SECTION_MEDIA_KINDS: Readonly<
  Record<WebsiteSectionType, readonly ('IMAGE' | 'VIDEO')[]>
> = {
  hero: ['IMAGE', 'VIDEO'],
  results: ['IMAGE'],
  journey: ['IMAGE', 'VIDEO'],
  coaching: ['IMAGE', 'VIDEO'],
  packages: ['IMAGE'],
  about: ['IMAGE', 'VIDEO'],
  faq: [],
  cta: ['IMAGE', 'VIDEO'],
  footer: [],
  pillars: ['IMAGE'],
  situations: ['IMAGE'],
  steps: ['IMAGE'],
  gallery: ['IMAGE'],
  home: ['IMAGE', 'VIDEO'],
  theme: [],
  seo: ['IMAGE'],
};

/** Validates stored content for a section type (used by the API on save and on publish). */
export function parseSectionContent(type: WebsiteSectionType, content: unknown) {
  return sectionContentSchemas[type].safeParse(content);
}
