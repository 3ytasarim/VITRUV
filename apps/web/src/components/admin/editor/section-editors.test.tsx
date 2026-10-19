// @vitest-environment happy-dom
import type { AdminMediaAsset, SectionContent, WebsiteSectionSummary } from '@vitruv/contracts';
import type { WebsiteSectionType } from '@vitruv/shared';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  saveDraftAction: vi.fn(),
  publishAction: vi.fn(),
  discardDraftAction: vi.fn(),
  listMediaAction: vi.fn(),
  mediaDetailAction: vi.fn(),
  updateMediaAltAction: vi.fn(),
  deleteMediaAction: vi.fn(),
}));
vi.mock('@/app/admin/website-actions', () => actions);
vi.mock('@/app/admin/training-actions', () => ({
  listTrainingMediaAction: vi.fn(async () => ({ ok: true, data: { items: [] } })),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/website/inhalte',
}));

const { SectionEditor } = await import('./section-editor');

const image: AdminMediaAsset = {
  id: '0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f',
  kind: 'IMAGE',
  visibility: 'PUBLIC',
  fileName: 'testmuster.webp',
  mimeType: 'image/webp',
  sizeBytes: 2048,
  width: 1600,
  height: 900,
  durationMs: null,
  altText: 'Neutrales Testmuster',
  url: 'http://localhost:4000/media/public/website/2026/10/x.webp',
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
  usageCount: 0,
};

const summary = (type: WebsiteSectionType, hasDraft = false): WebsiteSectionSummary => ({
  id: '1c8f4d2f-9b3e-4a7c-8d4f-3e2b6c8d0f1a',
  key: type,
  type,
  sortOrder: 10,
  enabled: true,
  hasDraft,
  hasPublished: true,
  draftUpdatedAt: null,
  publishedAt: '2026-10-15T10:00:00.000Z',
});

function renderEditor<T extends WebsiteSectionType>(type: T, published: SectionContent<T> | null) {
  const user = userEvent.setup();
  render(
    <SectionEditor
      sectionKey={type}
      type={type}
      summary={summary(type)}
      draft={null}
      published={published as Record<string, unknown> | null}
      media={[image]}
    />,
  );
  return user;
}

/** The content passed to the last "save draft" call. */
const savedContent = <T,>() => actions.saveDraftAction.mock.lastCall?.[1] as T;
const group = (name: string | RegExp) => screen.getByRole('group', { name });
const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /Entwurf speichern/ }));

async function typeInto(
  user: ReturnType<typeof userEvent.setup>,
  scope: HTMLElement,
  label: string,
  text: string,
) {
  // Exact field label (optionally followed by the required marker / "optional"), not button names.
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const field = within(scope).getByLabelText(new RegExp(`^${escaped}(\\s*\\*|\\s*optional)?$`));
  await user.clear(field);
  if (text) await user.type(field, text);
}

/** Opens the picker of a media group and selects the test image. */
async function pickImage(user: ReturnType<typeof userEvent.setup>, mediaGroup: HTMLElement) {
  await user.click(within(mediaGroup).getByRole('button', { name: 'Medium wählen' }));
  const option = await screen.findByRole('button', { name: /testmuster\.webp/ });
  await user.click(option);
  await waitFor(() => expect(within(mediaGroup).getByText(/testmuster\.webp ·/)).toBeTruthy());
}

beforeEach(() => {
  actions.saveDraftAction.mockImplementation(async (_key: string, content: unknown) => ({
    ok: true,
    data: {
      draft: {
        id: '2d9f5e3f-0c4f-4b8d-9e5f-4f3c7d9e1f2b',
        status: 'DRAFT',
        content,
        schemaVersion: 1,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-15T10:00:00.000Z',
        publishedAt: null,
      },
      warnings: [],
    },
  }));
  actions.publishAction.mockResolvedValue({
    ok: true,
    data: { published: {}, contentRevision: 2 },
  });
  actions.listMediaAction.mockResolvedValue({ ok: true, data: { items: [image] } });
  // happy-dom: make sure <dialog>.showModal exists.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Results editor', () => {
  const published: SectionContent<'results'> = { title: 'Ergebnisse', items: [] };

  it('adds, edits, reorders and removes items with stable IDs, then saves', async () => {
    const user = renderEditor('results', published);
    expect(screen.getByText(/Noch keine Ergebnisse/)).toBeTruthy();
    const add = screen.getByRole('button', { name: 'Ergebnis hinzufügen' });
    await user.click(add);
    await typeInto(user, group('Ergebnis 1'), 'Kennzahl', '8 Wochen');
    await typeInto(user, group(/Ergebnis 1 ·/), 'Bezeichnung', 'Programmdauer');
    await user.click(add);
    await typeInto(user, group('Ergebnis 2'), 'Kennzahl', '3x');
    await typeInto(user, group(/Ergebnis 2 ·/), 'Bezeichnung', 'Training pro Woche');
    await user.click(screen.getByRole('button', { name: 'Ergebnis 2 · 3x nach oben verschieben' }));
    await user.click(add);
    await user.click(screen.getByRole('button', { name: 'Ergebnis 3 entfernen' }));
    await save(user);

    const content = savedContent<SectionContent<'results'>>();
    expect(content.items.map((i) => i.value)).toEqual(['3x', '8 Wochen']);
    expect(content.items.every((i) => /^ergebnis-[a-z0-9]+$/.test(i.id))).toBe(true);
    expect(new Set(content.items.map((i) => i.id)).size).toBe(2);
    expect(
      await screen.findByText(/Entwurf gespeichert\. Die Website ist unverändert/),
    ).toBeTruthy();
  });

  it('shows field errors and does not save invalid items', async () => {
    const user = renderEditor('results', published);
    await user.click(screen.getByRole('button', { name: 'Ergebnis hinzufügen' }));
    await save(user);
    expect(actions.saveDraftAction).not.toHaveBeenCalled();
    const kennzahl = within(group('Ergebnis 1')).getByLabelText(/^Kennzahl/);
    expect(kennzahl.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByText('Darf nicht leer sein.').length).toBeGreaterThan(0);
  });

  it('assigns item media through the shared media picker (reference only)', async () => {
    const user = renderEditor('results', {
      title: 'Ergebnisse',
      items: [{ id: 'eins', value: '8 Wochen', label: 'Dauer', media: null }],
    });
    await pickImage(user, group('Bild Ergebnis 1'));
    await save(user);
    expect(savedContent<SectionContent<'results'>>().items[0]?.media).toEqual({
      desktop: { assetId: image.id },
    });
  });
});

