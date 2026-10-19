/**
 * Consent-compatible analytics abstraction (client-side). No provider is configured: every call
 * is a no-op until BOTH an adapter is registered and consent has been given. Nothing is sent to
 * third parties by default.
 *
 * Events carry only structural, non-personal properties (which section / which CTA). Values that
 * look like personal data (e-mail addresses, phone-like digit runs) are dropped defensively.
 */
export const ANALYTICS_EVENTS = [
  'cta_click',
  'navigation_click',
  'package_cta_click',
  'faq_open',
  'form_start',
  'contact_submit',
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsProps {
  /** Where it happened, e.g. `hero`, `packages`, `header`. */
  section?: string;
  /** Which control, e.g. the CTA label or a stable item id. */
  label?: string;
}

export interface AnalyticsAdapter {
  track(event: AnalyticsEvent, props: AnalyticsProps): void;
}

let adapter: AnalyticsAdapter | null = null;
let consented = false;

/** Called by a future, consent-managed provider integration. */
export function registerAnalyticsAdapter(next: AnalyticsAdapter | null): void {
  adapter = next;
}

export function setAnalyticsConsent(granted: boolean): void {
  consented = granted;
}

const LOOKS_PERSONAL = /@|\d{6,}/;

/** Keeps only the allowed keys with short, non-personal string values. */
export function sanitizeProps(props: Record<string, unknown>): AnalyticsProps {
  const out: AnalyticsProps = {};
  for (const key of ['section', 'label'] as const) {
    const value = props[key];
    if (typeof value === 'string' && value.length > 0 && !LOOKS_PERSONAL.test(value)) {
      out[key] = value.slice(0, 80);
    }
  }
  return out;
}

export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return typeof value === 'string' && (ANALYTICS_EVENTS as readonly string[]).includes(value);
}

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  if (!adapter || !consented) return;
  try {
    adapter.track(event, sanitizeProps(props));
  } catch {
    // Analytics must never break the page.
  }
}
