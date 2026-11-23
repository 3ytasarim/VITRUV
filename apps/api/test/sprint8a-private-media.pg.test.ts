import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adminMediaAssetSchema,
  assignTemplateResponseSchema,
  clientActiveTrainingResponseSchema,
  clientWorkoutSchema,
  startWorkoutResponseSchema,
  trainingMediaUrlSchema,
  workoutSessionSchema,
  workoutTemplateSchema,
  type ClientWorkout,
  type WorkoutSession,
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
import type { UserRole } from '@vitruv/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalStorage } from '../src/infra/storage/local-storage';
import { createLogger } from '../src/lib/logger';
import { createMediaUrlResolver } from '../src/modules/media/media-url';
import {
  createTrainingMediaSigner,
  type TrainingMediaSigner,
} from '../src/modules/media/training-media-access';
import { buildTestApp, principalResolver } from './helpers';
import { html, mp4, png, webm } from './media-fixtures';

/**
 * Sprint 8A — PRIVATE training media end-to-end on a REAL, ISOLATED PostgreSQL with the local
 * storage driver (never production, never Neon). Fictional people. Numbers = the Sprint 8A video
 * test list (docs/ios-training-sprint8a-test-results.md).
 */

const T = '/v1/admin/training';
const W = '/v1/client/workouts';
const API = 'http://localhost:4000';
const DATES = ['2027-06-07', '2027-06-09'];
const KEY = 'it-only-signing-key-0123456789abcdef-not-a-secret';
type Res = { status: number; body: Record<string, unknown>; text: string };
type Call = (method: string, path: string, body?: unknown) => Promise<Res>;

let storageDir: string;
let handle: DatabaseHandle;
const logLines: string[] = [];

const signer: TrainingMediaSigner = createTrainingMediaSigner({
  key: KEY,
  apiBaseUrl: API,
  ttlSeconds: 900,
});
const urls = createMediaUrlResolver(`${API}/media`, signer);

function must<V>(value: V | null | undefined, what = 'value'): V {
  if (value === null || value === undefined) throw new Error(`Expected ${what}`);
  return value;
}
const ok = (res: Res, status = 200) => {
  expect(res.status, res.text).toBe(status);
  return res.body;
};

async function freshDatabase(name: string) {
  const base = await verifiedIsolatedBase(process.env);
  const url = await recreateIsolatedDatabase(base, name);
  await migrateIsolated(url);
  const db = createDatabase(url, { maxConnections: 16, connectionTimeoutMs: 15_000 });
  const probe = await db.db.execute(
    sql.raw(
      "select current_setting('cluster_name') as cluster, inet_server_addr()::text as addr, current_database() as db",
    ),
  );
  await assertIsolatedServer({ query: async () => ({ rows: probe.rows }) });
  return db;
}

/** Captures every log line (to prove signatures never reach the log). */
const capturingLogger = createLogger({ level: 'info' });
for (const level of ['info', 'warn', 'error'] as const) {
  const original = capturingLogger[level].bind(capturingLogger);
  (capturingLogger as unknown as Record<string, unknown>)[level] = (...args: unknown[]) => {
    logLines.push(JSON.stringify(args));
    void original;
  };
}

function app(
  role: UserRole | null,
  userId: string,
  options: { visibility?: 'PUBLIC' | 'PRIVATE'; signing?: boolean } = {},
) {
  const { visibility = 'PRIVATE', signing = true } = options;
  const resolver = signing ? urls : createMediaUrlResolver(`${API}/media`);
  return buildTestApp({
    db: handle.db,
    storageDir,
    bodyLimitBytes: 1_048_576,
    logger: capturingLogger,
    ...(role ? { auth: principalResolver(role, userId) } : {}),
    training: { db: handle.db, urls: resolver, extendedTypes: true },
    website: { db: handle.db, urls: resolver },
    media: {
      db: handle.db,
      storage: createLocalStorage(storageDir),
      urls: resolver,
      limits: { IMAGE: 20 * 1024 * 1024, VIDEO: 50 * 1024 * 1024 },
      trainingVisibility: visibility,
    },
    trainingMediaSigner: signing ? signer : undefined,
  });
}

