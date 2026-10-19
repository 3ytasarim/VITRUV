'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { mountJourneyMap } from './journey-map-engine';

/**
 * Client root of the Journey map: runs the prototype map engine on the server-rendered markup
 * after hydration and tears it down on unmount. Everything inside stays readable without JS.
 */
export function JourneyMapMount({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    return mountJourneyMap(root);
  }, []);
  return (
    <div ref={ref} className={className} data-weg="">
      {children}
    </div>
  );
}
