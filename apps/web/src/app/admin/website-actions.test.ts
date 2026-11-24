import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const deleteMedia = vi.fn();
const saveDraft = vi.fn();
vi.mock('@/lib/admin-api', () => ({ adminApi: { deleteMedia, saveDraft } }));

const { deleteMediaBulkAction, saveDraftAction } = await import('./website-actions');
const { revalidatePath } = await import('next/cache');

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('deleteMediaBulkAction', () => {
  beforeEach(() => {
    deleteMedia.mockReset();
    vi.mocked(revalidatePath).mockReset();
  });

  it('deletes every id through the protected API delete and reports refusals individually', async () => {
    deleteMedia.mockImplementation(async (id: string) =>
      id === uuid(2)
        ? { ok: false, error: { code: 'CONFLICT', message: 'Medium wird verwendet.' } }
        : { ok: true, data: null },
    );
    const result = await deleteMediaBulkAction([uuid(1), uuid(2), uuid(3), uuid(1)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.deleted.sort()).toEqual([uuid(1), uuid(3)]);
    expect(result.data.failed).toEqual([{ id: uuid(2), message: 'Medium wird verwendet.' }]);
    expect(deleteMedia).toHaveBeenCalledTimes(3); // duplicates removed
    expect(revalidatePath).toHaveBeenCalledWith('/admin/website/medien');
  });

  it('rejects invalid input without calling the API', async () => {
    expect((await deleteMediaBulkAction([])).ok).toBe(false);
    expect((await deleteMediaBulkAction(['not-a-uuid'])).ok).toBe(false);
    expect(deleteMedia).not.toHaveBeenCalled();
  });
});

describe('saveDraftAction', () => {
  const ref = (n: number) => ({ desktop: { assetId: uuid(n) } });
  const sent = {
    results: {
      gallery: [{ id: 'ergebnis-1', who: 'T', media: ref(1), before: ref(2) }],
    },
  };
  const response = (content: Record<string, unknown>) => ({
    ok: true,
    data: {
      draft: {
        id: uuid(9),
        status: 'DRAFT',
        content,
        schemaVersion: 1,
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
        publishedAt: null,
      },
      warnings: [],
    },
  });

  beforeEach(() => saveDraft.mockReset());

  it('warns loudly when the server stored fewer images than were sent (outdated API build)', async () => {
    // an old API strips the unknown "before" key and still answers 200
    saveDraft.mockResolvedValue(
      response({ results: { gallery: [{ id: 'ergebnis-1', who: 'T', media: ref(1) }] } }),
    );
    const result = await saveDraftAction('home', sent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.warnings[0]?.message).toContain(
      '1 Bild(er) wurden vom Server NICHT gespeichert',
    );
  });

  it('no extra warning when everything was stored', async () => {
    saveDraft.mockResolvedValue(response(sent));
    const result = await saveDraftAction('home', sent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.warnings).toEqual([]);
  });
});
