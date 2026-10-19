'use client';

import type { AdminMediaAsset } from '@vitruv/contracts';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { listTrainingMediaAction } from '@/app/admin/training-actions';
import { listMediaAction } from '@/app/admin/website-actions';
import { Button } from '@/components/ui';
import { EmptyState, ErrorState } from '../states';
import { describeMedia } from './media-format';
import { MediaThumb } from './media-thumb';
import { useProgressive } from './use-progressive';
import { MediaUploadForm } from './media-upload-form';

export type MediaKindFilter = 'IMAGE' | 'VIDEO';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: AdminMediaAsset[] };

/** The selectable grid (presentational; rendered by the picker dialog). */
export function MediaPickerGrid({
  state,
  selectedId,
  onSelect,
  onRetry,
}: {
  state: LoadState;
  selectedId?: string;
  onSelect: (asset: AdminMediaAsset) => void;
  onRetry?: () => void;
}) {
  const { limit, sentinel, more, hasMore } = useProgressive(
    state.status === 'ready' ? state.items.length : 0,
    state,
  );
  if (state.status === 'loading') {
    return (
      <p role="status" className="type-body-sm text-fg-muted">
        Mediathek wird geladen …
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <ErrorState
        message={state.message}
        action={
          onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Erneut versuchen
            </Button>
          )
        }
      />
    );
  }
  if (state.items.length === 0) {
    return (
      <EmptyState title="Noch keine passenden Medien">
        Lade oben eine Datei hoch — sie wird danach direkt zugewiesen.
      </EmptyState>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {state.items.slice(0, limit).map((asset) => (
        <li key={asset.id}>
          <button
            type="button"
            aria-pressed={asset.id === selectedId}
            onClick={() => onSelect(asset)}
            className="vt-chamfer vt-cut-xs vt-card vt-card--interactive vt-option flex w-full flex-col gap-2 p-2 text-left"
          >
            <MediaThumb asset={asset} />
            <span className="type-caption block truncate text-fg">{asset.fileName}</span>
            <span className="type-caption block text-fg-subtle">{describeMedia(asset)}</span>
          </button>
        </li>
      ))}
      <li className="col-span-full flex justify-center">
        <div ref={sentinel} aria-hidden />
        {hasMore && (
          <Button variant="secondary" onClick={more}>
            Weitere laden ({state.items.length - limit})
          </Button>
        )}
      </li>
    </ul>
  );
}

/**
 * Media picker: Select media → library → choose → assign, or upload new media and assign it
 * directly. A native modal <dialog> (focus is trapped and Escape closes it), portalled out of the
 * editor form (pickers contain their own upload form, which must never be nested) into the themed
 * shell root (`[data-glass]` / `[data-surface]`) so it gets the same black glass colours and fonts.
 */
export function MediaPicker({
  open,
  title,
  kinds,
  selectedId,
  onSelect,
  onClose,
  library = 'WEBSITE',
}: {
  open: boolean;
  title: string;
  /** Which media library to browse/upload into (same media system, separate permissions). */
  library?: 'WEBSITE' | 'TRAINING';
  kinds: readonly MediaKindFilter[];
  selectedId?: string;
  onSelect: (asset: AdminMediaAsset) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const titleId = useId();
  const [reload, setReload] = useState(0);
  const kindKey = kinds.join(',');
  // Results are tagged with the request they answer; anything else shows as "loading".
  const requestKey = `${kindKey}#${reload}`;
  const [result, setResult] = useState<{ key: string; state: LoadState } | null>(null);
  const state: LoadState =
    result && result.key === requestKey ? result.state : { status: 'loading' };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const kindList = kindKey.split(',') as MediaKindFilter[];
    const load = library === 'TRAINING' ? listTrainingMediaAction : listMediaAction;
    void load(kindList.length === 1 ? kindList[0] : undefined).then((response) => {
      if (cancelled) return;
      setResult({
        key: requestKey,
        state: response.ok
          ? {
              status: 'ready',
              items: response.data.items.filter((a) =>
                kindList.includes(a.kind as MediaKindFilter),
              ),
            }
          : { status: 'error', message: response.message },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, kindKey, requestKey, library]);

  const choose = (asset: AdminMediaAsset) => {
    onSelect(asset);
    onClose();
  };

  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="vt-dialog"
      onClose={onClose}
      onCancel={onClose}
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-4 py-3 md:px-6">
            <h2 id={titleId} className="type-title">
              {title}
            </h2>
            <Button
              variant="ghost"
              icon={<X />}
              aria-label="Mediathek schließen"
              onClick={onClose}
            />
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <section aria-label="Neues Medium hochladen" className="mb-6">
              <p className="type-caption mb-3 text-fg-subtle">
                Neues Medium hochladen und zuweisen
              </p>
              <MediaUploadForm
                kinds={kinds}
                onUploaded={choose}
                compact
                endpoint={library === 'TRAINING' ? '/admin/api/training-media' : '/admin/api/media'}
              />
            </section>
            <section aria-label="Vorhandene Medien">
              <p className="type-caption mb-3 text-fg-subtle">Aus der Mediathek wählen</p>
              <MediaPickerGrid
                state={state}
                selectedId={selectedId}
                onSelect={choose}
                onRetry={() => setReload((n) => n + 1)}
              />
            </section>
          </div>
        </div>
      )}
    </dialog>,
    document.querySelector('[data-glass]') ??
      document.querySelector('[data-surface]') ??
      document.body,
  );
}

const noSubscribe = () => () => undefined;
