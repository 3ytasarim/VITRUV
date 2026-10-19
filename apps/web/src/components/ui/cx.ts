/**
 * Joins class names, skipping falsy values. Deliberately tiny: component variants never emit
 * conflicting utilities, so no tailwind-merge style conflict resolution is needed.
 */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
