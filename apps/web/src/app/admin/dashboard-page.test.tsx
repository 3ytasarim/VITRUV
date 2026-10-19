import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'A'.repeat(43) }), set: () => undefined }),
  headers: async () => new Headers(),
}));

/** Glass start page: real numbers from GET /v1/admin/dashboard (fictional data). */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const dashboard = {
  kpis: {
    activeClients: 7,
    totalClients: 9,
    activePrograms: 6,
    sessionsThisWeek: 12,
    sessionsLastWeek: 8,
    notesLast7Days: 4,
    notesPrevious7Days: 5,
  },
  sessionsPerWeek: Array.from({ length: 8 }, (_, i) => ({
    weekStart: `2026-10-${String(5 + i).padStart(2, '0')}`,
    count: i,
  })),
  clientsByStatus: { ACTIVE: 7, PAUSED: 1, COMPLETED: 1 },
  recentNotes: [
    {
      sessionId: uuid(600),
      clientId: uuid(900),
      clientName: 'Mara Beispiel',
      exerciseName: 'Kniebeuge',
      excerpt: 'Knie ok.',
      at: '2026-10-18T18:00:00.000Z',
    },
  ],
  recentSessions: [],
};
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_BASE_URL', 'http://localhost:4000');
  fetchMock.mockImplementation(async (url: URL) => {
    const path = String(url).replace('http://localhost:4000', '');
    if (path === '/v1/auth/me')
      return reply(200, {
        user: {
          id: uuid(1),
          email: 'admin@example.invalid',
          displayName: 'Philipp Test',
          role: 'ADMIN',
          status: 'ACTIVE',
          permissions: ['admin.access', 'clients.read'],
        },
      });
    if (path === '/v1/admin/dashboard') return reply(200, dashboard);
    return reply(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

describe('admin dashboard', () => {
  it('greets by first name, shows KPIs with trends, 8 weekly bars, status donut and linked notes', async () => {
    const { default: Page } = await import('./(shell)/page');
    const markup = renderToStaticMarkup(await Page());
    expect(markup).toContain('👋');
    expect(markup).toContain('Philipp');
    expect(markup).toContain('Aktive Kund:innen');
    expect(markup).toContain('von 9 insgesamt');
    expect(markup).toContain('+50 %'); // 12 vs 8 sessions
    expect(markup.match(/class="vt-dbars__bar"/g)).toHaveLength(8);
    expect(markup).toContain('Aktiv: 7, Pausiert: 1, Abgeschlossen: 1');
    expect(markup).toContain(`href="/admin/kunden/${uuid(900)}/training/einheit/${uuid(600)}"`);
    expect(markup).toContain('Knie ok.');
  });
});