describe('Coaching editor', () => {
  it('edits repeated feature cards, saves and publishes through the shared lifecycle', async () => {
    const user = renderEditor('coaching', {
      title: 'Coaching',
      features: [{ id: 'analyse', title: 'Analyse', description: 'Ausgangslage klären.' }],
      media: null,
    });
    await typeInto(user, group('Leistung 1 · Analyse'), 'Titel', 'Analyse & Ziele');
    await user.click(screen.getByRole('button', { name: 'Leistung hinzufügen' }));
    await typeInto(user, group('Leistung 2'), 'Titel', 'Plan');
    await typeInto(user, group(/Leistung 2 ·/), 'Beschreibung', 'Ein Plan, der passt.');
    const publish = screen.getByRole('button', { name: /Veröffentlichen/ });
    expect(publish.hasAttribute('disabled')).toBe(true); // unsaved changes block publishing
    await save(user);
    await waitFor(() => expect(publish.hasAttribute('disabled')).toBe(false));
    await user.click(publish);
    expect(actions.publishAction).toHaveBeenCalledWith('coaching');
    expect(await screen.findByText(/Veröffentlicht\. Die Website zeigt/)).toBeTruthy();
    expect(savedContent<SectionContent<'coaching'>>().features.map((f) => f.title)).toEqual([
      'Analyse & Ziele',
      'Plan',
    ]);
  });
});

describe('Packages editor', () => {
  const published: SectionContent<'packages'> = {
    title: 'Pakete',
    packages: [
      {
        id: 'basis',
        name: 'Basis',
        features: ['Erstgespräch'],
        cta: { label: 'Anfragen', href: '/kontakt' },
        highlighted: false,
      },
      {
        id: 'plus',
        name: 'Plus',
        features: [],
        cta: { label: 'Anfragen', href: '/kontakt' },
        highlighted: true,
      },
    ],
  };

  it('edits features, rejects unsafe CTA links and reorders packages', async () => {
    const user = renderEditor('packages', published);
    const basis = group('Paket 1 · Basis');
    await user.click(within(basis).getByRole('button', { name: 'Leistung hinzufügen' }));
    await typeInto(user, basis, 'Paket 1 Leistung 2', 'Trainingsplan');
    await user.click(
      within(basis).getByRole('button', { name: 'Paket 1 Leistung 2 nach oben verschieben' }),
    );
    const button = group('Button Paket 1');
    await typeInto(user, button, 'Link', 'javascript:alert(1)');
    await save(user);
    expect(actions.saveDraftAction).not.toHaveBeenCalled();
    expect(within(button).getByLabelText(/^Link/).getAttribute('aria-invalid')).toBe('true');

    await typeInto(user, button, 'Link', '/kontakt?paket=basis');
    await user.click(
      screen.getByRole('button', { name: 'Paket 2 · Plus (hervorgehoben) nach oben verschieben' }),
    );
    await save(user);
    const content = savedContent<SectionContent<'packages'>>();
    expect(content.packages.map((p) => p.id)).toEqual(['plus', 'basis']);
    expect(content.packages[1]?.features).toEqual(['Trainingsplan', 'Erstgespräch']);
    expect(content.packages[1]?.cta.href).toBe('/kontakt?paket=basis');
  });
});

