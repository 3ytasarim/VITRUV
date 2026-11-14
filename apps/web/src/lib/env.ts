import 'server-only';
import {
  WEBSITE_MEDIA_MAX_BYTES,
  blankToUndefined,
  mediaUploadMaxBodyBytes,
  parseEnv,
} from '@vitruv/shared';
import { z } from 'zod';

/**
 * Server-side env for the web app. The web app never connects to the database directly —
 * all data goes through the shared API (project rule "Shared backend").
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const webServerEnvSchema = z
  .object({
    API_BASE_URL: z.url().default('http://localhost:4000'),
    /**
     * The ONE public base URL of the website (canonical, Open Graph, sitemap, structured data).
     * Never inferred from request headers. Must be https in production (localhost excepted, for
     * local production builds).
     */
    PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
    /** `disabled` = noindex everywhere + robots.txt disallows all (staging/preview deployments). */
    SITE_INDEXING: z.enum(['enabled', 'disabled']).default('enabled'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** `enabled` exposes the internal /design preview in production builds (off by default). */
    DESIGN_PREVIEW: z.enum(['enabled', 'disabled']).default('disabled'),
    /**
     * Name of a request header that the hosting proxy SETS (overwrites) with the browser's IP,
     * e.g. `x-real-ip`, `cf-connecting-ip`, `x-vercel-forwarded-for`. Forwarded to the API for
     * login rate limits. Leave empty when no such proxy exists — never trust a client-supplied
     * X-Forwarded-For.
     */
    TRUSTED_CLIENT_IP_HEADER: z
      .string()
      .regex(/^[a-z0-9-]+$/i)
      .transform((value) => value.toLowerCase())
      .optional(),
    /**
     * Shared with the API (REVALIDATE_SECRET): authorises its server-to-server call to
     * /api/revalidate after a publish. Server-only — never NEXT_PUBLIC_.
     */
    REVALIDATE_SECRET: z.string().min(32).optional(),
    /**
     * Media upload limits — the SAME variables the API reads (repo-root .env), so the early
     * size check here never disagrees with the API. Defaults: @vitruv/shared.
     */
    MEDIA_MAX_IMAGE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(WEBSITE_MEDIA_MAX_BYTES.IMAGE),
    MEDIA_MAX_VIDEO_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(WEBSITE_MEDIA_MAX_BYTES.VIDEO),
  })
  .superRefine((env, ctx) => {
    const url = new URL(env.PUBLIC_SITE_URL);
    if (
      env.NODE_ENV === 'production' &&
      url.protocol !== 'https:' &&
      !LOCAL_HOSTS.has(url.hostname)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_SITE_URL'],
        message: 'must use https in production',
      });
    }
  });

/** Per-kind media upload limits (bytes) as configured for the API. */
export function mediaUploadLimits(): { IMAGE: number; VIDEO: number } {
  const env = webServerEnv();
  return { IMAGE: env.MEDIA_MAX_IMAGE_BYTES, VIDEO: env.MEDIA_MAX_VIDEO_BYTES };
}

/** Largest acceptable media upload request (largest file + multipart overhead). */
export function mediaUploadBodyLimit(): number {
  return mediaUploadMaxBodyBytes(mediaUploadLimits());
}

/** Public base URL without a trailing slash, e.g. `https://vitruv.example`. */
export function publicSiteUrl(): string {
  return webServerEnv().PUBLIC_SITE_URL.replace(/\/+$/, '');
}

export function isIndexingEnabled(): boolean {
  return webServerEnv().SITE_INDEXING === 'enabled';
}

/** /design is a design-review tool: always on in development, opt-in in production. */
export function isDesignPreviewEnabled(): boolean {
  const env = webServerEnv();
  return env.NODE_ENV !== 'production' || env.DESIGN_PREVIEW === 'enabled';
}

export type WebServerEnv = z.infer<typeof webServerEnvSchema>;

let cached: WebServerEnv | undefined;

export function webServerEnv(): WebServerEnv {
  cached ??= parseEnv(webServerEnvSchema, blankToUndefined(process.env));
  return cached;
}
