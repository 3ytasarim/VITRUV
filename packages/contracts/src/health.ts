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
