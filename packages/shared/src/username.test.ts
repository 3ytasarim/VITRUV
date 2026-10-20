import { describe, expect, it } from 'vitest';
import { USERNAME_PATTERN, usernameFromName, usernameWithSuffix } from './username';

describe('usernameFromName', () => {
  it.each([
    ['Rauf Onur', 'Çullu', 'raufonurcullu'],
    ['Jürgen', 'Groß', 'jurgengross'],
    ['Şule', 'Öztürk-Işık', 'suleozturkisik'],
    ['Anna-Lena', "O'Brien", 'annalenaobrien'],
    ['Zoë', 'Müller', 'zoemuller'],
  ])('%s %s → %s', (first, last, expected) => {
    expect(usernameFromName(first, last)).toBe(expected);
    expect(USERNAME_PATTERN.test(expected)).toBe(true);
  });

  it('falls back for too short names and cuts long ones to 32 characters', () => {
    expect(usernameFromName('A', '')).toBe('akunde');
    expect(usernameFromName('', '')).toBe('kunde');
    expect(usernameFromName('Maximilian Alexander', 'Schwarzenberger-Hohenlohe')).toHaveLength(32);
  });

  it('suffixes stay within the limit', () => {
    expect(usernameWithSuffix('raufonurcullu', 2)).toBe('raufonurcullu2');
    const long = 'a'.repeat(32);
    expect(usernameWithSuffix(long, 12)).toHaveLength(32);
    expect(usernameWithSuffix(long, 12).endsWith('12')).toBe(true);
  });
});
