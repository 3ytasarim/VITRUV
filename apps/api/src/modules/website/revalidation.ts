import type { RevalidationRequest } from '@vitruv/contracts';
import type { PublishHook } from './website.service';

export const REVALIDATE_SECRET_HEADER = 'x-vitruv-revalidate-secret';

/**
 * Publish hook → web app on-demand revalidation (server-to-server).
 *
 * After a public change has COMMITTED, the API POSTs `{ tags: ['website:<slug>'], contentRevision }`
 * to the web app's `/api/revalidate` with a shared secret header. The web app checks the secret and
 * expires the cache tag, so the next visitor gets the new content. Failures throw; the caller
 * (`notifyPublicChange`) logs them and the web cache's time-based expiry is the safety net.
 */
export function createWebRevalidationHook(options: {
  url: string;
  secret: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): PublishHook {
  const doFetch = options.fetchImpl ?? fetch;
  return async (event) => {
    const body: RevalidationRequest = {
      tags: [`website:${event.pageSlug}`],
      contentRevision: event.contentRevision,
    };
    const res = await doFetch(options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [REVALIDATE_SECRET_HEADER]: options.secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 3_000),
    });
    if (!res.ok) throw new Error(`revalidation responded ${res.status}`);
  };
}
