import { createHash } from 'node:crypto';
import type { LeadSubmission } from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import { AppError } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import type { RateLimiter } from '@vitruv/shared';

/** Submissions faster than this after the form was rendered are treated as automated. */
export const MIN_COMPLETION_MS = 2_500;

/** Notification hook (e-mail etc.) — not configured yet; receives no personal data. */
export type LeadNotifier = (lead: { id: string; createdAt: Date }) => Promise<void> | void;

export interface LeadServiceDeps {
  db: DbExecutor;
  logger: Logger;
  /** Per-recipient limit (normalised e-mail) and a process-wide safety limit. */
  perEmail: RateLimiter;
  global: RateLimiter;
  notify?: LeadNotifier;
  now?: () => number;
}

/** Stable, non-reversible key for rate limiting by e-mail without keeping the address in memory. */
const emailKey = (email: string) => createHash('sha256').update(email).digest('hex');

/**
 * Stores a website inquiry.
 *
 * - Honeypot filled or implausibly fast completion → reported as success, nothing stored
 *   (bots get no signal).
 * - Rate limits → 429 with a generic message.
 * - Logs contain only the lead id — never name, e-mail, phone or message.
 * Returns whether the lead was stored (for tests); the HTTP layer always answers `{ ok: true }`.
 */
export async function submitLead(
  deps: LeadServiceDeps,
  input: LeadSubmission,
): Promise<{ stored: boolean }> {
  const now = deps.now?.() ?? Date.now();
  if (input.website && input.website.trim() !== '') {
    deps.logger.info({ reason: 'honeypot' }, 'website lead discarded');
    return { stored: false };
  }
  if (input.startedAt !== undefined && now - input.startedAt < MIN_COMPLETION_MS) {
    deps.logger.info({ reason: 'too-fast' }, 'website lead discarded');
    return { stored: false };
  }
  if (!deps.global.hit('global') || !deps.perEmail.hit(emailKey(input.email))) {
    throw new AppError(429, 'RATE_LIMITED', 'Zu viele Anfragen. Bitte versuche es später erneut.');
  }

  const [lead] = await deps.db
    .insert(schema.websiteLeads)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      message: input.message,
      consentAt: new Date(now),
    })
    .returning({ id: schema.websiteLeads.id, createdAt: schema.websiteLeads.createdAt });
  if (!lead) throw new Error('lead insert returned no row');
  deps.logger.info({ leadId: lead.id }, 'website lead stored');

  if (deps.notify) {
    try {
      await deps.notify(lead);
    } catch (error) {
      deps.logger.warn({ leadId: lead.id, err: (error as Error).name }, 'lead notification failed');
    }
  }
  return { stored: true };
}
