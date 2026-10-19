/**
 * Read-only database inspection. Prints only safe metadata (no host, user or password).
 *
 *   pnpm db:inspect
 *
 * Runs inside a READ ONLY transaction that is always rolled back.
 */
import pg from 'pg';
import { describeDatabaseTarget, poolConfigFromUrl, requireDatabaseUrl } from '../src/connection';

async function main(): Promise<void> {
  const url = requireDatabaseUrl();
  const client = new pg.Client(poolConfigFromUrl(url));
  await client.connect();
  const out = (line: string) => console.warn(line);
  try {
    await client.query('BEGIN READ ONLY');
    const target = describeDatabaseTarget(url);
    out(`Database connection: OK (${target.provider}, pooled=${target.pooled}, tls=${target.tls})`);

    const version = await client.query<{ v: string }>("select split_part(version(), ' ', 2) as v");
    out(`PostgreSQL: ${version.rows[0]?.v}`);

    const schemas = await client.query<{ name: string }>(
      `select nspname as name from pg_namespace
       where nspname not like 'pg\\_%' and nspname <> 'information_schema' order by 1`,
    );
    out(`Schemas: ${schemas.rows.map((r) => r.name).join(', ')}`);

    const tables = await client.query<{ schema: string; name: string }>(
      `select table_schema as schema, table_name as name from information_schema.tables
       where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
       order by 1, 2`,
    );
    out(`Tables:${tables.rows.length ? '' : ' (none)'}`);
    for (const t of tables.rows) {
      const count = await client.query<{ c: number }>(
        `select count(*)::int as c from ${pg.escapeIdentifier(t.schema)}.${pg.escapeIdentifier(t.name)}`,
      );
      out(`  ${t.schema}.${t.name} — ${count.rows[0]?.c ?? 0} row(s)`);
    }

    const enums = await client.query<{ name: string; labels: string }>(
      `select n.nspname || '.' || t.typname as name,
              string_agg(e.enumlabel, ',' order by e.enumsortorder) as labels
       from pg_type t join pg_enum e on e.enumtypid = t.oid
       join pg_namespace n on n.oid = t.typnamespace group by 1 order by 1`,
    );
    out(`Enums:${enums.rows.length ? '' : ' (none)'}`);
    for (const e of enums.rows) out(`  ${e.name} = {${e.labels}}`);

    const hasHistory = tables.rows.some(
      (t) => t.schema === 'drizzle' && t.name === '__drizzle_migrations',
    );
    if (hasHistory) {
      const history = await client.query<{ hash: string; created_at: string }>(
        'select left(hash, 12) as hash, created_at from drizzle.__drizzle_migrations order by id',
      );
      out(`Migration history: ${history.rows.length} applied`);
      for (const h of history.rows) {
        out(`  ${h.hash}… at ${new Date(Number(h.created_at)).toISOString()}`);
      }
    } else {
      out('Migration history: (none)');
    }
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

main().catch((error: unknown) => {
  const e = error as { name?: string; code?: string };
  console.error(`Database connection: FAIL (${e.name ?? 'Error'}${e.code ? ` ${e.code}` : ''})`);
  process.exit(1);
});
