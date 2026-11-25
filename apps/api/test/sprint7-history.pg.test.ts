import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adminExerciseSchema,
  assignTemplateResponseSchema,
  clientActiveTrainingResponseSchema,
  clientTrainingWeekSchema,
  clientWorkoutSchema,
  exerciseProgressSchema,
  startWorkoutResponseSchema,
  workoutComparisonSchema,
  workoutSessionSchema,
  workoutSessionSummaryListSchema,
  workoutTemplateSchema,
  type ClientWorkout,
  type WorkoutSession,
  type WorkoutSessionExercise,
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
import { buildTestApp, principalResolver } from './helpers';
import { mp4, png, webm } from './media-fixtures';

/**
 * Sprint 7 — exercise videos per template row / per client, the session video snapshot, history
 * pagination with recorded totals, "previous vs current", exercise progress, the coach week
 * counts and the access rules, end-to-end on a REAL, ISOLATED PostgreSQL (never production).
 * Fictional people and values. Numbers refer to the Sprint 7 test list
 * (docs/ios-training-sprint7-test-results.md).
 */

const T = '/v1/admin/training';
const W = '/v1/client/workouts';
// Three Mondays/Wednesdays of one program week block (fictional dates)
const DATES = ['2027-05-03', '2027-05-05', '2027-05-07'];
type Res = { status: number; body: Record<string, unknown>; text: string };
type Call = (method: string, path: string, body?: unknown) => Promise<Res>;

let storageDir: string;
let handle: DatabaseHandle;

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

function app(role: UserRole, userId: string) {
  return buildTestApp({
    db: handle.db,
    storageDir,
    bodyLimitBytes: 1_048_576,
    auth: principalResolver(role, userId),
    extendedTypes: true,
  });
}

function api(role: UserRole, userId: string): Call {
  const instance = app(role, userId);
  return async (method, path, body) => {
    const res = await instance.request(path, {
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

async function upload(
  role: UserRole,
  userId: string,
  file: Uint8Array,
  name: string,
  type: string,
) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(file)], name, { type }));
  const res = await app(role, userId).request(`${T}/media`, { method: 'POST', body: form });
  const text = await res.text();
  return { status: res.status, text, body: (text ? JSON.parse(text) : {}) as { id: string } };
}

