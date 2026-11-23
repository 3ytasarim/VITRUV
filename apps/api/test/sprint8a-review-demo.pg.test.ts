import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adminExerciseSchema,
  assignTemplateResponseSchema,
  clientActiveTrainingResponseSchema,
  startWorkoutResponseSchema,
  workoutSessionSummaryListSchema,
  workoutTemplateSchema,
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
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalStorage } from '../src/infra/storage/local-storage';
import { createMediaUrlResolver } from '../src/modules/media/media-url';
import { createTrainingMediaSigner } from '../src/modules/media/training-media-access';
import { buildTestApp, principalResolver } from './helpers';
import { mp4 } from './media-fixtures';

/**
 * Sprint 8A — App Review demo account RECIPE, proven on the isolated cluster (never production,
 * never Neon). Builds exactly what docs/ios-training-sprint8a-apple-readiness.md §Demo describes:
 * one fictional coach, one fictional demo CLIENT, a library with a (private) exercise video, an
 * active plan with two workouts (only types allowed while TRAINING_EXTENDED_TYPES is OFF, i.e.
 * what production will run during review), and two completed sessions as history.
 * No password is created here (login identities are created by operator tooling on the target
 * environment; the reviewer credentials go only into App Store Connect).
 */

const T = '/v1/admin/training';
const W = '/v1/client/workouts';
const API = 'http://localhost:4000';
type Res = { status: number; body: Record<string, unknown>; text: string };
type Call = (method: string, path: string, body?: unknown) => Promise<Res>;

let handle: DatabaseHandle;
let storageDir: string;
const signer = createTrainingMediaSigner({
  key: 'it-only-review-demo-key-0123456789abcdef',
  apiBaseUrl: API,
  ttlSeconds: 900,
});
const urls = createMediaUrlResolver(`${API}/media`, signer);

const must = <V>(v: V | null | undefined, what = 'value'): V => {
  if (v === null || v === undefined) throw new Error(`Expected ${what}`);
  return v;
};
const ok = (res: Res, status = 200) => {
  expect(res.status, res.text).toBe(status);
  return res.body;
};

