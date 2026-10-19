import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ArrowRight } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardLink,
  MediaFrame,
  MetaRow,
  SectionHeading,
  SectionIntro,
  chamfer,
} from './index';

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const css = readFileSync(join(import.meta.dirname, '..', '..', 'styles', 'components.css'), 'utf8');

/** Returns the declaration block of the first rule whose selector list matches exactly. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The selector must open its own rule (preceded by a closing brace, comment or file start),
  // so `.a::after` does not match the shared `.a::before, .a::after` block.
  const match = css.match(new RegExp(`(?:^|\\}|\\*/)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match?.[1]) throw new Error(`rule not found: ${selector}`);
  return match[1];
}

describe('chamfer system (components.css)', () => {
  it('never clips the element itself, so focus outlines and glow stay visible', () => {
    expect(rule('.vt-chamfer')).not.toMatch(/clip-path|overflow\s*:\s*hidden/);
  });

  it('draws the border as an even-odd ring and the fill inset by the border width', () => {
    const ring = rule('.vt-chamfer::before');
    expect(ring).toMatch(/clip-path:\s*polygon\(\s*evenodd/);
    expect(ring).toContain('background: var(--vt-border)');
    const fill = rule('.vt-chamfer::after');
    expect(fill).toContain('inset: var(--vt-bw)');
    expect(fill).toContain('background: var(--vt-fill)');
  });

  it('shortens the inner cut by bw·(2−√2) so the diagonal stroke keeps its width', () => {
    expect(rule('.vt-chamfer')).toContain('calc(var(--vt-cut) - var(--vt-bw) * 0.5858)');
  });

  it.each(['xs', 'sm', 'md', 'lg'])('maps cut %s to its design token', (cut) => {
    expect(rule(`.vt-cut-${cut}`)).toContain(`--vt-cut: var(--chamfer-${cut})`);
    expect(chamfer(cut as 'sm')).toBe(`vt-chamfer vt-cut-${cut}`);
  });

  it('provides a bordered button variant and a focus style for forced preview focus', () => {
    expect(rule('.vt-btn--secondary')).toContain('--vt-bw: var(--border-strong)');
    expect(rule(".vt-btn[data-preview-state='focus']")).toContain(
      'outline: var(--border-focus) solid var(--color-focus-ring)',
    );
  });

  it('defines component motion only behind prefers-reduced-motion: no-preference', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.vt-reveal/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.vt-glitch/);
  });
});

describe('Button', () => {
  it('renders a real <button type="button"> with the chamfer + variant classes', () => {
    const out = html(<Button>Weiter</Button>);
    expect(out).toMatch(/^<button type="button"/);
    expect(out).toContain('vt-chamfer');
    expect(out).toContain('vt-btn--primary');
    expect(out).toContain('type-button');
    expect(out).toContain('>Weiter</button>');
  });

  it('keeps submit type when requested', () => {
    expect(html(<Button type="submit">Senden</Button>)).toContain('type="submit"');
  });

  it('is natively disabled', () => {
    expect(html(<Button disabled>Nein</Button>)).toMatch(/<button[^>]* disabled=""/);
  });

  it('blocks interaction and announces busy state while loading, keeping the label', () => {
    const out = html(<Button loading>Speichern</Button>);
    expect(out).toMatch(/disabled=""/);
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('Speichern');
    expect(out).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it('hides decorative icons from assistive technology', () => {
    const out = html(
      <Button icon={<ArrowRight />} iconPosition="end">
        Los
      </Button>,
    );
    expect(out).toMatch(/<span aria-hidden="true"[^>]*><svg/);
    expect(out.indexOf('Los')).toBeLessThan(out.indexOf('<svg'));
  });

  it('labels icon-only buttons via aria-label', () => {
    const out = html(<Button variant="secondary" icon={<ArrowRight />} aria-label="Weiter" />);
    expect(out).toContain('aria-label="Weiter"');
    expect(out).toContain('vt-btn--icon');
  });

  it('renders navigation as a link, not a button', () => {
    const out = html(
      <ButtonLink href="/kontakt" variant="secondary">
        Kontakt
      </ButtonLink>,
    );
    expect(out).toMatch(/^<a [^>]*href="\/kontakt"/);
    expect(out).not.toContain('<button');
    expect(out).toContain('vt-btn--secondary');
  });
});

describe('Card', () => {
  it('composes semantic containers with tone, cut and padding', () => {
    const out = html(
      <Card as="article" tone="accent" glow cut="lg" padding="lg">
        <h3>Titel</h3>
      </Card>,
    );
    expect(out).toMatch(/^<article class="[^"]*vt-card vt-card--accent/);
    expect(out).toContain('vt-cut-lg');
    expect(out).toContain('vt-glow-strong');
    expect(out).not.toContain('vt-card--interactive');
  });

  it('makes the whole card a single focusable link when interactive', () => {
    const out = html(<CardLink href="#x">Inhalt</CardLink>);
    expect(out).toMatch(/^<a [^>]*class="[^"]*vt-card--interactive/);
  });
});

describe('MediaFrame', () => {
  it('reserves the aspect ratio and shows an accessible placeholder without media', () => {
    const out = html(<MediaFrame ratio="4/5" />);
    expect(out).toContain('aspect-4/5');
    expect(out).toContain('vt-media__clip');
    expect(out).toContain('Medium folgt');
  });

  it('renders CMS media inside the clip with its alt text', () => {
    const out = html(
      <MediaFrame
        ratio="16/9"
        slot={{
          desktop: {
            assetId: '00000000-0000-4000-8000-000000000001',
            kind: 'IMAGE',
            url: '/_design/test-landscape.svg',
            mimeType: 'image/svg+xml',
            width: 1600,
            height: 900,
            altText: 'Testmuster',
          },
        }}
      />,
    );
    expect(out).toContain('aspect-video');
    expect(out).toMatch(/vt-media__clip"><picture><img[^>]*alt="Testmuster"/);
  });

  it('supports the rounded frame', () => {
    expect(html(<MediaFrame shape="rounded" />)).toContain('vt-media--rounded');
  });
});

describe('text and small primitives', () => {
  it('keeps document level independent of visual size', () => {
    const out = html(
      <SectionHeading level={3} size="display">
        Titel
      </SectionHeading>,
    );
    expect(out).toMatch(/^<h3 class="type-display/);
  });

  it('builds an intro with eyebrow, heading id and lead', () => {
    const out = html(<SectionIntro eyebrow="Eyebrow" title="Titel" titleId="t1" lead="Lead" />);
    expect(out).toMatch(/<p class="vt-intro__eyebrow type-eyebrow text-accent-text">.*Eyebrow/);
    // Title words are masked spans but stay plain text.
    expect(out.replace(/<[^>]+>/g, '')).toContain('Titel');
    expect(out).toMatch(/<h2 id="t1"/);
    expect(out).toContain('Lead');
  });

  it('never conveys status by colour alone', () => {
    const out = html(
      <Badge tone="error" dot>
        Fehler
      </Badge>,
    );
    expect(out).toContain('Fehler');
    expect(out).toContain('<span aria-hidden="true" class="vt-badge__dot">');
  });

  it('marks metadata separators as decorative', () => {
    const out = html(<MetaRow items={['A', 'B']} />);
    expect(out.match(/aria-hidden="true"/g)).toHaveLength(1);
  });
});
