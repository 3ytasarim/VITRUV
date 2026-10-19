import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import type { NextConfig } from 'next';

/**
 * Monorepo: API and web share the repo-root .env. The web server takes ONLY the keys it needs
 * from it (allow-list) — never DATABASE_URL or storage secrets, so the web process can not reach
 * the database even by accident. Already-set variables win (CI/hosting).
 */
const WEB_ENV_KEYS = [
  'API_BASE_URL',
  'PUBLIC_SITE_URL',
  'SITE_INDEXING',
  'DESIGN_PREVIEW',
  'TRUSTED_CLIENT_IP_HEADER',
  'REVALIDATE_SECRET',
  'CMS_MEDIA_ORIGINS',
  'CMS_MEDIA_ALLOW_LOCAL',
];
const rootEnv = resolve(process.cwd(), '..', '..', '.env');
if (existsSync(rootEnv)) {
  const values = parseEnv(readFileSync(rootEnv, 'utf8'));
  for (const key of WEB_ENV_KEYS) {
    if (process.env[key] === undefined && values[key] !== undefined) process.env[key] = values[key];
  }
}

/**
 * CMS media hosts for next/image optimisation. Media URLs are resolved by the API (local driver:
 * the API origin; production: PUBLIC_MEDIA_BASE_URL / CDN). Configured, never hardcoded:
 * CMS_MEDIA_ORIGINS (comma-separated origins), default = the API origin.
 * CMS_MEDIA_ALLOW_LOCAL=true lets the optimiser fetch from localhost — development only.
 */
function mediaRemotePatterns() {
  const origins = (
    process.env.CMS_MEDIA_ORIGINS ??
    process.env.API_BASE_URL ??
    'http://localhost:4000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.map((origin) => {
    const url = new URL(origin);
    return {
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      hostname: url.hostname,
      port: url.port,
      pathname: '/**',
    };
  });
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // HTTPS-only in production (ignored by browsers on plain-http localhost).
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Internal workspace packages are published as TypeScript source.
  transpilePackages: ['@vitruv/contracts', '@vitruv/design-tokens', '@vitruv/shared'],
  images: {
    remotePatterns: mediaRemotePatterns(),
    formats: ['image/avif', 'image/webp'],
    dangerouslyAllowLocalIP: process.env.CMS_MEDIA_ALLOW_LOCAL === 'true',
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Internal design-review route and its test media: never indexed, even if exposed.
      { source: '/design', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      {
        source: '/design/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      { source: '/_design/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      // Admin + CMS previews: internal, never indexed.
      { source: '/admin', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/mein-training', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      {
        source: '/mein-training/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;
