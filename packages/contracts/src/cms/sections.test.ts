import type { WebsiteSectionType } from '@vitruv/shared';
import { describe, expect, it } from 'vitest';
import { parseSectionContent } from '../index';

const ASSET = '0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f';

/**
 * Representative valid / invalid content for the section types that gained editors in
 * Sprint 3 Stage A (hero, journey, faq and footer are covered in cms.test.ts).
 */
const cases: {
  type: WebsiteSectionType;
  valid: Record<string, unknown>;
  invalid: [string, Record<string, unknown>, string][];
}[] = [
  {
    type: 'results',
    valid: {
      title: 'Ergebnisse',
      items: [
        { id: 'a', value: '8 Wochen', label: 'Dauer', media: { desktop: { assetId: ASSET } } },
        { id: 'b', value: '3x', label: 'Training', description: 'Pro Woche.', media: null },
      ],
    },
    invalid: [
      [
        'duplicate item IDs',
        { title: 'E', items: [1, 2].map(() => ({ id: 'x', value: '1', label: 'l', media: null })) },
        'items.1.id',
      ],
      [
        'figure too long',
        { title: 'E', items: [{ id: 'x', value: 'x'.repeat(25), label: 'l', media: null }] },
        'items.0.value',
      ],
    ],
  },
  {
    type: 'coaching',
    valid: {
      title: 'Coaching',
      intro: 'So arbeiten wir.',
      features: [{ id: 'analyse', title: 'Analyse', description: 'Ausgangslage klären.' }],
      media: null,
    },
    invalid: [
      [
        'feature without description',
        { title: 'C', features: [{ id: 'a', title: 'T', description: '' }], media: null },
        'features.0.description',
      ],
      ['missing media key', { title: 'C', features: [] }, 'media'],
    ],
  },
  {
    type: 'packages',
    valid: {
      title: 'Pakete',
      packages: [
        {
          id: 'basis',
          name: 'Basis',
          priceLabel: 'auf Anfrage',
          features: ['Erstgespräch', 'Plan'],
          cta: { label: 'Anfragen', href: '/kontakt?paket=basis' },
          highlighted: true,
        },
      ],
    },
    invalid: [
      [
        'unsafe CTA link',
        {
          title: 'P',
          packages: [
            {
              id: 'p',
              name: 'P',
              features: [],
              cta: { label: 'Kaufen', href: 'javascript:pay()' },
              highlighted: false,
            },
          ],
        },
        'packages.0.cta.href',
      ],
      [
        'empty feature line',
        {
          title: 'P',
          packages: [
            {
              id: 'p',
              name: 'P',
              features: [' '],
              cta: { label: 'A', href: '/kontakt' },
              highlighted: false,
            },
          ],
        },
        'packages.0.features.0',
      ],
    ],
  },
  {
    type: 'about',
    valid: {
      title: 'Dein Coach',
      paragraphs: ['Neutraler Entwicklungstext.'],
      highlights: [{ id: 'jahre', value: '10+', label: 'Jahre Erfahrung' }],
      media: { desktop: { assetId: ASSET, altText: '' } },
    },
    invalid: [
      ['no paragraphs', { title: 'A', paragraphs: [], highlights: [], media: null }, 'paragraphs'],
      [
        'control characters',
        { title: 'A', paragraphs: ['a\u0007b'], highlights: [], media: null },
        'paragraphs.0',
      ],
    ],
  },
  {
    type: 'cta',
    valid: {
      title: 'Bereit?',
      body: 'Kurzer Text.',
      action: { label: 'Termin', href: 'https://example.com/termin' },
      media: null,
    },
    invalid: [
      [
        'data: link',
        { title: 'C', action: { label: 'X', href: 'data:text/html,x' }, media: null },
        'action.href',
      ],
      [
        'plain http link',
        { title: 'C', action: { label: 'X', href: 'http://example.com' }, media: null },
        'action.href',
      ],
    ],
  },
];

describe.each(cases)('$type section schema', ({ type, valid, invalid }) => {
  it('accepts representative valid content', () => {
    expect(parseSectionContent(type, valid).error?.issues ?? []).toEqual([]);
  });

  it.each(invalid)('rejects %s', (_name, content, path) => {
    const result = parseSectionContent(type, content);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain(path);
  });
});
