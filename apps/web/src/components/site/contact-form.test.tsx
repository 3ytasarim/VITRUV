import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(site)/kontakt/actions', () => ({ submitContact: vi.fn() }));
const { ContactForm } = await import('./contact-form');

const html = renderToStaticMarkup(<ContactForm startedAt={1_800_000_000_000} />);

/** The opening tag of the input/textarea with the given name (attribute order independent). */
const field = (name: string) =>
  [...html.matchAll(/<(?:input|textarea)\b[^>]*>/g)]
    .map((m) => m[0])
    .find((tag) => tag.includes(`name="${name}"`)) ?? '';

describe('ContactForm markup', () => {
  it('labels every visible field and marks required ones', () => {
    const ids = [...html.matchAll(/<(?:input|textarea)[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) expect(html).toContain(`for="${id}"`);
    for (const name of ['name', 'email', 'message']) expect(field(name)).toContain('required=""');
    expect(field('phone')).not.toContain('required');
  });

  it('uses mobile-friendly input types and autocomplete', () => {
    expect(field('email')).toContain('type="email"');
    expect(field('email')).toContain('autoComplete="email"');
    expect(field('email')).toContain('inputMode="email"');
    expect(field('phone')).toContain('type="tel"');
  });

  it('asks for explicit consent (never pre-checked) and links the privacy notice', () => {
    expect(field('consent')).toContain('type="checkbox"');
    expect(field('consent')).not.toContain('checked');
    expect(html).toContain('href="/datenschutz"');
  });

  it('hides the honeypot from people and assistive technology', () => {
    expect(html).toMatch(/<div aria-hidden="true" class="vt-hp">/);
    expect(field('website')).toContain('tabindex="-1"');
  });

  it('does not ask for health data', () => {
    expect(html).toContain('Bitte keine Gesundheitsdaten');
    expect(html).not.toMatch(/name="(diagnose|health|krankheit|gewicht|alter)"/i);
  });
});
