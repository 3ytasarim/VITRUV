import type {
  AdminMediaAsset,
  AdminWebsitePage,
  FaqContent,
  HeroContent,
  JourneyCmsContent,
  WebsiteSectionSummary,
} from '@vitruv/contracts';
import { PERMISSIONS, roleHasPermission, type WebsiteSectionType } from '@vitruv/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { JOURNEY_DEMO } from '@/components/journey';

// Server actions + router are server/runtime dependencies; components only need their shape here.
vi.mock('@/app/admin/website-actions', () => ({
  saveDraftAction: vi.fn(),
  publishAction: vi.fn(),
  discardDraftAction: vi.fn(),
  listMediaAction: vi.fn(),
  mediaDetailAction: vi.fn(),
  updateMediaAltAction: vi.fn(),
  deleteMediaAction: vi.fn(),
  deleteMediaBulkAction: vi.fn(),
}));
vi.mock('@/app/admin/training-actions', () => ({
  listTrainingMediaAction: vi.fn(async () => ({ ok: true, data: { items: [] } })),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/website/inhalte',
}));

const { ContentOverview } = await import('./content-overview');
const { sectionStatuses } = await import('./section-registry');
const { HeroEditor } = await import('./editor/hero-editor');
const { JourneyEditor } = await import('./editor/journey-editor');
const { FaqEditor } = await import('./editor/faq-editor');
const { SectionEditor } = await import('./editor/section-editor');
const { MediaIndexProvider } = await import('./media/media-index');
const { MediaPickerGrid } = await import('./media/media-picker');
const { MediaLibrary } = await import('./media/media-library');
const { describeMedia, precheckUpload } = await import('./media/media-format');
const { SectionPreview } = await import('./preview/section-preview');
const { AdminNav } = await import('./admin-nav');

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
/** The opening tag of the <button> whose content contains `text`. */
const buttonWith = (markup: string, text: string) =>
  [...markup.matchAll(/<button([^>]*)>(.*?)<\/button>/gs)].find((m) => m[2]?.includes(text))?.[1] ??
  '';
const noop = () => undefined;

const summary = (overrides: Partial<WebsiteSectionSummary>): WebsiteSectionSummary => ({
  id: crypto.randomUUID(),
  key: 'hero',
  type: 'hero',
  sortOrder: 10,
  enabled: true,
  hasDraft: false,
  hasPublished: true,
  draftUpdatedAt: null,
  publishedAt: '2026-10-15T10:00:00.000Z',
  ...overrides,
});

const image: AdminMediaAsset = {
  id: '0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f',
  kind: 'IMAGE',
  visibility: 'PUBLIC',
  fileName: 'testmuster.webp',
  mimeType: 'image/webp',
  sizeBytes: 245_760,
  width: 1600,
  height: 900,
  durationMs: null,
  altText: null,
  url: 'http://localhost:4000/media/public/website/2026/10/x.webp',
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
  usageCount: 1,
};

const hero: HeroContent = {
  title: 'Stärker. Beweglicher.',
  primaryCta: { label: 'Erstgespräch', href: '/kontakt' },
  media: { desktop: { assetId: image.id } },
};

const journey: JourneyCmsContent = {
  eyebrow: 'Dein Weg',
  title: 'Vier Etappen. Ein Ziel.',
  stages: JOURNEY_DEMO.stages.map((stage) => ({ ...stage, media: null })),
};

