import type { PoolConfig } from 'pg';

export class MissingDatabaseUrlError extends Error {
  constructor(variable = 'DATABASE_URL') {
    super(
      `${variable} is not set. VITRUV uses the existing Neon PostgreSQL database configured in the ` +
        `project .env — there is no fallback database.`,
    );
    this.name = 'MissingDatabaseUrlError';
  }
}

/** Reads DATABASE_URL and fails loudly. Never falls back to another database. */
export function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new MissingDatabaseUrlError();
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error('DATABASE_URL must be a postgres:// or postgresql:// connection string.');
  }
  return url;
}

/**
 * Builds node-postgres pool options from a connection string.
 *
 * Neon URLs carry `sslmode=require`. node-postgres already treats that as full certificate
 * verification but logs a deprecation warning about future libpq semantics. We make the strict
 * behaviour explicit instead (`rejectUnauthorized: true`) so verification can never silently
 * weaken. Only `sslmode=disable` (local tooling) turns TLS off.
 */
export function poolConfigFromUrl(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode');
  // libpq-only parameter; node-postgres negotiates SCRAM channel binding on its own.
  url.searchParams.delete('channel_binding');

  return {
    connectionString: url.toString(),
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: true },
  };
}

/**
 * Neon serves a PgBouncer pooler at `<endpoint>-pooler.<region>...`. Multi-statement DDL inside
 * one transaction is unreliable through the pooler, so migrations use the direct endpoint.
 * The URL is only transformed in memory; DATABASE_URL itself is never modified.
 */
export function toDirectUrl(connectionString: string): string {
  const url = new URL(connectionString);
  const [first, ...rest] = url.hostname.split('.');
  if (first?.endsWith('-pooler')) {
    url.hostname = [first.slice(0, -'-pooler'.length), ...rest].join('.');
  }
  return url.toString();
}

/** Safe, credential-free description for logs and reports. */
export function describeDatabaseTarget(connectionString: string): {
  provider: 'neon' | 'postgres';
  pooled: boolean;
  tls: boolean;
} {
  const url = new URL(connectionString);
  return {
    provider: url.hostname.endsWith('.neon.tech') ? 'neon' : 'postgres',
    pooled: url.hostname.split('.')[0]?.endsWith('-pooler') ?? false,
    tls: url.searchParams.get('sslmode') !== 'disable',
  };
}
