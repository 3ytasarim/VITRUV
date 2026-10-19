import { z } from 'zod';

/**
 * POST /v1/public/leads — the public contact / coaching-inquiry form.
 *
 * Minimal data: no health, medical or family information is requested. Plain text only (stored
 * and rendered as text, never as HTML). `website` is a honeypot (must stay empty) and
 * `startedAt` lets the API discard submissions completed implausibly fast — both are handled
 * silently so bots learn nothing.
 */
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/;
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Bitte ausfüllen.')
    .max(max, `Höchstens ${max} Zeichen.`)
    .refine((value) => !CONTROL.test(value), 'Enthält unzulässige Zeichen.');

export const leadRequestSchema = z.object({
  name: text(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'Zu lang.')
    .pipe(z.email('Bitte eine gültige E-Mail-Adresse eingeben.')),
  phone: z
    .string()
    .trim()
    .max(40, 'Höchstens 40 Zeichen.')
    .regex(/^[+0-9 ()/.-]*$/, 'Nur Ziffern, Leerzeichen und + ( ) / - . erlaubt.')
    .optional()
    .transform((value) => (value ? value : undefined)),
  message: text(2000),
  consent: z.literal(true, { error: 'Bitte stimme der Kontaktaufnahme zu.' }),
  /** Honeypot — invisible to people; any value marks the submission as automated. */
  website: z.string().max(200).optional(),
  /** Epoch ms when the form was rendered (client clock); used only for a plausibility check. */
  startedAt: z.number().int().nonnegative().optional(),
});
export type LeadRequest = z.input<typeof leadRequestSchema>;
/** A validated, normalised submission (what the API service receives). */
export type LeadSubmission = z.output<typeof leadRequestSchema>;

/** The only response the public endpoint ever returns on success — no data echoed back. */
export const leadResponseSchema = z.object({ ok: z.literal(true) });
export type LeadResponse = z.infer<typeof leadResponseSchema>;