describe('content overview', () => {
  it('derives every status from API data', () => {
    expect(sectionStatuses(summary({ hasDraft: true })).map((s) => s.label)).toEqual([
      'Veröffentlicht',
      'Entwurf mit Änderungen',
    ]);
    expect(sectionStatuses(summary({})).map((s) => s.label)).toEqual([
      'Veröffentlicht',
      'Kein Entwurf',
    ]);
    expect(sectionStatuses(summary({ hasPublished: false })).map((s) => s.label)).toEqual([
      'Kein Inhalt',
    ]);
    expect(sectionStatuses(summary({ enabled: false })).map((s) => s.label)).toContain(
      'Ausgeblendet',
    );
  });

  it('lists only the homepage (reference design) — retired sections and colours are hidden', () => {
    const page: AdminWebsitePage = {
      slug: 'home',
      title: 'Startseite',
      contentRevision: 3,
      lastPublishedAt: null,
      sections: [
        summary({ key: 'home', type: 'home', hasDraft: true }),
        summary({ key: 'hero', type: 'hero' }),
        summary({ key: 'theme', type: 'theme' }),
      ],
    };
    const markup = html(<ContentOverview page={page} />);
    expect(markup).toContain('href="/admin/website/inhalte/home"');
    expect(markup).toContain('Startseite');
    expect(markup).toContain('Entwurf mit Änderungen');
    expect(markup).not.toContain('href="/admin/website/inhalte/hero"');
    expect(markup).not.toContain('Farben');
  });

  it('shows an explicit empty state', () => {
    const markup = html(
      <ContentOverview
        page={{ slug: 'home', title: 'S', contentRevision: 0, lastPublishedAt: null, sections: [] }}
      />,
    );
    expect(markup).toContain('Diese Seite hat noch keine Bereiche');
  });
});

describe('section editors', () => {
  const withMedia = (node: React.ReactElement, media: AdminMediaAsset[] = [image]) =>
    html(<MediaIndexProvider initial={media}>{node}</MediaIndexProvider>);

  it('hero: labelled fields, linked errors and the selected media', () => {
    const markup = withMedia(
      <HeroEditor
        value={hero}
        onChange={noop}
        errors={{ 'primaryCta.href': 'Nur interne Pfade …', title: 'Darf nicht leer sein.' }}
      />,
    );
    expect(markup).toContain('value="Stärker. Beweglicher."');
    // Every input has a label pointing at it.
    const inputs = [...markup.matchAll(/<(?:input|textarea|select)[^>]*\bid="([^"]+)"/g)].map(
      (m) => m[1],
    );
    for (const id of inputs) expect(markup).toContain(`for="${id}"`);
    // Errors are announced on the field.
    expect(markup.match(/aria-invalid="true"/g)).toHaveLength(2);
    expect(markup).toMatch(/aria-describedby="[^"]*-error"/);
    expect(markup).toContain('testmuster.webp');
    expect(markup).toContain('In der Mediathek fehlt ein Alt-Text');
  });

  it('journey: one group per stage with deterministic reorder controls', () => {
    const markup = withMedia(<JourneyEditor value={journey} onChange={noop} errors={{}} />, []);
    expect(markup.match(/Etappe 0\d · /g)?.length).toBeGreaterThanOrEqual(4);
    expect(markup).toContain('Etappe 01 · Ernährung');
    const up = [
      ...markup.matchAll(/<button[^>]*aria-label="(Etappe [^"]+ nach oben verschieben)"[^>]*>/g),
    ];
    expect(up).toHaveLength(4);
    expect(up[0]?.[0]).toContain('disabled');
    expect(up[1]?.[0]).not.toContain('disabled');
    const down = [
      ...markup.matchAll(/<button[^>]*aria-label="Etappe [^"]+ nach unten verschieben"[^>]*>/g),
    ];
    expect(down[3]?.[0]).toContain('disabled');
  });

  it('journey: the last remaining stage cannot be removed; hidden stages are labelled', () => {
    const single = { ...journey, stages: [{ ...journey.stages[0]!, enabled: false }] };
    const markup = withMedia(<JourneyEditor value={single} onChange={noop} errors={{}} />, []);
    expect(markup).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Etappe 01 · Ernährung \(ausgeblendet\) entfernen"|<button[^>]*aria-label="Etappe 01 · Ernährung \(ausgeblendet\) entfernen"[^>]*disabled/,
    );
  });

  it('faq: question/answer pairs with add and per-item controls', () => {
    const faq: FaqContent = {
      title: 'Häufige Fragen',
      items: [
        { id: 'a', question: 'Wie starte ich?', answer: 'Mit einem Gespräch.' },
        { id: 'b', question: 'Was kostet es?', answer: 'Siehe Pakete.' },
      ],
    };
    const markup = withMedia(
      <FaqEditor
        value={faq}
        onChange={noop}
        errors={{ 'items.1.answer': 'Darf nicht leer sein.' }}
      />,
      [],
    );
    expect(markup).toContain('Frage hinzufügen');
    expect(markup).toContain('Frage 2 entfernen');
    expect(markup).toContain('Darf nicht leer sein.');
    expect(markup.indexOf('Wie starte ich?')).toBeLessThan(markup.indexOf('Was kostet es?'));
  });

  it('shell: publish is disabled without a saved draft; preview link only with content', () => {
    const markup = html(
      <SectionEditor
        sectionKey="hero"
        type="hero"
        summary={summary({})}
        draft={null}
        published={hero}
        media={[image]}
      />,
    );
    expect(buttonWith(markup, 'Veröffentlichen')).toContain('disabled');
    expect(buttonWith(markup, 'Entwurf speichern')).toContain('disabled'); // nothing changed yet
    expect(markup).toContain('href="/admin/website/vorschau/hero"');
    expect(markup).toContain('Veröffentlicht');
    expect(markup).not.toContain('Entwurf verwerfen');

    const withDraft = html(
      <SectionEditor
        sectionKey="hero"
        type="hero"
        summary={summary({ hasDraft: true })}
        draft={hero}
        published={hero}
        media={[image]}
      />,
    );
    expect(withDraft).toContain('Entwurf verwerfen');
    expect(withDraft).toContain('Entwurf gespeichert');
    expect(buttonWith(withDraft, 'Veröffentlichen')).not.toContain('disabled');
  });
});

