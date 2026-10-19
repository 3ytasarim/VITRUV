import { describe, expect, it } from 'vitest';
import {
  errorsFromDetails,
  isEqualContent,
  moveItem,
  newItemId,
  optionalValue,
  removeItem,
  replaceItem,
  scopeErrors,
  validateContent,
} from './editor-state';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('array editing', () => {
  it('moves items deterministically and ignores moves past the edges', () => {
    expect(moveItem(items, 0, 1).map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(moveItem(items, 2, -1).map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(moveItem(items, 0, -1).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(moveItem(items, 2, 1).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    // Pure: the input is never mutated.
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('removes and replaces by position', () => {
    expect(removeItem(items, 1).map((i) => i.id)).toEqual(['a', 'c']);
    expect(replaceItem(items, 1, { id: 'x' }).map((i) => i.id)).toEqual(['a', 'x', 'c']);
  });

  it('creates new IDs that never collide with existing ones', () => {
    const sequence = ['dup', 'dup', 'fresh'];
    const random = () => sequence.shift() ?? 'z';
    expect(newItemId('frage', [{ id: 'frage-dup' }], random)).toBe('frage-fresh');
    expect(newItemId('etappe', [])).toMatch(/^etappe-[a-z0-9]+$/);
  });
});

describe('field values and errors', () => {
  it('treats empty optional text as "not set"', () => {
    expect(optionalValue('')).toBeUndefined();
    expect(optionalValue('   ')).toBeUndefined();
    expect(optionalValue(' Text ')).toBe(' Text ');
  });

  it('maps API details to field paths and scopes them for nested groups', () => {
    const errors = errorsFromDetails([
      { path: 'content.primaryCta.href', message: 'Unsicherer Link' },
      { path: 'content.stages.1.title', message: 'Darf nicht leer sein.' },
      { path: 'content', message: 'Allgemein' },
    ]);
    expect(errors).toEqual({
      'primaryCta.href': 'Unsicherer Link',
      'stages.1.title': 'Darf nicht leer sein.',
      _: 'Allgemein',
    });
    expect(scopeErrors(errors, 'primaryCta')).toEqual({ href: 'Unsicherer Link' });
    expect(scopeErrors(errors, 'stages.1')).toEqual({ title: 'Darf nicht leer sein.' });
  });

  it('validates with the shared contract before saving', () => {
    const errors = validateContent('hero', {
      title: '',
      primaryCta: { label: 'Los', href: 'javascript:alert(1)' },
      media: null,
    });
    expect(Object.keys(errors).sort()).toEqual(['primaryCta.href', 'title']);
    expect(
      validateContent('faq', { title: 'FAQ', items: [{ id: 'q', question: 'F?', answer: 'A.' }] }),
    ).toEqual({});
  });

  it('detects unsaved changes by value', () => {
    expect(isEqualContent({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(isEqualContent({ a: 1 }, { a: 2 })).toBe(false);
  });
});
