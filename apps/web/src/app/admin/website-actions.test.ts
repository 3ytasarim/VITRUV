import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const deleteMedia = vi.fn();
vi.mock('@/lib/admin-api', () => ({ adminApi: { deleteMedia } }));

const { deleteMediaBulkAction } = await import('./website-actions');
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
