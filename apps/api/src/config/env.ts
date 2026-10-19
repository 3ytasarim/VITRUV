import { WEBSITE_MEDIA_MAX_BYTES, blankToUndefined, parseEnv } from '@vitruv/shared';
import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

export const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    /** Externally reachable base URL of this API (used for local media delivery URLs). */
    API_PUBLIC_URL: z.url().default('http://localhost:4000'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    API_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),
    /** Browser origins allowed to call the API directly (allow-list; never '*'). */
    CORS_ORIGINS: csv.pipe(z.array(z.url())),
    /**
     * TCP peers whose X-Forwarded-For is trusted for the client IP (rate limiting). Default:
     * loopback — the web server on the same host. Add your reverse proxy / web host IPs.
     */
    TRUSTED_PROXY_IPS: z
      .string()
      .default('127.0.0.1,::1,::ffff:127.0.0.1')
      .transform((value) =>
        value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      ),

    DATABASE_URL: z
      .string({ error: 'is required (existing Neon PostgreSQL connection string)' })
      .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// or postgresql:// URL'),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('.storage'),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET_PUBLIC: z.string().optional(),
    S3_BUCKET_PRIVATE: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    PUBLIC_MEDIA_BASE_URL: z.url().optional(),
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

    /**
     * On-demand revalidation of the public website after a publish (server-to-server).
     * WEB_REVALIDATE_URL = the web app's /api/revalidate; REVALIDATE_SECRET is shared with it.
     */
    WEB_REVALIDATE_URL: z.url().optional(),
    REVALIDATE_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),

    /**
     * Development-only auth adapter for local API tooling. When enabled, a request carrying the
     * shared secret DEV_AUTH_TOKEN acts as the users row with DEV_AUTH_EMAIL — with that user's
     * real role. Refused in production. Real login: /v1/auth (docs/AUTH-ARCHITECTURE.md).
     */
    DEV_AUTH: z.enum(['enabled', 'disabled']).default('disabled'),
    DEV_AUTH_TOKEN: z.string().min(32, 'must be at least 32 characters').optional(),
    DEV_AUTH_EMAIL: z.email().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of [
        'S3_ENDPOINT',
        'S3_REGION',
        'S3_BUCKET_PUBLIC',
        'S3_BUCKET_PRIVATE',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ] as const) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'required when STORAGE_DRIVER=s3' });
      }
    }
    if (env.WEB_REVALIDATE_URL && !env.REVALIDATE_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['REVALIDATE_SECRET'],
        message: 'required when WEB_REVALIDATE_URL is set',
      });
    }
    if (env.DEV_AUTH === 'enabled') {
      if (env.NODE_ENV === 'production') {
        ctx.addIssue({
          code: 'custom',
          path: ['DEV_AUTH'],
          message: 'the development auth adapter must never run in production',
        });
      }
      for (const key of ['DEV_AUTH_TOKEN', 'DEV_AUTH_EMAIL'] as const) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'required when DEV_AUTH=enabled' });
      }
    }
    if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER === 'local') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'the local driver is for development only; configure an S3-compatible provider',
      });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Validates process.env once at startup. Throws with variable names only — never values. */
export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, blankToUndefined(source));
}
