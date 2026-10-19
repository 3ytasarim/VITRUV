import { contrastRatio, isValidHex } from './color';
import {
  type ColorRole,
  type ColorValue,
  REQUIRED_COLOR_ROLES,
  type tokens as Tokens,
} from './tokens';

type TokenSet = typeof Tokens;
type Themes = Record<string, Record<string, ColorValue>>;

export const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * Structural checks that TypeScript alone cannot guarantee. Returns a list of problems
 * (empty = valid). The generator refuses to write output when this is non-empty.
 */
export function validateTokens(t: TokenSet): string[] {
  const problems: string[] = [];
  const themes = t.colors as unknown as Themes;

  for (const [hexName, hex] of Object.entries(t.palette)) {
    if (!isValidHex(hex)) problems.push(`palette.${hexName}: invalid hex "${hex}"`);
  }

  for (const [theme, roles] of Object.entries(themes)) {
    for (const role of REQUIRED_COLOR_ROLES) {
      if (!roles[role]) problems.push(`colors.${theme}: missing required role "${role}"`);
    }
    // Two roles that flatten to the same CSS/Dart name would silently overwrite each other.
    const seen = new Map<string, string>();
    for (const [role, value] of Object.entries(roles)) {
      const flat = kebab(role);
      const prev = seen.get(flat);
      if (prev)
        problems.push(`colors.${theme}: "${role}" and "${prev}" both map to "--color-${flat}"`);
      seen.set(flat, role);
      if (!isValidHex(value.hex))
        problems.push(`colors.${theme}.${role}: invalid hex "${value.hex}"`);
      if (value.alpha !== undefined && (value.alpha <= 0 || value.alpha > 1)) {
        problems.push(`colors.${theme}.${role}: alpha ${value.alpha} outside (0, 1]`);
      }
    }
    if (roles.bg?.alpha !== undefined) problems.push(`colors.${theme}.bg must be opaque`);
  }

  const typeNames = new Map<string, string>();
  for (const [name, role] of Object.entries(t.typeScale)) {
    const flat = kebab(name);
    const prev = typeNames.get(flat);
    if (prev) problems.push(`typeScale: "${name}" and "${prev}" both map to "${flat}"`);
    typeNames.set(flat, name);
    if (role.min <= 0 || role.max < role.min)
      problems.push(`typeScale.${name}: invalid size range`);
    if (role.min < 12)
      problems.push(`typeScale.${name}: ${role.min}px is below the 12px text minimum`);
    const loaded = t.fontFaces.some(
      (f) =>
        f.family === role.family && f.weight === role.weight && f.italic === Boolean(role.italic),
    );
    if (!loaded) {
      problems.push(
        `typeScale.${name}: ${role.family} ${role.weight}${role.italic ? ' italic' : ''} is not a loaded font face`,
      );
    }
  }

  for (const [name, role] of Object.entries(t.publicTypeScale)) {
    if (role.min < 12)
      problems.push(`publicTypeScale.${name}: ${role.min}px is below the 12px text minimum`);
    const loaded = t.publicFontFaces.some(
      (f) =>
        f.family === role.family && f.weight === role.weight && f.italic === Boolean(role.italic),
    );
    if (!loaded)
      problems.push(
        `publicTypeScale.${name}: ${role.family} ${role.weight} is not a loaded public font face`,
      );
  }

  for (const [name, weight] of Object.entries(t.adminTypeWeights)) {
    const loaded = t.publicFontFaces.some(
      (f) => f.family === 'sans' && f.weight === weight && !f.italic,
    );
    if (!loaded)
      problems.push(`adminTypeWeights.${name}: sans ${weight} is not a loaded public font face`);
  }

  const steps = Object.entries(t.space).map(([k, v]) => [Number(k), v] as const);
  for (const [key, px] of steps) {
    if (px !== key * t.spaceBase)
      problems.push(`space.${key} = ${px}px, expected ${key * t.spaceBase}px`);
  }

  for (const [name, px] of Object.entries(t.shape.chamfer)) {
    if (px <= 0) problems.push(`shape.chamfer.${name} must be positive`);
  }
  const bps = Object.values(t.layout.breakpoints);
  if (bps.some((bp, i) => i > 0 && bp <= (bps[i - 1] ?? 0))) {
    problems.push('layout.breakpoints must ascend');
  }

  return problems;
}

export interface ContrastResult {
  theme: string;
  fg: ColorRole;
  bg: ColorRole;
  ratio: number;
  min: number;
  pass: boolean;
  note: string;
}

export function checkContrast(t: TokenSet): ContrastResult[] {
  const results: ContrastResult[] = [];
  for (const [theme, roles] of Object.entries(t.colors)) {
    for (const req of t.contrastRequirements) {
      const ratio = contrastRatio(roles[req.fg], roles[req.bg], roles.bg);
      results.push({ theme, ...req, ratio: Number(ratio.toFixed(2)), pass: ratio >= req.min });
    }
  }
  return results;
}
