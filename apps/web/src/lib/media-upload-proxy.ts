import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { adminApiUrl, adminAuthHeaders } from './admin-api';

/**
 * Media upload proxy: streams the browser's multipart body to the API (which validates type,
 * content, size and generates the storage key). Server actions are not used here because of
 * their small body limit. Adds the session's access token (HttpOnly cookie → Bearer) server-side;
 * the token never reaches browser JavaScript. The API checks the library permission
 * (website: website.media.write; training: training.exercises.write).
 */
export async function proxyMediaUpload(request: NextRequest, apiPath: string) {
  // Same-origin only (CSRF): the browser's session cookie authorises this request.
  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Ungültige Herkunft der Anfrage.' } },
      { status: 403 },
    );
  }
  const auth = await adminAuthHeaders();
  if (!auth) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Bitte melde dich erneut an.' } },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data') || !request.body) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'multipart/form-data erwartet.' } },
      { status: 400 },
    );
  }
  try {
    const res = await fetch(adminApiUrl(apiPath), {
      method: 'POST',
      headers: { ...auth, 'content-type': contentType },
      body: request.body,
      // Required by Node's fetch for streaming request bodies.
      duplex: 'half',
      cache: 'no-store',
    } as RequestInit & { duplex: 'half' });
    const body: unknown = await res.json().catch(() => ({
      error: { code: 'INTERNAL_ERROR', message: 'Unerwartete Antwort der API.' },
    }));
    return NextResponse.json(body, {
      status: res.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'Die API ist nicht erreichbar.' } },
      { status: 503 },
    );
  }
}