async function user(role: UserRole, name: string) {
  const [row] = await handle.db
    .insert(schema.users)
    .values({
      email: `it-s7-${name.toLowerCase()}-${randomUUID().slice(0, 6)}@vitruv.invalid`,
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

const named = (session: WorkoutSession, prefix: string): WorkoutSessionExercise =>
  must(
    session.exercises.find((e) => e.name.startsWith(prefix)),
    prefix,
  );

/** The PUT body of the client day editor from its current state (optionally patched per row). */
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

describe('Sprint 7 — videos, history, comparison and progress on an isolated PostgreSQL', () => {
  let adminId: string;
  let coachId: string;
  let otherCoachId: string;
  let clientA: string;
  let clientB: string;
  let admin: Call;
  let coach: Call;
  let otherCoach: Call;
  let asA: Call;
  let asB: Call;
  const ex: Record<'mobility' | 'squat' | 'pullups' | 'plank', string> = {
    mobility: '',
    squat: '',
    pullups: '',
    plank: '',
  };
  let libraryVideo = '';
  let templateVideo = '';
  let clientVideo = '';
  let templateId = '';
  let programA = '';
  const daysA: string[] = [];
  let dayB = '';
  const sessions: WorkoutSession[] = [];

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'vitruv-s7-'));
    handle = await freshDatabase('vitruv_it_s7');
    adminId = await user('ADMIN', 'Admin');
    coachId = await user('COACH', 'Coach');
    otherCoachId = await user('COACH', 'Fremd');
    await handle.db.insert(schema.coachProfiles).values([
      { userId: coachId, displayName: 'Coach' },
      { userId: otherCoachId, displayName: 'Fremd' },
    ]);
    clientA = await clientOf(coachId, 'Clara');
    clientB = await clientOf(coachId, 'David');
    admin = api('ADMIN', adminId);
    coach = api('COACH', coachId);
    otherCoach = api('COACH', otherCoachId);
    asA = api('CLIENT', clientA);
    asB = api('CLIENT', clientB);
  });
  afterAll(async () => {
    await handle?.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  it('1 + 7. training upload: MP4/H.264 accepted; WebM and HEVC refused with a German hint', async () => {
    const h264 = mp4({ width: 640, height: 360, durationMs: 4000, codec: 'avc1' });
    for (const label of ['library', 'template', 'client'] as const) {
      const res = await upload('COACH', coachId, h264, `${label}-demo.mp4`, 'video/mp4');
      expect(res.status, res.text).toBe(201);
      if (label === 'library') libraryVideo = res.body.id;
      if (label === 'template') templateVideo = res.body.id;
      if (label === 'client') clientVideo = res.body.id;
    }
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
    // images stay allowed
    expect((await upload('COACH', coachId, png(64, 64), 'bild.png', 'image/png')).status).toBe(201);
  });

  it('2. exercises with and without library video; every type can carry a row video', async () => {
    const names = {
      mobility: 'Hüftkreisen',
      squat: 'Kniebeuge',
      pullups: 'Klimmzüge',
      plank: 'Core-Zirkel',
    };
    for (const key of Object.keys(ex) as (keyof typeof ex)[]) {
      ex[key] = adminExerciseSchema.parse(
        ok(
          await coach('POST', `${T}/exercises`, {
            name: `${names[key]} ${randomUUID().slice(0, 4)}`,
            ...(key === 'squat' ? { mediaAssetId: libraryVideo } : {}),
          }),
          201,
        ),
      ).id;
    }
    const created = workoutTemplateSchema.parse(
      ok(
        await coach('POST', `${T}/templates`, {
          title: 'Sprint 7 Ganzkörper',
          category: 'UPPER_BODY',
          sections: [
            {
              type: 'WARMUP',
              exercises: [
                {
                  exerciseId: ex.mobility,
                  executionType: 'CHECKLIST',
                  mediaAssetId: templateVideo,
                },
              ],
            },
            {
              type: 'MAIN',
              exercises: [
                // library video only (no row video)
                {
                  exerciseId: ex.squat,
                  executionType: 'STRENGTH',
                  sets: 3,
                  reps: 10,
                  restSeconds: 90,
                },
                {
                  exerciseId: ex.pullups,
                  executionType: 'TOTAL_REPS',
                  totalReps: 30,
                  restSeconds: 60,
                  mediaAssetId: templateVideo,
                },
              ],
            },
            {
              type: 'FINISHER',
              exercises: [
                { exerciseId: ex.plank, executionType: 'INTERVAL', mediaAssetId: templateVideo },
              ],
            },
          ],
        }),
        201,
      ),
    );
    templateId = created.id;
    const rows = created.sections.flatMap((s) => s.exercises);
    expect(rows.map((r) => r.media?.assetId ?? null)).toEqual([
      templateVideo,
      null,
      templateVideo,
      templateVideo,
    ]);
    expect(must(rows[0]).media).toMatchObject({ kind: 'VIDEO', mimeType: 'video/mp4' });
  });

  it('3. a row video must come from the training library (website / unknown asset refused)', async () => {
    const [website] = await handle.db
      .insert(schema.mediaAssets)
      .values({
        kind: 'VIDEO',
        purpose: 'WEBSITE',
        visibility: 'PUBLIC',
        storageKey: `public/website/${randomUUID()}.mp4`,
        fileName: 'web.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 10,
      })
      .returning();
    for (const assetId of [must(website).id, randomUUID()]) {
      const res = await coach('POST', `${T}/templates`, {
        title: 'Falsches Medium',
        category: 'UPPER_BODY',
        sections: [
          {
            type: 'MAIN',
            exercises: [
              {
                exerciseId: ex.squat,
                executionType: 'STRENGTH',
                sets: 1,
                reps: 5,
                mediaAssetId: assetId,
              },
            ],
          },
        ],
      });
      expect(res.status, res.text).toBe(400);
      expect(res.text).toContain('mediaAssetId');
    }
  });

  it('4. duplicate + assign copy the video reference (file shared, not duplicated)', async () => {
    const copy = workoutTemplateSchema.parse(
      ok(await coach('POST', `${T}/templates/${templateId}/duplicate`), 201),
    );
    expect(copy.sections.flatMap((s) => s.exercises).map((r) => r.media?.assetId ?? null)).toEqual([
      templateVideo,
      null,
      templateVideo,
      templateVideo,
    ]);
    for (const [index, date] of DATES.entries()) {
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
      if (index === 0) ok(await coach('POST', `${T}/programs/${programA}/activate`));
    }
    const assignedB = assignTemplateResponseSchema.parse(
      ok(
        await coach('POST', `${T}/templates/${templateId}/assign`, {
          clientId: clientB,
          requestId: randomUUID(),
          date: DATES[0],
        }),
        201,
      ),
    );
    dayB = assignedB.dayId;
    ok(await coach('POST', `${T}/programs/${assignedB.programId}/activate`));
    const day = clientWorkoutSchema.parse(ok(await coach('GET', `${T}/days/${daysA[0]}/workout`)));
    expect(day.sections.flatMap((s) => s.exercises).map((r) => r.media?.assetId ?? null)).toEqual([
      templateVideo,
      null,
      templateVideo,
      templateVideo,
    ]);
  });

  it('5. changing client A’s video changes neither client B nor the template', async () => {
    const day = clientWorkoutSchema.parse(ok(await coach('GET', `${T}/days/${daysA[0]}/workout`)));
    ok(
      await coach(
        'PUT',
        `${T}/days/${daysA[0]}/workout`,
        dayInput(day, (row) =>
          row.exercise.id === ex.pullups ? { mediaAssetId: clientVideo } : {},
        ),
      ),
    );
    const after = clientWorkoutSchema.parse(
      ok(await coach('GET', `${T}/days/${daysA[0]}/workout`)),
    );
    const pull = (d: ClientWorkout) =>
      must(d.sections.flatMap((s) => s.exercises).find((r) => r.exercise.id === ex.pullups));
    expect(pull(after).media?.assetId).toBe(clientVideo);
    const b = clientWorkoutSchema.parse(ok(await coach('GET', `${T}/days/${dayB}/workout`)));
    expect(pull(b).media?.assetId).toBe(templateVideo);
    const template = workoutTemplateSchema.parse(
      ok(await coach('GET', `${T}/templates/${templateId}`)),
    );
    expect(
      template.sections.flatMap((s) => s.exercises).find((r) => r.exercise.id === ex.pullups)?.media
        ?.assetId,
    ).toBe(templateVideo);
    // the client's app sees its own video; B the template one; no row video → library video
    const seenA = clientActiveTrainingResponseSchema.parse(
      ok(await asA('GET', '/v1/client/training/active')),
    );
    const dayA = must(
      must(seenA.program)
        .weeks.flatMap((w) => w.days)
        .find((d) => d.id === daysA[0]),
    );
    const exercisesA = dayA.sections.flatMap((s) => s.exercises);
    expect(exercisesA.find((e) => e.exerciseId === ex.pullups)?.media?.assetId).toBe(clientVideo);
    expect(exercisesA.find((e) => e.exerciseId === ex.squat)?.media?.assetId).toBe(libraryVideo);
  });

  it('6 + 8. unlink (null) removes the row video → library video or none', async () => {
    const day = clientWorkoutSchema.parse(ok(await coach('GET', `${T}/days/${daysA[2]}/workout`)));
    ok(
      await coach(
        'PUT',
        `${T}/days/${daysA[2]}/workout`,
        dayInput(day, (row) => (row.exercise.id === ex.plank ? { mediaAssetId: null } : {})),
      ),
    );
    const after = clientWorkoutSchema.parse(
      ok(await coach('GET', `${T}/days/${daysA[2]}/workout`)),
    );
    expect(
      after.sections.flatMap((s) => s.exercises).find((r) => r.exercise.id === ex.plank)?.media,
    ).toBeNull();
  });

  it('9. the session snapshots the video at start; later video changes never reach it', async () => {
    const started = startWorkoutResponseSchema.parse(
      ok(await asA('POST', W, { trainingDayId: daysA[0] }), 201),
    ).session;
    expect(named(started, 'Klimmzüge').media?.assetId).toBe(clientVideo);
    expect(named(started, 'Kniebeuge').media?.assetId).toBe(libraryVideo);
    expect(named(started, 'Hüftkreisen').media?.assetId).toBe(templateVideo);
    // coach swaps A's video while the session runs
    const day = clientWorkoutSchema.parse(ok(await coach('GET', `${T}/days/${daysA[0]}/workout`)));
    ok(
      await coach(
        'PUT',
        `${T}/days/${daysA[0]}/workout`,
        dayInput(day, (row) =>
          row.exercise.id === ex.pullups ? { mediaAssetId: templateVideo } : {},
        ),
      ),
    );
    const again = workoutSessionSchema.parse(ok(await asA('GET', `${W}/${started.id}`)));
    expect(named(again, 'Klimmzüge').media?.assetId).toBe(clientVideo);
    sessions.push(again);
  });

  /** Records a full session (warm-up, strength reps, total-reps sets, rounds) and completes it. */
  async function play(
    session: WorkoutSession,
    strength: (number | null)[],
    total: number[],
    rounds: number,
  ) {
    ok(
      await asA('PATCH', `${W}/${session.id}/exercises/${named(session, 'Hüftkreisen').id}`, {
        status: 'COMPLETED',
      }),
    );
    const squat = named(session, 'Kniebeuge');
    for (const [i, reps] of strength.entries()) {
      if (reps === null) continue;
      ok(
        await asA('PATCH', `${W}/${session.id}/exercises/${squat.id}/sets/${i + 1}`, {
          completed: true,
          actualReps: reps,
        }),
      );
    }
    const pull = named(session, 'Klimmzüge');
    for (const reps of total) {
      ok(
        await asA('POST', `${W}/${session.id}/exercises/${pull.id}/sets`, {
          clientSetId: randomUUID(),
          actualReps: reps,
        }),
        201,
      );
    }
    const core = named(session, 'Core-Zirkel');
    for (let n = 1; n <= rounds; n++) {
      ok(
        await asA('PATCH', `${W}/${session.id}/exercises/${core.id}/sets/${n}`, {
          completed: true,
        }),
      );
    }
    ok(await asA('POST', `${W}/${session.id}/complete`));
  }

  it('11–15. three completed sessions with real reps; history newest first with totals', async () => {
    await play(must(sessions[0]), [10, 9, 8], [12, 10, 8], 5);
    const start = async (dayId: string | undefined) =>
      startWorkoutResponseSchema.parse(ok(await asA('POST', W, { trainingDayId: dayId }), 201))
        .session;
    // session 2: more reps; set 3 missing (never recorded → not 0)
    sessions.push(await start(daysA[1]));
    await play(must(sessions[1]), [11, 10, null], [15, 15], 4);
    // session 3 stays IN_PROGRESS (must never be used as "previous")
    sessions.push(await start(daysA[2]));
    const history = workoutSessionSummaryListSchema.parse(ok(await asA('GET', `${W}?limit=10`)));
    expect(history.items.map((i) => i.id)).toEqual([
      must(sessions[2]).id,
      must(sessions[1]).id,
      must(sessions[0]).id,
    ]);
    const first = must(history.items[2]);
    expect(first).toMatchObject({
      status: 'COMPLETED',
      exercisesCompleted: 4,
      totalReps: 27 + 30,
      setsCompleted: 3 + 3,
      roundsCompleted: 5,
    });
    expect(must(history.items[1])).toMatchObject({
      totalReps: 21 + 30,
      setsCompleted: 2 + 2,
      roundsCompleted: 4,
    });
    // running session without any record → totals null/0, never fake reps
    expect(must(history.items[0])).toMatchObject({
      status: 'IN_PROGRESS',
      totalReps: null,
      setsCompleted: 0,
    });
    expect(history.nextCursor).toBeNull();
  });

  it('16–17. cursor pagination: stable, no duplicates, invalid cursor 400', async () => {
    const page1 = workoutSessionSummaryListSchema.parse(ok(await asA('GET', `${W}?limit=2`)));
    expect(page1.items).toHaveLength(2);
    const cursor = must(page1.nextCursor);
    const page2 = workoutSessionSummaryListSchema.parse(
      ok(await asA('GET', `${W}?limit=2&cursor=${cursor}`)),
    );
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    const ids = [...page1.items, ...page2.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
    expect((await asA('GET', `${W}?cursor=bm9wZQ`)).status).toBe(400);
    expect((await asA('GET', `${W}?cursor=${encodeURIComponent('a b')}`)).status).toBe(400);
  });

  it('18–21. detail shows real sets (MAX-free strength, total sets, rounds, warm-up completion)', async () => {
    const detail = workoutSessionSchema.parse(ok(await asA('GET', `${W}/${must(sessions[1]).id}`)));
    expect(named(detail, 'Kniebeuge').sets.map((s) => s.actualReps)).toEqual([11, 10, null]);
    expect(named(detail, 'Klimmzüge').totalReps).toMatchObject({
      target: 30,
      done: 30,
      setCount: 2,
    });
    expect(named(detail, 'Core-Zirkel').sets.filter((s) => s.completed)).toHaveLength(4);
    expect(named(detail, 'Hüftkreisen')).toMatchObject({ status: 'COMPLETED', sets: [] });
  });

  it('22–24 + 26–29. comparison: previous vs current per set, totals, rounds; first = no data', async () => {
    const second = workoutComparisonSchema.parse(
      ok(await asA('GET', `${W}/${must(sessions[1]).id}/comparison`)),
    );
    const item = (name: string) => must(second.items.find((i) => i.name.startsWith(name)));
    expect(item('Kniebeuge')).toMatchObject({
      difference: 21 - 27,
      previous: { sessionId: must(sessions[0]).id },
      setDifferences: [
        { setNumber: 1, previous: 10, current: 11, difference: 1 },
        { setNumber: 2, previous: 9, current: 10, difference: 1 },
        { setNumber: 3, previous: 8, current: null, difference: null },
      ],
    });
    expect(item('Klimmzüge')).toMatchObject({ difference: 0 });
    expect(item('Klimmzüge').current.result).toMatchObject({
      totalReps: 30,
      setCount: 2,
      totalTarget: 30,
    });
    expect(item('Klimmzüge').previous?.result.setCount).toBe(3);
    expect(item('Core-Zirkel')).toMatchObject({ difference: -1, configChanged: false });
    expect(item('Core-Zirkel').current.result.interval).toEqual({
      rounds: 5,
      workSeconds: 40,
      restSeconds: 20,
    });
    // warm-up: no score, never a comparison
    expect(item('Hüftkreisen')).toMatchObject({ difference: null, setDifferences: [] });
    expect(item('Hüftkreisen').current.result.kind).toBe('NONE');

    const first = workoutComparisonSchema.parse(
      ok(await asA('GET', `${W}/${must(sessions[0]).id}/comparison`)),
    );
    expect(first.items.every((i) => i.previous === null && i.difference === null)).toBe(true);
    // the running session compares with the LATEST completed one, not with itself
    const running = workoutComparisonSchema.parse(
      ok(await asA('GET', `${W}/${must(sessions[2]).id}/comparison`)),
    );
    expect(running.items.find((i) => i.name.startsWith('Kniebeuge'))?.previous?.sessionId).toBe(
      must(sessions[1]).id,
    );
  });

  it('25 + 30–31. exercise progress: completed sessions only, oldest → newest, no fake points', async () => {
    const squat = exerciseProgressSchema.parse(
      ok(await asA('GET', `${W}/progress/exercises/${ex.squat}`)),
    );
    expect(squat).toMatchObject({ executionMode: 'SETS_REPS', kind: 'REPS' });
    expect(squat.points.map((p) => p.value)).toEqual([27, 21]);
    const core = exerciseProgressSchema.parse(
      ok(await asA('GET', `${W}/progress/exercises/${ex.plank}`)),
    );
    expect(core.points.map((p) => p.value)).toEqual([5, 4]);
    const warm = exerciseProgressSchema.parse(
      ok(await asA('GET', `${W}/progress/exercises/${ex.mobility}`)),
    );
    expect(warm).toMatchObject({ kind: 'NONE', points: [] });
    // coach sees the same series
    const viaCoach = exerciseProgressSchema.parse(
      ok(await coach('GET', `${T}/clients/${clientA}/workouts/progress/exercises/${ex.squat}`)),
    );
    expect(viaCoach.points.map((p) => p.value)).toEqual([27, 21]);
  });

  it('32–33. history reads the snapshot: template edit and archive change nothing', async () => {
    const before = ok(await asA('GET', `${W}/${must(sessions[0]).id}`));
    const template = workoutTemplateSchema.parse(
      ok(await coach('GET', `${T}/templates/${templateId}`)),
    );
    ok(
      await coach('PUT', `${T}/templates/${templateId}`, {
        expectedVersion: template.version,
        title: 'Umbenannt',
        category: 'UPPER_BODY',
        sections: [
          {
            type: 'MAIN',
            exercises: [{ exerciseId: ex.squat, executionType: 'STRENGTH', sets: 5, reps: 3 }],
          },
        ],
      }),
    );
    ok(await coach('POST', `${T}/templates/${templateId}/archive`));
    expect(ok(await asA('GET', `${W}/${must(sessions[0]).id}`))).toEqual(before);
  });

  it('34–35. coach week counts = the app rule (dated workouts, one status each)', async () => {
    const week = clientTrainingWeekSchema.parse(
      ok(await coach('GET', `${T}/clients/${clientA}/week?date=${DATES[0]}`)),
    );
    const workouts = week.days.flatMap((d) => d.workouts);
    expect(week.stats).toEqual({
      planned: workouts.length,
      completed: workouts.filter((w) => w.workoutStatus === 'COMPLETED').length,
      inProgress: workouts.filter((w) => w.workoutStatus === 'IN_PROGRESS').length,
      open: workouts.filter((w) => w.workoutStatus === 'NOT_STARTED').length,
    });
    expect(week.stats).toMatchObject({ planned: 3, completed: 2, inProgress: 1, open: 0 });
  });

  it('36–40. access: own data only; coach only assigned clients; client never admin routes', async () => {
    const a1 = must(sessions[0]).id;
    // client B: A's session, comparison and progress are invisible (404 / empty own series)
    expect((await asB('GET', `${W}/${a1}`)).status).toBe(404);
    expect((await asB('GET', `${W}/${a1}/comparison`)).status).toBe(404);
    const bProgress = exerciseProgressSchema.parse(
      ok(await asB('GET', `${W}/progress/exercises/${ex.squat}`)),
    );
    expect(bProgress.points).toEqual([]);
    expect(workoutSessionSummaryListSchema.parse(ok(await asB('GET', W))).items).toEqual([]);
    // a coach without the assignment: same 404 as a missing client
    for (const path of [
      `${T}/clients/${clientA}/workouts`,
      `${T}/clients/${clientA}/workouts/${a1}/comparison`,
      `${T}/clients/${clientA}/workouts/progress/exercises/${ex.squat}`,
    ]) {
      expect((await otherCoach('GET', path)).status, path).toBe(404);
    }
    // the right coach, but a session of another client → 404
    expect((await coach('GET', `${T}/clients/${clientB}/workouts/${a1}/comparison`)).status).toBe(
      404,
    );
    // clients never reach the admin routes
    expect((await asA('GET', `${T}/clients/${clientA}/workouts`)).status).toBe(403);
    // admin may read every client (existing policy)
    const viaAdmin = workoutSessionSummaryListSchema.parse(
      ok(await admin('GET', `${T}/clients/${clientA}/workouts?limit=1`)),
    );
    expect(viaAdmin.items).toHaveLength(1);
    expect(viaAdmin.nextCursor).toBeTruthy();
    // garbage ids are validation errors, not lookups
    expect((await asA('GET', `${W}/progress/exercises/not-a-uuid`)).status).toBe(400);
  });

  it('10. a video still in use can not be deleted; after unlinking it can — results stay', async () => {
    const blocked = await admin('DELETE', `${T}/media/${templateVideo}`);
    expect(blocked.status).toBe(409);
    expect(blocked.text).toMatch(/Workout-Vorlage|Kundenplan/);
    // the client video is only used by A's day 1 rows? It was swapped back to templateVideo in 9.
    const [usage] = await handle.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.trainingExerciseAssignments)
      .where(eq(schema.trainingExerciseAssignments.mediaAssetId, clientVideo));
    expect(must(usage).n).toBe(0);
    const removed = await admin('DELETE', `${T}/media/${clientVideo}`);
    expect([200, 204]).toContain(removed.status);
    // the session that snapshotted it keeps every result; only the video is gone (SET NULL)
    const old = workoutSessionSchema.parse(ok(await asA('GET', `${W}/${must(sessions[0]).id}`)));
    expect(named(old, 'Klimmzüge').media).toBeNull();
    expect(named(old, 'Klimmzüge').totalReps?.done).toBe(30);
  });
});
