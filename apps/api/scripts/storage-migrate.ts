/**
 * Copies the local media store to S3-compatible object storage (Hetzner Object Storage).
 *
 *   pnpm --filter @vitruv/api storage:migrate                      # dry-run (default)
 *   pnpm --filter @vitruv/api storage:migrate -- --apply           # copy + verify
 *
 * Options:
 *   --apply                  actually upload (otherwise dry-run: nothing is written anywhere)
 *   --source=<dir>           local store (default STORAGE_LOCAL_DIR, e.g. .storage)
 *   --visibility=all|public|private   (default all)
 *   --concurrency=<n>        parallel uploads (default 4, max 16)
 *   --overwrite-mismatched   replace bucket objects whose size/type differ (default: report only)
 *   --report=<file.json>     write the full per-file report (default storage-migration-report.json)
 *
 * Reads media_assets (read-only — no migration, no writes to the database). The object key is
 * the unchanged storage_key; Content-Type = media_assets.mime_type; sizes are checked against
 * the DB before and against the bucket (HEAD) after each upload. Re-running is safe: identical
 * objects are skipped. Local files are never deleted. Credentials are read from the environment
 * and never printed. Exit code 1 when anything is missing, mismatched or failed.
 */
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createDatabase, schema } from '@vitruv/db';
import { blankToUndefined } from '@vitruv/shared';
import { z } from 'zod';
import { createS3Client } from '../src/infra/storage/s3-storage';
import {
  MIGRATION_PROBLEMS,
  migrateLocalMedia,
  type MigrationAsset,
  type MigrationTarget,
} from '../src/infra/storage/migration';
import { argValue } from './cli-input';

const flag = (name: string) => process.argv.includes(`--${name}`);
const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GB`;

const env = z
  .object({
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
    STORAGE_LOCAL_DIR: z.string().default('.storage'),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET_PUBLIC: z.string().optional(),
    S3_BUCKET_PRIVATE: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
    S3_PUBLIC_OBJECT_ACL: z.enum(['public-read']).optional(),
  })
  .parse(blankToUndefined(process.env));

async function main() {
  const apply = flag('apply');
  const source = resolve(argValue('source') ?? env.STORAGE_LOCAL_DIR);
  const visibility = (argValue('visibility') ?? 'all').toUpperCase();
  if (!['ALL', 'PUBLIC', 'PRIVATE'].includes(visibility))
    throw new Error('--visibility=all|public|private');
  const concurrency = Math.max(1, Math.min(16, Number(argValue('concurrency') ?? 4) || 4));
  const reportFile = resolve(argValue('report') ?? 'storage-migration-report.json');

  const s3Ready = Boolean(
    env.S3_ENDPOINT &&
    env.S3_REGION &&
    env.S3_BUCKET_PUBLIC &&
    env.S3_BUCKET_PRIVATE &&
    env.S3_ACCESS_KEY_ID &&
    env.S3_SECRET_ACCESS_KEY,
  );
  if (apply && !s3Ready)
    throw new Error(
      '--apply needs S3_ENDPOINT, S3_REGION, S3_BUCKET_*, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.',
    );
  if (s3Ready && env.S3_BUCKET_PUBLIC === env.S3_BUCKET_PRIVATE) {
    throw new Error('S3_BUCKET_PUBLIC and S3_BUCKET_PRIVATE must differ.');
  }

  let target: MigrationTarget | null = null;
  const {
    S3_ENDPOINT: endpoint,
    S3_REGION: region,
    S3_BUCKET_PUBLIC: publicBucket,
    S3_BUCKET_PRIVATE: privateBucket,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
  } = env;
  if (endpoint && region && publicBucket && privateBucket && accessKeyId && secretAccessKey) {
    const config = {
      endpoint,
      region,
      publicBucket,
      privateBucket,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    };
    const client = createS3Client(config);
    const bucket = (v: 'PUBLIC' | 'PRIVATE') =>
      v === 'PUBLIC' ? config.publicBucket : config.privateBucket;
    target = {
      async head(key, v) {
        try {
          const out = await client.send(new HeadObjectCommand({ Bucket: bucket(v), Key: key }));
          return { sizeBytes: out.ContentLength ?? 0, contentType: out.ContentType ?? null };
        } catch (error) {
          const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
          if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) return null;
          throw error;
        }
      },
      async upload({ key, visibility: v, filePath, contentType }) {
        // multipart for large files; the file is streamed from disk (never fully in memory)
        await new Upload({
          client,
          queueSize: 2,
          partSize: 16 * 1024 * 1024,
          leavePartsOnError: false,
          params: {
            Bucket: bucket(v),
            Key: key,
            Body: createReadStream(filePath),
            ContentType: contentType,
            CacheControl:
              v === 'PUBLIC' ? 'public, max-age=31536000, immutable' : 'private, no-store',
            ...(v === 'PUBLIC' && env.S3_PUBLIC_OBJECT_ACL
              ? { ACL: env.S3_PUBLIC_OBJECT_ACL }
              : {}),
          },
        }).done();
      },
    };
  }

  const handle = createDatabase(env.DATABASE_URL, { maxConnections: 1 });
  let assets: MigrationAsset[];
  try {
    const rows = await handle.db
      .select({
        id: schema.mediaAssets.id,
        storageKey: schema.mediaAssets.storageKey,
        visibility: schema.mediaAssets.visibility,
        mimeType: schema.mediaAssets.mimeType,
        sizeBytes: schema.mediaAssets.sizeBytes,
      })
      .from(schema.mediaAssets);
    assets = rows.filter((row) => visibility === 'ALL' || row.visibility === visibility);
  } finally {
    await handle.close();
  }

  console.warn(
    `${apply ? 'APPLY' : 'DRY-RUN'} · source ${source} · ${assets.length} assets · ` +
      `bucket check ${target ? 'on' : 'off (no S3 credentials)'}`,
  );
  let lastPrint = 0;
  const report = await migrateLocalMedia({
    assets,
    localDir: source,
    target,
    dryRun: !apply,
    concurrency,
    overwriteMismatched: flag('overwrite-mismatched'),
    onItem: (item, index, total) => {
      const problem = MIGRATION_PROBLEMS.includes(item.status);
      if (problem || Date.now() - lastPrint > 2000 || index === total) {
        lastPrint = Date.now();
        console.warn(
          `[${index}/${total}] ${item.status.padEnd(19)} ${item.key}${item.error ? ` — ${item.error}` : ''}`,
        );
      }
    },
  });

  await writeFile(reportFile, JSON.stringify(report, null, 2));
  console.warn('\nSummary');
  console.warn(
    `  expected (media_assets): ${report.expected.count} files, ${gb(report.expected.bytes)}`,
  );
  for (const [status, t] of Object.entries(report.totals)) {
    if (t.count > 0)
      console.warn(`  ${status.padEnd(20)} ${String(t.count).padStart(5)}  ${gb(t.bytes)}`);
  }
  console.warn(`  local files without DB row (not copied, kept): ${report.orphans.length}`);
  console.warn(`  report: ${reportFile}`);
  console.warn('  local files were not modified or deleted.');
  const problems = MIGRATION_PROBLEMS.reduce((n, s) => n + report.totals[s].count, 0);
  if (problems > 0) {
    console.warn(`\n${problems} problem(s) — see the report. Nothing was deleted.`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`storage:migrate failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
