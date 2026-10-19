import { WEBSITE_SECTION_TYPES } from '@vitruv/shared';
import { describe, expect, it } from 'vitest';
import {
  collectMediaRefs,
  isSafeHref,
  mapMediaSlots,
  parseSectionContent,
  publicWebsitePageSchema,
  publicWebsiteSectionSchema,
  type FaqContent,
  type HeroContent,
  type JourneyCmsContent,
} from '../index';

const A = '0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f';
const B = '1c8f4d2f-9b3e-4a7c-8d4f-3e2b6c8d0f1a';

const hero: HeroContent = {
  title: 'Stärker. Beweglicher. Ausgeglichener.',
  primaryCta: { label: 'Erstgespräch buchen', href: '/kontakt' },
  media: { desktop: { assetId: A }, mobile: { assetId: B } },
};

const journey: JourneyCmsContent = {
  eyebrow: 'Dein Weg',
  title: 'Vier Etappen. Ein Ziel.',
  stages: [
    {
      id: 'ernaehrung',
      name: 'Ernährung',
      title: 'T',
      description: 'D',
      media: null,
      enabled: true,
    },
    {
      id: 'kraft',
      name: 'Kraft',
      title: 'T',
      description: 'D',
      media: { desktop: { assetId: A }, poster: { assetId: B } },
      enabled: true,
    },
  ],
};

describe('isSafeHref', () => {
  it.each([
    '/kontakt',
    '/pakete?plan=basis#details',
    '#faq',
    'https://example.com/pfad?x=1',
    'mailto:hallo@example.com',
    'tel:+4930123456',
  ])('accepts %s', (href) => expect(isSafeHref(href)).toBe(true));

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'http://example.com',
    '//evil.example',
    '/\\evil.example',
    'https://user:pass@example.com',
    'https://',
    'kontakt',
    '',
    '#',
    'mailto:',
    'file:///etc/passwd',
  ])('rejects %j', (href) => expect(isSafeHref(href)).toBe(false));
});

describe('section schemas', () => {
  it('accepts valid hero content and rejects a dangerous CTA', () => {
    expect(parseSectionContent('hero', hero).success).toBe(true);
    const bad = { ...hero, primaryCta: { label: 'X', href: 'javascript:alert(1)' } };
    const result = parseSectionContent('hero', bad);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['primaryCta', 'href']);
  });

  it('rejects empty required text, unknown shapes and control characters', () => {
    expect(parseSectionContent('hero', { ...hero, title: '   ' }).success).toBe(false);
    expect(parseSectionContent('hero', { ...hero, title: 'a\u0000b' }).success).toBe(false);
    expect(parseSectionContent('hero', { title: 'x' }).success).toBe(false);
  });

  it('requires unique stage IDs and at least one visible Journey stage', () => {
    expect(parseSectionContent('journey', journey).success).toBe(true);
    const duplicate = { ...journey, stages: [journey.stages[0], journey.stages[0]] };
    const dup = parseSectionContent('journey', duplicate);
    expect(dup.success).toBe(false);
    expect(dup.error?.issues[0]?.path).toEqual(['stages', 1, 'id']);
    const hidden = { ...journey, stages: journey.stages.map((s) => ({ ...s, enabled: false })) };
    expect(parseSectionContent('journey', hidden).success).toBe(false);
  });

  it('is not hard-wired to four Journey stages', () => {
    const [firstStage] = journey.stages;
    if (!firstStage) throw new Error('fixture');
    const five = {
      ...journey,
      stages: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ ...firstStage, id })),
    };
    expect(parseSectionContent('journey', five).success).toBe(true);
  });

  it('requires question and answer for every FAQ entry', () => {
    const faq: FaqContent = {
      title: 'Häufige Fragen',
      items: [{ id: 'q1', question: 'Wie starte ich?', answer: 'Mit einem Erstgespräch.' }],
    };
    expect(parseSectionContent('faq', faq).success).toBe(true);
    const missing = { ...faq, items: [{ id: 'q1', question: 'Frage?', answer: '' }] };
    expect(parseSectionContent('faq', missing).success).toBe(false);
    expect(parseSectionContent('faq', { ...faq, items: [] }).success).toBe(false);
  });

  it('allows only https links for social profiles', () => {
    const footer = {
      navigation: [],
      legal: [{ id: 'impressum', label: 'Impressum', href: '/impressum' }],
      contact: { email: 'kontakt@example.com' },
      social: [{ id: 'ig', platform: 'instagram', href: 'https://instagram.com/x' }],
    };
    expect(parseSectionContent('footer', footer).success).toBe(true);
    const unsafe = { ...footer, social: [{ ...footer.social[0], href: 'mailto:a@b.de' }] };
    expect(parseSectionContent('footer', unsafe).success).toBe(false);
  });
});

describe('media references', () => {
  it('collects every reference with a stable, id-based role', () => {
    expect(collectMediaRefs(hero).map((r) => [r.role, r.ref.assetId])).toEqual([
      ['media.desktop', A],
      ['media.mobile', B],
    ]);
    expect(collectMediaRefs(journey).map((r) => r.role)).toEqual([
      'stages.kraft.media.desktop',
      'stages.kraft.media.poster',
    ]);
  });

  it('keeps roles stable when items are reordered', () => {
    const reordered = { ...journey, stages: [...journey.stages].reverse() };
    expect(collectMediaRefs(reordered).map((r) => r.role)).toEqual(
      collectMediaRefs(journey).map((r) => r.role),
    );
  });

  it('maps slots without touching other content', () => {
    const mapped = mapMediaSlots(journey, (_slot, path) => `resolved:${path}`) as {
      stages: { media: unknown; title: string }[];
    };
    expect(mapped.stages[0]?.media).toBeNull();
    expect(mapped.stages[1]?.media).toBe('resolved:stages.kraft.media');
    expect(mapped.stages[1]?.title).toBe('T');
  });
});

describe('public page contract', () => {
  it('has a public variant for EVERY section type (new types must not be dropped silently)', () => {
    const union = publicWebsiteSectionSchema.options.map((o) => o.shape.type.value).sort();
    expect(union).toEqual([...WEBSITE_SECTION_TYPES].sort());
  });

  it('only accepts resolved media in public content', () => {
    const page = {
      slug: 'home',
      title: 'Startseite',
      contentRevision: 1,
      publishedAt: '2026-10-15T12:00:00.000Z',
      sections: [{ key: 'hero', type: 'hero', content: hero }],
    };
    // Stored references (assetId only) are not a valid public payload.
    expect(publicWebsitePageSchema.safeParse(page).success).toBe(false);
    const resolved = {
      ...page,
      sections: [
        {
          key: 'hero',
          type: 'hero',
          content: {
            ...hero,
            media: {
              desktop: {
                assetId: A,
                kind: 'IMAGE',
                url: 'https://cdn.example.com/a.webp',
                mimeType: 'image/webp',
                width: 1600,
                height: 900,
                altText: 'Training',
              },
            },
          },
        },
      ],
    };
    expect(publicWebsitePageSchema.safeParse(resolved).success).toBe(true);
  });
});
