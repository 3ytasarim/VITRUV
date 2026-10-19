import 'server-only';
import { NextResponse } from 'next/server';
import { adminApiUrl, adminAuthHeaders } from './admin-api';

/** Response headers of the private file that are passed through unchanged. */
const PASS = [
  'content-type',
  'content-disposition',
  'content-length',
  'x-content-type-options',
  'content-security-policy',
  'cross-origin-resource-policy',
];

/**
 * Streams a PRIVATE file (meal-plan PDF) from the API to the browser. The session's access
 * token (HttpOnly cookie) is added server-side as Bearer; the API checks permission + scope and
 * answers 404 for anything out of scope. The API's own headers (download disposition, sandbox
 * CSP, nosniff) are kept; nothing is cached anywhere.
 */
export async function proxyPrivateFile(apiPath: string) {
  const auth = await adminAuthHeaders();
  if (!auth) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Bitte melde dich erneut an.' } },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  let res: Response;
  try {
    res = await fetch(adminApiUrl(apiPath), {
      headers: auth,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'Die API ist nicht erreichbar.' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!res.ok || !res.body) {
    return NextResponse.json(
      {
        error: {
          code: res.status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
          message: 'Datei nicht verfügbar.',
        },
      },
      {
        status: res.status === 404 || res.status === 403 ? 404 : 502,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  for (const name of PASS) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(res.body, { status: 200, headers });
}
