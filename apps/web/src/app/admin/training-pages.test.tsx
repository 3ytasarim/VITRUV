import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/admin/training/uebungen',
  useRouter: () => ({ refresh: vi.fn() }),
}));
const jar = vi.hoisted(() => ({
  values: new Map<string, string>([['vitruv_at', 'A'.repeat(43)]]),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.values.has(name) ? { value: jar.values.get(name) } : undefined),
    set: () => undefined,
  }),
  headers: async () => new Headers(),
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const me = (permissions: string[]) =>
  reply(200, {
    user: {
      id: uuid(1),
      email: 'coach@example.invalid',
      displayName: 'Coach',
      role: 'COACH',
      status: 'ACTIVE',
      permissions,
    },
  });
const COACH = [
  'admin.access',
  'clients.read',
  'training.exercises.read',
  'training.exercises.write',
  'training.programs.read',
  'training.programs.create',
  'training.programs.update',
  'training.programs.activate',
  'training.sessions.read',
];
const exercise = (n: number, name: string, extra = {}) => ({
  id: uuid(100 + n),
  name,
  description: null,
  active: true,
  media: null,
  usageCount: 0,
  createdAt: '2026-10-16T10:00:00.000Z',
  updatedAt: '2026-10-16T10:00:00.000Z',
  ...extra,
});
const summary = (n: number, title: string, status: string) => ({
  id: uuid(200 + n),
  clientId: uuid(900),
  title,
  status,
  startsOn: null,
  endsOn: null,
  activatedAt: status === 'ACTIVE' ? '2026-10-10T10:00:00.000Z' : null,
  retiredAt: null,
  weekCount: 2,
  assignmentCount: 7,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-12T10:00:00.000Z',
});