function api(role: UserRole, userId: string, options?: Parameters<typeof app>[2]): Call {
  return async (method, path, body) => {
    const res = await app(role, userId, options).request(path, {
      method,
      headers: {
        'X-Vitruv-App-Capability': '2',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return {
      status: res.status,
      text,
      body: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
    };
  };
}

/** A player without credentials (AVPlayer / <video>): only the URL authorises. */
async function fetchMedia(url: string, headers: Record<string, string> = {}) {
  const target = new URL(url);
  const res = await app(null, '').request(target.pathname + target.search, { headers });
  return { res, bytes: new Uint8Array(await res.arrayBuffer()) };
}

async function upload(
  role: UserRole,
  userId: string,
  file: Uint8Array,
  name: string,
  type: string,
  options?: Parameters<typeof app>[2],
  path = `${T}/media`,
) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(file)], name, { type }));
  const res = await app(role, userId, options).request(path, { method: 'POST', body: form });
  const text = await res.text();
  return {
    status: res.status,
    text,
    body: (text ? JSON.parse(text) : {}) as { id: string; url: string },
  };
}

async function user(role: UserRole, name: string) {
  const [row] = await handle.db
    .insert(schema.users)
    .values({
      email: `it-s8a-${name.toLowerCase()}-${randomUUID().slice(0, 6)}@vitruv.invalid`,
      role,
      status: 'ACTIVE',
      displayName: name,
    })
    .returning();
  return must(row).id;
}
async function clientOf(coachId: string, name: string) {
  const id = await user('CLIENT', name);
  await handle.db
    .insert(schema.clientProfiles)
    .values({ userId: id, firstName: 'Fiktiv', lastName: name });
  await handle.db
    .insert(schema.coachClientAssignments)
    .values({ coachUserId: coachId, clientUserId: id });
  return id;
}

function dayInput(
  day: ClientWorkout,
  patch: (row: ClientWorkout['sections'][number]['exercises'][number]) => object = () => ({}),
) {
  return {
    expectedVersion: day.version,
    title: day.title,
    sections: day.sections.map((section) => ({
      id: section.id,
      type: section.type,
      title: section.title,
      exercises: section.exercises.map((row) => ({
        id: row.id,
        exerciseId: row.exercise.id,
        executionType: row.executionType,
        sets: row.sets,
        reps: row.reps,
        repsMax: row.repsMax,
        totalReps: row.totalReps,
        durationSeconds: row.durationSeconds,
        restSeconds: row.restSeconds,
        mediaAssetId: row.media?.assetId ?? null,
        ...patch(row),
      })),
    })),
  };
}

const withQuery = (url: string, patch: Record<string, string>) => {
  const target = new URL(url);
  for (const [k, v] of Object.entries(patch)) target.searchParams.set(k, v);
  return target.toString();
};

