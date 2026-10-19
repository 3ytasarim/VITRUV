'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Progressive rendering for long media grids: shows `step` items first and the next batch when
 * the sentinel (placed after the list) comes near the viewport — or via the explicit button.
 * Resets when `resetKey` changes (e.g. the type filter).
 */
export function useProgressive(total: number, resetKey: unknown, step = 48) {
  const [limit, setLimit] = useState(step);
  const [key, setKey] = useState(resetKey);
  // reset during render when the filter changes (no extra effect pass)
  if (key !== resetKey) {
    setKey(resetKey);
    setLimit(step);
  }
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= total) return;
    const io = new IntersectionObserver(
      ([entry]) => entry?.isIntersecting && setLimit((l) => Math.min(total, l + step)),
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [limit, total, step]);
  return {
    limit,
    sentinel,
    more: () => setLimit((l) => Math.min(total, l + step)),
    hasMore: limit < total,
  };
}