describe('media picker and library', () => {
  it('picker shows loading, error, empty and selectable states', () => {
    expect(html(<MediaPickerGrid state={{ status: 'loading' }} onSelect={noop} />)).toContain(
      'Mediathek wird geladen',
    );
    expect(
      html(<MediaPickerGrid state={{ status: 'error', message: 'API weg' }} onSelect={noop} />),
    ).toContain('role="alert"');
    expect(
      html(<MediaPickerGrid state={{ status: 'ready', items: [] }} onSelect={noop} />),
    ).toContain('Noch keine passenden Medien');
    const grid = html(
      <MediaPickerGrid
        state={{ status: 'ready', items: [image] }}
        selectedId={image.id}
        onSelect={noop}
      />,
    );
    expect(grid).toContain('aria-pressed="true"');
    expect(grid).toContain('Bild · 1600×900 · 240 KB');
  });

  it('library shows the empty state and per-asset usage/alt badges', () => {
    expect(html(<MediaLibrary initialItems={[]} />)).toContain('Noch keine Medien');
    const markup = html(
      <MediaLibrary
        initialItems={[
          image,
          { ...image, id: crypto.randomUUID(), usageCount: 0, altText: 'Text' },
        ]}
      />,
    );
    expect(markup).toContain('In Verwendung');
    expect(markup).toContain('Unbenutzt');
    expect(markup.match(/Alt-Text fehlt/g)).toHaveLength(1);
    expect(markup).toContain('Hochladen');
    expect(markup).toContain('Mehrere auswählen');
    expect(html(<MediaLibrary initialItems={[]} />)).not.toContain('Mehrere auswählen');
  });

  it('formats metadata and prechecks uploads', () => {
    expect(
      describeMedia({
        kind: 'VIDEO',
        width: 1920,
        height: 1080,
        durationMs: 75_000,
        sizeBytes: 3 * 1024 * 1024,
      }),
    ).toBe('Video · 1920×1080 · 1:15 · 3,0 MB');
    expect(precheckUpload({ type: 'image/svg+xml', size: 10 })).toMatch(/nicht erlaubt/);
    expect(precheckUpload({ type: 'video/quicktime', size: 10 })).toMatch(/nicht erlaubt/);
    expect(precheckUpload({ type: 'image/png', size: 30 * 1024 * 1024 })).toMatch(/zu groß/);
    expect(precheckUpload({ type: 'video/mp4', size: 10 }, ['IMAGE'])).toMatch(/JPEG/);
    expect(precheckUpload({ type: 'image/webp', size: 10 })).toBeNull();
  });
});