/** Routes fetches by API path; records every call. */
const fetchMock = vi.fn();
function routes(table: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (url: URL) => {
    const path = String(url).replace('http://localhost:4000', '');
    if (path === '/v1/auth/me') return me(COACH);
    for (const [prefix, respond] of Object.entries(table))
      if (path.startsWith(prefix)) return respond();
    return reply(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
}
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const html = async (node: Promise<React.ReactElement> | React.ReactElement) =>
  renderToStaticMarkup(await node);

describe('exercise library pages', () => {
  it('lists exercises with status + media presence and forwards search/status to the API', async () => {
    routes({
      '/v1/admin/training/exercises': () =>
        reply(200, {
          items: [
            exercise(1, 'Goblet Squat', { usageCount: 3 }),
            exercise(2, 'Plank', {
              active: false,
              media: {
                assetId: uuid(7),
                kind: 'VIDEO',
                url: 'http://localhost:4000/media/x.mp4',
                fileName: 'p.mp4',
              },
            }),
          ],
        }),
    });
    const { default: Page } = await import('./(shell)/training/uebungen/page');
    const markup = await html(
      Page({ searchParams: Promise.resolve({ q: 'pla', status: 'alle' }) }),
    );
    const call = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((u) => u.includes('/exercises'));
    expect(call).toContain('q=pla');
    expect(call).toContain('status=all');
    expect(markup).toContain('Goblet Squat');
    expect(markup).toContain('3 Verwendungen');
    expect(markup).toContain('Inaktiv');
    expect(markup).toContain('Video');
    expect(markup).toContain('Kein Medium');
    expect(markup).toMatch(/<form[^>]*role="search"/);
    expect(markup).toContain('href="/admin/training/uebungen/neu"');
  });

  it('shows an explicit empty state', async () => {
    routes({ '/v1/admin/training/exercises': () => reply(200, { items: [] }) });
    const { default: Page } = await import('./(shell)/training/uebungen/page');
    expect(await html(Page({ searchParams: Promise.resolve({}) }))).toContain('Noch keine Übungen');
  });
});

describe('client training tab', () => {
  it('groups programs by lifecycle and offers "new draft"', async () => {
    routes({
      '/v1/admin/training/clients/': () =>
        reply(200, {
          items: [
            summary(1, 'Aktueller Plan', 'ACTIVE'),
            summary(2, 'Nächster Block', 'DRAFT'),
            summary(3, 'Alter Block', 'ARCHIVED'),
          ],
        }),
    });
    const { default: Page } = await import('./(shell)/kunden/[id]/training/page');
    const markup = await html(
      Page({ params: Promise.resolve({ id: uuid(900) }), searchParams: Promise.resolve({}) }),
    );
    expect(markup.indexOf('Aktiver Plan')).toBeLessThan(markup.indexOf('Entwürfe'));
    expect(markup.indexOf('Entwürfe')).toBeLessThan(markup.indexOf('Abgeschlossen und archiviert'));
    expect(markup).toContain(`href="/admin/kunden/${uuid(900)}/training/${uuid(201)}"`);
    expect(markup).toContain('2 Wochen · 7 Übungen');
    expect(markup).toContain('Plan als Entwurf anlegen');
  });

  it('shows read-only workout summaries (snapshot values) with status, duration and counts', async () => {
    const session = (n: number, status: string, extra = {}) => ({
      id: uuid(600 + n),
      status,
      programTitle: 'Kraftaufbau',
      dayTitle: 'Oberkörper A',
      weekOrder: 0,
      dayOrder: 1,
      startedAt: '2026-10-14T16:00:00.000Z',
      completedAt: null,
      abandonedAt: null,
      durationSeconds: null,
      programId: uuid(201),
      dayId: null,
      exercisesTotal: 6,
      exercisesCompleted: 0,
      exercisesSkipped: 0,
      notesCount: 0,
      ...extra,
    });
    routes({
      [`/v1/admin/training/clients/${uuid(900)}/workouts`]: () =>
        reply(200, {
          items: [
            session(1, 'IN_PROGRESS', { exercisesCompleted: 2 }),
            session(2, 'COMPLETED', {
              completedAt: '2026-10-14T16:48:00.000Z',
              durationSeconds: 2880,
              exercisesCompleted: 5,
              exercisesSkipped: 1,
              notesCount: 3,
            }),
          ],
        }),
      '/v1/admin/training/clients/': () =>
        reply(200, { items: [summary(1, 'Aktueller Plan', 'ACTIVE')] }),
    });
    const { default: Page } = await import('./(shell)/kunden/[id]/training/page');
    const markup = await html(
      Page({ params: Promise.resolve({ id: uuid(900) }), searchParams: Promise.resolve({}) }),
    );
    expect(markup).toContain('Trainingsverlauf');
    expect(markup).toContain('Woche 1 · Tag 2 · Oberkörper A');
    expect(markup).toContain('Läuft');
    expect(markup).toContain('2 von 6 Übungen');
    expect(markup).toContain('48 Min. · 5 von 6 Übungen · 1 übersprungen');
    expect(markup).not.toContain('offen');
    expect(markup).toContain('3 Notizen');
    expect(markup).toContain(`href="/admin/kunden/${uuid(900)}/training/einheit/${uuid(602)}"`);
  });

  it('a client outside the coach scope is a 404 page (API 404)', async () => {
    routes({});
    const { default: Page } = await import('./(shell)/kunden/[id]/training/page');
    await expect(
      html(Page({ params: Promise.resolve({ id: uuid(901) }), searchParams: Promise.resolve({}) })),
    ).rejects.toThrow('NOT_FOUND');
  });
});

describe('client preview', () => {
  it('renders weeks → days → sections → exercises with prescriptions, rest, instructions and media hints', async () => {
    const preview = {
      id: uuid(201),
      title: 'Kraftaufbau',
      description: 'Drei Einheiten pro Woche.',
      startsOn: null,
      endsOn: null,
      currentWeekId: null,
      weeks: [
        {
          id: uuid(10),
          order: 0,
          title: null,
          notes: null,
          days: [
            {
              id: uuid(20),
              order: 0,
              title: 'Oberkörper A',
              notes: null,
              scheduledWeekday: 1,
              sections: [
                {
                  id: uuid(30),
                  order: 0,
                  type: 'MAIN',
                  title: null,
                  exercises: [
                    {
                      assignmentId: uuid(500),
                      exerciseId: uuid(100),
                      order: 0,
                      name: 'Klimmzüge',
                      description: null,
                      media: {
                        assetId: uuid(7),
                        kind: 'VIDEO',
                        url: 'http://localhost:4000/media/x.mp4',
                        mimeType: 'video/mp4',
                        width: 1280,
                        height: 720,
                        altText: 'Klimmzüge',
                      },
                      sets: 4,
                      reps: 12,
                      totalReps: null,
                      durationSeconds: null,
                      restSeconds: 90,
                      targetWeight: null,
                      weightUnit: null,
                      prescriptionText: null,
                      instructions: 'Schulterblätter aktiv.',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const program = { ...summary(1, 'Kraftaufbau', 'DRAFT'), description: null, weeks: [] };
    routes({
      [`/v1/admin/training/programs/${uuid(201)}/preview`]: () => reply(200, preview),
      [`/v1/admin/training/programs/${uuid(201)}`]: () => reply(200, program),
    });
    const { default: Page } =
      await import('./(shell)/kunden/[id]/training/[programId]/vorschau/page');
    const markup = await html(
      Page({ params: Promise.resolve({ id: uuid(900), programId: uuid(201) }) }),
    );
    for (const text of [
      'Woche 1',
      'Tag 1 · Oberkörper A',
      'Montag',
      'Hauptteil',
      'Klimmzüge',
      '4 × 12 · Pause 01:30',
      'Schulterblätter aktiv.',
      'Video verfügbar',
      'noch ein Entwurf',
    ]) {
      expect(markup).toContain(text);
    }
  });
});

describe('training actions', () => {
  it('validate operations with the shared contracts before calling the API', async () => {
    const { trainingOpAction } = await import('./training-actions');
    const bad = await trainingOpAction({
      type: 'addAssignment',
      sectionId: uuid(31),
      input: { exerciseId: uuid(100), restSeconds: 60 },
    });
    expect(bad.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    const forged = await trainingOpAction({ type: 'deleteWeek', weekId: 'nicht-uuid' } as never);
    expect(forged.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps an operation to exactly one API call with the session Bearer', async () => {
    routes({
      '/v1/admin/training/sections/': () =>
        reply(201, { ...summary(1, 'Plan', 'DRAFT'), description: null, weeks: [] }),
    });
    const { trainingOpAction } = await import('./training-actions');
    const result = await trainingOpAction({
      type: 'addAssignment',
      sectionId: uuid(31),
      input: { exerciseId: uuid(100), totalReps: 70, restSeconds: 60 },
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/sections/')) as [
      URL,
      RequestInit,
    ];
    expect(String(url)).toMatch(new RegExp(`/v1/admin/training/sections/${uuid(31)}/assignments$`));
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${'A'.repeat(43)}`);
    expect(JSON.parse(String(init.body))).toMatchObject({
      exerciseId: uuid(100),
      totalReps: 70,
      restSeconds: 60,
    });
  });

  it('reports out-of-scope ids (API 404) without detail', async () => {
    routes({});
    const { trainingOpAction } = await import('./training-actions');
    const result = await trainingOpAction({ type: 'deleteAssignment', assignmentId: uuid(500) });
    expect(result).toEqual({
      ok: false,
      message: 'Nicht gefunden oder kein Zugriff.',
      fieldErrors: {},
    });
  });
});
