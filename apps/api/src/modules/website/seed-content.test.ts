import { collectMediaRefs, parseSectionContent } from '@vitruv/contracts';
import { WEBSITE_SECTION_TYPES } from '@vitruv/shared';
import { describe, expect, it } from 'vitest';
import { HOME_SECTIONS, HOME_SEED_CONTENT } from './seed-content';

describe('home seed content', () => {
  it.each(WEBSITE_SECTION_TYPES)('%s is valid against its section schema', (type) => {
    const result = parseSectionContent(type, HOME_SEED_CONTENT[type]);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('places every section type exactly once, with stable keys', () => {
    expect(HOME_SECTIONS.map((s) => s.type).sort()).toEqual([...WEBSITE_SECTION_TYPES].sort());
    expect(new Set(HOME_SECTIONS.map((s) => s.key)).size).toBe(HOME_SECTIONS.length);
  });

  it('references no media and invents no results or prices', () => {
    for (const type of WEBSITE_SECTION_TYPES) {
      expect(collectMediaRefs(HOME_SEED_CONTENT[type])).toEqual([]);
    }
    expect(HOME_SEED_CONTENT.results.items).toEqual([]);
    expect(HOME_SEED_CONTENT.packages.packages).toEqual([]);
  });
});
