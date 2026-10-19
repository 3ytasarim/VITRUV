import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const requestHeaders = vi.hoisted(() => ({
  value: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}));
vi.mock('next/headers', () => ({ headers: async () => requestHeaders.value }));

const { submitContact } = await import('./actions');

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const valid = {
  name: 'Erika Musterfrau',
  email: 'erika@example.com',
  phone: '',
  message: 'Ich möchte stärker werden.',
  consent: 'on',
  website: '',
  startedAt: String(Date.now() - 60_000),
};
const idle = { status: 'idle' as const };

describe('submitContact (server action)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('forwards a valid inquiry to the API and reports success', async () => {
    requestHeaders.value = new Headers({ 'x-forwarded-for': '203.0.113.10' });
    expect(await submitContact(idle, form(valid))).toEqual({ status: 'success' });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toMatch(/\/v1\/public\/leads$/);
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: 'erika@example.com',
      consent: true,
      website: '',
    });
  });

  it('returns field errors for invalid input without calling the API', async () => {
    requestHeaders.value = new Headers({ 'x-forwarded-for': '203.0.113.11' });
    const state = await submitContact(idle, form({ ...valid, email: 'kaputt', consent: '' }));
    expect(state.status).toBe('error');
    expect(Object.keys(state.fieldErrors ?? {}).sort()).toEqual(['consent', 'email']);
    expect(state.values?.email).toBe('kaputt'); // repopulates the form for the same visitor
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rate-limits a client after five submissions', async () => {
    requestHeaders.value = new Headers({ 'x-forwarded-for': '203.0.113.12' });
    for (let i = 0; i < 5; i++)
      expect((await submitContact(idle, form(valid))).status).toBe('success');
    const limited = await submitContact(idle, form(valid));
    expect(limited).toMatchObject({ status: 'error' });
    expect(limited.message).toMatch(/Zu viele Anfragen/);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('shows a safe, generic message when the API fails', async () => {
    requestHeaders.value = new Headers({ 'x-forwarded-for': '203.0.113.13' });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'db host xyz' } }), {
        status: 500,
      }),
    );
    const state = await submitContact(idle, form(valid));
    expect(state.status).toBe('error');
    expect(state.message).not.toContain('xyz');
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED 10.0.0.5'));
    expect((await submitContact(idle, form(valid))).message).not.toContain('10.0.0.5');
  });
});
