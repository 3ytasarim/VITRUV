import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  PublicSectionContent,
  PublicWebsitePage,
  PublicWebsiteSection,
  ResolvedMedia,
} from '@vitruv/contracts';
import { WEBSITE_SECTION_TYPES } from '@vitruv/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const publicSite = vi.hoisted(() => ({ getPublicHome: vi.fn() }));
vi.mock('@/lib/public-site', () => publicSite);
vi.mock('server-only', () => ({}));

const { PUBLIC_SECTION_RENDERERS, PublicSection } = await import('./section-registry');
const { buildNavigation, anchorOf, liveFooter } = await import('./navigation');
const { splitHighlight } = await import('./sections/hero-section');
const { default: HomePage } = await import('@/app/(site)/page');

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const render = (section: PublicWebsiteSection) => html(<PublicSection section={section} />);

const img = (overrides: Partial<ResolvedMedia> = {}): ResolvedMedia => ({
  assetId: '0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f',
  kind: 'IMAGE',
  url: 'https://media.example.test/public/website/2026/10/a.webp',
  mimeType: 'image/webp',
  width: 1600,
  height: 900,
  altText: 'Testmotiv',
  ...overrides,
});

const CONTENT: { [T in (typeof WEBSITE_SECTION_TYPES)[number]]: PublicSectionContent<T> } = {
  hero: {
    eyebrow: 'Eyebrow-T',
    title: 'Titel mit Akzent',
    highlight: 'Akzent',
    body: 'Lead-T',
    primaryCta: { label: 'CTA-Eins', href: '#cta' },
    secondaryCta: { label: 'CTA-Zwei', href: '#journey' },
    media: null,
  },
  results: {
    title: 'Ergebnis-T',
    items: [
      { id: 'a', value: 'W-1', label: 'L-1', media: { desktop: img() } },
      { id: 'b', value: 'W-2', label: 'L-2', description: 'D-2', media: null },
    ],
  },
  journey: {
    eyebrow: 'Weg-E',
    title: 'Weg-T',
    stages: [
      { id: 's1', name: 'N-1', title: 'ST-1', description: 'SD-1', media: null, enabled: true },
      { id: 's2', name: 'N-2', title: 'ST-2', description: 'SD-2', media: null, enabled: true },
    ],
  },
  coaching: {
    title: 'Coaching-T',
    features: [{ id: 'f', title: 'F-1', description: 'FD-1' }],
    media: null,
  },
  packages: {
    title: 'Paket-T',
    packages: [
      {
        id: 'p1',
        name: 'P-1',
        priceLabel: 'Preis-1',
        features: ['Leistung-1'],
        cta: { label: 'P-CTA', href: '/kontakt' },
        highlighted: true,
      },
      {
        id: 'p2',
        name: 'P-2',
        features: [],
        cta: { label: 'P-CTA-2', href: '/kontakt' },
        highlighted: false,
      },
    ],
  },
  about: { title: 'About-T', paragraphs: ['Absatz-1', 'Absatz-2'], highlights: [], media: null },
  faq: {
    title: 'FAQ-T',
    items: [
      { id: 'q1', question: 'Frage-1?', answer: 'Antwort-1' },
      { id: 'q2', question: 'Frage-2?', answer: 'Antwort-2' },
    ],
  },
  cta: { title: 'CTA-T', action: { label: 'Aktion', href: '#faq' }, media: null },
  footer: {
    tagline: 'Footer-Zeile',
    navigation: [
      { id: 'n1', label: 'Nav-FAQ', href: '#faq' },
      { id: 'n2', label: 'Nav-Pakete', href: '/#packages' },
      { id: 'n3', label: 'Nav-Extern', href: '/impressum' },
    ],
    legal: [{ id: 'i', label: 'Impressum', href: '/impressum' }],
    contact: {},
    social: [],
  },
  pillars: {
    title: 'Säulen-T',
    highlight: 'T',
    pillars: [
      {
        id: 'k',
        name: 'Körper-T',
        title: 'Corpus-T',
        keywords: 'A · B',
        paragraphs: ['Absatz-T'],
        facets: [{ id: 'f', label: 'Facette-T', description: 'Facettentext-T' }],
        media: null,
      },
    ],
  },
  situations: {
    title: 'Situationen-T',
    items: [{ id: 's', title: 'Situation-T', description: 'Satz-T', icon: null }],
    outro: 'Outro-T',
  },
  gallery: {
    title: 'Galerie-T',
    autoplay: true,
    items: [
      {
        id: 'foto-1',
        title: 'Foto-T',
        media: {
          desktop: {
            assetId: '00000000-0000-4000-8000-000000000077',
            kind: 'IMAGE',
            url: 'http://localhost:4000/media/public/foto.webp',
            mimeType: 'image/webp',
            width: 1333,
            height: 2000,
            altText: 'Foto-Alt',
          },
        },
      },
    ],
  },
  steps: {
    title: 'Stufen-T',
    items: [
      { id: 'a', group: 'Gruppe-A', title: 'Stufe-A', description: 'Text-A', icon: null },
      { id: 'b', group: 'Gruppe-A', title: 'Stufe-B', description: 'Text-B', icon: null },
      { id: 'c', group: 'Gruppe-B', title: 'Stufe-C', description: 'Text-C', icon: null },
    ],
  },
  theme: {
    background: '#ffffff',
    surface: '#ffffff',
    surfaceSunken: '#eeeeee',
    heading: '#111111',
    text: '#111111',
    textMuted: '#333333',
    textSubtle: '#555555',
    eyebrow: '#665544',
    button: '#111111',
    buttonText: '#ffffff',
    accent: '#aa9966',
    accentSecondary: '#cc5533',
    dark: '#111111',
  },
  home: {
    hero: {
      eyebrow: 'Home-Eyebrow-T',
      lines: ['Zeile-A', 'Zeile-B'],
      body: 'Home-Text-T',
      primary: { label: 'Home-CTA-T', href: '#bewerben' },
      secondary: { label: 'Home-CTA-Zwei', href: '#pakete' },
      note: 'Home-Hinweis-T',
      media: null,
    },
    intro: { caption: 'Video-Unterschrift-T', media: null },
    results: {
      eyebrow: 'Ergebnis-Eyebrow-T',
      title: 'Ergebnis-Titel-T',
      videos: [{ id: 'video-1', quote: 'Video-Zitat-T', who: 'Person-T', media: null }],
      swipeHint: 'Wischen-T',
      gallery: [{ id: 'ergebnis-1', who: 'Galerie-T', media: null }],
    },
    journey: {
      title: 'Weg-Titel-T',
      stages: [
        { id: 'a', name: 'Etappe-A', title: 'Etappe-Titel-A', text: 'Etappe-Text-A', media: null },
        { id: 'b', name: 'Etappe-B', title: 'Etappe-Titel-B', text: 'Etappe-Text-B', media: null },
      ],
    },
    voices: { eyebrow: 'Stimmen-T', items: [{ id: 's-1', quote: 'Stimme-T', who: 'Wer-T' }] },
    doubts: {
      title: 'Zweifel-Titel-T',
      items: [{ id: 'z-1', text: 'Zweifel-Satz-T' }],
      outro: 'Ein normaler Startpunkt-T für alle.',
      outroHighlight: 'Startpunkt-T',
    },
    included: {
      title: 'Leistung-Titel-T',
      items: [{ id: 'l-1', title: 'Leistung-T', text: 'Leistung-Text-T' }],
    },
    packages: {
      title: 'Paket-Titel-T',
      items: [
        {
          id: 'p-1',
          name: 'Paket-A',
          label: 'Label-A',
          featured: false,
          features: ['Merkmal-A'],
          cta: { label: 'Bewerben-A', href: '#bewerben' },
        },
        {
          id: 'p-2',
          name: 'Paket-B',
          label: 'Beliebt-T',
          featured: true,
          features: ['Merkmal-B'],
          note: 'Hinweis-B',
          cta: { label: 'Bewerben-B', href: '#bewerben' },
        },
      ],
    },
    steps: { title: 'Ablauf-Titel-T', items: [{ id: 'st-1', title: 'Schritt-T', text: 'Text-T' }] },
    training: {
      title: 'Training-Titel-T',
      items: [{ id: 't-1', label: 'Kraft-T', text: 'Karte-T', media: null }],
    },
    coach: {
      name: 'Coach-Name-T',
      facts: ['Fakt-T'],
      paragraphs: ['Absatz-Coach-T'],
      closing: 'Schluss-T',
      media: null,
    },
    faq: {
      title: 'FAQ-Titel-T',
      items: [
        { id: 'f-1', question: 'Frage-Home-1', answer: 'Antwort-Home-1' },
        { id: 'f-2', question: 'Frage-Home-2', answer: 'Antwort-Home-2' },
      ],
    },
    cta: {
      title: 'CTA-Home-Titel-T',
      body: 'CTA-Home-Text-T',
      action: { label: 'CTA-Home-Button', href: '#bewerben' },
      media: null,
    },
    apply: {
      title: 'Bewerben-Titel-T',
      channels: [
        {
          id: 'instagram',
          tag: 'IG',
          title: 'Instagram',
          cta: 'Zu Instagram',
          href: 'https://instagram.com/demo',
        },
      ],
    },
    headerCta: { label: 'Header-CTA-T', href: '/#bewerben' },
    menu: [{ id: 'faq', label: 'FAQ', href: '/#faq' }],
  },
  seo: {
    title: 'SEO-Titel',
    description: 'SEO-Beschreibung',
    siteName: 'VITRUV',
    ogImage: null,
    faqStructuredData: true,
  },
};