describe('About editor', () => {
  it('starts empty (nothing pre-filled from source material) and requires a paragraph', async () => {
    const user = renderEditor('about', null);
    const textboxes = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(textboxes.every((box) => box.value === '')).toBe(true);
    expect(screen.getByText(/Keine Gesundheits-, Familien- oder/)).toBeTruthy();
    await save(user); // nothing typed yet → no change
    expect(actions.saveDraftAction).not.toHaveBeenCalled();
  });

  it('edits paragraphs and highlights and assigns a portrait', async () => {
    const user = renderEditor('about', {
      title: 'Dein Coach',
      paragraphs: ['Platzhaltertext.'],
      highlights: [],
      media: null,
    });
    await typeInto(user, document.body, 'Absatz 1', 'Neutraler Entwicklungstext.');
    await user.click(screen.getByRole('button', { name: 'Absatz hinzufügen' }));
    await typeInto(user, document.body, 'Absatz 2', 'Zweiter Absatz.');
    await user.click(screen.getByRole('button', { name: 'Eckdatum hinzufügen' }));
    await typeInto(user, group('Eckdatum 1'), 'Wert', '10+');
    await typeInto(user, group(/Eckdatum 1 ·/), 'Bezeichnung', 'Jahre Erfahrung');
    await pickImage(user, group('Porträt / Medium'));
    await save(user);
    const content = savedContent<SectionContent<'about'>>();
    expect(content.paragraphs).toEqual(['Neutraler Entwicklungstext.', 'Zweiter Absatz.']);
    expect(content.highlights[0]).toMatchObject({ value: '10+', label: 'Jahre Erfahrung' });
    expect(content.media?.desktop.assetId).toBe(image.id);
  });
});

describe('CTA editor', () => {
  const published: SectionContent<'cta'> = {
    title: 'Bereit?',
    action: { label: 'Erstgespräch', href: '/#kontakt' },
    media: null,
  };

  it.each(['data:text/html,x', 'http://example.com', '//evil.example'])(
    'rejects the unsafe link %s',
    async (href) => {
      const user = renderEditor('cta', published);
      await typeInto(user, group('Button'), 'Link', href);
      await save(user);
      expect(actions.saveDraftAction).not.toHaveBeenCalled();
      expect(within(group('Button')).getByText(/Nur interne Pfade/)).toBeTruthy();
    },
  );

  it('saves a safe https link', async () => {
    const user = renderEditor('cta', published);
    await typeInto(user, group('Text'), 'Text', 'Kurzer Text.');
    await typeInto(user, group('Button'), 'Link', 'https://example.com/termin');
    await save(user);
    expect(savedContent<SectionContent<'cta'>>()).toMatchObject({
      body: 'Kurzer Text.',
      action: { href: 'https://example.com/termin' },
    });
  });
});

describe('Footer editor', () => {
  const published: SectionContent<'footer'> = {
    navigation: [],
    legal: [{ id: 'impressum', label: 'Impressum', href: '/impressum' }],
    contact: {},
    social: [],
  };

  it('adds and reorders links, validates social URLs and e-mail, then saves', async () => {
    const user = renderEditor('footer', published);
    const addNav = screen.getByRole('button', { name: 'Navigationslink hinzufügen' });
    await user.click(addNav);
    await typeInto(user, group('Navigationslink 1'), 'Beschriftung', 'Start');
    await typeInto(user, group(/Navigationslink 1 ·/), 'Link', '/');
    await user.click(addNav);
    await typeInto(user, group('Navigationslink 2'), 'Beschriftung', 'FAQ');
    await typeInto(user, group(/Navigationslink 2 ·/), 'Link', '#faq');
    await user.click(
      screen.getByRole('button', { name: 'Navigationslink 2 · FAQ nach oben verschieben' }),
    );

    await user.click(screen.getByRole('button', { name: 'Profil hinzufügen' }));
    const profile = group(/Profil 1/);
    await user.selectOptions(within(profile).getByLabelText('Plattform'), 'youtube');
    await typeInto(user, group(/Profil 1/), 'Profil-Adresse', 'http://youtube.com/x');
    await typeInto(user, group('Kontakt'), 'E-Mail', 'keine-adresse');
    await save(user);
    expect(actions.saveDraftAction).not.toHaveBeenCalled();
    expect(within(group(/Profil 1/)).getByText(/https:\/\/-Adressen erlaubt/)).toBeTruthy();
    expect(within(group('Kontakt')).getByText('Ungültige E-Mail-Adresse.')).toBeTruthy();

    await typeInto(user, group(/Profil 1/), 'Profil-Adresse', 'https://youtube.com/@vitruv-demo');
    await typeInto(user, group('Kontakt'), 'E-Mail', '');
    await save(user);
    const content = savedContent<SectionContent<'footer'>>();
    expect(content.navigation.map((l) => l.label)).toEqual(['FAQ', 'Start']);
    expect(content.social).toEqual([
      expect.objectContaining({ platform: 'youtube', href: 'https://youtube.com/@vitruv-demo' }),
    ]);
    expect(content.contact.email).toBeUndefined();
  });
});
