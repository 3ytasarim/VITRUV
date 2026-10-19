'use server';

import { apiErrorSchema, leadRequestSchema } from '@vitruv/contracts';
import { createRateLimiter } from '@vitruv/shared';
import { headers } from 'next/headers';
import { webServerEnv } from '@/lib/env';

/** Result of a contact submission. Field values are echoed back only to the same visitor. */
export interface ContactFormState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Partial<Record<'name' | 'email' | 'phone' | 'message' | 'consent', string>>;
  values?: { name: string; email: string; phone: string; message: string };
}

/** Per client address: 5 submissions per 10 minutes (per web process; see docs). */
const perClient = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

/** First hop of X-Forwarded-For as set by the hosting proxy; used only as an in-memory key. */
async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

const GENERIC_FAILURE =
  'Die Nachricht konnte gerade nicht gesendet werden. Bitte versuche es in einigen Minuten erneut.';

/**
 * Server action behind the contact form. Validates with the shared contract (fast feedback),
 * rate-limits per client, then forwards to the API, which validates again, applies its own
 * limits and stores the inquiry. Never logs the submitted content.
 */
export async function submitContact(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const values = {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    message: String(formData.get('message') ?? ''),
  };
  const startedAt = Number(formData.get('startedAt'));
  const request = {
    ...values,
    phone: values.phone.trim() || undefined,
    consent: formData.get('consent') === 'on',
    website: String(formData.get('website') ?? ''),
    startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : undefined,
  };

  const parsed = leadRequestSchema.safeParse(request);
  if (!parsed.success) {
    const fieldErrors: ContactFormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && field in values) {
        fieldErrors[field as keyof typeof values] ??= issue.message;
      } else if (field === 'consent') fieldErrors.consent ??= issue.message;
    }
    return { status: 'error', message: 'Bitte die markierten Felder prüfen.', fieldErrors, values };
  }

  if (!perClient.hit(await clientKey())) {
    return {
      status: 'error',
      message: 'Zu viele Anfragen in kurzer Zeit. Bitte versuche es später erneut.',
      values,
    };
  }

  try {
    const res = await fetch(new URL('/v1/public/leads', webServerEnv().API_BASE_URL), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) return { status: 'success' };
    const error = apiErrorSchema.safeParse(await res.json().catch(() => null));
    const message =
      error.success && (res.status === 429 || res.status === 400)
        ? error.data.error.message
        : GENERIC_FAILURE;
    return { status: 'error', message, values };
  } catch {
    return { status: 'error', message: GENERIC_FAILURE, values };
  }
}