const section = <T extends keyof typeof CONTENT>(type: T, key: string = type) =>
  ({ key, type, content: CONTENT[type] }) as PublicWebsiteSection;

describe('public section registry', () => {
  it('has exactly one production renderer per contract section type', () => {
    expect(Object.keys(PUBLIC_SECTION_RENDERERS).sort()).toEqual([...WEBSITE_SECTION_TYPES].sort());
  });

  it('renders every type with its CMS content under a stable anchor = CMS key', () => {
    for (const type of WEBSITE_SECTION_TYPES) {
      const markup = render(section(type));
      if (type === 'seo' || type === 'theme')
        expect(markup).toBe(''); // page/design settings never render as content
      // the reference homepage is a whole page: its anchors are the prototype ones (#top …)
      else if (type === 'home') expect(markup).toContain('id="top"');
      else expect(markup, type).toContain(`id="${type}"`);
    }
    expect(render(section('faq', 'haeufige-fragen'))).toContain('id="haeufige-fragen"');
  });

  it('ignores unknown section types instead of breaking the page', () => {
    const unknown = {
      key: 'x',
      type: 'testimonials',
      content: {},
    } as unknown as PublicWebsiteSection;
    expect(render(unknown)).toBe('');
  });
});

describe('section renderers', () => {
  it('hero: the h1 with the accent phrase, two chamfered CTAs, no media without a medium', () => {
    const markup = render(section('hero'));
    expect(markup).toMatch(
      /<h1 id="hero-title"[^>]*>[^<]*Titel[^<]*mit[^<]*<span class="vf-hl vf-hl--glow">Akzent<\/span>[^<]*<\/h1>/,
    );
    expect(markup).toContain('href="#cta"');
    expect(markup).toContain('CTA-Zwei');
    expect(markup.match(/class="vf-btn /g)).toHaveLength(2);
    expect(markup).not.toContain('data-hero-media');
    expect(markup).not.toContain('<img');
    expect(splitHighlight('Ohne Treffer', 'xyz')).toEqual({
      before: 'Ohne Treffer',
      highlight: '',
      after: '',
    });
  });

  it('hero: renders CMS media (optimised, eager) instead of the fallback', () => {
    const hero = {
      ...CONTENT.hero,
      media: { desktop: img(), mobile: img({ url: 'https://media.example.test/m.webp' }) },
    };
    const markup = render({ key: 'hero', type: 'hero', content: hero });
    expect(markup).not.toContain('data-hero-fallback');
    expect(markup).toContain('loading="eager"');
    expect(markup).toContain('media="(max-width: 767px)"');
  });

  it('hero: video uses poster, metadata preload and no autoplay in server HTML', () => {
    const video = img({
      kind: 'VIDEO',
      mimeType: 'video/mp4',
      url: 'https://media.example.test/v.mp4',
      altText: '',
    });
    const markup = render({
      key: 'hero',
      type: 'hero',
      content: {
        ...CONTENT.hero,
        media: { desktop: video, poster: img({ url: 'https://media.example.test/p.webp' }) },
      },
    });
    expect(markup).toContain('preload="metadata"');
    expect(markup).toContain(
      `poster="/_next/image?url=${encodeURIComponent('https://media.example.test/p.webp')}`,
    );
    expect(markup).not.toContain('autoPlay');
  });

  it('results: voices with CMS media only where assigned', () => {
    const markup = render(section('results'));
    expect(markup).toContain('D-2');
    expect(markup.match(/<img/g)).toHaveLength(1);
    expect(markup).toContain('<blockquote class="vf-voice__text">');
  });

  it('results: no items → only the introduction, no empty list', () => {
    const markup = render({
      key: 'results',
      type: 'results',
      content: { title: 'Nur Titel', items: [] },
    });
    expect(markup).not.toContain('<ul');
  });

  it('journey: reuses the production Journey component (semantic ordered list)', () => {
    const markup = render(section('journey'));
    expect(markup).toMatch(/<ol class="vt-weg__list">/);
    expect(markup).toContain('ST-2');
  });

  it('coaching: numbered features; full width without media', () => {
    const markup = render(section('coaching'));
    expect(markup).toContain('F-1');
    expect(markup).toContain('>01<');
    expect(markup).not.toContain('<img');
  });

  it('packages: highlight is marked by text, not colour only; no checkout', () => {
    const markup = render(section('packages'));
    expect(markup).toContain('Empfohlen');
    expect(markup.match(/Empfohlen/g)).toHaveLength(1);
    expect(markup).toContain('Preis-1');
    expect(markup).toContain('href="/kontakt"');
    expect(markup).not.toMatch(/stripe|checkout|warenkorb/i);
  });

  it('about: only CMS paragraphs; no portrait without an assigned medium', () => {
    const markup = render(section('about'));
    expect(markup).toContain('Absatz-2');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('<dl');
  });

  it('faq: buttons with aria-expanded/aria-controls; answers readable without JavaScript', () => {
    const markup = render(section('faq'));
    const buttons = [
      ...markup.matchAll(/<button[^>]*aria-expanded="(true|false)"[^>]*aria-controls="([^"]+)"/g),
    ];
    expect(buttons).toHaveLength(2);
    for (const [, , controls] of buttons) {
      expect(markup).toMatch(new RegExp(`id="${controls}" role="region" aria-labelledby="[^"]+"`));
    }
    // Server HTML: nothing hidden (progressive enhancement collapses after hydration).
    expect(markup).not.toContain('hidden=""');
    expect(markup).toContain('Antwort-2');
  });

  it('hero with CMS media: full stage, copy set light on the media, media rendered', () => {
    const markup = render({
      key: 'hero',
      type: 'hero',
      content: { ...CONTENT.hero, media: { desktop: img() } },
    } as PublicWebsiteSection);
    expect(markup).toContain('data-hero-media=""');
    expect(markup).toContain('vf-hero__shade');
    expect(markup).toContain('<img');
    expect(markup).toMatch(/<h1 id="hero-title"/);
  });

  it('situations: quote cards with the CMS situation, description and closing line', () => {
    const markup = render(section('situations'));
    expect(markup).toMatch(/<h2 id="situations-title"/);
    expect(markup).toMatch(/<h3 class="vf-quote__title">Situation-T<\/h3>/);
    expect(markup).toContain('Satz-T');
    expect(markup).toContain('Outro-T');
  });

  it('pillars: one card per pillar, facets as a definition list', () => {
    const markup = render(section('pillars'));
    expect(markup).toMatch(/<li class="vf-card vf-pillar">/);
    expect(markup).toContain('<dt>Facette-T</dt>');
  });

  it('steps: one row per step in CMS order, numbered across groups, group label kept', () => {
    const markup = render(section('steps'));
    expect(markup.indexOf('Gruppe-A')).toBeLessThan(markup.indexOf('Gruppe-B'));
    expect(markup).toContain('>03<');
    expect(markup.match(/<li class="vf-step">/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('cta: single CMS action, no media without an assigned medium', () => {
    const markup = render(section('cta'));
    expect(markup).toContain('href="#faq"');
    expect(markup).not.toContain('vf-cta__media');
    expect(markup.match(/<a /g)).toHaveLength(1);
  });

  it('footer: CMS groups only; empty contact/social are omitted, nothing invented', () => {
    const markup = render(section('footer'));
    // the tagline heads the contact cards — without contact data there is no contact block
    expect(markup).not.toContain('Footer-Zeile');
    expect(markup).toContain('Nav-Pakete');
    expect(markup).not.toContain('Kontakt');
    expect(markup).not.toContain('mailto:');
    expect(markup).not.toContain('Social');
    const withContact = render({
      key: 'footer',
      type: 'footer',
      content: {
        ...CONTENT.footer,
        contact: { email: 'kontakt@example.com', phone: '+49 30 123' },
        social: [{ id: 's', platform: 'youtube', href: 'https://youtube.com/@demo' }],
      },
    });
    expect(withContact).toContain('Footer-Zeile');
    expect(withContact).toContain('href="mailto:kontakt@example.com"');
    expect(withContact).toContain('href="tel:+4930123"');
    expect(withContact).toContain('rel="noopener noreferrer"');
  });
});

describe('navigation from CMS content', () => {
  const page = (sections: PublicWebsiteSection[]): PublicWebsitePage => ({
    slug: 'home',
    title: 'Startseite',
    contentRevision: 1,
    publishedAt: null,
    sections,
  });

  it('parses anchors', () => {
    expect(anchorOf('#faq')).toBe('faq');
    expect(anchorOf('/#packages')).toBe('packages');
    expect(anchorOf('/impressum')).toBeNull();
    expect(anchorOf('https://example.com/#x')).toBeNull();
  });

  it('removes dead in-page links from the footer as well', () => {
    const footer = liveFooter(page([section('faq'), section('footer')]));
    const labels = footer?.type === 'footer' ? footer.content.navigation.map((l) => l.label) : [];
    expect(labels).toEqual(['Nav-FAQ', 'Nav-Extern']);
  });

  it('drops links to sections that are not rendered and takes the CTA from the CTA section', () => {
    const nav = buildNavigation(page([section('faq'), section('cta'), section('footer')]));
    expect(nav.items.map((i) => i.label)).toEqual(['Nav-FAQ', 'Nav-Extern']); // packages disabled
    expect(nav.cta).toEqual({ label: 'Aktion', href: '#faq' });
    expect(buildNavigation(page([section('faq')]))).toEqual({
      items: [],
      cta: null,
      logo: null,
      overHero: false,
      heroDark: false,
    });
  });
});

describe('homepage composition', () => {
  const render = async () => html(await HomePage());

  it('renders the reference page structure in prototype order with one h1', async () => {
    publicSite.getPublicHome.mockResolvedValue({
      ok: true,
      page: {
        slug: 'home',
        title: 'Startseite',
        contentRevision: 3,
        publishedAt: null,
        sections: [section('home'), section('hero'), section('faq'), section('footer')],
      },
    });
    const markup = await render();
    expect(markup).toContain('Home-Eyebrow-T');
    expect(markup).toContain('Startpunkt-T');
    // an external channel opens in a new tab without referrer
    expect(markup).toMatch(/href="https:\/\/instagram.com\/demo"[^>]*rel="noopener noreferrer"/);
    const order = [
      'id="top"',
      'data-video-sec',
      'id="ergebnisse"',
      'data-weg=""',
      'id="leistung"',
      'id="pakete"',
      'id="ablauf"',
      'id="coach"',
      'id="faq"',
      'id="bewerben"',
    ].map((needle) => markup.indexOf(needle));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The footer is rendered by the layout, not inside <main>.
    expect(markup).not.toContain('<footer');
    expect(markup.match(/<h1/g)).toHaveLength(1);
    // FAQ as native disclosures (readable and operable without JavaScript)
    expect(markup.match(/<details>/g)).toHaveLength(2);
  });

  it('takes the hero video from the CMS; empty slots render only their frame', async () => {
    publicSite.getPublicHome.mockResolvedValue({
      ok: true,
      page: {
        slug: 'home',
        title: 'Startseite',
        contentRevision: 3,
        publishedAt: null,
        sections: [
          {
            key: 'home',
            type: 'home',
            content: { ...CONTENT.home, hero: { ...CONTENT.home.hero, media: { desktop: img() } } },
          } as PublicWebsiteSection,
        ],
      },
    });
    const markup = await render();
    expect(markup.match(/<img/g)).toHaveLength(1);
    expect(markup).toContain('class="r-hero__video"');
  });

  it('without a published home section the calm failure state shows (no invented copy)', async () => {
    publicSite.getPublicHome.mockResolvedValue({
      ok: true,
      page: {
        slug: 'home',
        title: 'Startseite',
        contentRevision: 3,
        publishedAt: null,
        sections: [section('faq')],
      },
    });
    expect(await render()).toContain('nicht erreichbar');
  });

  it('shows a calm temporary failure state — never hardcoded marketing content', async () => {
    publicSite.getPublicHome.mockResolvedValue({ ok: false });
    const markup = await render();
    expect(markup).toContain('nicht erreichbar');
    expect(markup).not.toContain('id="hero"');
  });
});

describe('editorial integrity', () => {
  /** Every string literal (≥ 12 chars) of the API's seed content — real editorial copy. */
  const seed = readFileSync(
    join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      '..',
      'api',
      'src',
      'modules',
      'website',
      'seed-content.ts',
    ),
    'utf8',
  );
  const editorial = [...seed.matchAll(/'([^'\n]{12,})'/g)]
    .map((m) => m[1] as string)
    .filter((copy) => !/^[@./]/.test(copy)); // import specifiers and route paths

  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : [];
    });

  it('public components contain none of the CMS editorial copy', () => {
    const files = [
      ...sources(join(import.meta.dirname)),
      ...sources(join(import.meta.dirname, '..', '..', 'app', '(site)')),
      ...sources(join(import.meta.dirname, '..', 'journey')).filter(
        (f) => !f.includes('demo-data'),
      ),
    ];
    expect(editorial.length).toBeGreaterThan(10);
    const hits = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return editorial.filter((copy) => text.includes(copy)).map((copy) => `${file}: ${copy}`);
    });
    expect(hits).toEqual([]);
  });

  it('public code never reads source material', () => {
    const files = [
      ...sources(join(import.meta.dirname)),
      ...sources(join(import.meta.dirname, '..', 'cms')),
    ];
    for (const file of files) expect(readFileSync(file, 'utf8')).not.toContain('assets-source');
  });
});
