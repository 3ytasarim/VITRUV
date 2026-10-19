'use client';

import type { AdminMediaAsset } from '@vitruv/contracts';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Asset metadata known to an editor page. Section content stores only asset IDs; this index
 * lets slot fields show thumbnails/names and is extended when the picker selects or uploads.
 */
interface MediaIndex {
  get(id: string): AdminMediaAsset | undefined;
  remember(asset: AdminMediaAsset): void;
}

const MediaIndexContext = createContext<MediaIndex | null>(null);

export function MediaIndexProvider({
  initial,
  children,
}: {
  initial: readonly AdminMediaAsset[];
  children: ReactNode;
}) {
  const [assets, setAssets] = useState(() => new Map(initial.map((a) => [a.id, a])));
  const remember = useCallback((asset: AdminMediaAsset) => {
    setAssets((current) => new Map(current).set(asset.id, asset));
  }, []);
  const value = useMemo<MediaIndex>(
    () => ({ get: (id) => assets.get(id), remember }),
    [assets, remember],
  );
  return <MediaIndexContext.Provider value={value}>{children}</MediaIndexContext.Provider>;
}

export function useMediaIndex(): MediaIndex {
  const context = useContext(MediaIndexContext);
  if (!context) throw new Error('useMediaIndex must be used inside MediaIndexProvider');
  return context;
}
