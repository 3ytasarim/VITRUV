/**
 * Small in-memory fixed-window rate limiter (per process). Enough for a single API instance;
 * a multi-instance deployment needs a shared store (e.g. Redis) — documented as deferred.
 */
export interface RateLimiter {
  /** Records a hit for `key`; returns false when the limit for the current window is exceeded. */
  hit(key: string): boolean;
  /**
   * Whether `key` has already used up the current window — without recording a hit. Used to
   * count only failures (login) while still refusing further attempts once the limit is reached.
   */
  isLimited(key: string): boolean;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}): RateLimiter {
  const now = options.now ?? Date.now;
  const windows = new Map<string, { start: number; count: number }>();
  const active = (key: string, time: number) => {
    const current = windows.get(key);
    return current && time - current.start < options.windowMs ? current : undefined;
  };
  return {
    hit(key) {
      const time = now();
      const current = active(key, time);
      if (!current) {
        // Bound memory: drop expired windows when the map grows.
        if (windows.size >= (options.maxKeys ?? 10_000)) {
          for (const [k, w] of windows) if (time - w.start >= options.windowMs) windows.delete(k);
        }
        windows.set(key, { start: time, count: 1 });
        return true;
      }
      current.count += 1;
      return current.count <= options.limit;
    },
    isLimited(key) {
      const current = active(key, now());
      return current !== undefined && current.count >= options.limit;
    },
  };
}
