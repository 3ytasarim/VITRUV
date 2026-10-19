import { randomUUID } from 'node:crypto';
import {
  createDatabase,
  schema,
  toDirectUrl,
  type DatabaseHandle,
  type DbExecutor,
} from '@vitruv/db';
import type { WebsiteSectionType } from '@vitruv/shared';

/** Narrows away null/undefined in tests (fails the test instead of a non-null assertion). */
export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what} to be present.`);
  return value;
}

/**
 * Safe DB test strategy: every integration test runs inside ONE transaction on the existing Neon
 * database that is ALWAYS rolled back. Nothing a test writes is ever committed — services under
 * test open their own transactions, which become savepoints inside it.
 */
class RollbackSignal extends Error {
  constructor() {
    super('rollback');
    this.name = 'RollbackSignal';
  }
}

export const databaseUrl = process.env.DATABASE_URL;

export function openTestDatabase(): DatabaseHandle {
  // Direct (non-pooler) endpoint: one long-lived transaction per test.
  const url = process.env.DATABASE_URL_DIRECT?.trim() || toDirectUrl(databaseUrl as string);
  return createDatabase(url, { maxConnections: 2, connectionTimeoutMs: 15_000 });
}

export async function inRollback(
  handle: DatabaseHandle,
  test: (tx: DbExecutor) => Promise<void>,
): Promise<void> {
  try {
    await handle.db.transaction(async (tx) => {
      await test(tx);
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
}

export interface Fixture {
  userId: string;
  pageSlug: string;
  sectionIds: Record<string, string>;
}

/** Fictional user + an isolated page with the given sections (inside the rolled-back tx). */
export async function createFixture(
  tx: DbExecutor,
  sections: { key: string; type: WebsiteSectionType }[],
): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const [userRow] = await tx
    .insert(schema.users)
    .values({
      email: `it-${suffix}@vitruv.invalid`,
      displayName: 'Integrationstest',
      role: 'ADMIN',
    })
    .returning();
  const [pageRow] = await tx
    .insert(schema.websitePages)
    .values({ slug: `it-${suffix}`, title: 'Integrationstest' })
    .returning();
  const user = must(userRow, 'user');
  const page = must(pageRow, 'page');
  const rows = await tx
    .insert(schema.websiteSections)
    .values(
      sections.map((section, index) => ({
        pageId: page.id,
        key: section.key,
        type: section.type,
        sortOrder: (index + 1) * 10,
      })),
    )
    .returning();
  return {
    userId: user.id,
    pageSlug: page.slug,
    sectionIds: Object.fromEntries(rows.map((row) => [row.key, row.id])),
  };
}

/** A website media_assets row (metadata only — integration tests do not need the bytes). */
export async function createAsset(
  tx: DbExecutor,
  values: Partial<typeof schema.mediaAssets.$inferInsert> = {},
) {
  const [asset] = await tx
    .insert(schema.mediaAssets)
    .values({
      kind: 'IMAGE',
      purpose: 'WEBSITE',
      visibility: 'PUBLIC',
      storageKey: `public/website/2026/10/${randomUUID()}.webp`,
      fileName: 'testbild.webp',
      mimeType: 'image/webp',
      sizeBytes: 1234,
      width: 1600,
      height: 900,
      altText: 'Athlet beim Training',
      ...values,
    })
    .returning();
  return must(asset, 'asset');
}
