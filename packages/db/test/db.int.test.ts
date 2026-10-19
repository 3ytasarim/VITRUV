import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../src/index';

/**
 * Integration tests against the configured Neon database. Read-only: they never write rows.
 * Skipped automatically when DATABASE_URL is not available (e.g. CI without secrets).
 */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)('database (integration, read-only)', () => {
  let handle: DatabaseHandle | undefined;
  afterAll(async () => handle?.close());

  it('connects and answers a ping', async () => {
    handle = createDatabase(url as string, { maxConnections: 1 });
    await expect(handle.ping()).resolves.toBeUndefined();
  });

  it('has the website CMS + lead tables and enums (Sprint 2, Sprint 3 Stage C)', async () => {
    handle ??= createDatabase(url as string, { maxConnections: 1 });
    const tables = await handle.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables
          where table_schema = 'public' and table_name like 'website\_%' order by 1`,
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      'website_leads',
      'website_media_slots',
      'website_pages',
      'website_section_versions',
      'website_sections',
    ]);
    const enums = await handle.db.execute<{ typname: string }>(
      sql`select typname from pg_type where typname in
          ('media_purpose', 'website_lead_status', 'website_section_type', 'website_version_status') order by 1`,
    );
    expect(enums.rows).toHaveLength(4);
  });

  it('has the Sprint 0 baseline tables', async () => {
    handle ??= createDatabase(url as string, { maxConnections: 1 });
    const result = await handle.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables
          where table_schema = 'public' and table_name in ('users', 'media_assets') order by 1`,
    );
    expect(result.rows.map((r) => r.table_name)).toEqual(['media_assets', 'users']);
  });
});
