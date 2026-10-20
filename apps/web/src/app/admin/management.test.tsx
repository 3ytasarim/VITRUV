import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PERMISSIONS, roleHasPermission } from '@vitruv/shared';

vi.mock('server-only', () => ({}));
const jar = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.values.has(name) ? { value: jar.values.get(name) } : undefined),
    set: () => undefined,
  }),
  headers: async () => new Headers(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  usePathname: () => '/admin/kunden/00000000-0000-4000-8000-000000000001',
  useRouter: () => ({ refresh: vi.fn() }),
}));

const actions = await import('./management-actions');
const activation = await import('../aktivieren/actions');
const { requirePagePermission } = await import('@/lib/auth/session');

const CLIENT_ID = '00000000-0000-4000-8000-000000000001';
const COACH_ID = '00000000-0000-4000-8000-0000000000c1';
const TOKEN = 'T'.repeat(43);
const account = {
  status: 'ACTIVE',
  activation: 'PENDING',
  activationExpiresAt: '2030-01-04T10:00:00.000Z',
  lastLoginAt: null,
} as const;
const detail = {
  id: CLIENT_ID,
  firstName: 'Erika',
  lastName: 'Muster',
  email: 'erika@example.invalid',
  username: 'erikamuster',
  coachingStatus: 'ACTIVE',
  account,
  coach: { id: COACH_ID, displayName: 'Coach A' },
  createdAt: '2030-01-01T10:00:00.000Z',
  phone: null,
  internalNotes: null,
  assignedAt: '2030-01-01T10:00:00.000Z',
  assignments: [],
};
const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('PUBLIC_SITE_URL', 'http://localhost:3200');
  jar.values.clear();
  jar.values.set('vitruv_at', 'A'.repeat(43));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

describe('client management actions', () => {
  it('creates a client with a staff-set password via the API (Bearer from the session cookie)', async () => {
    fetchMock.mockResolvedValue(reply(201, { client: detail }));
    const state = await actions.createClientAction(
      { status: 'idle' },
      form({
        firstName: 'Erika',
        lastName: 'Muster',
        username: '',
        password: 'ein langes Passwort',
        email: 'Erika@Example.invalid',
        phone: '',
        coachId: COACH_ID,
        coachingStatus: 'ACTIVE',
      }),
    );
    expect(state).toEqual({
      status: 'success',
      data: {
        clientId: CLIENT_ID,
        name: 'Erika Muster',
        username: 'erikamuster',
        email: 'erika@example.invalid',
      },
    });
    // the password is never echoed back into the UI state
    expect(JSON.stringify(state)).not.toContain('ein langes Passwort');
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toMatch(/\/v1\/admin\/clients$/);
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${'A'.repeat(43)}`);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      email: 'erika@example.invalid',
      username: null,
      password: 'ein langes Passwort',
      coachId: COACH_ID,
      phone: null,
    });
    expect(body).not.toHaveProperty('role');
  });

  it('e-mail and phone are optional; a typed username is sent normalised', async () => {
    fetchMock.mockResolvedValue(reply(201, { client: { ...detail, email: null } }));
    const state = await actions.createClientAction(
      { status: 'idle' },
      form({
        firstName: 'Erika',
        lastName: 'Muster',
        username: ' Erika.M ',
        password: 'ein langes Passwort',
        email: '',
      }),
    );
    expect(state).toMatchObject({ status: 'success', data: { email: null } });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [URL, RequestInit])[1].body));
    expect(body).toMatchObject({ email: null, username: 'erika.m', phone: null });
  });

  it('sets a new client password; short passwords are rejected locally', async () => {
    expect(
      await actions.setClientPasswordAction(
        CLIENT_ID,
        { status: 'idle' },
        form({ password: 'kurz' }),
      ),
    ).toMatchObject({ status: 'error', fieldErrors: { password: expect.any(String) } });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(reply(200, detail));
    expect(
      await actions.setClientPasswordAction(
        CLIENT_ID,
        { status: 'idle' },
        form({ password: 'ein neues langes Passwort' }),
      ),
    ).toEqual({ status: 'success', data: undefined });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toMatch(new RegExp(`/v1/admin/clients/${CLIENT_ID}/password$`));
    expect(init.method).toBe('PUT');
  });

  it('shows the API field error when the e-mail is taken', async () => {
    fetchMock.mockResolvedValue(
      reply(409, {
        error: {
          code: 'CONFLICT',
          message: 'E-mail address already in use.',
          details: [{ path: 'email', message: 'Diese E-Mail-Adresse wird bereits verwendet.' }],
        },
      }),
    );
    const state = await actions.createClientAction(
      { status: 'idle' },
      form({
        firstName: 'A',
        lastName: 'B',
        email: 'a@example.invalid',
        password: 'ein langes Passwort',
      }),
    );
    expect(state).toMatchObject({
      status: 'error',
      fieldErrors: { email: 'Diese E-Mail-Adresse wird bereits verwendet.' },
    });
  });

  it('validates locally before calling the API', async () => {
    const state = await actions.createClientAction(
      { status: 'idle' },
      form({ firstName: '', lastName: 'B', email: 'kein-email' }),
    );
    expect(state).toMatchObject({
      status: 'error',
      fieldErrors: { firstName: expect.any(String), email: expect.any(String) },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await actions.setClientAccountAction('not-a-uuid', 'DISABLED')).toMatchObject({
      status: 'error',
    });
    expect(await actions.assignClientAction(CLIENT_ID, 'x')).toMatchObject({ status: 'error' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports out-of-scope clients (API 404) without details', async () => {
    fetchMock.mockResolvedValue(
      reply(404, { error: { code: 'NOT_FOUND', message: 'Client not found.' } }),
    );
    expect(await actions.setClientAccountAction(CLIENT_ID, 'DISABLED')).toEqual({
      status: 'error',
      message: 'Nicht gefunden oder kein Zugriff.',
    });
  });

  it('regenerates an activation link and returns it once', async () => {
    fetchMock.mockResolvedValue(
      reply(201, {
        activation: { token: TOKEN, expiresAt: '2030-01-04T10:00:00.000Z', path: '/aktivieren' },
      }),
    );
    const state = await actions.regenerateClientActivationAction(CLIENT_ID);
    expect(state).toMatchObject({
      status: 'success',
      data: { url: expect.stringContaining(`#t=${TOKEN}`) },
    });
    expect(String((fetchMock.mock.calls[0] as [URL])[0])).toMatch(
      `/v1/admin/clients/${CLIENT_ID}/activation`,
    );
  });
});

