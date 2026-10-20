/** Login names: lowercase, start with a letter/digit, 3–32 chars of a-z 0-9 . _ - (DB check). */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const USERNAME_MAX_LENGTH = 32;

/** Letters that NFKD does not decompose into "base + accent" (Turkish/German/Nordic). */
const SPECIAL: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ß: 'ss',
  ẞ: 'ss',
  æ: 'ae',
  Æ: 'ae',
  ø: 'o',
  Ø: 'o',
  đ: 'd',
  Đ: 'd',
  ł: 'l',
  Ł: 'l',
};

/**
 * Login name from first + last name: "Rauf Onur" + "Çullu" → "raufonurcullu". Accents are
 * dropped (ç→c, ü→u, ş→s …), everything but a-z/0-9 is removed, the result is cut to 32
 * characters. Too short (< 3) or empty names fall back to "kunde". Uniqueness is the API's job
 * (it appends 2, 3 … when the name is taken).
 */
export function usernameFromName(firstName: string, lastName: string): string {
  const base = `${firstName}${lastName}`
    .replace(/[ıİßẞæÆøØđĐłŁ]/g, (c) => SPECIAL[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, USERNAME_MAX_LENGTH);
  return base.length >= 3 ? base : `${base}kunde`.slice(0, USERNAME_MAX_LENGTH);
}

/** "raufonurcullu" → "raufonurcullu2" … keeping within 32 characters. */
export function usernameWithSuffix(base: string, n: number): string {
  const suffix = String(n);
  return `${base.slice(0, USERNAME_MAX_LENGTH - suffix.length)}${suffix}`;
}
