import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidationRequestSchema } from '@vitruv/contracts';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { webServerEnv } from '@/lib/env';

const SECRET_HEADER = 'x-vitruv-revalidate-secret';

const digest = (value: string) => createHash('sha256').update(value).digest();
const reply = (status: number, code: string) =>
  NextResponse.json(
    { ok: status === 200, code },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );

/**
 * Server-to-server on-demand revalidation, called by the API AFTER a public change has committed
 * (publish or section visibility/order). Requires the shared REVALIDATE_SECRET in a header —
 * never a query string — compared in constant time. Expires the given cache tags immediately,
 * so the next visitor receives the newly published content.
 */
export async function POST(request: NextRequest) {
  const secret = webServerEnv().REVALIDATE_SECRET;
  if (!secret) return reply(503, 'NOT_CONFIGURED');
  const presented = request.headers.get(SECRET_HEADER);
  if (!presented || !timingSafeEqual(digest(presented), digest(secret))) {
    return reply(401, 'UNAUTHENTICATED');
  }
  const body = revalidationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return reply(400, 'BAD_REQUEST');
  for (const tag of body.data.tags) revalidateTag(tag, { expire: 0 });
  return reply(200, 'REVALIDATED');
}
