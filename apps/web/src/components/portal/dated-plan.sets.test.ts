import { describe, expect, it } from 'vitest';
import { setCount } from './dated-plan';

describe('setCount', () => {
  it('reads the number of sets from the standard', () => {
    expect(setCount('4 Sätze (Kraft) / Gesamtziel')).toBe(4);
    expect(setCount('3 Satz')).toBe(3);
    expect(setCount('6x Sätze')).toBe(6);
    expect(setCount('3 Saetze à 10 Wdh.')).toBe(3);
  });
  it('ignores other numbers and missing values', () => {
    expect(setCount('10 Wdh.')).toBe(0);
    expect(setCount(null)).toBe(0);
    expect(setCount('99 Sätze')).toBe(0);
  });
});
