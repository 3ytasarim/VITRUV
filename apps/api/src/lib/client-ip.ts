import { isIP } from 'node:net';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import type { AppEnv } from '../types';

export type ClientIpResolver = (c: Context<AppEnv>) => string;

/**
 * Client IP for rate limiting. `X-Forwarded-For` is honoured ONLY when the TCP peer is a
 * configured trusted proxy (TRUSTED_PROXY_IPS — by default loopback, i.e. the web server on the
 * same host forwarding the browser's IP on login). Otherwise the header is ignored, so callers
 * can not choose their own rate-limit bucket. The rightmost entry is the one the trusted proxy
 * appended.
 */
export function createClientIpResolver(trustedProxies: readonly string[]): ClientIpResolver {
  const trusted = new Set(trustedProxies);
  return (c) => {
    let remote: string | undefined;
    try {
      remote = getConnInfo(c).remote.address;
    } catch {
      remote = undefined; // no socket (e.g. in-process tests)
    }
    if (remote && trusted.has(remote)) {
      const forwarded = c.req
        .header('x-forwarded-for')
        ?.split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .at(-1);
      if (forwarded && isIP(forwarded)) return forwarded;
    }
    return remote ?? 'unknown';
  };
}
