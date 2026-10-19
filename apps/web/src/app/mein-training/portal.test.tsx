import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// next/font only works inside the Next.js compiler; the layout imports the public fonts.
vi.mock('next/font/google', () => {
  const font = () => ({ variable: '', className: '', style: { fontFamily: '' } });
  return {
    Barlow: font,
    Barlow_Condensed: font,
    Chakra_Petch: font,
    Jost: font,
    Bodoni_Moda: font,
  };
});
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/mein-training',
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'vitruv_at' ? { value: 'A'.repeat(43) } : undefined),
    set: () => undefined,
  }),
  headers: async () => new Headers(),
}));

/** Client area ("Mein Training") and the coach's read-only view of client notes. Fictional data. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const CLIENT = ['training.self.read', 'training.self.workout'];
const COACH = ['admin.access', 'clients.read', 'training.sessions.read'];
let permissions = CLIENT;

const fetchMock = vi.fn();
const calls: { path: string; method: string; body: unknown }[] = [];
function routes(table: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (url: URL, init: RequestInit = {}) => {
    const path = String(url).replace('http://localhost:4000', '');
    calls.push({
      path,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (path === '/v1/auth/me')
      return reply(200, {
        user: {
          id: uuid(1),
          email: 'kunde@example.invalid',
          displayName: 'Test Kunde',
          role: permissions === CLIENT ? 'CLIENT' : 'COACH',
          status: 'ACTIVE',
          permissions,
        },
      });
    for (const [prefix, respond] of Object.entries(table))
      if (path.startsWith(prefix)) return respond();
    return reply(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_BASE_URL', 'http://localhost:4000');
  permissions = CLIENT;
  calls.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});
const html = async (node: Promise<React.ReactElement> | React.ReactElement) =>
  renderToStaticMarkup(await node);

const video = {
  assetId: uuid(7),
  kind: 'VIDEO',
  url: 'http://localhost:4000/media/klimmzug.mp4',
  mimeType: 'video/mp4',
  width: 1280,
  height: 720,
  altText: 'Klimmzug',
};
const program = {
  id: uuid(200),
  title: 'Kraftaufbau',
  description: null,
  startsOn: null,
  endsOn: null,
  currentWeekId: uuid(10),
  weeks: [
    {
      id: uuid(10),
      order: 0,
      title: null,
      notes: 'Ruhig starten.',
      days: [
        {
          id: uuid(20),
          order: 0,
          title: 'Oberkörper A',
          notes: 'Vorher gut aufwärmen.',
          scheduledWeekday: 1,
          sections: [
            {
              id: uuid(30),
              order: 0,
              type: 'MAIN',
              title: null,
              exercises: [
                {
                  assignmentId: uuid(40),
                  exerciseId: uuid(50),
                  order: 0,
                  name: 'Klimmzüge',
                  description: null,
                  media: video,
                  sets: 4,
                  reps: 8,
                  totalReps: null,
                  durationSeconds: null,
                  restSeconds: 90,
                  targetWeight: null,
                  weightUnit: null,
                  prescriptionText: null,
                  instructions: 'Schulterblätter zuerst.',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
const target = {
  sets: 4,
  reps: 8,
  totalReps: null,
  durationSeconds: null,
  restSeconds: 90,
  targetWeight: null,
  weightUnit: null,
  prescriptionText: null,
};
const session = (extra = {}) => ({
  id: uuid(600),
  status: 'COMPLETED',
  programTitle: 'Kraftaufbau',
  dayTitle: 'Oberkörper A',
  weekOrder: 0,
  dayOrder: 0,
  startedAt: '2026-10-17T16:00:00.000Z',
  completedAt: '2026-10-17T16:45:00.000Z',
  abandonedAt: null,
  durationSeconds: 2700,
  programId: uuid(200),
  dayId: uuid(20),
  progress: { total: 2, completed: 1, skipped: 1, currentExerciseId: null },
  clientNote: 'Wenig Schlaf, trotzdem gut.',
  clientNoteUpdatedAt: '2026-10-17T16:46:00.000Z',
  exercises: [
    {
      id: uuid(700),
      assignmentId: uuid(40),
      exerciseId: uuid(50),
      order: 0,
      sectionType: 'MAIN',
      sectionTitle: null,
      sectionOrder: 0,
      name: 'Klimmzüge',
      instructions: null,
      media: video,
      target,
      executionMode: 'SETS_REPS',
      status: 'COMPLETED',
      completedAt: '2026-10-17T16:20:00.000Z',
      actualReps: null,
      actualDurationSeconds: null,
      actualWeight: null,
      sets: [1, 2, 3, 4].map((n) => ({
        setNumber: n,
        targetReps: 8,
        targetDurationSeconds: null,
        targetWeight: null,
        actualReps: null,
        actualWeight: null,
        completed: true,
        completedAt: '2026-10-17T16:20:00.000Z',
      })),
      clientNote: 'Letzter Satz nur mit Schwung.',
      clientNoteUpdatedAt: '2026-10-17T16:21:00.000Z',
    },
    {
      id: uuid(701),
      assignmentId: null,
      exerciseId: uuid(51),
      order: 1,
      sectionType: 'MAIN',
      sectionTitle: null,
      sectionOrder: 0,
      name: 'Plank',
      instructions: null,
      media: null,
      target: { ...target, sets: null, reps: null, durationSeconds: 45 },
      executionMode: 'DURATION',
      status: 'SKIPPED',
      completedAt: null,
      actualReps: null,
      actualDurationSeconds: null,
      actualWeight: null,
      sets: [],
      clientNote: null,
      clientNoteUpdatedAt: null,
    },
  ],
  ...extra,
});

describe('client area access', () => {
  it('panel accounts are sent to /admin; clients get the area', async () => {
    const { default: Layout } = await import('./layout');
    permissions = COACH;
    routes({});
    await expect(html(Layout({ children: null }))).rejects.toThrow('REDIRECT:/admin');
    permissions = CLIENT;
    routes({ '/v1/public/': () => reply(503) });
    const markup = await html(Layout({ children: <p>Inhalt</p> }));
    expect(markup).toContain('data-surface="public"');
    expect(markup).toContain('Mein Training');
    expect(markup).toContain('Abmelden');
  });
});

describe('client area pages', () => {
  const profile = {
    id: uuid(1),
    firstName: 'Mara',
    lastName: 'Beispiel',
    email: 'kunde@example.invalid',
    coachingStatus: 'ACTIVE',
    coach: { displayName: 'Coach Test' },
  };
  const summary = {
    ...session(),
    exercisesTotal: 2,
    exercisesCompleted: 1,
    exercisesSkipped: 1,
    notesCount: 2,
  };

  it('dashboard: greeting with full name, next training with its exercises and start button', async () => {
    routes({
      '/v1/client/me': () => reply(200, profile),
      '/v1/client/training/active': () => reply(200, { program }),
      '/v1/client/workouts/current': () => reply(200, { session: null }),
      '/v1/client/workouts?': () => reply(200, { items: [] }),
    });
    const { default: Page } = await import('./page');
    const markup = await html(Page());
    // server renders the neutral greeting; the browser swaps in Morgen/Tag/Abend
    expect(markup).toContain('👋');
    expect(markup).toContain('Mara Beispiel');
    expect(markup).toContain('Coach Test');
    expect(markup).toContain('Nächstes Training');
    expect(markup).toContain('Oberkörper A');
    expect(markup).toContain('Klimmzüge');
    expect(markup).toContain('Training starten');
    expect(markup).toContain('0 von 1 Einheiten dieser Woche');
    expect(markup).toContain(`href="/mein-training/tag/${uuid(20)}"`);
    // self context: no client id in any API path
    expect(calls.every((c) => !c.path.includes(uuid(1)))).toBe(true);
  });

  it('dashboard: a completed day ticks the week, counts KPIs and lists the session with notes', async () => {
    routes({
      '/v1/client/me': () => reply(200, profile),
      '/v1/client/training/active': () => reply(200, { program }),
      '/v1/client/workouts/current': () => reply(200, { session: null }),
      '/v1/client/workouts?': () => reply(200, { items: [summary] }),
    });
    const { default: Page } = await import('./page');
    const markup = await html(Page());
    expect(markup).toContain('Diese Woche: 1 von 1 Einheiten erledigt');
    expect(markup).toContain('Alle Einheiten dieser Woche sind erledigt');
    expect(markup).toContain('Deine Notizen');
    expect(markup).toContain('2 Notizen');
    expect(markup).toContain(`href="/mein-training/einheit/${uuid(600)}"`);
  });

  it('plan: weeks with notes, day tiles linking to the videos, done days ticked', async () => {
    routes({
      '/v1/client/training/active': () => reply(200, { program }),
      '/v1/client/workouts?': () => reply(200, { items: [summary] }),
    });
    const { default: Page } = await import('./plan/page');
    const markup = await html(Page());
    expect(markup).toContain('Kraftaufbau');
    expect(markup).toContain('Diese Woche');
    expect(markup).toContain('Ruhig starten.');
    expect(markup).toContain('1 / 1 erledigt');
    expect(markup).toContain(`href="/mein-training/tag/${uuid(20)}"`);
    expect(markup).toContain('1 Übung');
  });

  it('day: coach notes, demo video (no autoplay), prescription, instructions and the start button', async () => {
    routes({
      '/v1/client/training/active': () => reply(200, { program }),
      '/v1/client/workouts/current': () => reply(200, { session: null }),
    });
    const { default: Page } = await import('./tag/[dayId]/page');
    const markup = await html(Page({ params: Promise.resolve({ dayId: uuid(20) }) }));
    expect(markup).toContain('Vorher gut aufwärmen.');
    expect(markup).toMatch(/<video[^>]*src="http:\/\/localhost:4000\/media\/klimmzug.mp4"/);
    expect(markup).not.toContain('autoplay');
    expect(markup).toContain('4 × 8');
    expect(markup).toContain('Schulterblätter zuerst.');
    expect(markup).toContain('Training starten');
    await expect(html(Page({ params: Promise.resolve({ dayId: uuid(99) }) }))).rejects.toThrow(
      'NOT_FOUND',
    );
  });

  it('session: notes under each exercise and on the whole session are editable, also after finishing', async () => {
    routes({ [`/v1/client/workouts/${uuid(600)}`]: () => reply(200, session()) });
    const { default: Page } = await import('./einheit/[sessionId]/page');
    const markup = await html(
      Page({
        params: Promise.resolve({ sessionId: uuid(600) }),
        searchParams: Promise.resolve({ hinweis: 'fertig' }),
      }),
    );
    expect(markup).toContain('Training abgeschlossen');
    expect(markup).toContain('Deine Notiz zu dieser Übung');
    expect(markup).toContain('Letzter Satz nur mit Schwung.');
    expect(markup).toContain('Wenig Schlaf, trotzdem gut.');
    expect(markup).toContain('Dein Coach kann diese Notiz lesen.');
    // finished: no recording controls, no finish buttons
    expect(markup).not.toContain('Sätze abhaken');
    expect(markup).not.toContain('Training abschließen');
  });

  it('a session of someone else is a 404 page (API 404)', async () => {
    routes({});
    const { default: Page } = await import('./einheit/[sessionId]/page');
    await expect(
      html(
        Page({
          params: Promise.resolve({ sessionId: uuid(601) }),
          searchParams: Promise.resolve({}),
        }),
      ),
    ).rejects.toThrow('NOT_FOUND');
  });
});

describe('note action', () => {
  it('validates ids and length before the API; sends only the note to the own session', async () => {
    routes({
      [`/v1/client/workouts/${uuid(600)}/exercises/${uuid(700)}/note`]: () =>
        reply(200, { clientNote: 'Gut.', clientNoteUpdatedAt: '2026-10-17T16:21:00.000Z' }),
    });
    const { saveNoteAction } = await import('./actions');
    expect(await saveNoteAction('x', null, 'Gut.')).toMatchObject({ ok: false });
    expect(await saveNoteAction(uuid(600), null, 'x'.repeat(2001))).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
    expect(await saveNoteAction(uuid(600), uuid(700), '  Gut.  ')).toMatchObject({
      ok: true,
      data: { clientNote: 'Gut.' },
    });
    expect(calls[0]).toMatchObject({ method: 'PUT', body: { note: 'Gut.' } });
  });
});

describe('coach view of client notes', () => {
  it('shows which note sits under which exercise and the session note — read-only', async () => {
    permissions = COACH;
    routes({
      [`/v1/admin/training/clients/${uuid(900)}/workouts/${uuid(600)}`]: () =>
        reply(200, session()),
    });
    const { default: Page } =
      await import('../admin/(shell)/kunden/[id]/training/einheit/[sessionId]/page');
    const markup = await html(
      Page({ params: Promise.resolve({ id: uuid(900), sessionId: uuid(600) }) }),
    );
    expect(markup).toContain('Notiz zum ganzen Training');
    expect(markup).toContain('Wenig Schlaf, trotzdem gut.');
    expect(markup).toMatch(
      /Klimmzüge[\s\S]*Letzter Satz nur mit Schwung\.[\s\S]*Plank[\s\S]*Keine Notiz/,
    );
    expect(markup).toContain('4 von 4 Sätzen');
    expect(markup).toContain('1 von 2 Übungen haben eine Notiz');
    expect(markup).not.toContain('<textarea');
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });
});

describe('client area: Ernährung', () => {
  it('shows the released meal plan with a download through the portal proxy (no API path)', async () => {
    routes({
      '/v1/client/nutrition/active': () =>
        reply(200, {
          document: {
            id: uuid(800),
            title: 'Plan November',
            versionNumber: 2,
            versionLabel: 'Woche 1–4',
            effectiveFrom: '2026-11-01',
            activatedAt: '2026-10-18T10:00:00.000Z',
            createdAt: '2026-10-18T09:00:00.000Z',
            file: {
              mimeType: 'application/pdf',
              sizeBytes: 2_400_000,
              fileName: 'plan.pdf',
              fileApiPath: `/v1/client/nutrition/${uuid(800)}/file`,
            },
          },
        }),
    });
    const { default: Page } = await import('./ernaehrung/page');
    const markup = await html(Page());
    expect(markup).toContain('Plan November');
    expect(markup).toContain('Woche 1–4');
    expect(markup).toContain(`href="/mein-training/api/ernaehrung/${uuid(800)}"`);
    expect(markup).toContain('2,3 MB');
    expect(markup).not.toContain('/v1/');
  });

  it('without a released plan: an honest empty state', async () => {
    routes({ '/v1/client/nutrition/active': () => reply(200, { document: null }) });
    const { default: Page } = await import('./ernaehrung/page');
    expect(await html(Page())).toContain('Noch kein Ernährungsplan');
  });
});
