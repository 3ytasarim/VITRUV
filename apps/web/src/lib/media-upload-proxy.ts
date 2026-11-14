import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { adminApiUrl } from './admin-api';
import { authApi, clearSession, clientIp, sessionTokens, storeSession } from './auth/session';
import { webServerEnv } from './env';

const json = (status: number, code: string, message: string) =>
  NextResponse.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );

/** Origin of the configured public site — the only origin allowed to post uploads (CSRF). */
function allowedOrigin(): string | null {
  try {
    return new URL(webServerEnv().PUBLIC_SITE_URL).origin;
  } catch {
    return null;
  }
}

/**
 * Access token for the upload. The media upload routes are excluded from src/proxy.ts (the proxy
 * would buffer the request body), so the session refresh it normally does happens here: with an
 * expired access token the refresh token is rotated via the API and the new cookies are set on
 * this response — exactly what the proxy does for every other admin request.
 */
async function uploadAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken } = await sessionTokens();
  if (accessToken) return accessToken;
  if (!refreshToken) return null;
  const refreshed = await authApi().refresh(refreshToken, await clientIp());
  if (!refreshed.ok) {
    await clearSession();
    return null;
  }
  await storeSession(refreshed.data.tokens);
  return refreshed.data.tokens.accessToken;
}

/**
 * Upload proxy: STREAMS the browser's multipart body to the API (which validates type, content
 * signature, size and generates the storage key). Nothing is buffered here — the request body is
 * piped into the API request with backpressure, so a 500 MiB video costs no more memory than a
 * small image. Server actions are not used because of their body limit.
 *
 * Security (unchanged by the streaming): same-origin check against PUBLIC_SITE_URL (CSRF), the
 * session's access token (HttpOnly cookie → Bearer, never visible to browser JS), and the API
 * checks the permission of the library (website.media.write / training.exercises.write /
 * nutrition.documents.write). `maxBodyBytes` rejects an announced oversized body early (413);
 * the API enforces the limits while streaming in any case.
 */
export async function proxyMediaUpload(
  request: NextRequest,
  apiPath: string,
  options: { maxBodyBytes?: number } = {},
) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!origin || origin !== allowedOrigin() || (fetchSite && fetchSite !== 'same-origin')) {
    return json(403, 'FORBIDDEN', 'Ungültige Herkunft der Anfrage.');
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data') || !request.body) {
    return json(400, 'BAD_REQUEST', 'multipart/form-data erwartet.');
  }
  const declaredLength = Number(request.headers.get('content-length') ?? NaN);
  if (
    options.maxBodyBytes !== undefined &&
    Number.isFinite(declaredLength) &&
    declaredLength > options.maxBodyBytes
  ) {
    return json(
      413,
      'PAYLOAD_TOO_LARGE',
      `Datei zu groß (max. ${Math.floor(options.maxBodyBytes / 1024 / 1024)} MB inkl. Formular).`,
    );
  }
  const accessToken = await uploadAccessToken();
  if (!accessToken) return json(401, 'UNAUTHENTICATED', 'Bitte melde dich erneut an.');

  try {
    const res = await fetch(adminApiUrl(apiPath), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': contentType },
      body: request.body,
      // Required by Node's fetch for streaming request bodies.
      duplex: 'half',
      cache: 'no-store',
      signal: request.signal,
    } as RequestInit & { duplex: 'half' });
    const body: unknown = await res.json().catch(() => ({
      error: { code: 'INTERNAL_ERROR', message: 'Unerwartete Antwort der API.' },
    }));
    return NextResponse.json(body, {
      status: res.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return json(503, 'SERVICE_UNAVAILABLE', 'Die API ist nicht erreichbar.');
  }
}
