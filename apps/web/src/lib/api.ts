import 'server-only';
import {
  dbHealthResponseSchema,
  healthResponseSchema,
  type DbHealthResponse,
  type HealthResponse,
} from '@vitruv/contracts';
import type { z } from 'zod';
import { webServerEnv } from './env';

/** Typed, validated server-side call to the shared API. Returns null when the API is unreachable. */
async function getJson<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T> | null> {
  try {
    const res = await fetch(new URL(path, webServerEnv().API_BASE_URL), {
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    const parsed = schema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const api = {
  health: (): Promise<HealthResponse | null> => getJson('/health', healthResponseSchema),
  databaseHealth: (): Promise<DbHealthResponse | null> =>
    getJson('/health/db', dbHealthResponseSchema),
};
