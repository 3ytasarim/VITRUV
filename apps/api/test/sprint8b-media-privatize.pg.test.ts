import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  adminExerciseSchema,
  assignTemplateResponseSchema,
  clientActiveTrainingResponseSchema,
  workoutTemplateSchema,
} from '@vitruv/contracts';
import {
  assertIsolatedServer,
  createDatabase,
  migrateIsolated,
  recreateIsolatedDatabase,
  schema,
  verifiedIsolatedBase,
  type DatabaseHandle,
} from '@vitruv/db';
import type { MediaVisibility, UserRole } from '@vitruv/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ObjectStorage } from '../src/infra/storage/index';
import { createLocalStorage } from '../src/infra/storage/local-storage';
import { createMediaUrlResolver } from '../src/modules/media/media-url';
import { createTrainingMediaSigner } from '../src/modules/media/training-media-access';
import {
  inventoryPublicTrainingVideos,
  privatizeTrainingVideos,
  removePublicOriginals,
  rollbackPrivatization,
} from '../src/modules/media/training-media-privatize';
import { buildTestApp, principalResolver } from './helpers';
import { mp4, png } from './media-fixtures';

/**
 * Sprint 8B — REHEARSAL of the private-video rollout (runbook steps 1–10) on the isolated cluster
 * with the local storage driver. Never production storage, never Neon, no CLI with the root .env.
 * Starting point = today's production: training uploads PUBLIC, signing key configured.
 */
const T = '/v1/admin/training';
const API = 'http://localhost:4000';
let handle: DatabaseHandle;
let storageDir: string;
let storage: ObjectStorage;
const signer = createTrainingMediaSigner({
  key: 'it-only-privatize-rehearsal-key-0123456789',
  apiBaseUrl: API,
  ttlSeconds: 900,
});
const urls = createMediaUrlResolver(`${API}/media`, signer);
const must = <V>(v: V | null | undefined, what = 'value'): V => {
  if (v === null || v === undefined) throw new Error(`Expected ${what}`);
  return v;
};

