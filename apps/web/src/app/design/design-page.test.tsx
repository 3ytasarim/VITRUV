import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

async function renderDesign(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const mod = await import('./page');
  return { html: renderToStaticMarkup(mod.default()), metadata: mod.metadata };
}

afterEach(() => vi.unstubAllEnvs());

describe('/design preview', () => {
  it('renders every foundation and component group', async () => {
    const { html } = await renderDesign({ NODE_ENV: 'development' });
    for (const group of [
      'colors',
      'typography',
      'spacing',
      'shapes',
      'motion',
      'buttons',
      'cards',
      'media',
      'text-primitives',
      'small-ui',
      'responsive',
    ]) {
      expect(html, group).toContain(`data-design-group="${group}"`);
    }
    expect(html).toContain('<h1 class="type-display');
    expect(html).toContain('logo asset pending');
  });

  it('shows all interactive button states', async () => {
    const { html } = await renderDesign({ NODE_ENV: 'development' });
    for (const state of ['hover', 'focus', 'active']) {
      expect(html).toContain(`data-preview-state="${state}"`);
    }
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Disabled<\/button>/);
    expect(html).toContain('aria-busy="true"');
  });

  it('is never indexable', async () => {
    const { metadata } = await renderDesign({ NODE_ENV: 'development' });
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it('is unavailable in production unless explicitly enabled', async () => {
    await expect(renderDesign({ NODE_ENV: 'production' })).rejects.toThrow('NEXT_NOT_FOUND');
    const { html } = await renderDesign({ NODE_ENV: 'production', DESIGN_PREVIEW: 'enabled' });
    expect(html).toContain('data-design-group="buttons"');
  });

  it('uses only local test media and neutral demo copy', async () => {
    const { html } = await renderDesign({ NODE_ENV: 'development' });
    const sources = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) expect(src).toMatch(/^\/_design\/test-/);
    expect(html).not.toMatch(/Philipp|Zypern/);
  });
});
