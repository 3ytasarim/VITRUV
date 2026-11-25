/**
 * Server actions are HTTP requests. Their own failures come back as `{ ok: false, message }`, but a
 * network failure (offline, connection reset, server restart) REJECTS the promise instead. Without
 * this wrapper such a rejection left searches stuck on "Suche …" and broke the assign dialog
 * (Sprint 7.5, found by the browser E2E run). The rejection becomes an ordinary failure result, so
 * every caller shows its existing error state and retry.
 */
export const OFFLINE_MESSAGE =
  'Keine Verbindung zum Server. Bitte prüfe deine Verbindung und versuche es erneut.';

export type OfflineFailure = {
  ok: false;
  offline: true;
  message: string;
  fieldErrors: Record<string, string>;
};

export async function callAction<R>(run: () => Promise<R>): Promise<R | OfflineFailure> {
  try {
    return await run();
  } catch {
    return { ok: false, offline: true, message: OFFLINE_MESSAGE, fieldErrors: {} };
  }
}
