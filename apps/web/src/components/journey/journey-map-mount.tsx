'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { THEME_CHANGE_EVENT } from '@/components/site/theme-mode';
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
    let unmount = mountJourneyMap(root);
    // light/dark switch: the engine reads its colours once — mount it again with the new ones
    const remount = () => {
      unmount();
      unmount = mountJourneyMap(root);
    };
    window.addEventListener(THEME_CHANGE_EVENT, remount);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, remount);
      unmount();
    };
  }, []);
  return (
    <div ref={ref} className={className} data-weg="">
      {children}
    </div>
  );
}
