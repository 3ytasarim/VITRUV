import pino, { type Logger } from 'pino';

export type { Logger };

/**
 * Structured JSON logger. Anything that could carry credentials is redacted at the logger level,
 * so a careless `log.info({ headers })` can still not leak a token or the database URL.
 */
export function createLogger(options: { level: string; pretty?: boolean }): Logger {
  return pino({
    level: options.level,
    base: { service: 'vitruv-api' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        '*.password',
        '*.currentPassword',
        '*.newPassword',
        '*.passwordHash',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
        '*.DATABASE_URL',
        '*.connectionString',
        '*.S3_SECRET_ACCESS_KEY',
        '*.REVALIDATE_SECRET',
      ],
      censor: '[redacted]',
    },
    ...(options.pretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
      : {}),
  });
}