describe('Sprint 8A — private training media on an isolated PostgreSQL', () => {
  let adminId: string;
  let coachId: string;
  let otherCoachId: string;
  let clientA: string;
  let clientB: string;
  let coach: Call;
  let otherCoach: Call;
  let asA: Call;
  let asB: Call;
  let exerciseId = '';
  let templateVideo = '';
  let clientVideo = '';
  let publicVideo = '';
  let templateId = '';
  let programA = '';
  let programB = '';
  const daysA: string[] = [];
  let dayB = '';
  let session: WorkoutSession;
  const h264 = mp4({ width: 640, height: 360, durationMs: 4000, codec: 'avc1' });

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'vitruv-s8a-'));
    handle = await freshDatabase('vitruv_it_s8a');
    adminId = await user('ADMIN', 'Admin');
    coachId = await user('COACH', 'Coach');
    otherCoachId = await user('COACH', 'Fremd');
    await handle.db.insert(schema.coachProfiles).values([
      { userId: coachId, displayName: 'Coach' },
      { userId: otherCoachId, displayName: 'Fremd' },
    ]);
    clientA = await clientOf(coachId, 'Clara');
    clientB = await clientOf(coachId, 'David');
    coach = api('COACH', coachId);
    otherCoach = api('COACH', otherCoachId);
    asA = api('CLIENT', clientA);
    asB = api('CLIENT', clientB);
  });
  afterAll(async () => {
    await handle?.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  it('13. MP4/H.264 is accepted and stored PRIVATE (private folder, no public URL)', async () => {
    for (const label of ['template', 'client'] as const) {
      const res = await upload('COACH', coachId, h264, `${label}.mp4`, 'video/mp4');
      expect(res.status, res.text).toBe(201);
      const dto = adminMediaAssetSchema.parse(res.body);
      expect(dto.visibility).toBe('PRIVATE');
      expect(dto.url).toMatch(new RegExp(`^${API}/v1/media/training/${dto.id}\\?u=`));
      if (label === 'template') templateVideo = dto.id;
      else clientVideo = dto.id;
    }
    const [row] = await handle.db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, templateVideo));
    expect(must(row).storageKey).toMatch(/^private\/training-video\//);
    expect(await readdir(join(storageDir, 'private'))).toEqual(['private']);
    // not reachable through the public delivery route, neither under its key nor guessed
    const viaPublic = await app(null, '').request(`/media/${must(row).storageKey}`);
    expect(viaPublic.status).toBe(404);
    const publicSpelling = must(row).storageKey.replace(/^private\//, 'public/');
    expect((await app(null, '').request(`/media/${publicSpelling}`)).status).toBe(404);
  });

  it('14. unsupported files are refused (WebM, HEVC, HTML) — nothing stored', async () => {
    const webmRes = await upload('COACH', coachId, webm(), 'demo.webm', 'video/webm');
    expect(webmRes.status).toBe(400);
    expect(webmRes.text).toContain('H.264');
    const hevc = await upload(
      'COACH',
      coachId,
      mp4({ width: 640, height: 360, durationMs: 4000, codec: 'hvc1' }),
      'hevc.mp4',
      'video/mp4',
    );
    expect(hevc.status).toBe(400);
    expect((await upload('COACH', coachId, html(), 'x.mp4', 'video/mp4')).status).toBe(400);
    const count = await handle.db
      .select({ id: schema.mediaAssets.id })
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.purpose, 'TRAINING_VIDEO'));
    expect(count).toHaveLength(2);
  });

  it('setup: template with the private video, assigned to A and B, plans active', async () => {
    exerciseId = (
      ok(
        await coach('POST', `${T}/exercises`, { name: `Klimmzüge ${randomUUID().slice(0, 4)}` }),
        201,
      ) as {
        id: string;
      }
    ).id;
    const created = workoutTemplateSchema.parse(
      ok(
        await coach('POST', `${T}/templates`, {
          title: 'Sprint 8A Zug',
          category: 'UPPER_BODY',
          sections: [
            {
              type: 'MAIN',
              exercises: [
                {
                  exerciseId,
                  executionType: 'STRENGTH',
                  sets: 2,
                  reps: 8,
                  restSeconds: 60,
                  mediaAssetId: templateVideo,
                },
              ],
            },
          ],
        }),
        201,
      ),
    );
    templateId = created.id;
    const media = must(created.sections[0]?.exercises[0]?.media, 'template media');
    expect(media.assetId).toBe(templateVideo);
    expect(media.url).toContain('/v1/media/training/');
    for (const date of DATES) {
      const assigned = assignTemplateResponseSchema.parse(
        ok(
          await coach('POST', `${T}/templates/${templateId}/assign`, {
            clientId: clientA,
            requestId: randomUUID(),
            date,
          }),
          201,
        ),
      );
      daysA.push(assigned.dayId);
      programA = assigned.programId;
    }
    ok(await coach('POST', `${T}/programs/${programA}/activate`));
    const b = assignTemplateResponseSchema.parse(
      ok(
        await coach('POST', `${T}/templates/${templateId}/assign`, {
          clientId: clientB,
          requestId: randomUUID(),
          date: DATES[0],
        }),
        201,
      ),
    );
    dayB = b.dayId;
    programB = b.programId;
    ok(await coach('POST', `${T}/programs/${programB}/activate`));
  });

  it('1. the client sees and plays their own video (signed URL, no bearer needed)', async () => {
    const started = startWorkoutResponseSchema.parse(
      ok(await asA('POST', W, { trainingDayId: daysA[0] }), 201),
    );
    session = started.session;
    const media = must(session.exercises[0]?.media, 'session media');
    expect(media.assetId).toBe(templateVideo);
    expect(new URL(media.url).searchParams.get('u')).toBe(clientA);
    const { res, bytes } = await fetchMedia(media.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(bytes).toEqual(h264);
    // the same URL again within the window: identical (players are not reset on refresh)
    const again = workoutSessionSchema.parse(ok(await asA('GET', `${W}/${session.id}`)));
    expect(again.exercises[0]?.media?.url).toBe(media.url);
  });

  it('6 + 7. HTTP Range: first bytes, a seek into the middle, suffix; invalid → 416', async () => {
    const url = must(session.exercises[0]?.media).url;
    const first = await fetchMedia(url, { Range: 'bytes=0-15' });
    expect(first.res.status).toBe(206);
    expect(first.res.headers.get('content-range')).toBe(`bytes 0-15/${h264.length}`);
    expect(first.bytes).toEqual(h264.slice(0, 16));
    const seekFrom = Math.floor(h264.length / 2);
    const seek = await fetchMedia(url, { Range: `bytes=${seekFrom}-` });
    expect(seek.res.status).toBe(206);
    expect(seek.res.headers.get('content-length')).toBe(String(h264.length - seekFrom));
    expect(seek.bytes).toEqual(h264.slice(seekFrom));
    const suffix = await fetchMedia(url, { Range: 'bytes=-8' });
    expect(suffix.bytes).toEqual(h264.slice(-8));
    const bad = await fetchMedia(url, { Range: `bytes=${h264.length + 10}-` });
    expect(bad.res.status).toBe(416);
    const head = await app(null, '').request(new URL(url).pathname + new URL(url).search, {
      method: 'HEAD',
    });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(h264.length));
  });

  it('2. another client can not use A’s URL, renew it, or get a working URL for A’s video', async () => {
    const url = must(session.exercises[0]?.media).url;
    // swap the user id → signature no longer matches
    expect((await fetchMedia(withQuery(url, { u: clientB }))).res.status).toBe(403);
    // B has the template video in B's own plan — but not A's per-client video (assigned below)
    const day = clientWorkoutSchema.parse(ok(await coach('GET', `${T}/days/${daysA[1]}/workout`)));
    ok(
      await coach(
        'PUT',
        `${T}/days/${daysA[1]}/workout`,
        dayInput(day, () => ({ mediaAssetId: clientVideo })),
      ),
    );
    expect((await asB('GET', `/v1/client/training/media/${clientVideo}/url`)).status).toBe(404);
    // even a correctly signed URL for B is refused at delivery (relationship re-checked)
    const forged = signer.sign(clientVideo, clientB).url;
    expect((await fetchMedia(forged)).res.status).toBe(404);
    // A can: the per-client video is in A's active plan
    const renewed = trainingMediaUrlSchema.parse(
      ok(await asA('GET', `/v1/client/training/media/${clientVideo}/url`)),
    );
    expect((await fetchMedia(renewed.url)).res.status).toBe(200);
  });

  it('3. coaches: unassigned coach gets no client data (no URL leaks); disabled coach is refused', async () => {
    // the unassigned coach can not read A's day → never receives A's media URLs
    expect((await otherCoach('GET', `${T}/days/${daysA[0]}/workout`)).status).toBe(404);
    // a coach can not use the client renewal endpoint
    expect((await coach('GET', `/v1/client/training/media/${templateVideo}/url`)).status).toBe(403);
    // the training library is shared by all coaches (same rule as GET /training/media): allowed
    const coachUrl = trainingMediaUrlSchema.parse(
      ok(await coach('GET', `${T}/media/${templateVideo}/url`)),
    );
    expect((await fetchMedia(coachUrl.url)).res.status).toBe(200);
    // a disabled coach: the already issued URL stops working before it expires
    const fremdUrl = trainingMediaUrlSchema.parse(
      ok(await otherCoach('GET', `${T}/media/${templateVideo}/url`)),
    );
    await handle.db
      .update(schema.users)
      .set({ status: 'DISABLED' })
      .where(eq(schema.users.id, otherCoachId));
    expect((await fetchMedia(fremdUrl.url)).res.status).toBe(404);
    await handle.db
      .update(schema.users)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.users.id, otherCoachId));
    // a client (no training.exercises.read) can not use the admin renewal endpoint
    expect((await asA('GET', `${T}/media/${templateVideo}/url`)).status).toBe(403);
  });

  it('4 + 5. expired and tampered URLs are refused (403 MEDIA_URL_EXPIRED); no reuse', async () => {
    const url = must(session.exercises[0]?.media).url;
    const old = signer.sign(templateVideo, clientA, Date.now() - 2 * 60 * 60 * 1000).url;
    const expired = await fetchMedia(old);
    expect(expired.res.status).toBe(403);
    expect(new TextDecoder().decode(expired.bytes)).toContain('MEDIA_URL_EXPIRED');
    const sig = must(new URL(url).searchParams.get('s'));
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    for (const tampered of [
      withQuery(url, { s: flipped }),
      withQuery(url, { e: String(Number(new URL(url).searchParams.get('e')) + 60) }),
      withQuery(url, { e: String(Math.floor(Date.now() / 1000) + 10 * 365 * 86400) }),
      url.replace(templateVideo, clientVideo),
      url.split('?')[0] ?? '',
      withQuery(url, { s: 'x' }),
    ]) {
      expect((await fetchMedia(tampered)).res.status, tampered.slice(-30)).toBe(403);
    }
    // a key that the server does not know (another environment) is refused
    const foreign = createTrainingMediaSigner({
      key: 'z'.repeat(40),
      apiBaseUrl: API,
      ttlSeconds: 900,
    });
    expect((await fetchMedia(foreign.sign(templateVideo, clientA).url)).res.status).toBe(403);
    // without a configured key the route refuses everything and responses carry no private URL
    const noKey = await app(null, '', { signing: false }).request(
      new URL(url).pathname + new URL(url).search,
    );
    expect(noKey.status).toBe(403);
    const unsigned = workoutSessionSchema.parse(
      ok(await api('CLIENT', clientA, { signing: false })('GET', `${W}/${session.id}`)),
    );
    expect(unsigned.exercises[0]?.media).toBeNull();
  });

  it('8. an expired URL is renewed by the app and plays again at a byte offset', async () => {
    const renewed = trainingMediaUrlSchema.parse(
      ok(await asA('GET', `/v1/client/training/media/${templateVideo}/url`)),
    );
    expect(Date.parse(must(renewed.expiresAt))).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
    const resumed = await fetchMedia(renewed.url, { Range: 'bytes=20-' });
    expect(resumed.res.status).toBe(206);
    expect(resumed.bytes).toEqual(h264.slice(20));
    // unknown / foreign asset ids: 404 (no hint whether it exists)
    expect((await asA('GET', `/v1/client/training/media/${randomUUID()}/url`)).status).toBe(404);
  });

  it('9. public website media and older PUBLIC training videos are unaffected', async () => {
    const site = await upload(
      'ADMIN',
      adminId,
      png(32, 32),
      'site.png',
      'image/png',
      undefined,
      '/v1/admin/media',
    );
    expect(site.status, site.text).toBe(201);
    expect(site.body.url).toMatch(new RegExp(`^${API}/media/public/website/`));
    const sitePath = new URL(site.body.url).pathname;
    const served = await app(null, '').request(sitePath);
    expect(served.status).toBe(200);
    expect(served.headers.get('cache-control')).toContain('public');
    // a training video uploaded BEFORE the switch (PUBLIC) keeps its public URL everywhere
    const legacy = await upload('COACH', coachId, h264, 'legacy.mp4', 'video/mp4', {
      visibility: 'PUBLIC',
    });
    expect(legacy.status).toBe(201);
    publicVideo = legacy.body.id;
    expect(legacy.body.url).toMatch(new RegExp(`^${API}/media/public/training-video/`));
    expect((await app(null, '').request(new URL(legacy.body.url).pathname)).status).toBe(200);
    // the signed route never serves public objects
    expect((await fetchMedia(signer.sign(publicVideo, coachId).url)).res.status).toBe(404);
    // renewal of a public asset answers its public URL without expiry
    const renewal = trainingMediaUrlSchema.parse(
      ok(await coach('GET', `${T}/media/${publicVideo}/url`)),
    );
    expect(renewal).toMatchObject({ url: legacy.body.url, expiresAt: null });
  });

  it('10. duplicating the template keeps the private video reference (signed for the viewer)', async () => {
    const copy = workoutTemplateSchema.parse(
      ok(await coach('POST', `${T}/templates/${templateId}/duplicate`), 201),
    );
    const media = must(copy.sections[0]?.exercises[0]?.media);
    expect(media.assetId).toBe(templateVideo);
    expect(new URL(media.url).searchParams.get('u')).toBe(coachId);
    expect((await fetchMedia(media.url)).res.status).toBe(200);
  });

  it('11. a per-client video change touches neither the other client nor the template', async () => {
    const seenA = clientActiveTrainingResponseSchema.parse(
      ok(await asA('GET', '/v1/client/training/active')),
    );
    const dayA = must(
      must(seenA.program)
        .weeks.flatMap((w) => w.days)
        .find((d) => d.id === daysA[1]),
    );
    expect(dayA.sections[0]?.exercises[0]?.media?.assetId).toBe(clientVideo);
    const seenB = clientActiveTrainingResponseSchema.parse(
      ok(await asB('GET', '/v1/client/training/active')),
    );
    const bDay = must(
      must(seenB.program)
        .weeks.flatMap((w) => w.days)
        .find((d) => d.id === dayB),
    );
    const bMedia = must(bDay.sections[0]?.exercises[0]?.media);
    expect(bMedia.assetId).toBe(templateVideo);
    expect(new URL(bMedia.url).searchParams.get('u')).toBe(clientB);
    expect((await fetchMedia(bMedia.url)).res.status).toBe(200);
    const template = workoutTemplateSchema.parse(
      ok(await coach('GET', `${T}/templates/${templateId}`)),
    );
    expect(template.sections[0]?.exercises[0]?.media?.assetId).toBe(templateVideo);
  });

  it('12. archived template/program + removed video: the old session snapshot still plays', async () => {
    // finish the session, then archive template and plan, and unlink the video from the plan
    for (const n of [1, 2]) {
      ok(
        await asA(
          'PATCH',
          `${W}/${session.id}/exercises/${must(session.exercises[0]).id}/sets/${n}`,
          {
            completed: true,
            actualReps: 8,
          },
        ),
      );
    }
    ok(await asA('POST', `${W}/${session.id}/complete`));
    const day = clientWorkoutSchema.parse(ok(await coach('GET', `${T}/days/${daysA[0]}/workout`)));
    ok(
      await coach(
        'PUT',
        `${T}/days/${daysA[0]}/workout`,
        dayInput(day, () => ({ mediaAssetId: null })),
      ),
    );
    ok(await coach('POST', `${T}/templates/${templateId}/archive`));
    ok(await coach('POST', `${T}/programs/${programA}/archive`));
    const history = workoutSessionSchema.parse(ok(await asA('GET', `${W}/${session.id}`)));
    const media = must(history.exercises[0]?.media, 'snapshot media');
    expect(media.assetId).toBe(templateVideo);
    expect((await fetchMedia(media.url)).res.status).toBe(200);
    // the per-client video of the archived plan is no longer renewable for A (only snapshots)
    expect((await asA('GET', `/v1/client/training/media/${clientVideo}/url`)).status).toBe(404);
  });

  it('a disabled client loses access at once; signatures never appear in the log', async () => {
    const renewed = trainingMediaUrlSchema.parse(
      ok(await asA('GET', `/v1/client/training/media/${templateVideo}/url`)),
    );
    await handle.db
      .update(schema.users)
      .set({ status: 'DISABLED' })
      .where(eq(schema.users.id, clientA));
    expect((await fetchMedia(renewed.url)).res.status).toBe(404);
    await handle.db
      .update(schema.users)
      .set({ status: 'ACTIVE' })
      .where(eq(schema.users.id, clientA));
    const signature = must(new URL(renewed.url).searchParams.get('s'));
    expect(logLines.length).toBeGreaterThan(10);
    expect(logLines.some((line) => line.includes(signature))).toBe(false);
    expect(logLines.some((line) => line.includes('s='))).toBe(false);
    expect(logLines.some((line) => line.includes(KEY))).toBe(false);
  });
});
