/**
 * Content-Security-Policy for the web app, built from what the site actually loads:
 *  - scripts: Next.js framework/app chunks + inline RSC payloads → per-request nonce +
 *    'strict-dynamic' (no 'unsafe-inline'; 'unsafe-eval' only in development for React tooling)
 *  - styles: own CSS files + inline style attributes (next/image fill styles, object-position)
 *    → 'unsafe-inline' for styles only (attributes can not carry a nonce)
 *  - images/video: same origin (/_next/image) + the configured CMS media origins (admin
 *    thumbnails, video files and posters are served by the media host)
 *  - fonts: self-hosted by next/font; connections: same origin (server actions, upload proxy)
 */
export function mediaOrigins(env: Record<string, string | undefined>): string[] {
  const raw = env.CMS_MEDIA_ORIGINS ?? env.API_BASE_URL ?? 'http://localhost:4000';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);
}

export function buildCsp(options: {
  nonce: string;
  dev: boolean;
  media: string[];
  /** Only when the public site is served over https (never for plain-http localhost builds). */
  upgradeInsecure: boolean;
}): string {
  const media = options.media.join(' ');
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${media}`,
    `media-src 'self' blob: ${media}`,
    "font-src 'self'",
    `connect-src 'self'${options.dev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.upgradeInsecure ? ['upgrade-insecure-requests'] : []),
  ];
  return directives.join('; ');
}
