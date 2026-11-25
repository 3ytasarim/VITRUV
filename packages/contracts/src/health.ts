import { APP_COMPATIBILITY_STATUSES, APP_PLATFORMS } from '@vitruv/shared';
import { z } from 'zod';

/** GET /health — process liveness. Never touches the database. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('vitruv-api'),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * GET /health/db — database readiness.
 * Deliberately contains no host, user, database name or driver error text.
 */
export const dbHealthResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    database: z.literal('reachable'),
    latencyMs: z.number().nonnegative(),
  }),
  z.object({
    status: z.literal('unavailable'),
    database: z.literal('unreachable'),
  }),
]);
export type DbHealthResponse = z.infer<typeof dbHealthResponseSchema>;

/**
 * Sprint 8B — GET /v1/app/compatibility (public, no auth). Reads X-Vitruv-App-Version and
 * X-Vitruv-App-Platform. `updateUrl` is the configured store link (https) or null.
 */
export const appCompatibilitySchema = z.object({
  status: z.enum(APP_COMPATIBILITY_STATUSES),
  platform: z.enum(APP_PLATFORMS).nullable(),
  version: z.string().nullable(),
  minimumVersion: z.string().nullable(),
  updateUrl: z.url().nullable(),
});
export type AppCompatibility = z.infer<typeof appCompatibilitySchema>;