function app(role: UserRole, userId: string) {
  return buildTestApp({
    db: handle.db,
    storageDir,
    storage,
    bodyLimitBytes: 1_048_576,
    auth: principalResolver(role, userId),
    training: { db: handle.db, urls, extendedTypes: false },
    website: { db: handle.db, urls },
    media: {
      db: handle.db,
      storage,
      urls,
      limits: { IMAGE: 20 * 1024 * 1024, VIDEO: 50 * 1024 * 1024 },
      trainingVisibility: 'PUBLIC', // production today
    },
    trainingMediaSigner: signer,
  });
}
async function call(role: UserRole, userId: string, method: string, path: string, body?: unknown) {
  const res = await app(role, userId).request(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
}
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function bytesOf(res: Response) {
  return new Uint8Array(await res.arrayBuffer());
}

describe('Sprint 8B — private video rollout rehearsal (isolated)', () => {
  let coachId: string;
  let clientId: string;
  let otherClientId: string;
  let videoId: string;
  let websiteId: string;
  let publicKey: string;
  let original: Uint8Array<ArrayBuffer>;

  const assetRow = async () =>
    must(
      (
        await handle.db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, videoId))
      )[0],
    );
  const clientVideoUrl = async (userId = clientId) => {
    const res = await call('CLIENT', userId, 'GET', '/v1/client/training/active');
    const active = clientActiveTrainingResponseSchema.parse(res.body);
    const media = active.program?.weeks
      .flatMap((w) => w.days)
      .flatMap((d) => d.sections.flatMap((s) => s.exercises))
      .find((e) => e.media)?.media;
    return must(media, 'video in plan').url;
  };
  const fetchVia = async (url: string, userId = clientId) => {
    const u = new URL(url);
    // public URLs are served by the (development) /media route of the same app
    return app('CLIENT', userId).request(u.pathname + u.search);
  };

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'vitruv-s8b-privatize-'));
    storage = createLocalStorage(storageDir);
    const base = await verifiedIsolatedBase(process.env);
    const url = await recreateIsolatedDatabase(base, 'vitruv_it_s8b_privatize');
    await migrateIsolated(url);
    handle = createDatabase(url, { maxConnections: 8, connectionTimeoutMs: 15_000 });
    const probe = await handle.db.execute(
      sql.raw(
        "select current_setting('cluster_name') as cluster, inet_server_addr()::text as addr, current_database() as db",
      ),
    );
    await assertIsolatedServer({ query: async () => ({ rows: probe.rows }) });

    const [c] = await handle.db
      .insert(schema.users)
      .values({
        email: 'it-s8b-coach@vitruv.invalid',
        role: 'COACH',
        status: 'ACTIVE',
        displayName: 'Coach',
      })
      .returning();
    coachId = must(c).id;
    await handle.db.insert(schema.coachProfiles).values({ userId: coachId, displayName: 'Coach' });
    for (const name of ['A', 'B']) {
      const [u] = await handle.db
        .insert(schema.users)
        .values({
          username: `it.s8b.${name.toLowerCase()}`,
          role: 'CLIENT',
          status: 'ACTIVE',
          displayName: name,
        })
        .returning();
      const id = must(u).id;
      await handle.db
        .insert(schema.clientProfiles)
        .values({ userId: id, firstName: name, lastName: 'Test' });
      if (name === 'A') {
        clientId = id;
        await handle.db
          .insert(schema.coachClientAssignments)
          .values({ coachUserId: coachId, clientUserId: id });
      } else {
        otherClientId = id;
      }
    }

    // a PUBLIC training video, like every one in production today
    original = new Uint8Array(mp4({ width: 640, height: 360, durationMs: 4000, codec: 'avc1' }));
    const form = new FormData();
    form.append('file', new File([new Uint8Array(original)], 'uebung.mp4', { type: 'video/mp4' }));
    const up = await app('COACH', coachId).request(`${T}/media`, { method: 'POST', body: form });
    expect(up.status).toBe(201);
    videoId = ((await up.json()) as { id: string }).id;
    publicKey = (await assetRow()).storageKey;
    expect(publicKey.startsWith('public/training-video/')).toBe(true);

    const exercise = adminExerciseSchema.parse(
      (
        await call('COACH', coachId, 'POST', `${T}/exercises`, {
          name: 'Kniebeuge',
          mediaAssetId: videoId,
        })
      ).body,
    );
    const template = workoutTemplateSchema.parse(
      (
        await call('COACH', coachId, 'POST', `${T}/templates`, {
          title: 'Probe',
          category: 'UPPER_BODY',
          sections: [
            {
              type: 'MAIN',
              exercises: [
                {
                  exerciseId: exercise.id,
                  executionType: 'STRENGTH',
                  sets: 3,
                  reps: 10,
                  restSeconds: 60,
                },
              ],
            },
          ],
        })
      ).body,
    );
    const assigned = assignTemplateResponseSchema.parse(
      (
        await call('COACH', coachId, 'POST', `${T}/templates/${template.id}/assign`, {
          clientId,
          requestId: randomUUID(),
          date: '2027-03-01',
        })
      ).body,
    );
    expect(
      (await call('COACH', coachId, 'POST', `${T}/programs/${assigned.programId}/activate`)).status,
    ).toBe(200);

    // website media must never be part of the rollout
    const site = new FormData();
    site.append('file', new File([new Uint8Array(png(8, 8))], 'site.png', { type: 'image/png' }));
    const [admin] = await handle.db
      .insert(schema.users)
      .values({
        email: 'it-s8b-admin@vitruv.invalid',
        role: 'ADMIN',
        status: 'ACTIVE',
        displayName: 'Admin',
      })
      .returning();
    const ws = await app('ADMIN', must(admin).id).request('/v1/admin/media', {
      method: 'POST',
      body: site,
    });
    expect(ws.status).toBe(201);
    websiteId = ((await ws.json()) as { id: string }).id;
  });
  afterAll(async () => {
    await handle?.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  it('1. inventory: the public training video, never website media', async () => {
    const inventory = await inventoryPublicTrainingVideos(handle.db);
    expect(inventory.map((a) => a.id)).toEqual([videoId]);
    expect(inventory.some((a) => a.id === websiteId)).toBe(false);
  });

  it('2. authorised endpoint before the rollout: the client gets the PUBLIC URL (old behaviour)', async () => {
    const url = await clientVideoUrl();
    expect(url).toBe(`${API}/media/${publicKey}`);
    const served = await fetchVia(url);
    expect(served.status).toBe(200);
    expect(sha(await bytesOf(served))).toBe(sha(original));
  });

  it('dry-run changes nothing (no copy, no flip)', async () => {
    const report = await privatizeTrainingVideos({ db: handle.db, storage });
    expect(report).toEqual([
      {
        assetId: videoId,
        status: 'would-copy',
        fromKey: publicKey,
        toKey: publicKey.replace(/^public\//, 'private/'),
      },
    ]);
    expect((await assetRow()).visibility).toBe('PUBLIC');
    expect(await storage.exists(publicKey.replace(/^public\//, 'private/'), 'PRIVATE')).toBe(false);
  });

  it('a corrupted copy is detected (checksum) and the row is NOT flipped', async () => {
    const corrupting: ObjectStorage = {
      ...storage,
      putStream: async (input) => {
        const chunks: Buffer[] = [];
        for await (const chunk of input.body) chunks.push(Buffer.from(chunk as Uint8Array));
        const data = Buffer.concat(chunks);
        data[data.length - 1] = (data.at(-1) ?? 0) ^ 0xff; // one flipped byte, same size
        return storage.putStream({ ...input, body: Readable.from([data]) });
      },
    };
    const report = await privatizeTrainingVideos({
      db: handle.db,
      storage: corrupting,
      apply: true,
    });
    expect(report[0]?.status).toBe('checksum-mismatch');
    expect((await assetRow()).visibility).toBe('PUBLIC');
  });

  it('3–6. private storage ready → copy → checksum → references updated (and re-run is idempotent)', async () => {
    const report = await privatizeTrainingVideos({ db: handle.db, storage, apply: true });
    expect(report.map((r) => r.status)).toEqual(['copied-and-flipped']);
    const row = await assetRow();
    expect(row.visibility).toBe('PRIVATE');
    expect(row.storageKey).toBe(publicKey.replace(/^public\//, 'private/'));
    const copy = must(await storage.get(row.storageKey, 'PRIVATE'));
    expect(sha(copy.body)).toBe(sha(original));
    // the public original is still there (rollback possible)
    expect(await storage.exists(publicKey, 'PUBLIC')).toBe(true);
    // re-run: nothing left in the inventory; explicit id → already-private
    expect(await privatizeTrainingVideos({ db: handle.db, storage, apply: true })).toEqual([]);
    expect(
      (
        await privatizeTrainingVideos({ db: handle.db, storage, apply: true, assetIds: [videoId] })
      ).map((r) => r.status),
    ).toEqual(['already-private']);
  });

  it('7. playback verified: the client now gets a signed URL that plays byte-exact, Range included', async () => {
    const url = await clientVideoUrl();
    expect(url.startsWith(`${API}/v1/media/training/${videoId}?u=`)).toBe(true);
    const full = await fetchVia(url);
    expect(full.status).toBe(200);
    expect(sha(await bytesOf(full))).toBe(sha(original));
    const u = new URL(url);
    const part = await app('CLIENT', clientId).request(u.pathname + u.search, {
      headers: { Range: 'bytes=10-19' },
    });
    expect(part.status).toBe(206);
    expect([...(await bytesOf(part))]).toEqual([...original.slice(10, 20)]);
  });

  it('rollback BEFORE removing originals: back to the public URL, then forward again', async () => {
    expect(
      (await rollbackPrivatization({ db: handle.db, storage, assetIds: [videoId] }))[0]?.status,
    ).toBe('would-roll-back');
    expect(
      (await rollbackPrivatization({ db: handle.db, storage, assetIds: [videoId], apply: true }))[0]
        ?.status,
    ).toBe('rolled-back');
    expect(await clientVideoUrl()).toBe(`${API}/media/${publicKey}`);
    expect((await fetchVia(await clientVideoUrl())).status).toBe(200);
    // forward again: the existing private copy is verified and reused
    expect(
      (await privatizeTrainingVideos({ db: handle.db, storage, apply: true })).map((r) => r.status),
    ).toEqual(['copied-and-flipped']);
  });

  it('8. disable public originals (dry-run first, then apply)', async () => {
    expect(
      (await removePublicOriginals({ db: handle.db, storage, assetIds: [videoId, websiteId] })).map(
        (r) => r.status,
      ),
    ).toEqual(['would-remove-original']); // website asset is not a training video → not listed
    expect(await storage.exists(publicKey, 'PUBLIC')).toBe(true);
    expect(
      (await removePublicOriginals({ db: handle.db, storage, assetIds: [videoId], apply: true }))[0]
        ?.status,
    ).toBe('original-removed');
    expect(await storage.exists(publicKey, 'PUBLIC')).toBe(false);
    // website media untouched
    const site = must(
      (
        await handle.db
          .select()
          .from(schema.mediaAssets)
          .where(eq(schema.mediaAssets.id, websiteId))
      )[0],
    );
    expect(site.visibility).toBe('PUBLIC' satisfies MediaVisibility);
    expect(await storage.exists(site.storageKey, 'PUBLIC')).toBe(true);
  });

  it('9. denial verified: old public URL 404, unsigned/foreign 403, other client no URL', async () => {
    expect((await app('CLIENT', clientId).request(`/media/${publicKey}`)).status).toBe(404);
    const signed = new URL(await clientVideoUrl());
    expect((await app('CLIENT', clientId).request(signed.pathname)).status).toBe(403);
    const foreign = new URL(signed);
    foreign.searchParams.set('u', otherClientId);
    expect(
      (await app('CLIENT', otherClientId).request(foreign.pathname + foreign.search)).status,
    ).toBe(403);
    const renew = await call(
      'CLIENT',
      otherClientId,
      'GET',
      `/v1/client/training/media/${videoId}/url`,
    );
    expect(renew.status).toBe(404);
    // still playable for the owner
    expect((await fetchVia(signed.toString())).status).toBe(200);
  });

  it('10. rollback limits: after removing originals a rollback is refused (report, no change)', async () => {
    const report = await rollbackPrivatization({
      db: handle.db,
      storage,
      assetIds: [videoId],
      apply: true,
    });
    expect(report[0]?.status).toBe('public-original-missing');
    expect((await assetRow()).visibility).toBe('PRIVATE');
    // removing again is a no-op
    expect(
      (await removePublicOriginals({ db: handle.db, storage, assetIds: [videoId], apply: true }))[0]
        ?.status,
    ).toBe('original-already-gone');
  });
});