describe('activation actions', () => {
  it('treats malformed tokens as invalid without asking the API', async () => {
    expect(await activation.checkActivationAction('kurz')).toEqual({ status: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps every API link failure to one generic invalid state', async () => {
    fetchMock.mockImplementation(async () =>
      reply(400, { error: { code: 'ACTIVATION_INVALID', message: 'x' } }),
    );
    expect(await activation.checkActivationAction(TOKEN)).toEqual({ status: 'invalid' });
    expect(
      await activation.activateAction(
        { status: 'idle' },
        form({ token: TOKEN, password: 'ein langes Passwort', confirm: 'ein langes Passwort' }),
      ),
    ).toEqual({ status: 'invalid' });
  });

  it('checks password confirmation and policy before calling the API', async () => {
    const mismatch = await activation.activateAction(
      { status: 'idle' },
      form({ token: TOKEN, password: 'ein langes Passwort', confirm: 'anders' }),
    );
    expect(mismatch).toMatchObject({ fieldErrors: { confirm: expect.any(String) } });
    const weak = await activation.activateAction(
      { status: 'idle' },
      form({ token: TOKEN, password: 'kurz', confirm: 'kurz' }),
    );
    expect(weak).toMatchObject({ fieldErrors: { password: expect.stringContaining('12') } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('activates and tells where to sign in', async () => {
    fetchMock.mockResolvedValue(reply(200, { destination: 'APP' }));
    expect(
      await activation.activateAction(
        { status: 'idle' },
        form({ token: TOKEN, password: 'ein langes Passwort', confirm: 'ein langes Passwort' }),
      ),
    ).toEqual({ status: 'done', destination: 'APP' });
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [URL, RequestInit])[1].body))).toEqual({
      token: TOKEN,
      password: 'ein langes Passwort',
    });
  });
});

describe('page guard (identity from the API)', () => {
  const me = (permissions: string[]) =>
    reply(200, {
      user: {
        id: COACH_ID,
        email: 'coach@example.invalid',
        displayName: 'Coach',
        role: 'COACH',
        status: 'ACTIVE',
        permissions,
      },
    });

  it('a COACH (real permission set) can not open Website CMS pages but keeps the client area', async () => {
    const coachPermissions = PERMISSIONS.filter((p) => roleHasPermission('COACH', p));
    expect(coachPermissions.some((p) => p.startsWith('website.'))).toBe(false);
    for (const permission of [
      'website.content.read',
      'website.media.read',
      'coaches.read',
    ] as const) {
      fetchMock.mockImplementation(async () => me([...coachPermissions]));
      await expect(requirePagePermission(permission)).rejects.toThrow('NOT_FOUND');
    }
    fetchMock.mockImplementation(async () => me([...coachPermissions]));
    await expect(requirePagePermission('clients.read')).resolves.toMatchObject({ role: 'COACH' });
  });

  it('a COACH reaching /admin/coaches gets 404; clients.read passes', async () => {
    fetchMock.mockResolvedValue(me(['admin.access', 'clients.read']));
    await expect(requirePagePermission('coaches.read')).rejects.toThrow('NOT_FOUND');
    fetchMock.mockResolvedValue(me(['admin.access', 'clients.read']));
    await expect(requirePagePermission('clients.read')).resolves.toMatchObject({ role: 'COACH' });
  });
});

describe('management UI markup', async () => {
  const { ClientCreateForm } = await import('@/components/admin/management/client-create-form');
  const { ActivationLinkPanel } =
    await import('@/components/admin/management/activation-link-panel');
  const { AccountBadge, CoachingBadge } =
    await import('@/components/admin/management/status-badges');
  const { WorkspaceTabs } = await import('@/components/admin/management/workspace-tabs');
  const { ConfirmDialog } = await import('@/components/admin/management/confirm-dialog');
  const html = (node: React.ReactElement) => renderToStaticMarkup(node);

  it('client form: ADMIN chooses a coach, a COACH does not; every field is labelled', () => {
    const admin = html(
      <ClientCreateForm coaches={[{ id: COACH_ID, displayName: 'Coach A', active: true }]} />,
    );
    expect(admin).toContain('name="coachId"');
    expect(admin).toContain('Coach A');
    const ids = [...admin.matchAll(/<(?:input|select|textarea)[^>]*\bid="([^"]+)"/g)].map(
      (m) => m[1],
    );
    for (const id of ids) expect(admin).toContain(`for="${id}"`);
    // staff sets the password (owner decision 2026-10-20); a role is never chosen in the UI
    expect(admin).toContain('name="password"');
    expect(admin).toContain('autoComplete="new-password"');
    expect(admin).toContain('name="username"');
    expect(admin).not.toMatch(/name="role"/);
    expect(admin).not.toMatch(/<input[^>]*name="email"[^>]*required/);
    const coach = html(<ClientCreateForm coaches={null} />);
    expect(coach).not.toContain('name="coachId"');
  });

  it('activation link panel: one-time warning, labelled field, copy control with live status', () => {
    const markup = html(
      <ActivationLinkPanel
        url={`https://vitruv.example/aktivieren#t=${TOKEN}`}
        expiresAt="2030-01-04T10:00:00.000Z"
        personName="Erika Muster"
      />,
    );
    expect(markup).toContain('Nur jetzt sichtbar');
    expect(markup).toMatch(/<label[^>]*for="([^"]+)"[^>]*>Aktivierungslink<\/label>/);
    expect(markup).toContain('readOnly');
    expect(markup).toContain('Link kopieren');
    expect(markup).toMatch(/role="status"[^>]*aria-live="polite"/);
  });

  it('status is spelled out, never colour only', () => {
    expect(html(<CoachingBadge status="PAUSED" />)).toContain('Pausiert');
    expect(html(<AccountBadge account={{ ...account, status: 'DISABLED' }} />)).toContain(
      'Konto deaktiviert',
    );
    expect(html(<AccountBadge account={account} />)).toContain('Aktivierung ausstehend');
  });

  it('workspace tabs mark the current section and announce later sprints as disabled', () => {
    const markup = html(
      <WorkspaceTabs
        label="Bereiche"
        tabs={[{ href: `/admin/kunden/${CLIENT_ID}`, label: 'Übersicht' }]}
        upcoming={['Training']}
      />,
    );
    expect(markup).toMatch(/aria-current="page"[^>]*>Übersicht/);
    expect(markup).toMatch(/aria-disabled="true"[^>]*>Training/);
    expect(markup).toContain('(folgt später)');
  });

  it('confirm dialog is a labelled modal with cancel first', () => {
    const markup = html(
      <ConfirmDialog
        open
        title="Konto deaktivieren?"
        confirmLabel="Deaktivieren"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      >
        <p>Text</p>
      </ConfirmDialog>,
    );
    expect(markup).toMatch(/<dialog[^>]*aria-labelledby="[^"]+"[^>]*aria-describedby="[^"]+"/);
    expect(markup.indexOf('Abbrechen')).toBeLessThan(markup.indexOf('Deaktivieren<'));
  });
});
