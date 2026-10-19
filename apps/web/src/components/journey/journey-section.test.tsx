import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JOURNEY_DEMO, JourneyMapSection, type JourneyContent } from './index';

/** Server render = what users get before/without JavaScript (the map engine runs client-side). */
const html = renderToStaticMarkup(<JourneyMapSection content={JOURNEY_DEMO} />);

const textOnly = (markup: string) =>
  markup
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

describe('JourneyMapSection — baseline content (no JS)', () => {
  it('renders every stage name, title and description as HTML text outside the SVG', () => {
    const text = textOnly(html);
    for (const stage of JOURNEY_DEMO.stages) {
      expect(text).toContain(stage.name);
      expect(text).toContain(stage.title);
      expect(text).toContain(stage.description);
    }
  });

  it('keeps the stage order in a semantic ordered list (prototype data-weg markup)', () => {
    expect(html).toMatch(/<ol class="vt-weg__list">/);
    const positions = JOURNEY_DEMO.stages.map((s) => html.indexOf(s.title));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html.match(/data-weg-m=""/g)).toHaveLength(JOURNEY_DEMO.stages.length);
  });

  it('alternates image/text sides like the prototype', () => {
    expect(html.match(/vt-weg__m vt-weg__m--reverse/g)).toHaveLength(
      Math.floor(JOURNEY_DEMO.stages.length / 2),
    );
  });

  it('has a logical heading hierarchy (section h2, stage h3)', () => {
    // Title words are masked spans for the reveal; the text itself is unchanged.
    const h2 = /<h2 [^>]*id="journey-title"[^>]*>(.*?)<\/h2>/.exec(html);
    expect(h2?.[1]?.replace(/<[^>]+>/g, '')).toBe('Vier Etappen. Ein Ziel.');
    expect(html.match(/<h3 /g)).toHaveLength(JOURNEY_DEMO.stages.length);
    expect(html).toMatch(/<section id="journey" aria-labelledby="journey-title"/);
  });

  it('hides the decorative map, route and progress dot from assistive technology', () => {
    expect(html).toMatch(/<svg data-weg-svg="" aria-hidden="true"/);
    expect(html).toMatch(/<div data-weg-dot="" aria-hidden="true"/);
  });

  it('starts at 0 % and is not "ready" before the client engine ran (stable SSR)', () => {
    expect(html).toContain('<span data-weg-pct="">0%</span>');
    expect(html).not.toContain('data-weg-ready');
    expect(html).not.toContain('data-on=');
    expect(renderToStaticMarkup(<JourneyMapSection content={JOURNEY_DEMO} />)).toBe(html);
  });

  it('is data-driven: renders any number of stages with their own keys', () => {
    const three: JourneyContent = { ...JOURNEY_DEMO, stages: JOURNEY_DEMO.stages.slice(0, 3) };
    const markup = renderToStaticMarkup(<JourneyMapSection content={three} id="weg" />);
    expect(markup.match(/data-weg-m=""/g)).toHaveLength(3);
    expect(markup).toContain('03 / 03');
    expect(markup).toContain('id="weg-title"');
    expect(markup).not.toContain(JOURNEY_DEMO.stages[3]!.title);
  });

  it('shows the media placeholder when a stage has no media', () => {
    expect(html).toContain('Ernährung · Medium folgt');
  });
});

describe('Journey styles', () => {
  const css = readFileSync(
    join(import.meta.dirname, '..', '..', 'styles', 'components.css'),
    'utf8',
  );

  it('hides map, route and dot until the engine is ready (content stays visible)', () => {
    expect(css).toMatch(/\.vt-weg:not\(\[data-weg-ready\]\) :is\(\.vt-weg__svg, \.vt-weg__dot\)/);
  });

  it('only dims upcoming stages after client enhancement — the copy, never the card', () => {
    expect(css).toMatch(
      /\[data-weg-ready\] \.vt-weg__m\[data-on='false'\] \.vt-weg__txt \{\s*opacity/,
    );
    expect(css).not.toMatch(/\.vt-weg__m\[data-on='false'\] \{[^}]*opacity/);
  });

  it('turns all Journey transitions off under reduced motion', () => {
    const block = css.slice(
      css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('.vt-weg')),
    );
    expect(block).toMatch(/\[data-weg-map\] \[data-dr\][\s\S]*transition: none !important/);
  });
});
