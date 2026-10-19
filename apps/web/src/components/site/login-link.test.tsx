import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
const { SiteHeader } = await import('./site-header');

describe('public header login', () => {
  it('always shows "Anmelden" → /login next to the CTA (also without CMS links)', () => {
    const markup = renderToStaticMarkup(
      <SiteHeader items={[]} cta={{ href: '/kontakt', label: 'Erstgespräch' }} />,
    );
    expect(markup).toMatch(/<a class="vt-login"[^>]*href="\/login"/);
    expect(markup).toContain('Anmelden');
    expect(markup.indexOf('href="/login"')).toBeLessThan(markup.indexOf('href="/kontakt"'));
  });
});