function app(role: UserRole, userId: string) {
  return buildTestApp({
    db: handle.db,
    storageDir,
    bodyLimitBytes: 1_048_576,
    auth: principalResolver(role, userId),
    // Production default during review: extended types OFF.
    training: { db: handle.db, urls, extendedTypes: false },
    website: { db: handle.db, urls },
    media: {
      db: handle.db,
      storage: createLocalStorage(storageDir),
      urls,
      limits: { IMAGE: 20 * 1024 * 1024, VIDEO: 50 * 1024 * 1024 },
      trainingVisibility: 'PRIVATE',
    },
    trainingMediaSigner: signer,
  });
}
const api =
  (role: UserRole, userId: string): Call =>
  async (method, path, body) => {
    const res = await app(role, userId).request(path, {
      method,
      headers: {
        // an app build of today (capability 2); the plan uses only capability-1 types anyway
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

describe('Sprint 8A — App Review demo client (isolated recipe)', () => {
  let coachId: string;
  let demoId: string;
  let coach: Call;
  let demo: Call;
  const sessions: WorkoutSession[] = [];

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'vitruv-s8a-demo-'));
    const base = await verifiedIsolatedBase(process.env);
    const url = await recreateIsolatedDatabase(base, 'vitruv_it_s8a_demo');
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
        email: 'review.coach@vitruv.invalid',
        role: 'COACH',
        status: 'ACTIVE',
        displayName: 'Demo Coach',
      })
      .returning();
    coachId = must(c).id;
    await handle.db
      .insert(schema.coachProfiles)
      .values({ userId: coachId, displayName: 'Demo Coach' });
    // username login like website-created clients; no e-mail, no password in the fixture
    const [d] = await handle.db
      .insert(schema.users)
      .values({
        username: 'appreview.demo',
        role: 'CLIENT',
        status: 'ACTIVE',
        displayName: 'Demo Teilnehmer',
      })
      .returning();
    demoId = must(d).id;
    await handle.db
      .insert(schema.clientProfiles)
      .values({ userId: demoId, firstName: 'Demo', lastName: 'Teilnehmer' });
    await handle.db
      .insert(schema.coachClientAssignments)
      .values({ coachUserId: coachId, clientUserId: demoId });
    coach = api('COACH', coachId);
    demo = api('CLIENT', demoId);
  });
  afterAll(async () => {
    await handle?.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  it('builds library, video, plan, two workouts and two completed sessions', async () => {
    const form = new FormData();
    form.append(
      'file',
      new File(
        [new Uint8Array(mp4({ width: 640, height: 360, durationMs: 8000, codec: 'avc1' }))],
        'kniebeuge-demo.mp4',
        {
          type: 'video/mp4',
        },
      ),
    );
    const uploaded = await app('COACH', coachId).request(`${T}/media`, {
      method: 'POST',
      body: form,
    });
    expect(uploaded.status).toBe(201);
    const videoId = ((await uploaded.json()) as { id: string }).id;
    const squat = adminExerciseSchema.parse(
      ok(
        await coach('POST', `${T}/exercises`, { name: 'Kniebeuge (Demo)', mediaAssetId: videoId }),
        201,
      ),
    );
    const pushups = adminExerciseSchema.parse(
      ok(await coach('POST', `${T}/exercises`, { name: 'Liegestütze (Demo)' }), 201),
    );
    const template = workoutTemplateSchema.parse(
      ok(
        await coach('POST', `${T}/templates`, {
          title: 'Demo Ganzkörper',
          category: 'UPPER_BODY',
          sections: [
            {
              type: 'MAIN',
              exercises: [
                {
                  exerciseId: squat.id,
                  executionType: 'STRENGTH',
                  sets: 3,
                  reps: 10,
                  restSeconds: 90,
                },
                {
                  exerciseId: pushups.id,
                  executionType: 'TOTAL_REPS',
                  totalReps: 40,
                  restSeconds: 60,
                },
              ],
            },
          ],
        }),
        201,
      ),
    );
    let programId = '';
    const days: string[] = [];
    for (const date of ['2027-03-01', '2027-03-03', '2027-03-05']) {
      const assigned = assignTemplateResponseSchema.parse(
        ok(
          await coach('POST', `${T}/templates/${template.id}/assign`, {
            clientId: demoId,
            requestId: randomUUID(),
            date,
          }),
          201,
        ),
      );
      days.push(assigned.dayId);
      programId = assigned.programId;
    }
    ok(await coach('POST', `${T}/programs/${programId}/activate`));
    // two completed sessions → history + progress
    for (const day of days.slice(0, 2)) {
      const session = startWorkoutResponseSchema.parse(
        ok(await demo('POST', W, { trainingDayId: day }), 201),
      ).session;
      const strength = must(session.exercises.find((e) => e.name.startsWith('Kniebeuge')));
      for (const n of [1, 2, 3]) {
        ok(
          await demo('PATCH', `${W}/${session.id}/exercises/${strength.id}/sets/${n}`, {
            completed: true,
            actualReps: 10,
          }),
        );
      }
      const total = must(session.exercises.find((e) => e.name.startsWith('Liegestütze')));
      for (const reps of [15, 15, 10]) {
        ok(
          await demo('POST', `${W}/${session.id}/exercises/${total.id}/sets`, {
            clientSetId: randomUUID(),
            actualReps: reps,
          }),
          201,
        );
      }
      ok(await demo('POST', `${W}/${session.id}/complete`));
      sessions.push(session);
    }
  });

  it('the demo client sees an active plan with an open workout, a playable video and history', async () => {
    const active = clientActiveTrainingResponseSchema.parse(
      ok(await demo('GET', '/v1/client/training/active')),
    );
    const program = must(active.program, 'active program');
    const allDays = program.weeks.flatMap((w) => w.days);
    expect(allDays).toHaveLength(3);
    const open = allDays.filter((d) => d.workoutStatus !== 'COMPLETED');
    expect(open).toHaveLength(1);
    const media = must(open[0]?.sections[0]?.exercises.find((e) => e.media)?.media, 'video');
    const target = new URL(media.url);
    const played = await app('CLIENT', demoId).request(target.pathname + target.search);
    expect(played.status).toBe(200);
    const history = workoutSessionSummaryListSchema.parse(ok(await demo('GET', `${W}?limit=10`)));
    expect(history.items.length).toBe(2);
    // nothing in the fixture uses a type that production rejects while the flag is OFF
    const types = allDays.flatMap((d) =>
      d.sections.flatMap((s) => s.exercises.map((e) => e.executionType)),
    );
    expect(new Set(types)).toEqual(new Set(['STRENGTH', 'TOTAL_REPS']));
  });
});