describe('preview', () => {
  it('renders Journey drafts with the production component', () => {
    const markup = html(<SectionPreview type="journey" content={journey} />);
    expect(markup).toContain('class="vt-weg__list"');
    expect(markup).toContain('Tanke die richtige Energie.');
  });

  it('renders every section type with the production public renderers', () => {
    const resolved = {
      assetId: image.id,
      kind: 'IMAGE' as const,
      url: image.url,
      mimeType: 'image/webp',
      width: 1600,
      height: 900,
      altText: 'Testmuster',
    };
    const samples: { type: WebsiteSectionType; content: Record<string, unknown>; text: string }[] =
      [
        {
          type: 'results',
          content: {
            title: 'Ergebnisse',
            items: [{ id: 'a', value: '8 Wochen', label: 'Dauer', media: { desktop: resolved } }],
          },
          text: '8 Wochen',
        },
        {
          type: 'coaching',
          content: {
            title: 'Coaching',
            features: [{ id: 'a', title: 'Analyse', description: 'D.' }],
            media: null,
          },
          text: 'Analyse',
        },
        {
          type: 'packages',
          content: {
            title: 'Pakete',
            packages: [
              {
                id: 'p',
                name: 'Basis',
                priceLabel: 'auf Anfrage',
                features: ['Plan'],
                cta: { label: 'Anfragen', href: '/kontakt' },
                highlighted: true,
              },
            ],
          },
          text: 'auf Anfrage',
        },
        {
          type: 'about',
          content: {
            title: 'Dein Coach',
            paragraphs: ['Neutraler Text.'],
            highlights: [],
            media: null,
          },
          text: 'Neutraler Text.',
        },
        {
          type: 'cta',
          content: { title: 'Bereit?', action: { label: 'Los', href: '/#kontakt' }, media: null },
          text: 'Bereit?',
        },
        {
          type: 'footer',
          content: {
            tagline: 'VITRUV Coaching',
            navigation: [],
            legal: [{ id: 'i', label: 'Impressum', href: '/impressum' }],
            contact: {},
            social: [],
          },
          text: 'Impressum',
        },
      ];
    for (const sample of samples) {
      const markup = html(<SectionPreview type={sample.type} content={sample.content} />);
      expect(markup, sample.type).toContain(sample.text);
      expect(markup, sample.type).not.toContain('Vorschau nicht möglich');
    }
    expect(html(<SectionPreview type="results" content={samples[0]?.content ?? {}} />)).toContain(
      `/_next/image?url=${encodeURIComponent(image.url)}`,
    );
  });

  it('refuses content that does not satisfy the public contract', () => {
    const markup = html(<SectionPreview type="hero" content={{ title: '' }} />);
    expect(markup).toContain('Vorschau nicht möglich');
  });
});

describe('admin navigation', () => {
  const ADMIN = PERMISSIONS;
  const COACH = PERMISSIONS.filter((p) => roleHasPermission('COACH', p));

  it('marks the current page and links the training library', () => {
    const markup = html(<AdminNav permissions={ADMIN} />);
    expect(markup).toMatch(/aria-current="page"[^>]*>.*?Startseite/s);
    expect(markup).toContain('href="/admin/training/uebungen"');
  });

  it('shows only permitted areas; the coach team is switched off (one coach)', () => {
    const admin = html(<AdminNav permissions={ADMIN} />);
    expect(admin).toContain('href="/admin/kunden"');
    expect(admin).not.toContain('href="/admin/coaches"');
    const coach = html(<AdminNav permissions={COACH} />);
    expect(coach).toContain('href="/admin/kunden"');
    expect(coach).not.toContain('href="/admin/coaches"');
    // Website CMS is ADMIN-only: no Website group at all for coaches
    expect(admin).toContain('href="/admin/website"');
    expect(coach).not.toContain('/admin/website');
    expect(coach).not.toContain('>Website<');
    expect(coach).toContain('href="/admin/konto"');
    const minimal = html(<AdminNav permissions={['admin.access']} />);
    expect(minimal).not.toContain('href="/admin/kunden"');
    expect(minimal).not.toContain('/admin/website');
    expect(minimal).toContain('href="/admin/konto"');
  });
});
