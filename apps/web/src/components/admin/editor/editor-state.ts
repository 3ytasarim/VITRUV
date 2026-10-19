import { sectionContentSchemas } from '@vitruv/contracts';
import type { WebsiteSectionType } from '@vitruv/shared';

/**
 * Pure helpers behind the section editors (unit-tested; no React).
 * Array items carry stable IDs, so reordering never changes item identity or media roles.
 */

/** Field errors keyed by content path, e.g. `stages.2.title` or `primaryCta.href`. */
export type FieldErrors = Readonly<Record<string, string>>;

export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

export function removeItem<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

export function replaceItem<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}

/** A new item ID (`prefix-xxxxxx`) that does not collide with existing ones. */
export function newItemId(
  prefix: string,
  existing: readonly { id: string }[],
  random: () => string = () => Math.random().toString(36).slice(2, 8),
): string {
  const taken = new Set(existing.map((item) => item.id));
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = `${prefix}-${random()}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!taken.has(id) && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) return id;
  }
  return `${prefix}-${taken.size + 1}-${Date.now().toString(36)}`;
}

/** Optional text inputs: empty or whitespace-only means "not set". */
export function optionalValue(value: string): string | undefined {
  return value.trim() === '' ? undefined : value;
}

/** API error details (`content.a.b`) → editor field errors (`a.b`). */
export function errorsFromDetails(
  details: readonly { path: string; message: string }[],
): FieldErrors {
  const errors: Record<string, string> = {};
  for (const detail of details) {
    const path = detail.path.replace(/^content\.?/, '') || '_';
    errors[path] ??= detail.message;
  }
  return errors;
}

/**
 * Validates editor state with the same contract the API enforces, so most mistakes are shown
 * before a round trip. The API remains the authority (it re-validates and checks media).
 */
export function validateContent(type: WebsiteSectionType, content: unknown): FieldErrors {
  const result = sectionContentSchemas[type].safeParse(content);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join('.') || '_';
    errors[path] ??= issue.message;
  }
  return errors;
}

/** Errors under `prefix` with the prefix removed (for nested field groups). */
export function scopeErrors(errors: FieldErrors, prefix: string): FieldErrors {
  const scoped: Record<string, string> = {};
  const start = `${prefix}.`;
  for (const [path, message] of Object.entries(errors)) {
    if (path === prefix) scoped._ = message;
    else if (path.startsWith(start)) scoped[path.slice(start.length)] = message;
  }
  return scoped;
}

export function isEqualContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
