import type { DbHealthResponse, HealthResponse } from '@vitruv/contracts';
import { Hono } from 'hono';
import type { Logger } from '../../lib/logger';
import type { AppEnv } from '../../types';

export interface HealthDeps {
  version: string;
  startedAt: number;
  /** Resolves when the database answers; rejects otherwise. */
  pingDatabase: () => Promise<void>;
  logger: Logger;
  dbTimeoutMs?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function healthRoutes(deps: HealthDeps) {
  const routes = new Hono<AppEnv>();

  routes.get('/', (c) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'vitruv-api',
      version: deps.version,
      uptimeSeconds: Math.round((Date.now() - deps.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
    c.header('Cache-Control', 'no-store');
    return c.json(body);
  });

  routes.get('/db', async (c) => {
    c.header('Cache-Control', 'no-store');
    const started = performance.now();
    try {
      await withTimeout(deps.pingDatabase(), deps.dbTimeoutMs ?? 3_000);
      const body: DbHealthResponse = {
        status: 'ok',
        database: 'reachable',
        latencyMs: Math.round(performance.now() - started),
      };
      return c.json(body);
    } catch (error) {
      // Details go to the server log only (driver code, not the message which may name the host).
      const e = error as { name?: string; code?: string };
      deps.logger.error(
        { requestId: c.get('requestId'), errName: e.name, errCode: e.code },
        'database health check failed',
      );
      const body: DbHealthResponse = { status: 'unavailable', database: 'unreachable' };
      return c.json(body, 503);
    }
  });

  return routes;
}
