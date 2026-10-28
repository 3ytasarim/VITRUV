import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
const { SiteHeader } = await import('./site-header');

describe('public header login', () => {
  it('always shows "Anmelden" → /login and the light/dark switch (also without CMS links)', () => {
    const markup = renderToStaticMarkup(
      <SiteHeader items={[]} cta={{ href: '/kontakt', label: 'Erstgespräch' }} />,
    );
    expect(markup).toMatch(/<a class="vt-login vf-login"[^>]*href="\/login"/);
    expect(markup).toContain('Anmelden');
    expect(markup).toContain('href="/kontakt"');
    // the switch names the OTHER mode and sits after the login, at the end of the bar
    expect(markup).toMatch(
      /<button type="button" class="vf-theme"[^>]*aria-label="Zur hellen Version"/,
    );
    expect(markup.indexOf('href="/login"')).toBeLessThan(markup.indexOf('class="vf-theme"'));
    const light = renderToStaticMarkup(<SiteHeader items={[]} cta={null} mode="light" />);
    expect(light).toContain('aria-label="Zur dunklen Version"');
    expect(light).toContain('<span>Dunkel</span>');
  });
});
